import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateLessonForTopic } from "@/lib/fyp";
import { LearningPath } from "@/lib/learning-path";
import type { Lesson } from "@/lib/schema";
import type { Difficulty } from "@/types/placement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

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
  if (!subject) return new Response(JSON.stringify({ error: "No subject" }), { status: 400 });

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
  };
  type PathWithProgress = LearningPath & { progress?: PathProgress };
  let path = state?.path as PathWithProgress | null;
  // Auto-generate a learning path if missing
  if (!path) {
    const { data: prof } = await sb
      .from("profiles")
      .select("level_map")
      .eq("id", user.id)
      .maybeSingle();
    const levelMap = (prof?.level_map || {}) as Record<string, string>;
    const course = state?.course || levelMap[subject];
    if (!course) return new Response(JSON.stringify({ error: "No course mapping for subject" }), { status: 400 });

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
      const p = await (await import("@/lib/learning-path")).generateLearningPath(sb, user.id, ip, course, mastery, notes);
      path = p as PathWithProgress;
      const next_topic = p.starting_topic || (Array.isArray(p.topics) && p.topics[0]?.name) || null;
      const difficulty = mastery < 35 ? "intro" : mastery < 55 ? "easy" : mastery < 75 ? "medium" : "hard";
      await sb
        .from("user_subject_state")
        .upsert({
          user_id: user.id,
          subject,
          course,
          mastery,
          difficulty,
          next_topic,
          path: p,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,subject" });
      const { data: refreshed } = await sb
        .from("user_subject_state")
        .select("path, next_topic, difficulty, course")
        .eq("user_id", user.id)
        .eq("subject", subject)
        .maybeSingle();
      state = refreshed ?? state;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Server error";
      const status = msg === "Usage limit exceeded" ? 403 : 500;
      return new Response(JSON.stringify({ error: msg }), { status });
    }
  }

  const topics = (Array.isArray(path.topics) ? path.topics : []) as LearningPath["topics"];
  const progress: PathProgress = path.progress ?? {};
  const currentTopic = (state?.next_topic as string | null) || path.starting_topic || topics[0]?.name;
  if (!currentTopic) return new Response(JSON.stringify({ error: "No topic" }), { status: 400 });

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
    const recentIds = (progress.deliveredIdsByTopic?.[currentTopic] || []).slice(-20);
    const disliked = (progress.preferences?.disliked ?? []).slice(-20);
    lesson = await generateLessonForTopic(sb, user.id, ip, subject, currentTopic, {
      pace,
      accuracyPct: accuracyPct ?? undefined,
      difficultyPref: (state?.difficulty as Difficulty | undefined) ?? undefined,
      avoidIds: [...recentIds, ...disliked],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = msg === "Usage limit exceeded" ? 403 : 500;
    return new Response(JSON.stringify({ error: msg }), { status });
  }

  // Honor estimated_lessons and update progress
  let nextTopic: string | null = currentTopic;
  const idx = topics.findIndex((t) => t.name === currentTopic);
  const planned = idx >= 0 ? Math.max(1, Number(topics[idx].estimated_lessons || 1)) : 1;
  const deliveredByTopic = progress.deliveredByTopic || {};
  const deliveredIdsByTopic = progress.deliveredIdsByTopic || {};
  deliveredByTopic[currentTopic] = (deliveredByTopic[currentTopic] || 0) + 1;
  const lid = lesson.id as string | undefined;
  const list = deliveredIdsByTopic[currentTopic] || [];
  if (lid) {
    if (!list.includes(lid)) list.push(lid);
    while (list.length > 50) list.shift();
    deliveredIdsByTopic[currentTopic] = list;
  }
  const after = deliveredByTopic[currentTopic];
  if (idx >= 0 && after >= planned) {
    if (idx + 1 < topics.length) nextTopic = topics[idx + 1].name;
    else nextTopic = null;
  }

  const newPath: PathWithProgress = { ...(path as PathWithProgress), progress: { deliveredByTopic, deliveredIdsByTopic } };
  await sb
    .from("user_subject_state")
    .update({ next_topic: nextTopic, path: newPath, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("subject", subject);

  return new Response(
    JSON.stringify({ topic: currentTopic, lesson }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
