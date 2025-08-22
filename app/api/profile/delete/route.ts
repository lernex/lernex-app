import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Best-effort: delete profile rows; auth.user deletion requires service role (skip for now)
  await sb.from("profiles").delete().eq("id", user.id);
  await sb.auth.signOut();
  return NextResponse.json({ ok: true });
}
