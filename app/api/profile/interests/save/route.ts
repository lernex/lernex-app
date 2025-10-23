// app/api/profile/interests/save/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { interests } = await req.json().catch(() => ({}));
  if (!Array.isArray(interests) || interests.length === 0) {
    return NextResponse.json({ error: "Pick at least one subject" }, { status: 400 });
  }

  // Ensure row exists (safety)
  await sb
    .from("profiles")
    .insert({ id: user.id, total_cost: 0 })
    .select("id")
    .maybeSingle();

  const { error } = await sb
    .from("profiles")
    .update({ interests, level_map: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
