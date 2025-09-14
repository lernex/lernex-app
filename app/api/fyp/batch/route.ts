import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateLessonForTopic } from "@/lib/fyp";
import { LearningPath } from "@/lib/learning-path";
import type { Lesson } from "@/lib/schema";
import type { Difficulty } from "@/types/placement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PathProgress = {
  deliveredByTopic?: Record<string, number>;
  deliveredIdsByTopic?: Record<string, string[]>;
};

type PathWithProgress = LearningPath & { progress?: PathProgress };

function getProgress(path: unknown): PathProgress {
  const hasProgress = (o: unknown): o is { progress?: PathProgress } => !!o && typeof o === "object" && "progress" in (o as object);
  const p = (hasProgress(path) ? (path as { progress?: PathProgress }).progress : undefined) ?? {};
  const deliveredByTopic = (p.deliveredByTopic && typeof p.deliveredByTopic === "object") ? (p.deliveredByTopic as Record<string, number>) : {};
  const deliveredIdsByTopic = (p.deliveredIdsByTopic && typeof p.deliveredIdsByTopic === "object") ? (p.deliveredIdsByTopic as Record<string, string[]>) : {};
  return { deliveredByTopic, deliveredIdsByTopic };
}

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

  const subjectParam = req.nextUrl.searchParams.get("subject");
  const nParam = req.nextUrl.searchParams.get("n");
  const n = Math.max(1, Math.min(8, Number(nParam ?? "5") || 5));

  let subject = subjectParam || null;
  if (!subject) {
    const { data: first } = await sb
      .from("user_subject_state")
      .select("subject")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    subject = first?.subject ?? null;
  }
  if (!subject) return new Response(JSON.stringify({ error: "No subject" }), { status: 400 });

  // Load subject state
  let { data: stateRow } = await sb
    .from("user_subject_state")
    .select("path, next_topic, difficulty, course")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .maybeSingle();

  let path = stateRow?.path as PathWithProgress | null;
  if (!path) {
    // Auto-generate based on profile mapping and attempts
    const { data: prof } = await sb
      .from("profiles")
      .select("level_map")
      .eq("id", user.id)
      .maybeSingle();
    const levelMap = (prof?.level_map || {}) as Record<string, string>;
    const course = stateRow?.course || levelMap[subject];
    if (!course) return new Response(JSON.stringify({ error: "No course mapping for subject" }), { status: 400 });
    const { data: attempts } = await sb
      .from("attempts")
      .select("subject, correct_count,total,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    let correct = 0, total = 0;
    (attempts ?? []).forEach((a) => { if (!a.subject || a.subject === subject) { correct += a.correct_count ?? 0; total += a.total ?? 0; } });
    const mastery = total > 0 ? Math.round((correct / total) * 100) : 50;
    const now = Date.now();
    const recent = (attempts ?? []).filter((a) => a.created_at && (now - +new Date(a.created_at)) < 72 * 3600_000);
    const pace = recent.length >= 12 ? "fast" : recent.length >= 4 ? "normal" : "slow";
    const notes = `Learner pace: ${pace}. Personalized for ${subject}.`;
    try {
      const gp = await (await import("@/lib/learning-path")).generateLearningPath(sb, user.id, ip, course, mastery, notes);
      path = gp as PathWithProgress;
      const next_topic = gp.starting_topic || (Array.isArray(gp.topics) && gp.topics[0]?.name) || null;
      const difficulty = mastery < 35 ? "intro" : mastery < 55 ? "easy" : mastery < 75 ? "medium" : "hard";
      await sb.from("user_subject_state").upsert({
        user_id: user.id,
        subject,
        course,
        mastery,
        difficulty,
        next_topic,
        path: gp,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,subject" });
      const { data: refreshed } = await sb
        .from("user_subject_state")
        .select("path, next_topic, difficulty, course")
        .eq("user_id", user.id)
        .eq("subject", subject)
        .maybeSingle();
      stateRow = refreshed ?? stateRow;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Server error";
      const status = msg === "Usage limit exceeded" ? 403 : 500;
      return new Response(JSON.stringify({ error: msg }), { status });
    }
  }

  const topics = (Array.isArray(path.topics) ? path.topics : []) as LearningPath["topics"];
  if (!topics.length) return new Response(JSON.stringify({ error: "No topics in learning path" }), { status: 400 });

  const progress = getProgress(path);
  let currentTopic = (stateRow?.next_topic as string | null) || path.starting_topic || topics[0]?.name;
  if (!currentTopic) return new Response(JSON.stringify({ error: "No topic" }), { status: 400 });

  // Compute simple accuracy-based and activity-based pace
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

  const out: { topic: string; lesson: Lesson }[] = [];
  let safetyCounter = 0;
  while (out.length < n && safetyCounter++ < n * 3) {
    const idx = topics.findIndex((t) => t.name === currentTopic);
    if (idx < 0) break;
    const planned = Math.max(1, Number(topics[idx].estimated_lessons || 1));
    const delivered = Math.max(0, Number(progress.deliveredByTopic?.[currentTopic] || 0));
    const recentIds = (progress.deliveredIdsByTopic?.[currentTopic] || []).slice(-20);

    // Generate the lesson
    let lesson: Lesson;
    try {
      lesson = await generateLessonForTopic(
        sb,
        user.id,
        ip,
        subject!,
        currentTopic,
        {
          pace,
          accuracyPct: accuracyPct ?? undefined,
          difficultyPref: (stateRow?.difficulty as Difficulty | undefined) ?? undefined,
          avoidIds: recentIds,
        }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Server error";
      if (out.length === 0) return new Response(JSON.stringify({ error: msg }), { status: msg === "Usage limit exceeded" ? 403 : 500 });
      break; // return what we have
    }

    // Update progress bookkeeping in-memory
    const lid = lesson.id as string | undefined;
    progress.deliveredByTopic = progress.deliveredByTopic || {};
    progress.deliveredByTopic[currentTopic] = (progress.deliveredByTopic[currentTopic] || 0) + 1;
    progress.deliveredIdsByTopic = progress.deliveredIdsByTopic || {};
    const list = progress.deliveredIdsByTopic[currentTopic] || [];
    if (lid) {
      if (!list.includes(lid)) list.push(lid);
      while (list.length > 50) list.shift();
      progress.deliveredIdsByTopic[currentTopic] = list;
    }

    out.push({ topic: currentTopic, lesson });

    // Decide whether to move to next topic
    const afterDelivered = progress.deliveredByTopic[currentTopic];
    if (afterDelivered >= planned) {
      if (idx + 1 < topics.length) {
        currentTopic = topics[idx + 1].name;
      } else {
        currentTopic = null; // end of path
        break;
      }
    }
  }

  // Persist updated progress and next_topic
  const newPath: PathWithProgress = { ...(path as PathWithProgress), progress };
  await sb
    .from("user_subject_state")
    .update({ path: newPath, next_topic: currentTopic ?? null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("subject", subject);

  return new Response(
    JSON.stringify({ items: out }),
    { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }
  );
}
