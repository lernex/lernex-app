// app/api/profile/welcome/save/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { username, dob } = await req.json().catch(() => ({}));

  if (!username || typeof username !== "string" || username.trim().length < 3) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }
  if (!dob || typeof dob !== "string") {
    return NextResponse.json({ error: "Invalid date of birth" }, { status: 400 });
  }

  // Ensure the row exists (trigger should handle this, but belt-and-suspenders)
  await sb
    .from("profiles")
    .insert({ id: user.id, total_cost: 0 })
    .select("id")
    .maybeSingle();

  // Check duplicates excluding self
  const { data: taken } = await sb
    .from("profiles").select("id")
    .eq("username", username)
    .neq("id", user.id)
    .limit(1);

  if (taken && taken.length > 0) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  const { error } = await sb
    .from("profiles")
    .update({
      username,
      dob, // ISO date string
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
