import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { username } = await req.json();
  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  const { error } = await sb
    .from("profiles")
    .update({ username })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
