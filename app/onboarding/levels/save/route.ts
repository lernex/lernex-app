// app/onboarding/levels/save/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", new URL(req.url).origin));

  const form = await req.formData();
  const entries = [...form.entries()].filter(([k]) => k.startsWith("lv_")) as [string, string][];

  const level_map: Record<string, string> = {};
  for (const [k, v] of entries) {
    const domain = k.replace(/^lv_/, "");
    if (v) level_map[domain] = v;
  }
  if (!Object.keys(level_map).length) {
    return NextResponse.redirect(new URL("/onboarding", new URL(req.url).origin));
  }

  // Ensure row exists
  await sb
    .from("profiles")
    .insert({ id: user.id, total_cost: 0 })
    .select("id")
    .maybeSingle();

  await sb.from("profiles").update({
    level_map,
    placement_ready: true,
    updated_at: new Date().toISOString(),
  }).eq("id", user.id);

  return NextResponse.redirect(new URL("/post-auth", new URL(req.url).origin));
}
