// lib/fyp-enhancements.ts
// Enhanced FYP integration layer for collaborative filtering & learning style detection
// This module provides clean integration points for the existing FYP system

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/types_db";
import {
  getRecommendationsWithCache,
  CollaborativeRecommendations,
} from "@/lib/collaborative-filtering";
import {
  getLearningStyleProfile,
  adaptContentToStyle,
  LearningStyle,
  ContentAdaptations,
} from "@/lib/learning-style-detection";

// ============================================================================
// COLLABORATIVE FILTERING INTEGRATION
// ============================================================================

/**
 * Blend curriculum-based and collaborative recommendations
 * 70% curriculum (existing path) + 20% collaborative + 10% exploratory
 */
export async function getBlendedRecommendations(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string,
  currentTopicLessons: string[], // Lesson IDs from current topic
  recentLessonIds: string[] // Recently delivered lessons to avoid
): Promise<{
  blended: string[];
  sources: {
    curriculum: string[];
    collaborative: string[];
    exploratory: string[];
  };
}> {
  // Get collaborative recommendations
  const collabRecs = await getRecommendationsWithCache(
    supabase,
    userId,
    subject,
    10
  );

  // Filter out recently delivered lessons
  const recentSet = new Set(recentLessonIds);
  const freshCollabRecs = collabRecs.recommendedLessonIds.filter(
    (id) => !recentSet.has(id)
  );

  // Blend recommendations
  // - 70% from current topic (curriculum)
  // - 20% from collaborative filtering
  // - 10% from exploratory (future: cross-subject connections)

  const curriculumCount = Math.floor(currentTopicLessons.length * 0.7);
  const collabCount = Math.floor(freshCollabRecs.length * 0.2);

  const curriculum = currentTopicLessons.slice(0, curriculumCount);
  const collaborative = freshCollabRecs.slice(0, Math.min(collabCount, 3));
  const exploratory: string[] = []; // Future: implement cross-subject recommendations

  // Interleave recommendations for better UX
  const blended: string[] = [];
  const maxLen = Math.max(curriculum.length, collaborative.length, exploratory.length);

  for (let i = 0; i < maxLen; i++) {
    // Add curriculum lesson
    if (i < curriculum.length) blended.push(curriculum[i]!);
    // Every 3 curriculum lessons, add 1 collaborative
    if (i % 3 === 2 && collaborative.length > 0) {
      const collabLesson = collaborative.shift();
      if (collabLesson) blended.push(collabLesson);
    }
    // Every 10 lessons, add 1 exploratory
    if (i % 10 === 9 && exploratory.length > 0) {
      const exploratoryLesson = exploratory.shift();
      if (exploratoryLesson) blended.push(exploratoryLesson);
    }
  }

  return {
    blended,
    sources: {
      curriculum,
      collaborative,
      exploratory,
    },
  };
}

/**
 * Enrich lesson metadata with collaborative signals
 * Adds "Similar learners enjoyed this" tags
 */
export function enrichLessonWithCollaborativeSignals(
  lesson: Record<string, unknown>,
  collabRecs: CollaborativeRecommendations
): Record<string, unknown> {
  const lessonId = lesson.id as string;
  const isCollabRecommended = collabRecs.recommendedLessonIds.includes(lessonId);

  if (!isCollabRecommended) {
    return lesson;
  }

  // Find score for this lesson
  const index = collabRecs.recommendedLessonIds.indexOf(lessonId);
  const score = collabRecs.scores[index] || 0;

  // Determine source
  const sources = [];
  if (collabRecs.sources.cohort.includes(lessonId)) {
    sources.push("Similar learners enjoyed this");
  }
  if (collabRecs.sources.coOccurrence.includes(lessonId)) {
    sources.push("Often studied together");
  }

  return {
    ...lesson,
    collaborativeSignals: {
      isRecommended: true,
      score: Math.round(score * 100), // Convert to percentage
      reasons: sources,
    },
  };
}

// ============================================================================
// LEARNING STYLE INTEGRATION
// ============================================================================

/**
 * Get learning style adaptations for content generation
 * Returns style-based prompt modifications
 */
