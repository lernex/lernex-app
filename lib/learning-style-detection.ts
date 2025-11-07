// lib/learning-style-detection.ts
// Learning Style Detection & Adaptation
// Detects behavioral patterns and adapts content accordingly

import { Database } from "@/lib/types_db";
import { SupabaseClient } from "@supabase/supabase-js";

type LearningStyleProfile = Database["public"]["Tables"]["user_learning_style_profile"]["Row"];
type InteractionSignal = Database["public"]["Tables"]["interaction_signals"]["Insert"];

// ============================================================================
// 1. LEARNING STYLE PROFILE TYPES
// ============================================================================

export interface LearningStyle {
  visualPreference: number;      // -1 to 1: text vs visual
  examplePreference: number;     // -1 to 1: abstract vs concrete
  pacePreference: number;        // -1 to 1: thorough vs fast
  challengeTolerance: number;    // -1 to 1: comfort vs stretch
  explanationLength: number;     // -1 to 1: concise vs detailed
  retryTendency: number;         // -1 to 1: move-on vs perfectionist
  errorConsistency: number;      // -1 to 1: random vs systematic
  helpSeeking: number;           // -1 to 1: independent vs frequent
  confidenceLevel: number;       // 0 to 1: statistical confidence
  sampleSize: number;            // number of attempts analyzed
}

export interface ContentAdaptations {
  toneModifiers: string[];       // e.g., ["visual-rich", "fast-paced"]
  promptSuffix: string;          // Instructions to add to generation prompt
  explanationStyle: string;      // "concise" | "standard" | "detailed"
}

// ============================================================================
// 2. INTERACTION SIGNAL TRACKING
// ============================================================================

/**
 * Record detailed behavioral signals from a lesson interaction
 * Should be called after each lesson completion
 */
export async function recordInteractionSignal(
  supabase: SupabaseClient<Database>,
  signal: InteractionSignal
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("interaction_signals")
    .insert(signal);

  if (error) {
    console.error("Error recording interaction signal:", error);
  }
}

// ============================================================================
// 3. LEARNING STYLE COMPUTATION
// ============================================================================

/**
 * Compute learning style dimensions from recent interaction signals
 * Uses exponentially weighted moving average for recency bias
 */
