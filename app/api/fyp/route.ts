import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateLessonForTopic } from "@/lib/fyp";
import type { LevelMap } from "@/lib/learning-path";
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

  let { data: state } = await sb
    .from("user_subject_state")
    .select("path, next_topic, difficulty, course")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .maybeSingle();

  type PathProgress = {
    deliveredByTopic?: Record<string, number>;
    deliveredIdsByTopic?: Record<string, string[]>;
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
          return new Response(JSON.stringify({ status: "generating" }), { status: 202, headers: { "retry-after": "3" } });
        } else if (lock.reason === "error") {
          // Lock table exists but errored; fall back to in-process lock if active, otherwise proceed without lock
          const { isLearningPathGenerating } = await import("@/lib/learning-path");
          if (isLearningPathGenerating(user.id, subject)) {
            try { console.debug(`[fyp][${reqId}] lock-error but in-process active -> 202`); } catch {}
            return new Response(JSON.stringify({ status: "generating" }), { status: 202, headers: { "retry-after": "3" } });
          }
        }
      }
      if (!lock.supported) {
        // No DB lock available; if our in-process lock is active, signal 202 too
        const { isLearningPathGenerating } = await import("@/lib/learning-path");
        if (isLearningPathGenerating(user.id, subject)) {
          try { console.debug(`[fyp][${reqId}] in-process-lock -> 202`); } catch {}
          return new Response(JSON.stringify({ status: "generating" }), { status: 202, headers: { "retry-after": "3" } });
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

  // Decode indices from progress, fall back to first
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
    const recentIds = (progress.deliveredIdsByTopic?.[currentLabel] || []).slice(-20);
    const disliked = (progress.preferences?.disliked ?? []).slice(-20);
    lesson = await generateLessonForTopic(sb, user.id, ip, subject, currentLabel, {
      pace,
      accuracyPct: accuracyPct ?? undefined,
      difficultyPref: (state?.difficulty as Difficulty | undefined) ?? undefined,
      avoidIds: [...recentIds, ...disliked],
    });
    try { console.debug(`[fyp][${reqId}] lesson: ok`, { subject, currentLabel }); } catch {}
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = msg === "Usage limit exceeded" ? 403 : 500;
    try { console.error(`[fyp][${reqId}] lesson: error`, { msg, status }); } catch {}
    return new Response(JSON.stringify({ error: msg }), { status });
  }

  // Honor mini_lessons per subtopic and update progress/indices
  let nextTopicStr: string | null = currentLabel;
  const deliveredByTopic = progress.deliveredByTopic || {};
  const deliveredIdsByTopic = progress.deliveredIdsByTopic || {};
  deliveredByTopic[currentLabel] = (deliveredByTopic[currentLabel] || 0) + 1;
  deliveredMini += 1;
  const plannedMini = Math.max(1, Number(curSub.mini_lessons || 1));
  const lid = lesson.id as string | undefined;
  const list = deliveredIdsByTopic[currentLabel] || [];
  if (lid) {
    if (!list.includes(lid)) list.push(lid);
    while (list.length > 50) list.shift();
    deliveredIdsByTopic[currentLabel] = list;
  }
  if (deliveredMini >= plannedMini) {
    // Advance to next subtopic or topic
    deliveredMini = 0;
    if (subtopicIdx + 1 < (curTopic.subtopics?.length ?? 0)) {
      subtopicIdx += 1;
    } else {
      subtopicIdx = 0;
      if (topicIdx + 1 < topics.length) {
        topicIdx += 1;
      } else {
        // End of map
        nextTopicStr = null;
      }
    }
  }

  // Recompute next label
  const nextTopicObj = topics[topicIdx];
  const nextSubObj = nextTopicObj?.subtopics?.[subtopicIdx];
  if (nextTopicObj && nextSubObj) {
    nextTopicStr = `${nextTopicObj.name} > ${nextSubObj.name}`;
  }

  const newPath: PathWithProgress = {
    ...(path as PathWithProgress),
    progress: {
      ...(path.progress || {}),
      deliveredByTopic,
      deliveredIdsByTopic,
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
