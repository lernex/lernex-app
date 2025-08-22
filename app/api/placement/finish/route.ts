import { NextResponse } from "next/server";
import type { PlacementState } from "@/types/placement";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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

  // Write/Upsert user_subject_state
  await sb.from("user_subject_state").upsert({
    user_id: user.id,
    subject: state.subject,
    course: state.course,
    mastery: Math.round(acc * 100),
    difficulty,
    next_topic: null,
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

  // Clear the placement flag so /post-auth routes to /app next time
  await sb.from("profiles").update({ placement_ready: false }).eq("id", user.id);

  return NextResponse.json({ ok: true });
}
