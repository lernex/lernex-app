// app/api/learning-style/route.ts
// API endpoint for learning style profile management
// Returns user's learning style profile and adaptations

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  getLearningStyleProfile,
  adaptContentToStyle,
  updateLearningStyleProfile,
} from "@/lib/learning-style-detection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/learning-style
 * Query params:
 *   - subject: required - subject to get profile for
 */
export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();

  // Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get query parameters
  const subject = req.nextUrl.searchParams.get("subject");

  if (!subject) {
    return NextResponse.json(
      { error: "Subject parameter required" },
      { status: 400 }
    );
  }

  try {
    // Get learning style profile
    const profile = await getLearningStyleProfile(
      supabase,
      user.id,
      subject
    );

    // Generate adaptations
    const adaptations = adaptContentToStyle(profile);

    // Return profile and adaptations
    return NextResponse.json({
      subject,
      profile: {
        visualPreference: profile.visualPreference,
        examplePreference: profile.examplePreference,
        pacePreference: profile.pacePreference,
        challengeTolerance: profile.challengeTolerance,
        explanationLength: profile.explanationLength,
        retryTendency: profile.retryTendency,
        errorConsistency: profile.errorConsistency,
        helpSeeking: profile.helpSeeking,
        confidenceLevel: profile.confidenceLevel,
        sampleSize: profile.sampleSize,
      },
      adaptations: {
        toneModifiers: adaptations.toneModifiers,
        explanationStyle: adaptations.explanationStyle,
      },
    });
  } catch (error) {
    console.error("Error fetching learning style profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch learning style profile" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/learning-style
 * Body:
 *   - subject: required - subject to update profile for
 *
 * Triggers a learning style profile update based on recent interactions
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();

  // Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { subject } = body;

    if (!subject) {
      return NextResponse.json(
        { error: "Subject required in body" },
        { status: 400 }
      );
    }

    // Update learning style profile
    await updateLearningStyleProfile(supabase, user.id, subject);

    // Get updated profile
    const profile = await getLearningStyleProfile(
      supabase,
      user.id,
      subject
    );

    return NextResponse.json({
      success: true,
      subject,
      profile: {
        confidenceLevel: profile.confidenceLevel,
        sampleSize: profile.sampleSize,
      },
    });
  } catch (error) {
    console.error("Error updating learning style profile:", error);
    return NextResponse.json(
      { error: "Failed to update learning style profile" },
      { status: 500 }
    );
  }
}
