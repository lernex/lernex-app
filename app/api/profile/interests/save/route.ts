import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { interests } = await req.json().catch(() => ({}));
  if (!Array.isArray(interests) || interests.some((x) => typeof x !== "string")) {
    return NextResponse.json({ error: "Invalid interests" }, { status: 400 });
  }

  const { error } = await sb.from("profiles").update({ interests }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