export async function getStyleAdaptations(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string,
  existingToneTags: string[] = []
): Promise<{
  style: LearningStyle;
  adaptations: ContentAdaptations;
  enhancedToneTags: string[];
}> {
  // Get user's learning style profile
  const style = await getLearningStyleProfile(supabase, userId, subject);

  // Generate content adaptations
  const adaptations = adaptContentToStyle(style, existingToneTags);

  // Merge with existing tone tags
  const enhancedToneTags = Array.from(
    new Set([...existingToneTags, ...adaptations.toneModifiers])
  );

  return {
    style,
    adaptations,
    enhancedToneTags,
  };
}

/**
 * Enhance lesson generation prompt with learning style adaptations
 * Appends style-based instructions to the existing prompt
 */
export function enhancePromptWithStyle(
  basePrompt: string,
  adaptations: ContentAdaptations
): string {
  if (!adaptations.promptSuffix) {
    return basePrompt;
  }

  return `${basePrompt}${adaptations.promptSuffix}`;
}

/**
 * Format learning style profile for debugging/logging
 */
export function formatStyleProfileForLog(style: LearningStyle): string {
  const dims = [];
  if (Math.abs(style.visualPreference) > 0.3) {
    dims.push(`visual:${style.visualPreference.toFixed(2)}`);
  }
  if (Math.abs(style.examplePreference) > 0.3) {
    dims.push(`example:${style.examplePreference.toFixed(2)}`);
  }
  if (Math.abs(style.pacePreference) > 0.3) {
    dims.push(`pace:${style.pacePreference.toFixed(2)}`);
  }
  if (Math.abs(style.challengeTolerance) > 0.3) {
    dims.push(`challenge:${style.challengeTolerance.toFixed(2)}`);
  }

  return dims.length > 0
    ? `[${dims.join(", ")}] (confidence: ${(style.confidenceLevel * 100).toFixed(0)}%)`
    : "neutral";
}

// ============================================================================
// UNIFIED ENHANCEMENT API
// ============================================================================

/**
 * Get all enhancements for FYP in one call
 * Returns collaborative recommendations + learning style adaptations
 */
export async function getFYPEnhancements(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string,
  existingToneTags: string[] = []
): Promise<{
  collaborative: CollaborativeRecommendations;
  style: LearningStyle;
  adaptations: ContentAdaptations;
  enhancedToneTags: string[];
}> {
  // Fetch both in parallel for performance
  const [collabRecs, styleData] = await Promise.all([
    getRecommendationsWithCache(supabase, userId, subject, 10),
    getStyleAdaptations(supabase, userId, subject, existingToneTags),
  ]);

  return {
    collaborative: collabRecs,
    style: styleData.style,
    adaptations: styleData.adaptations,
    enhancedToneTags: styleData.enhancedToneTags,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if collaborative filtering is enabled for user
 * Can be used for A/B testing or gradual rollout
 */
export function isCollaborativeFilteringEnabled(
  userTier: string,
  sampleRate: number = 1.0
): boolean {
  // Enable for all premium users, sample for others
  if (userTier === "premium") return true;
  return Math.random() < sampleRate;
}

/**
 * Check if learning style detection is enabled
 */
export function isLearningStyleDetectionEnabled(
  userTier: string,
  sampleRate: number = 1.0
): boolean {
  // Enable for all paid users, sample for free users
  if (userTier === "premium" || userTier === "plus") return true;
  return Math.random() < sampleRate;
}

/**
 * Log enhancement metrics for monitoring
 */
export function logEnhancementMetrics(
  reqId: string,
  userId: string,
  enhancements: {
    collabRecsCount: number;
    styleConfidence: number;
    adaptationsApplied: number;
  }
): void {
  console.log(
    `[fyp-enhancements][${reqId}] userId=${userId.slice(0, 8)} ` +
    `collabRecs=${enhancements.collabRecsCount} ` +
    `styleConf=${(enhancements.styleConfidence * 100).toFixed(0)}% ` +
    `adaptations=${enhancements.adaptationsApplied}`
  );
}
