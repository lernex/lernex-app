import { NextResponse } from "next/server";
import type { PlacementState } from "@/types/placement";
import { supabaseServer } from "@/lib/supabase-server";
import { generateLearningPath, type LevelMap } from "@/lib/learning-path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const uid = user.id;
  const reqId = Math.random().toString(36).slice(2, 8);
  try { console.debug(`[placement-finish][${reqId}] begin`, { uid: uid.slice(0,8), ip }); } catch {}

  const { state, correctTotal, questionTotal } = await req.json().catch(() => ({})) as {
    state: PlacementState;
    correctTotal: number;
    questionTotal: number;
  };
  if (!state || typeof correctTotal !== "number" || typeof questionTotal !== "number") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Roll simple mastery estimate
  const acc = questionTotal > 0 ? correctTotal / questionTotal : 0.5;
  const difficulty = state.difficulty;
  let path: LevelMap | null = null;
  try {
    path = await generateLearningPath(sb, user.id, ip, state.subject, state.course, Math.round(acc * 100));
    try { console.debug(`[placement-finish][${reqId}] generated path`, { subject: state.subject, course: state.course }); } catch {}
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg === "Usage limit exceeded") {
      try { console.warn(`[placement-finish][${reqId}] usage-limit`, { subject: state.subject, course: state.course }); } catch {}
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    path = null;
    try { console.error(`[placement-finish][${reqId}] generate error`, { msg }); } catch {}
  }
  // First subtopic as starting point
  const firstTopic = path?.topics?.[0];
  const firstSub = firstTopic?.subtopics?.[0];
  const nextTopic = firstTopic && firstSub ? `${firstTopic.name} > ${firstSub.name}` : null;

  // Write/Upsert user_subject_state
  await sb.from("user_subject_state").upsert({
    user_id: user.id,
    subject: state.subject,
    course: state.course,
    mastery: Math.round(acc * 100),
    difficulty,
    next_topic: nextTopic,
    path,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,subject" });

  // Log a compact attempts row
  await sb.from("attempts").insert({
    user_id: user.id,
    subject: state.subject,
    level: state.course,
    correct_count: correctTotal,
    total: questionTotal,
  });
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const { data: prof } = await sb
    .from("profiles")
    .select("points, streak, last_study_date")
    .eq("id", user.id)
    .maybeSingle();
  const currentPoints = (prof?.points as number | null) ?? 0;
  const last = (prof?.last_study_date as string | null) ?? null;
  const previousStreak = (prof?.streak as number | null) ?? 0;
  let newStreak = previousStreak > 0 ? previousStreak : 0;
  if (!last) {
    newStreak = Math.max(1, newStreak || 1);
  } else {
    const lastDate = new Date(last);
    if (!Number.isFinite(lastDate.getTime())) {
      newStreak = Math.max(1, newStreak || 1);
    } else {
      const todayDate = new Date();
      const diff = Math.floor((
        Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate()) -
        Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate())
      ) / 86400000);
      if (diff === 0) {
        newStreak = Math.max(newStreak, 1);
      } else if (diff === 1) {
        newStreak = Math.max(newStreak + 1, 1);
      } else if (diff > 1) {
        newStreak = 1;
      }
    }
  }
  const addPts = Math.max(0, Number(correctTotal) || 0) * 10;
  const { data: updatedProfile, error: updateError } = await sb
    .from("profiles")
    .update({
      last_study_date: today,
      streak: newStreak,
      points: currentPoints + addPts,
      updated_at: nowIso,
    })
    .eq("id", user.id)
    .select("points, streak, last_study_date, updated_at")
    .maybeSingle();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Clear the placement flag so /post-auth routes to /app next time
  await sb.from("profiles").update({ placement_ready: false }).eq("id", user.id);
  try { console.debug(`[placement-finish][${reqId}] done`, { nextTopic }); } catch {}
  return NextResponse.json({
    ok: true,
    addPts,
    newStreak: (updatedProfile?.streak as number | null) ?? newStreak,
    profile: updatedProfile ?? null,
  });
}
