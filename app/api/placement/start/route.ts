import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { Difficulty } from "@/types/placement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Read interests & level_map
  const { data: prof, error } = await sb
    .from("profiles")
    .select("interests, level_map, placement_ready")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const profile = prof as { interests?: unknown; level_map?: unknown; placement_ready?: boolean } | null;
  if (!profile?.placement_ready) return NextResponse.json({ error: "Placement not required" }, { status: 400 });

  const interests: string[] = Array.isArray(profile?.interests) ? profile.interests as string[] : [];
  if (!interests.length) return NextResponse.json({ error: "No interests" }, { status: 400 });

  const levelMap: Record<string, string> = (profile?.level_map as Record<string, string>) ?? {};
  const courses = interests
    .filter((s) => levelMap[s])
    .map((s) => ({ subject: s, course: levelMap[s]! }));
  if (!courses.length) return NextResponse.json({ error: "No course selected for any interest" }, { status: 400 });

  const [first, ...rest] = courses;

  // Always begin at the introductory level for a course. Difficulty will
  // adapt based on the learner's answers rather than relying on the course
  // name, ensuring questions progress through the course's own units.

  const state = {
    subject: first.subject,
    course: first.course,
    difficulty: "intro" as Difficulty,
    step: 1,
    correctStreak: 0,
    mistakes: 0,
    done: false,
    maxSteps: 7,
    asked: [],
    remaining: rest,
  };

  return NextResponse.json(state);
}
