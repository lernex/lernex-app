// app/api/profile/me/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await sb
    .from("profiles")
    .select(
      "username, full_name, dob, interests, level_map, placement_ready, streak, points, last_study_date, theme_pref, show_real_name",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? {});
}