async function computeLearningStyleFromSignals(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string
): Promise<Partial<LearningStyle>> {
  // Fetch recent signals (last 90 days, up to 100 signals)
  const { data: signalsData, error } = await supabase
    .from("interaction_signals")
    .select("*")
    .eq("user_id", userId)
    .eq("subject", subject)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !signalsData || signalsData.length === 0) {
    return {}; // Return empty if no data
  }

  const signals = signalsData as Array<{
    scroll_depth_percent: number | null;
    replay_count: number | null;
    hint_requests: number | null;
    first_attempt_correct: boolean | null;
    total_attempts: number | null;
    answer_change_count: number | null;
    time_to_first_answer_seconds: number | null;
    correct_count: number | null;
    total_questions: number | null;
    time_on_task_seconds: number | null;
    [key: string]: unknown;
  }>;

  const sampleSize = signals.length;

  // Helper: Calculate weighted average with recency bias
  const weightedAvg = (values: number[]): number => {
    let sum = 0;
    let weightSum = 0;
    for (let i = 0; i < values.length; i++) {
      const weight = Math.exp(-i / 20); // Exponential decay
      sum += values[i] * weight;
      weightSum += weight;
    }
    return weightSum > 0 ? sum / weightSum : 0;
  };

  // 1. Visual Preference: Inferred from scroll depth and replay behavior
  // High scroll depth + replays = prefers detailed visual content
  const scrollDepths = signals
    .filter((s) => s.scroll_depth_percent !== null)
    .map((s) => s.scroll_depth_percent!);
  const avgScrollDepth = scrollDepths.length > 0
    ? scrollDepths.reduce((a, b) => a + b, 0) / scrollDepths.length
    : 50;
  const replayCounts = signals.map((s) => s.replay_count || 0);
  const avgReplays = weightedAvg(replayCounts);
  const visualPreference = Math.max(-1, Math.min(1,
    (avgScrollDepth - 50) / 50 + avgReplays / 3 - 0.5
  ));

  // 2. Example Preference: Inferred from accuracy patterns
  // Users who prefer concrete examples have higher accuracy
  const accuracies = signals
    .filter((s) => s.correct_count !== null && s.total_questions !== null)
    .map((s) => (s.correct_count! / s.total_questions!) || 0);
  const avgAccuracy = accuracies.length > 0 ? weightedAvg(accuracies) : 0.5;
  const examplePreference = Math.max(-1, Math.min(1, (avgAccuracy - 0.5) * 2));

  // 3. Pace Preference: Inferred from time-on-task
  const times = signals
    .filter((s) => s.time_on_task_seconds !== null)
    .map((s) => s.time_on_task_seconds!);
  const medianTime = times.length > 0
    ? times.sort((a, b) => a - b)[Math.floor(times.length / 2)]
    : 120;
  // Assuming 120s is baseline - faster means prefers fast pace
  const pacePreference = Math.max(-1, Math.min(1, (120 - medianTime) / 120));

  // 4. Challenge Tolerance: Inferred from skip rate and accuracy
  const skipCount = signals.filter((s) => s.skipped).length;
  const skipRate = skipCount / sampleSize;
  const challengeTolerance = Math.max(-1, Math.min(1,
    avgAccuracy - skipRate
  ));

  // 5. Explanation Length: Inferred from scroll depth
  // High scroll = prefers detailed explanations
  const explanationLength = Math.max(-1, Math.min(1,
    (avgScrollDepth - 50) / 50
  ));

  // 6. Retry Tendency: Measure perfectionism
  const totalAttempts = signals.map((s) => s.total_attempts || 1);
  const avgAttempts = weightedAvg(totalAttempts);
  const retryTendency = Math.max(-1, Math.min(1, (avgAttempts - 1) / 2));

  // 7. Error Consistency: Measure if errors are systematic
  const firstAttemptCorrect = signals.filter((s) => s.first_attempt_correct);
  const consistencyRate = firstAttemptCorrect.length / sampleSize;
  const errorConsistency = Math.max(-1, Math.min(1,
    (consistencyRate - 0.5) * 2
  ));

  // 8. Help Seeking: Inferred from hint requests
  const hintRequests = signals.map((s) => s.hint_requests || 0);
  const avgHints = weightedAvg(hintRequests);
  const helpSeeking = Math.max(-1, Math.min(1, avgHints / 2 - 0.5));

  // Calculate confidence based on sample size (sigmoid)
  const confidenceLevel = Math.min(1.0, sampleSize / 30);

  return {
    visualPreference,
    examplePreference,
    pacePreference,
    challengeTolerance,
    explanationLength,
    retryTendency,
    errorConsistency,
    helpSeeking,
    confidenceLevel,
    sampleSize,
  };
}

/**
 * Update user's learning style profile based on recent interactions
 * Should be called after every 5 attempts or daily background job
 */
