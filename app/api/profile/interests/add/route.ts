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
  const currentLevelMap = (profileData?.level_map as Record<string, string>) || {};

  // Validate: can only add courses, not domains
  if (isValidDomain && !isValidCourse) {
    return NextResponse.json({ error: "Cannot add a domain directly. Please select a specific course." }, { status: 400 });
  }

  // At this point, interest is a valid course
  const courseToAdd = interest;

  // Find which domain this course belongs to
  const foundDomain = Object.entries(LEVELS_BY_DOMAIN).find(([, courses]) =>
    courses.includes(courseToAdd)
  )?.[0];

  if (!foundDomain) {
    return NextResponse.json({ error: "Could not determine subject domain" }, { status: 400 });
  }

  // Check if this exact course already exists in interests
  if (currentInterests.includes(courseToAdd)) {
    return NextResponse.json({ error: "This class is already added" }, { status: 400 });
  }

  // New data model: interests now contains courses directly (e.g., ["Calculus 2", "AP Chemistry", "Algebra 2"])
  // This allows multiple courses from the same domain
  const updatedInterests = [...currentInterests, courseToAdd];

  // Update level_map for backward compatibility (map domain to latest course)
  const updatedLevelMap = { ...currentLevelMap, [foundDomain]: courseToAdd };

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
