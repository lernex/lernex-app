// lib/collaborative-filtering.ts
// Collaborative Filtering Recommendation Engine
// Provides user similarity and lesson co-occurrence recommendations

import { Database } from "@/lib/types_db";
import { SupabaseClient } from "@supabase/supabase-js";

type UserCohort = Database["public"]["Tables"]["user_cohorts"]["Row"];
type LessonCoOccurrence = Database["public"]["Tables"]["lesson_co_occurrences"]["Row"];
type CollaborativeRecommendation = Database["public"]["Tables"]["collaborative_recommendations"]["Row"];

export interface CollaborativeRecommendations {
  recommendedLessonIds: string[];
  scores: number[];
  sources: {
    cohort: string[];      // From similar users in cohort
    coOccurrence: string[]; // From lesson associations
  };
}

// ============================================================================
// 1. USER SIMILARITY & COHORTS
// ============================================================================

/**
 * Get user's cohort for a given subject
 * Returns cohort_id and similarity score
 */
export async function getUserCohort(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string
): Promise<UserCohort | null> {
  const { data, error } = await supabase
    .from("user_cohorts")
    .select("*")
    .eq("user_id", userId)
    .eq("subject", subject)
    .single();

  if (error) {
    console.error("Error fetching user cohort:", error);
    return null;
  }

  return data;
}

/**
 * Find similar users in the same cohort
 * Excludes the current user and returns top N similar users
 */
export async function getSimilarUsers(
  supabase: SupabaseClient<Database>,
  cohortId: string,
  excludeUserId: string,
  limit: number = 50
): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_cohorts")
    .select("user_id")
    .eq("cohort_id", cohortId)
    .neq("user_id", excludeUserId)
    .order("similarity_score", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching similar users:", error);
    return [];
  }

  return data.map((row) => row.user_id);
}

// ============================================================================
// 2. LESSON CO-OCCURRENCE RECOMMENDATIONS
// ============================================================================

/**
 * Get lessons frequently liked together with given lessons
 * Uses confidence score to rank associations
 */
export async function getCoOccurrenceRecommendations(
  supabase: SupabaseClient<Database>,
  likedLessonIds: string[],
  subject: string,
  limit: number = 10,
  minConfidence: number = 0.3
): Promise<Array<{ lessonId: string; score: number }>> {
  if (likedLessonIds.length === 0) return [];

  const { data, error } = await supabase
    .from("lesson_co_occurrences")
    .select("lesson_b_id, confidence_score")
    .in("lesson_a_id", likedLessonIds)
    .eq("subject", subject)
    .gte("confidence_score", minConfidence)
    .order("confidence_score", { ascending: false })
    .limit(limit * 2); // Get more to deduplicate

  if (error) {
    console.error("Error fetching co-occurrence recommendations:", error);
    return [];
  }

  // Aggregate scores for lessons that appear multiple times
  const scoreMap = new Map<string, number>();
  for (const row of data) {
    const currentScore = scoreMap.get(row.lesson_b_id) || 0;
    // Use max score if lesson appears multiple times
    scoreMap.set(
      row.lesson_b_id,
      Math.max(currentScore, row.confidence_score || 0)
    );
  }

  // Filter out already liked lessons and sort by score
  const recommendations = Array.from(scoreMap.entries())
    .filter(([lessonId]) => !likedLessonIds.includes(lessonId))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([lessonId, score]) => ({ lessonId, score }));

  return recommendations;
}

// ============================================================================
// 3. COHORT-BASED RECOMMENDATIONS
// ============================================================================

/**
 * Get lessons liked by similar users in the cohort
 * Returns lessons the user hasn't interacted with yet
 */
export async function getCohortRecommendations(
  supabase: SupabaseClient<Database>,
  similarUserIds: string[],
  subject: string,
  currentUserLikedIds: string[],
  currentUserDislikedIds: string[],
  limit: number = 10
): Promise<Array<{ lessonId: string; score: number }>> {
  if (similarUserIds.length === 0) return [];

  // Get preferences from similar users
  const { data, error } = await supabase
    .from("user_subject_preferences")
    .select("liked_ids, saved_ids")
    .in("user_id", similarUserIds)
    .eq("subject", subject);

  if (error) {
    console.error("Error fetching cohort preferences:", error);
    return [];
  }

  // Count how many similar users liked each lesson
  const lessonCounts = new Map<string, number>();
  for (const pref of data) {
    const allLikes = [
      ...(pref.liked_ids || []),
      ...(pref.saved_ids || []),
    ];
    for (const lessonId of allLikes) {
      lessonCounts.set(lessonId, (lessonCounts.get(lessonId) || 0) + 1);
    }
  }

  // Filter out lessons user already interacted with
  const recommendations = Array.from(lessonCounts.entries())
    .filter(
      ([lessonId]) =>
        !currentUserLikedIds.includes(lessonId) &&
        !currentUserDislikedIds.includes(lessonId)
    )
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([lessonId, count]) => ({
      lessonId,
      score: Math.min(1.0, count / similarUserIds.length), // Normalize to 0-1
    }));

  return recommendations;
}

// ============================================================================
// 4. UNIFIED COLLABORATIVE FILTERING
// ============================================================================

/**
 * Get collaborative filtering recommendations using both cohort and co-occurrence
 * Blends recommendations from multiple sources
 */