export async function updateLearningStyleProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string
): Promise<void> {
  // Compute style from signals
  const computed = await computeLearningStyleFromSignals(
    supabase,
    userId,
    subject
  );

  if (Object.keys(computed).length === 0) {
    return; // No data to update
  }

  // Fetch existing profile for smoothing
  const { data: existingData, error: existingError } = await supabase
    .from("user_learning_style_profile")
    .select("*")
    .eq("user_id", userId)
    .eq("subject", subject)
    .single();

  const existing = existingData as {
    visual_preference: number | null;
    example_preference: number | null;
    pace_preference: number | null;
    challenge_tolerance: number | null;
    explanation_length: number | null;
    retry_tendency: number | null;
    error_consistency: number | null;
    help_seeking: number | null;
    [key: string]: unknown;
  } | null;

  // Smooth with existing profile (70% new, 30% old) if exists
  const smooth = (newVal: number | undefined, oldVal: number | null): number => {
    if (newVal === undefined) return oldVal || 0;
    if (!oldVal || !existing) return newVal;
    return newVal * 0.7 + oldVal * 0.3;
  };

  // Prepare update
  const update: Database["public"]["Tables"]["user_learning_style_profile"]["Insert"] = {
    user_id: userId,
    subject: subject,
    visual_preference: smooth(computed.visualPreference, existing?.visual_preference ?? null),
    example_preference: smooth(computed.examplePreference, existing?.example_preference ?? null),
    pace_preference: smooth(computed.pacePreference, existing?.pace_preference ?? null),
    challenge_tolerance: smooth(computed.challengeTolerance, existing?.challenge_tolerance ?? null),
    explanation_length: smooth(computed.explanationLength, existing?.explanation_length ?? null),
    retry_tendency: smooth(computed.retryTendency, existing?.retry_tendency ?? null),
    error_consistency: smooth(computed.errorConsistency, existing?.error_consistency ?? null),
    help_seeking: smooth(computed.helpSeeking, existing?.help_seeking ?? null),
    confidence_level: computed.confidenceLevel || 0,
    sample_size: computed.sampleSize || 0,
    last_updated_at: new Date().toISOString(),
  };

  // Upsert profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("user_learning_style_profile")
    .upsert(update, {
      onConflict: "user_id,subject",
    });

  if (error) {
    console.error("Error updating learning style profile:", error);
  }
}

// ============================================================================
// 4. LEARNING STYLE RETRIEVAL
// ============================================================================

/**
 * Get user's learning style profile
 * Returns default neutral profile if not found
 */
export async function getLearningStyleProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  subject: string
): Promise<LearningStyle> {
  const { data, error } = await supabase
    .from("user_learning_style_profile")
    .select("*")
    .eq("user_id", userId)
    .eq("subject", subject)
    .single();

  if (error || !data) {
    // Return neutral profile as default
    return {
      visualPreference: 0,
      examplePreference: 0,
      pacePreference: 0,
      challengeTolerance: 0,
      explanationLength: 0,
      retryTendency: 0,
      errorConsistency: 0,
      helpSeeking: 0,
      confidenceLevel: 0,
      sampleSize: 0,
    };
  }

  const profile = data as {
    visual_preference: number | null;
    example_preference: number | null;
    pace_preference: number | null;
    challenge_tolerance: number | null;
    explanation_length: number | null;
    retry_tendency: number | null;
    error_consistency: number | null;
    help_seeking: number | null;
    confidence_level: number | null;
    sample_size: number | null;
  };

  return {
    visualPreference: profile.visual_preference || 0,
    examplePreference: profile.example_preference || 0,
    pacePreference: profile.pace_preference || 0,
    challengeTolerance: profile.challenge_tolerance || 0,
    explanationLength: profile.explanation_length || 0,
    retryTendency: profile.retry_tendency || 0,
    errorConsistency: profile.error_consistency || 0,
    helpSeeking: profile.help_seeking || 0,
    confidenceLevel: profile.confidence_level || 0,
    sampleSize: profile.sample_size || 0,
  };
}

// ============================================================================
// 5. CONTENT ADAPTATION
// ============================================================================

/**
 * Generate content adaptations based on learning style
 * Returns modifiers and prompt adjustments for lesson generation
 */
