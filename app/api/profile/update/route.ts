import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { username, dob, theme_pref } = await req.json().catch(()=>({}));

  const { error } = await sb.from("profiles").update({
    username: typeof username === "string" ? username : undefined,
    dob: typeof dob === "string" ? dob : undefined,
    theme_pref: ["light","dark","system"].includes(theme_pref) ? theme_pref : undefined,
    updated_at: new Date().toISOString(),
  }).eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
