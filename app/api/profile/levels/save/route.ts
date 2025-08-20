import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { level_map } = await req.json().catch(() => ({}));
  if (!level_map || typeof level_map !== "object" || Array.isArray(level_map)) {
    return NextResponse.json({ error: "Invalid level_map" }, { status: 400 });
  }

  const { error } = await sb.from("profiles").update({ level_map }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