export async function getCollaborativeRecommendations(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string,
  limit: number = 10
): Promise<CollaborativeRecommendations> {
  // Initialize result
  const result: CollaborativeRecommendations = {
    recommendedLessonIds: [],
    scores: [],
    sources: {
      cohort: [],
      coOccurrence: [],
    },
  };

  // Get user's current preferences
  const { data: preferences } = await supabase
    .from("user_subject_preferences")
    .select("liked_ids, disliked_ids, saved_ids")
    .eq("user_id", userId)
    .eq("subject", subject)
    .single();

  const likedIds = preferences?.liked_ids || [];
  const dislikedIds = preferences?.disliked_ids || [];
  const savedIds = preferences?.saved_ids || [];
  const allPositiveIds = [...likedIds, ...savedIds];

  // 1. Get cohort-based recommendations (40% weight)
  const cohort = await getUserCohort(supabase, userId, subject);
  let cohortRecs: Array<{ lessonId: string; score: number }> = [];
  if (cohort) {
    const similarUsers = await getSimilarUsers(
      supabase,
      cohort.cohort_id,
      userId,
      50
    );
    cohortRecs = await getCohortRecommendations(
      supabase,
      similarUsers,
      subject,
      allPositiveIds,
      dislikedIds,
      limit
    );
  }

  // 2. Get co-occurrence recommendations (60% weight)
  const coOccurrenceRecs = await getCoOccurrenceRecommendations(
    supabase,
    allPositiveIds,
    subject,
    limit,
    0.3
  );

  // 3. Blend recommendations with weighted scores
  const blendedScores = new Map<string, number>();
  const sources = new Map<string, string[]>();

  // Add cohort recommendations (weight: 0.4)
  for (const rec of cohortRecs) {
    blendedScores.set(rec.lessonId, rec.score * 0.4);
    sources.set(rec.lessonId, ["cohort"]);
  }

  // Add co-occurrence recommendations (weight: 0.6)
  for (const rec of coOccurrenceRecs) {
    const currentScore = blendedScores.get(rec.lessonId) || 0;
    blendedScores.set(rec.lessonId, currentScore + rec.score * 0.6);
    const currentSources = sources.get(rec.lessonId) || [];
    sources.set(rec.lessonId, [...currentSources, "coOccurrence"]);
  }

  // Sort by blended score and prepare result
  const sortedRecs = Array.from(blendedScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  result.recommendedLessonIds = sortedRecs.map(([id]) => id);
  result.scores = sortedRecs.map(([, score]) => score);

  // Populate sources
  for (const [lessonId] of sortedRecs) {
    const lessonSources = sources.get(lessonId) || [];
    if (lessonSources.includes("cohort")) {
      result.sources.cohort.push(lessonId);
    }
    if (lessonSources.includes("coOccurrence")) {
      result.sources.coOccurrence.push(lessonId);
    }
  }

  return result;
}

// ============================================================================
// 5. CACHE MANAGEMENT
// ============================================================================

/**
 * Get cached collaborative recommendations (fast path)
 * Returns null if cache is expired or doesn't exist
 */
export async function getCachedRecommendations(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string
): Promise<CollaborativeRecommendations | null> {
  const { data, error } = await supabase
    .from("collaborative_recommendations")
    .select("*")
    .eq("user_id", userId)
    .eq("subject", subject)
    .single();

  if (error || !data) return null;

  // Check if cache is expired
  const expiresAt = new Date(data.expires_at || 0);
  if (expiresAt < new Date()) {
    return null;
  }

  return {
    recommendedLessonIds: data.recommended_lesson_ids,
    scores: data.recommendation_scores.map(Number),
    sources: (data.recommendation_sources as { cohort: string[]; coOccurrence: string[] }) || {
      cohort: [],
      coOccurrence: [],
    },
  };
}

/**
 * Cache collaborative recommendations for fast retrieval
 * Expires in 2 hours by default
 */
export async function cacheRecommendations(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string,
  recommendations: CollaborativeRecommendations,
  expiryHours: number = 2
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiryHours);

  const { error } = await supabase.from("collaborative_recommendations").upsert(
    {
      user_id: userId,
      subject: subject,
      recommended_lesson_ids: recommendations.recommendedLessonIds,
      recommendation_scores: recommendations.scores,
      recommendation_sources: recommendations.sources as Record<string, unknown>,
      generated_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    {
      onConflict: "user_id,subject",
    }
  );

  if (error) {
    console.error("Error caching recommendations:", error);
  }
}

// ============================================================================
// 6. MAIN API - FAST RECOMMENDATIONS
// ============================================================================

/**
 * Get collaborative recommendations with cache fallback
 * This is the main function to use in the FYP route
 */
export async function getRecommendationsWithCache(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string,
  limit: number = 10
): Promise<CollaborativeRecommendations> {
  // Try cache first
  const cached = await getCachedRecommendations(supabase, userId, subject);
  if (cached && cached.recommendedLessonIds.length > 0) {
    return cached;
  }

  // Generate fresh recommendations
  const recommendations = await getCollaborativeRecommendations(
    supabase,
    userId,
    subject,
    limit
  );

  // Cache for next time (don't await - fire and forget)
  cacheRecommendations(supabase, userId, subject, recommendations).catch(
    (err) => console.error("Failed to cache recommendations:", err)
  );

  return recommendations;
}
