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

  // Determine the domain and course to add
  let domainToAdd: string;
  let courseToAdd: string;

  if (isValidDomain) {
    // Adding a domain directly - will need to pick course later in /onboarding/levels
    domainToAdd = interest;
    courseToAdd = ""; // Will be filled in by /onboarding/levels
  } else {
    // Adding a specific course - find which domain it belongs to
    courseToAdd = interest;
    const foundDomain = Object.entries(LEVELS_BY_DOMAIN).find(([, courses]) =>
      courses.includes(interest)
    )?.[0];

    if (!foundDomain) {
      return NextResponse.json({ error: "Could not determine subject domain" }, { status: 400 });
    }
    domainToAdd = foundDomain;
  }

  // Check if domain already exists in interests
  if (currentInterests.includes(domainToAdd)) {
    // Domain exists - check if they're trying to add a different course for same domain
    if (courseToAdd && currentLevelMap[domainToAdd] !== courseToAdd) {
      // Update the course for existing domain
      const updatedLevelMap = { ...currentLevelMap, [domainToAdd]: courseToAdd };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (sb as any)
        .from("profiles")
        .update({
          level_map: updatedLevelMap,
          updated_at: new Date().toISOString(),
          placement_ready: true
        })
        .eq("id", user.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        interests: currentInterests,
        message: `${interest} updated successfully. Run placement to set your level.`
      });
    }
    return NextResponse.json({ error: "Subject already added" }, { status: 400 });
  }

  // Add the new domain to interests
  const updatedInterests = [...currentInterests, domainToAdd];

  // Update level_map if we have a specific course
  const updatedLevelMap = courseToAdd
    ? { ...currentLevelMap, [domainToAdd]: courseToAdd }
    : currentLevelMap;

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
