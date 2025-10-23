import { NextResponse } from "next/server";
import type { PlacementState } from "@/types/placement";
import { supabaseServer } from "@/lib/supabase-server";
import type { Database } from "@/lib/types_db";
import { generateLearningPath, type LevelMap } from "@/lib/learning-path";
import { computeStreakAfterActivity } from "@/lib/profile-stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await supabaseServer();
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).from("user_subject_state").upsert({
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
  const baseAttempt: Database["public"]["Tables"]["attempts"]["Insert"] = {
    user_id: user.id,
    correct_count: correctTotal,
    total: questionTotal,
  };
  const subjectValue = typeof state.subject === "string" && state.subject.trim().length ? state.subject.trim() : null;
  const courseValue = typeof state.course === "string" && state.course.trim().length ? state.course.trim() : null;
  const buildAttempt = (includeSubject: boolean, includeLevel: boolean) => ({
    ...baseAttempt,
    ...(includeSubject && subjectValue ? { subject: subjectValue } : {}),
    ...(includeLevel && courseValue ? { level: courseValue } : {}),
  });
  let includeSubject = !!subjectValue;
  let includeLevel = !!courseValue;
  let attemptPayload = buildAttempt(includeSubject, includeLevel);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { error: attemptError } = await (sb as any).from("attempts").insert(attemptPayload);
  if (attemptError?.code === "PGRST204" && includeSubject) {
    console.warn("[placement-finish] subject column missing; retry without subject");
    includeSubject = false;
    attemptPayload = buildAttempt(includeSubject, includeLevel);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ error: attemptError } = await (sb as any).from("attempts").insert(attemptPayload));
  }
  if (attemptError?.code === "PGRST204" && includeLevel) {
    console.warn("[placement-finish] level column missing; retry without level");
    includeLevel = false;
    attemptPayload = buildAttempt(includeSubject, includeLevel);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ error: attemptError } = await (sb as any).from("attempts").insert(attemptPayload));
  }
  if (attemptError) {
    console.error("[placement-finish] attempts insert failed", attemptError);
    return NextResponse.json({ error: attemptError.message }, { status: 500 });
  }
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();
  const { data: prof } = await sb
    .from("profiles")
    .select("points, streak, last_study_date")
    .eq("id", user.id)
    .maybeSingle();
  const profile = prof as { points?: number | null; streak?: number | null; last_study_date?: string | null } | null;
  const currentPoints = profile?.points ?? 0;
  const last = profile?.last_study_date ?? null;
  const previousStreak = profile?.streak ?? 0;
  const newStreak = computeStreakAfterActivity(previousStreak, last, now);
  const addPts = Math.max(0, Number(correctTotal) || 0) * 10;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updatedProfile, error: updateError } = await (sb as any)
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

  // Clear the placement flag so /post-auth routes to /fyp next time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).from("profiles").update({ placement_ready: false }).eq("id", user.id);
  try { console.debug(`[placement-finish][${reqId}] done`, { nextTopic }); } catch {}
  return NextResponse.json({
    ok: true,
    addPts,
    newStreak: (updatedProfile?.streak as number | null) ?? newStreak,
    profile: updatedProfile ?? null,
  });
}
