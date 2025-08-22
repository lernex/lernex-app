import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { username, dob } = await req.json().catch(() => ({}));

  if (!username || typeof username !== "string" || username.trim().length < 3) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }
  if (!dob || typeof dob !== "string") {
    return NextResponse.json({ error: "Invalid dob" }, { status: 400 });
  }

  // Check uniqueness (exclude current user)
  const { data: taken } = await sb
    .from("profiles")
    .select("id")
    .eq("username", username)
    .neq("id", user.id)
    .limit(1);

  if (taken && taken.length > 0) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  const { error } = await sb
    .from("profiles")
    .update({ username, dob })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
