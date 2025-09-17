import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateLessonForTopic } from "@/lib/fyp";
import { getLearningPathProgress, type LevelMap } from "@/lib/learning-path";
import type { Lesson } from "@/lib/schema";
import type { Difficulty } from "@/types/placement";
import { acquireGenLock, releaseGenLock } from "@/lib/db-lock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const uid = user.id;
  const reqId = Math.random().toString(36).slice(2, 8);
  try { console.debug(`[fyp][${reqId}] begin`, { uid: uid.slice(0,8), ip }); } catch {}

  const subjectParam = req.nextUrl.searchParams.get("subject");

  let subject = subjectParam || null;
  if (!subject) {
    // Prefer an existing subject row
    const { data: first } = await sb
      .from("user_subject_state")
      .select("subject")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    subject = first?.subject ?? null;

    // If none, fall back to the first interest with a chosen course
    if (!subject) {
      const { data: prof } = await sb
        .from("profiles")
        .select("interests, level_map")
        .eq("id", user.id)
        .maybeSingle();
      const interests: string[] = Array.isArray(prof?.interests) ? (prof!.interests as string[]) : [];
      const levelMap = (prof?.level_map || {}) as Record<string, string>;
      const firstSubject = interests.find((s) => levelMap[s]);
      subject = firstSubject ?? null;
    }
  }
  if (!subject) {
    try { console.warn(`[fyp][${reqId}] no-subject`, { uid: uid.slice(0,8), subjectParam }); } catch {}
    return new Response(JSON.stringify({ error: "No subject" }), { status: 400 });
  }
  try { console.debug(`[fyp][${reqId}] subject`, { subject }); } catch {}

  const buildProgressPayload = (phase?: string, detail?: string) => {
    const progress = getLearningPathProgress(user.id, subject);
    if (progress) return progress;
    if (!phase && !detail) return null;
    return { phase: phase ?? "Preparing your learning path", ...(detail ? { detail } : {}) };
  };

  const progressResponse = (retryAfter: string, phase?: string, detail?: string) =>
    new Response(
      JSON.stringify({ status: "generating", progress: buildProgressPayload(phase, detail) }),
      { status: 202, headers: { "retry-after": retryAfter } }
    );

  let { data: state } = await sb
    .from("user_subject_state")
    .select("path, next_topic, difficulty, course")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .maybeSingle();

  type PathProgress = {
    deliveredByTopic?: Record<string, number>;
    deliveredIdsByTopic?: Record<string, string[]>;
    deliveredIdsByKey?: Record<string, string[]>; // tolerate older/newer schema key
    deliveredTitlesByTopic?: Record<string, string[]>;
    preferences?: { liked?: string[]; disliked?: string[]; saved?: string[] };
    topicIdx?: number;
    subtopicIdx?: number;
    deliveredMini?: number;
  };
  type PathWithProgress = LevelMap & { progress?: PathProgress };
  let path = state?.path as PathWithProgress | null;
  // Auto-generate a level map if missing or invalid
  const missingOrInvalid = !path || !Array.isArray(path.topics) || path.topics.length === 0;
  if (missingOrInvalid) {
    try { console.debug(`[fyp][${reqId}] path missing/invalid, attempting ensureLearningPath`); } catch {}
    const { data: prof } = await sb
      .from("profiles")
      .select("level_map")
      .eq("id", user.id)
      .maybeSingle();
    const levelMap = (prof?.level_map || {}) as Record<string, string>;
    const findCourse = (subj: string | null): string | undefined => {
      if (!subj) return undefined;
      const direct = levelMap[subj];
      if (direct) return direct;
      const key = Object.keys(levelMap).find((k) => k.toLowerCase() === subj.toLowerCase());
      if (key) return levelMap[key]!;
      const firstKey = Object.keys(levelMap)[0];
      return firstKey ? levelMap[firstKey] : undefined;
    };
    const course = state?.course || findCourse(subject);
    if (!course) {
      try { console.warn(`[fyp][${reqId}] no-course-mapping`, { subject, levelMapKeys: Object.keys(levelMap) }); } catch {}
      return new Response(JSON.stringify({ error: "Not ready: no course mapping for subject" }), { status: 409 });
    }

    // Estimate mastery from recent attempts (subject-specific if available)
    const { data: attempts } = await sb
      .from("attempts")
      .select("subject, correct_count, total, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    let correct = 0, total = 0;
    (attempts ?? []).forEach((a) => {
      if (!a.subject || a.subject === subject) { correct += a.correct_count ?? 0; total += a.total ?? 0; }
    });
    const mastery = total > 0 ? Math.round((correct / total) * 100) : 50;

    // Pace heuristic from activity density
    const now = Date.now();
    const recent = (attempts ?? []).filter((a) => a.created_at && (now - +new Date(a.created_at)) < 72 * 3600_000);
    const pace = recent.length >= 12 ? "fast" : recent.length >= 4 ? "normal" : "slow";
    const notes = `Learner pace: ${pace}. Personalized for ${subject}.`;

    try {
      // Cross-instance DB lock. If not supported and busy, fallback to in-process lock inside ensureLearningPath.
      const lock = await acquireGenLock(sb, user.id, subject);
      try { console.debug(`[fyp][${reqId}] acquire-lock`, lock); } catch {}
      if (!lock.supported && lock.reason === "error") {
        // DB error unrelated to missing table
        return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
      }
      if (lock.supported && !lock.acquired) {
        if (lock.reason === "busy") {
          // Someone else is generating; signal client to backoff and retry
          try { console.debug(`[fyp][${reqId}] lock-busy -> 202`); } catch {}
          return progressResponse("3", "Another session is preparing your learning path", "Waiting for the current generation to finish.");
        } else if (lock.reason === "error") {
          // Lock table exists but errored; fall back to in-process lock if active, otherwise proceed without lock
          const { isLearningPathGenerating } = await import("@/lib/learning-path");
          if (isLearningPathGenerating(user.id, subject)) {
            try { console.debug(`[fyp][${reqId}] lock-error but in-process active -> 202`); } catch {}
            return progressResponse("3", "Finishing an existing generation", "Re-using the map from a parallel request.");
          }
        }
      }
      if (!lock.supported) {
        // No DB lock available; if our in-process lock is active, signal 202 too
        const { isLearningPathGenerating } = await import("@/lib/learning-path");
        if (isLearningPathGenerating(user.id, subject)) {
          try { console.debug(`[fyp][${reqId}] in-process-lock -> 202`); } catch {}
          return progressResponse("3", "Finalizing your learning path", "A previous request is still wrapping up.");
        }
      }

      const mod = await import("@/lib/learning-path");
      const p = await mod.ensureLearningPath(sb, user.id, ip, subject, course, mastery, notes);
      path = p as PathWithProgress;
      const { data: refreshed } = await sb
        .from("user_subject_state")
        .select("path, next_topic, difficulty, course")
        .eq("user_id", user.id)
        .eq("subject", subject)
        .maybeSingle();
      state = refreshed ?? state;
      if (lock.acquired && lock.supported) await releaseGenLock(sb, user.id, subject);
      try { console.debug(`[fyp][${reqId}] ensureLearningPath: ok`); } catch {}
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Server error";
      const status = msg === "Usage limit exceeded" ? 403 : 500;
      // Ensure lock release on failure
      try { await releaseGenLock(sb, user.id, subject); } catch {}
      try { console.error(`[fyp][${reqId}] ensureLearningPath: error`, { msg, status }); } catch {}
      return new Response(JSON.stringify({ error: msg }), { status });
    }
  }

  if (!path || !Array.isArray(path.topics)) {
    try { console.warn(`[fyp][${reqId}] no-learning-path after ensure`); } catch {}
    return new Response(JSON.stringify({ error: "No learning path" }), { status: 400 });
  }
  const topics = path.topics;
  if (!topics.length) {
    try { console.warn(`[fyp][${reqId}] empty-topics`); } catch {}
    return new Response(JSON.stringify({ error: "No topics in level map" }), { status: 400 });
  }
  const progress: PathProgress = path.progress ?? {};

  // Helper: find first incomplete subtopic if completion flags exist
  const findFirstIncomplete = () => {
    for (let ti = 0; ti < topics.length; ti++) {
      const subs = topics[ti]?.subtopics ?? [];
      for (let si = 0; si < subs.length; si++) {
        // Treat "completed !== true" as incomplete for robustness
        if (subs[si]?.completed !== true) return [ti, si] as [number, number];
      }
    }
    return null as null;
  };

  // Decode indices from progress, fall back to next_topic or first incomplete
  let topicIdx = Math.max(0, Math.min(progress.topicIdx ?? 0, topics.length - 1));
  let subtopicIdx = Math.max(0, Math.min(progress.subtopicIdx ?? 0, (topics[topicIdx]?.subtopics?.length ?? 1) - 1));
  let deliveredMini = Math.max(0, Number(progress.deliveredMini ?? 0));
  // If no indices tracked yet, try to infer from next_topic string
  if ((progress.topicIdx == null || progress.subtopicIdx == null) && typeof state?.next_topic === "string") {
    const [tName, sName] = state.next_topic.split(">").map((x) => x.trim());
    const tIdx = topics.findIndex((t) => t.name === tName);
    if (tIdx >= 0) {
      topicIdx = tIdx;
      const subs = topics[tIdx]?.subtopics ?? [];
      const sIdx = subs.findIndex((s) => s.name === sName);
      if (sIdx >= 0) subtopicIdx = sIdx;
    }
  }
  // If everything is at defaults or completion flags suggest an earlier/later spot, prefer first incomplete
  const firstInc = findFirstIncomplete();
  if (firstInc) {
    const [ti, si] = firstInc;
    // If current subtopic is already marked completed, jump to the first incomplete
    if (topics[topicIdx]?.subtopics?.[subtopicIdx]?.completed === true) {
      topicIdx = ti; subtopicIdx = si; deliveredMini = 0;
    }
  }
  const curTopic = topics[topicIdx];
  const curSub = curTopic?.subtopics?.[subtopicIdx];
  if (!curTopic || !curSub) {
    try { console.warn(`[fyp][${reqId}] invalid-indices`, { topicIdx, subtopicIdx }); } catch {}
    return new Response(JSON.stringify({ error: "Invalid level map indices" }), { status: 400 });
  }
  const currentLabel = `${curTopic.name} > ${curSub.name}`;

  // Personalization signals
  const { data: attempts } = await sb
    .from("attempts")
    .select("correct_count,total,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  let correct = 0, total = 0;
  (attempts ?? []).forEach((a) => { correct += a.correct_count ?? 0; total += a.total ?? 0; });
  const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : null;
  const now = Date.now();
  const recent = (attempts ?? []).filter((a) => a.created_at && (now - +new Date(a.created_at)) < 72 * 3600_000);
  const pace: "slow" | "normal" | "fast" = recent.length >= 12 ? "fast" : recent.length >= 4 ? "normal" : "slow";

  let lesson: Lesson;
  try {
    const recentIds = (
      progress.deliveredIdsByTopic?.[currentLabel] ||
      progress.deliveredIdsByKey?.[currentLabel] ||
      []
    ).slice(-20);
    const recentTitles = (progress.deliveredTitlesByTopic?.[currentLabel] || []).slice(-20);
    const disliked = (progress.preferences?.disliked ?? []).slice(-20);
    // Map position summary for extra personalization (tiny input, no extra cost)
    type SubDone = { completed?: boolean };
    const totalSubs = topics.reduce((sum, t) => sum + (t.subtopics?.length ?? 0), 0);
    const doneSubs = topics.reduce((sum, t) => sum + ((t.subtopics?.filter((s) => (s as SubDone).completed === true)?.length) ?? 0), 0);
    const compPct = totalSubs > 0 ? Math.round((doneSubs / totalSubs) * 100) : 0;
    const plannedMini = Math.max(1, Number(curSub.mini_lessons || 1));
    const mapSummary = `Course:${state?.course ?? ''}; Topic#${topicIdx+1}/${topics.length}; Sub#${subtopicIdx+1}/${curTopic?.subtopics?.length ?? 1}; Completed:${compPct}%; Mini:${deliveredMini}/${plannedMini}`;

    lesson = await generateLessonForTopic(sb, user.id, ip, subject, currentLabel, {
      pace,
      accuracyPct: accuracyPct ?? undefined,
      difficultyPref: (state?.difficulty as Difficulty | undefined) ?? undefined,
      avoidIds: [...recentIds, ...disliked],
      avoidTitles: recentTitles,
      mapSummary,
    });
    try { console.debug(`[fyp][${reqId}] lesson: ok`, { subject, currentLabel }); } catch {}
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    // Treat AI formatting hiccups as transient: ask client to retry instead of hard failing
    if (msg === "Invalid lesson format from AI") {
      try { console.warn(`[fyp][${reqId}] lesson: transient-format-error -> 202`); } catch {}
      return progressResponse("2", "Generating lesson content", "Retrying after formatting hiccup.");
    }
    const status = msg === "Usage limit exceeded" ? 403 : 500;
    try { console.error(`[fyp][${reqId}] lesson: error`, { msg, status }); } catch {}
    return new Response(JSON.stringify({ error: msg }), { status });
  }

  // Honor mini_lessons per subtopic and update progress/indices
  const nextTopicStr: string | null = currentLabel;
  const deliveredByTopic = progress.deliveredByTopic || {};
  const deliveredIdsByTopic = progress.deliveredIdsByTopic || {};
  const deliveredTitlesByTopic = progress.deliveredTitlesByTopic || {};
  deliveredByTopic[currentLabel] = (deliveredByTopic[currentLabel] || 0) + 1;
  // plannedMini used only for context in mapSummary; not needed here
  const lid = lesson.id as string | undefined;
  const list = deliveredIdsByTopic[currentLabel] || [];
  if (lid) {
    if (!list.includes(lid)) list.push(lid);
    while (list.length > 50) list.shift();
    deliveredIdsByTopic[currentLabel] = list;
  }
  const ttl = (deliveredTitlesByTopic[currentLabel] || []);
  const ltitle = typeof lesson.title === 'string' ? lesson.title.trim() : null;
  if (ltitle) {
    if (!ttl.includes(ltitle)) ttl.push(ltitle);
    while (ttl.length > 50) ttl.shift();
    deliveredTitlesByTopic[currentLabel] = ttl;
  }
  // Completion and advancement are handled on quiz finish (/api/attempt).
  // Keep indices and deliveredMini unchanged here; leave topics as-is.
  const updatedTopics = topics;

  // Recompute next label
  // Keep nextTopicStr as current when not auto-advancing.

  const newPath: PathWithProgress = {
    ...(path as PathWithProgress),
    topics: updatedTopics as unknown as PathWithProgress['topics'],
    progress: {
      ...(path.progress || {}),
      deliveredByTopic,
      deliveredIdsByTopic,
      deliveredTitlesByTopic,
      topicIdx,
      subtopicIdx,
      deliveredMini,
    },
  };
  await sb
    .from("user_subject_state")
    .update({ next_topic: nextTopicStr, path: newPath, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("subject", subject);

  try { console.debug(`[fyp][${reqId}] success`, { topic: currentLabel, lessonId: lesson.id }); } catch {}
  return new Response(
    JSON.stringify({ topic: currentLabel, lesson }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
