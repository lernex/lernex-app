// app/api/recommendations/collaborative/route.ts
// API endpoint for collaborative filtering recommendations
// Returns similar learner recommendations for a given subject

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getRecommendationsWithCache } from "@/lib/collaborative-filtering";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/recommendations/collaborative
 * Query params:
 *   - subject: required - subject to get recommendations for
 *   - limit: optional - number of recommendations (default: 10)
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
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 10;

  if (!subject) {
    return NextResponse.json(
      { error: "Subject parameter required" },
      { status: 400 }
    );
  }

  try {
    // Get collaborative recommendations
    const recommendations = await getRecommendationsWithCache(
      supabase,
      user.id,
      subject,
      limit
    );

    // Return recommendations
    return NextResponse.json({
      subject,
      recommendations: recommendations.recommendedLessonIds,
      scores: recommendations.scores,
      sources: recommendations.sources,
      count: recommendations.recommendedLessonIds.length,
    });
  } catch (error) {
    console.error("Error fetching collaborative recommendations:", error);
    return NextResponse.json(
      { error: "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}
