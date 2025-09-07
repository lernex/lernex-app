import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { username, dob, theme_pref } = await req.json().catch(()=>({}));
  // If username provided, validate + check uniqueness
  if (typeof username === "string" && username.trim()) {
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 20 || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return NextResponse.json({ error: "Invalid username" }, { status: 400 });
    }
    const { data: taken } = await sb
      .from("profiles")
      .select("id")
      .eq("username", trimmed)
      .neq("id", user.id)
      .limit(1);
    if (taken && taken.length > 0) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
  }

  const { error } = await sb.from("profiles").update({
    username: typeof username === "string" ? username : undefined,
    dob: typeof dob === "string" ? dob : undefined,
    theme_pref: ["light","dark","system"].includes(theme_pref) ? theme_pref : undefined,
    updated_at: new Date().toISOString(),
  }).eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
