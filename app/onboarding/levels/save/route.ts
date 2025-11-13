// app/onboarding/levels/save/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", new URL(req.url).origin));

  const form = await req.formData();
  const entries = [...form.entries()].filter(([k]) => k.startsWith("lv_")) as [string, string][];

  const level_map: Record<string, string> = {};
  const courses: string[] = [];
  for (const [k, v] of entries) {
    const domain = k.replace(/^lv_/, "");
    if (v) {
      level_map[domain] = v;
      courses.push(v); // Add the course to interests array
    }
  }
  if (!courses.length) {
    return NextResponse.redirect(new URL("/onboarding", new URL(req.url).origin));
  }

  // Ensure row exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any)
    .from("profiles")
    .insert({ id: user.id, total_cost: 0 })
    .select("id")
    .maybeSingle();

  // New data model: interests now contains courses directly (e.g., ["Calculus 2", "Chemistry"])
  // level_map is kept for backward compatibility but interests is the source of truth
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).from("profiles").update({
    interests: courses, // Store courses in interests
    level_map, // Keep for backward compatibility
    placement_ready: true,
    updated_at: new Date().toISOString(),
  }).eq("id", user.id);

  return NextResponse.redirect(new URL("/post-auth", new URL(req.url).origin));
}
