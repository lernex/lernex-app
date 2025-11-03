// app/api/profile/interests/add/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { DOMAINS, LEVELS_BY_DOMAIN } from "@/data/domains";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { interest } = await req.json().catch(() => ({}));

  // Validate the interest is a valid course (can be a domain OR a specific course)
  const allValidCourses = Object.values(LEVELS_BY_DOMAIN).flat();
  const isValidDomain = DOMAINS.includes(interest);
  const isValidCourse = allValidCourses.includes(interest);

  if (!interest || typeof interest !== "string" || (!isValidDomain && !isValidCourse)) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }

  // Get current profile
  const { data: profile, error: fetchError } = await sb
    .from("profiles")
    .select("interests, level_map")
    .eq("id", user.id)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const profileData = profile as { interests?: string[]; level_map?: unknown } | null;
  const currentInterests = profileData?.interests || [];

  // Check if interest already exists
  if (currentInterests.includes(interest)) {
    return NextResponse.json({ error: "Subject already added" }, { status: 400 });
  }

  // Add the new interest
  const updatedInterests = [...currentInterests, interest];

  // Get current level_map
  const currentLevelMap = (profileData?.level_map as Record<string, string>) || {};

  // Update level_map based on what was added
  const updatedLevelMap = isValidCourse && !isValidDomain
    ? { ...currentLevelMap, [interest]: interest } // Adding specific course, map to itself
    : currentLevelMap; // Adding domain, level_map will be filled in by /onboarding/levels

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (sb as any)
    .from("profiles")
    .update({
      interests: updatedInterests,
      level_map: updatedLevelMap, // Update level_map if we added a course
      updated_at: new Date().toISOString(),
      placement_ready: true // Enable placement for the new interest
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    interests: updatedInterests,
    message: `${interest} added successfully. Run placement to set your level.`
  });
}
