// lib/background-jobs/cohort-builder.ts
// Background job for building user cohorts based on similarity
// Run daily to cluster users and update cohort assignments

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/types_db";

// ============================================================================
// USER VECTOR COMPUTATION
// ============================================================================

interface UserVector {
  userId: string;
  subject: string;
  interestsVector: number[];
  performanceVector: number[];
  preferenceVector: number[];
}

/**
 * Compute feature vector for a user in a subject
 * Returns normalized vectors for interests, performance, and preferences
 */
async function computeUserVector(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string
): Promise<UserVector | null> {
  // Fetch user data
  const [profile, preferences, progress] = await Promise.all([
    supabase
      .from("profiles")
      .select("interests")
      .eq("id", userId)
      .single(),
    supabase
      .from("user_subject_preferences")
      .select("tone_tags, liked_ids, disliked_ids")
      .eq("user_id", userId)
      .eq("subject", subject)
      .single(),
    supabase
      .from("user_subject_progress")
      .select("metrics")
      .eq("user_id", userId)
      .eq("subject", subject)
      .single(),
  ]);

  if (!profile.data) return null;

  // 1. Interests Vector (5 dimensions - common subjects)
  const commonSubjects = ["Math", "Physics", "Chemistry", "Biology", "Computer Science"];
  const interests = profile.data.interests || [];
  const interestsVector = commonSubjects.map((s) =>
    interests.includes(s) ? 1.0 : 0.0
  );

  // 2. Performance Vector (3 dimensions - accuracy, pace, consistency)
  const metrics = (progress.data?.metrics as any) || {};
  const accuracy = typeof metrics.accuracyPct === "number"
    ? metrics.accuracyPct / 100
    : 0.5;
  const pace = metrics.pace === "fast" ? 1.0 : metrics.pace === "slow" ? 0.0 : 0.5;
  const sampleSize = typeof metrics.sampleSize === "number" ? metrics.sampleSize : 0;
  const consistency = Math.min(1.0, sampleSize / 20); // Normalize to 0-1
  const performanceVector = [accuracy, pace, consistency];

  // 3. Preference Vector (9 dimensions - tone tags)
  const allToneTags = [
    "step-by-step",
    "real-world",
    "visual",
    "story-driven",
    "challenge-oriented",
    "playful",
    "supportive",
    "fast-paced",
    "practice-heavy",
  ];
  const userToneTags = preferences.data?.tone_tags || [];
  const preferenceVector = allToneTags.map((tag) =>
    userToneTags.includes(tag) ? 1.0 : 0.0
  );

  return {
    userId,
    subject,
    interestsVector,
    performanceVector,
    preferenceVector,
  };
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const norm = Math.sqrt(normA) * Math.sqrt(normB);
  return norm > 0 ? dotProduct / norm : 0;
}

/**
 * Compute combined similarity score between two user vectors
 */
function computeUserSimilarity(a: UserVector, b: UserVector): number {
  // Weighted combination of similarities
  const interestsSim = cosineSimilarity(a.interestsVector, b.interestsVector);
  const performanceSim = cosineSimilarity(a.performanceVector, b.performanceVector);
  const preferenceSim = cosineSimilarity(a.preferenceVector, b.preferenceVector);

  // Weights: interests 30%, performance 40%, preferences 30%
  return (
    interestsSim * 0.3 +
    performanceSim * 0.4 +
    preferenceSim * 0.3
  );
}

// ============================================================================
// COHORT BUILDING
// ============================================================================

/**
 * Build cohorts for a subject using k-means-like clustering
 * Groups similar users together
 */