export function adaptContentToStyle(
  style: LearningStyle,
  toneTags: string[] = []
): ContentAdaptations {
  const toneModifiers: string[] = [];
  const promptInstructions: string[] = [];

  // Only apply adaptations if confidence is sufficient
  if (style.confidenceLevel < 0.3) {
    return {
      toneModifiers: [],
      promptSuffix: "",
      explanationStyle: "standard",
    };
  }

  // Visual Preference
  if (style.visualPreference > 0.3) {
    toneModifiers.push("visual-rich");
    promptInstructions.push(
      "Include vivid descriptions and visual imagery. Use analogies that create mental pictures."
    );
  } else if (style.visualPreference < -0.3) {
    toneModifiers.push("text-focused");
    promptInstructions.push(
      "Focus on clear textual explanations without relying on visual analogies."
    );
  }

  // Example Preference
  if (style.examplePreference > 0.4) {
    toneModifiers.push("example-heavy");
    promptInstructions.push(
      "Provide multiple concrete, real-world examples. Avoid abstract theory."
    );
  } else if (style.examplePreference < -0.2) {
    toneModifiers.push("theory-focused");
    promptInstructions.push(
      "Focus on theoretical understanding and abstract concepts."
    );
  }

  // Pace Preference
  if (style.pacePreference > 0.5) {
    toneModifiers.push("fast-paced");
    promptInstructions.push(
      "Keep explanations concise and move quickly through concepts."
    );
  } else if (style.pacePreference < -0.4) {
    toneModifiers.push("step-by-step");
    promptInstructions.push(
      "Break down concepts into small steps. Be patient and thorough."
    );
  }

  // Challenge Tolerance
  if (style.challengeTolerance > 0.6) {
    toneModifiers.push("challenging");
    promptInstructions.push(
      "Include stretch challenges and advanced applications."
    );
  } else if (style.challengeTolerance < -0.3) {
    toneModifiers.push("supportive");
    promptInstructions.push(
      "Build confidence with achievable challenges. Provide encouragement."
    );
  }

  // Retry Tendency (Perfectionist)
  if (style.retryTendency > 0.5) {
    promptInstructions.push(
      "Provide detailed feedback on mistakes to support mastery learning."
    );
  }

  // Help Seeking
  if (style.helpSeeking > 0.4) {
    promptInstructions.push(
      "Offer hints and guidance throughout the lesson."
    );
  }

  // Explanation Length
  let explanationStyle: "concise" | "standard" | "detailed" = "standard";
  if (style.explanationLength > 0.4) {
    explanationStyle = "detailed";
  } else if (style.explanationLength < -0.4) {
    explanationStyle = "concise";
  }

  // Build final prompt suffix
  const promptSuffix = promptInstructions.length > 0
    ? `\n\nStyle adaptations:\n${promptInstructions.map((i) => `- ${i}`).join("\n")}`
    : "";

  return {
    toneModifiers,
    promptSuffix,
    explanationStyle,
  };
}

/**
 * Merge learning style with existing tone tags
 * Returns combined style preferences for content generation
 */
export function mergeStyleWithToneTags(
  style: LearningStyle,
  existingToneTags: string[]
): string[] {
  const adaptations = adaptContentToStyle(style, existingToneTags);

  // Combine existing tone tags with style-based modifiers
  const merged = new Set([...existingToneTags, ...adaptations.toneModifiers]);

  return Array.from(merged);
}

// ============================================================================
// 6. INTEGRATION HELPERS
// ============================================================================

/**
 * Check if it's time to update learning style profile
 * Updates every 5 attempts to keep profile fresh
 */
export function shouldUpdateProfile(attemptCount: number): boolean {
  return attemptCount > 0 && attemptCount % 5 === 0;
}

/**
 * Create interaction signal from attempt data
 * Helper to convert attempt data to interaction signal format
 */
export function createInteractionSignalFromAttempt(
  userId: string,
  lessonId: string,
  subject: string,
  correctCount: number,
  totalQuestions: number,
  timeOnTaskSeconds: number,
  skipped: boolean = false
): InteractionSignal {
  return {
    user_id: userId,
    lesson_id: lessonId,
    subject: subject,
    time_on_task_seconds: timeOnTaskSeconds,
    scroll_depth_percent: null, // Needs client-side tracking
    replay_count: 0,
    hint_requests: 0,
    first_attempt_correct: correctCount === totalQuestions,
    total_attempts: 1,
    answer_change_count: 0,
    time_to_first_answer_seconds: null,
    correct_count: correctCount,
    total_questions: totalQuestions,
    skipped: skipped,
    created_at: new Date().toISOString(),
  };
}
