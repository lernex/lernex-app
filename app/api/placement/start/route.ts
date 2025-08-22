import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Read interests & level_map
  const { data: prof, error } = await sb
    .from("profiles")
    .select("interests, level_map, placement_ready")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!prof?.placement_ready) return NextResponse.json({ error: "Placement not required" }, { status: 400 });

  const interests: string[] = Array.isArray(prof?.interests) ? prof!.interests : [];
  if (!interests.length) return NextResponse.json({ error: "No interests" }, { status: 400 });

  const levelMap: Record<string, string> = (prof?.level_map as Record<string, string>) ?? {};
  // Pick the first subject that has a mapped course
  const subject = interests.find((s) => levelMap[s]);
  if (!subject) return NextResponse.json({ error: "No course selected for any interest" }, { status: 400 });

  const course = levelMap[subject];

  // Initial difficulty heuristic: intro for K-2, easy for middle, medium for HS+, else easy
  let difficulty: "intro" | "easy" | "medium" | "hard" = "easy";
  const lc = course.toLowerCase();
  if (/(kindergarten|grade\s*[12])/.test(lc)) difficulty = "intro";
  else if (/grade\s*[3-6]|pre\-?algebra/.test(lc)) difficulty = "easy";
  else if (/(algebra\s*1|geometry|biology|chemistry)/.test(lc)) difficulty = "medium";

  const state = {
    subject,
    course,
    difficulty,
    step: 1,
    correctStreak: 0,
    mistakes: 0,
    done: false,
    maxSteps: 6,
  };

  // Save ephemeral state in user's profile (optional) or just return it to client to hold in memory:
  return NextResponse.json(state);
}