async function buildCohortsForSubject(
  supabase: SupabaseClient<Database>,
  subject: string,
  numCohorts: number = 10
): Promise<void> {
  console.log(`[cohort-builder] Building cohorts for ${subject}...`);

  // Get all users who have progress in this subject
  const { data: users } = await supabase
    .from("user_subject_progress")
    .select("user_id")
    .eq("subject", subject);

  if (!users || users.length < numCohorts) {
    console.log(`[cohort-builder] Not enough users for ${subject} (${users?.length || 0})`);
    return;
  }

  // Compute vectors for all users
  const userVectors: UserVector[] = [];
  for (const { user_id } of users) {
    const vector = await computeUserVector(supabase, user_id, subject);
    if (vector) {
      userVectors.push(vector);
    }
  }

  console.log(`[cohort-builder] Computed ${userVectors.length} user vectors for ${subject}`);

  // Simple cohort assignment based on performance and preferences
  // In production, use proper k-means clustering
  const cohorts = new Map<string, UserVector[]>();

  for (const vector of userVectors) {
    // Create cohort ID based on performance and pace
    const perfScore = vector.performanceVector[0] || 0; // accuracy
    const paceScore = vector.performanceVector[1] || 0; // pace

    const perfLevel =
      perfScore > 0.7 ? "advanced" : perfScore > 0.4 ? "intermediate" : "beginner";
    const paceLevel = paceScore > 0.6 ? "fast" : paceScore > 0.3 ? "medium" : "slow";

    // Check if user prefers visual content
    const visualIdx = 2; // "visual" is 3rd in tone tags list
    const isVisual = vector.preferenceVector[visualIdx] === 1.0;
    const visualTag = isVisual ? "visual" : "text";

    const cohortId = `${subject}_${perfLevel}_${paceLevel}_${visualTag}`;

    if (!cohorts.has(cohortId)) {
      cohorts.set(cohortId, []);
    }
    cohorts.get(cohortId)!.push(vector);
  }

  console.log(`[cohort-builder] Created ${cohorts.size} cohorts for ${subject}`);

  // Compute similarity scores and save cohort assignments
  for (const [cohortId, members] of cohorts.entries()) {
    // Compute centroid
    const centroid: UserVector = {
      userId: "centroid",
      subject,
      interestsVector: Array(5).fill(0),
      performanceVector: Array(3).fill(0),
      preferenceVector: Array(9).fill(0),
    };

    for (const member of members) {
      for (let i = 0; i < 5; i++) {
        centroid.interestsVector[i] += member.interestsVector[i] || 0;
      }
      for (let i = 0; i < 3; i++) {
        centroid.performanceVector[i] += member.performanceVector[i] || 0;
      }
      for (let i = 0; i < 9; i++) {
        centroid.preferenceVector[i] += member.preferenceVector[i] || 0;
      }
    }

    // Normalize centroid
    for (let i = 0; i < 5; i++) {
      centroid.interestsVector[i] /= members.length;
    }
    for (let i = 0; i < 3; i++) {
      centroid.performanceVector[i] /= members.length;
    }
    for (let i = 0; i < 9; i++) {
      centroid.preferenceVector[i] /= members.length;
    }

    // Compute similarity to centroid for each member
    for (const member of members) {
      const similarityScore = computeUserSimilarity(member, centroid);

      // Upsert cohort assignment
      await supabase.from("user_cohorts").upsert(
        {
          user_id: member.userId,
          subject: member.subject,
          cohort_id: cohortId,
          similarity_score: similarityScore,
          interests_vector: member.interestsVector,
          performance_vector: member.performanceVector,
          preference_vector: member.preferenceVector,
          cohort_size: members.length,
          last_updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,subject",
        }
      );
    }
  }

  console.log(`[cohort-builder] Saved cohort assignments for ${subject}`);
}

// ============================================================================
// MAIN JOB
// ============================================================================

/**
 * Main cohort builder job
 * Run this daily to update user cohorts
 */
export async function runCohortBuilderJob(
  supabase: SupabaseClient<Database>
): Promise<void> {
  console.log("[cohort-builder] Starting cohort builder job...");

  // Get all subjects with active users
  const { data: subjects } = await supabase
    .from("user_subject_progress")
    .select("subject")
    .limit(1000);

  if (!subjects) {
    console.log("[cohort-builder] No subjects found");
    return;
  }

  const uniqueSubjects = [...new Set(subjects.map((s) => s.subject))];
  console.log(`[cohort-builder] Processing ${uniqueSubjects.length} subjects`);

  // Build cohorts for each subject
  for (const subject of uniqueSubjects) {
    try {
      await buildCohortsForSubject(supabase, subject);
    } catch (error) {
      console.error(`[cohort-builder] Error building cohorts for ${subject}:`, error);
    }
  }

  console.log("[cohort-builder] Cohort builder job complete");
}

/**
 * Cleanup old cohort data (optional maintenance)
 */
export async function cleanupOldCohorts(
  supabase: SupabaseClient<Database>
): Promise<void> {
  // Remove cohorts not updated in 7 days (stale data)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data, error } = await supabase
    .from("user_cohorts")
    .delete()
    .lt("last_updated_at", sevenDaysAgo.toISOString());

  if (error) {
    console.error("[cohort-builder] Error cleaning up old cohorts:", error);
  } else {
    console.log("[cohort-builder] Cleaned up stale cohort data");
  }
}
