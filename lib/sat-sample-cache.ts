// lib/sat-sample-cache.ts
// In-memory cache for SAT sample questions to reduce DB calls and token usage

import type { SupabaseClient } from "@supabase/supabase-js";

interface CacheEntry {
  content: string;
  timestamp: number;
}

interface SampleQuestion {
  question_text?: string;
  answer_choices?: unknown;
  correct_answer?: string;
  explanation?: string;
}

// Cache with 1 hour TTL
const SAMPLE_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Fetches sample questions from DB and returns compressed format
 * Uses in-memory cache to avoid repeated DB calls and reduce token usage
 */
export async function getCachedSampleQuestions(
  sb: SupabaseClient,
  section: string,
  topic: string,
  format: "stream" | "quiz" = "stream"
): Promise<string> {
  const key = `${section}:${topic}:${format}`;
  const now = Date.now();

  // Check cache
  const cached = SAMPLE_CACHE.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.content;
  }

  // Fetch from database
  let { data: sampleQuestions } = await sb
    .from("sat_questions")
    .select("question_text, answer_choices, correct_answer, explanation")
    .eq("section", section)
    .or(`tags.cs.{${topic}},topic.ilike.%${topic}%`)
    .limit(3);

  // Fallback to section-only if no topic-specific questions found
  if (!sampleQuestions || sampleQuestions.length === 0) {
    const fallbackResult = await sb
      .from("sat_questions")
      .select("question_text, answer_choices, correct_answer, explanation")
      .eq("section", section)
      .limit(3);
    sampleQuestions = fallbackResult.data;
  }

  // If still no questions, return empty string
  if (!sampleQuestions || sampleQuestions.length === 0) {
    return "";
  }

  // Compress the format to reduce token usage
  const compressed = compressSamples(sampleQuestions as SampleQuestion[], format);

  // Store in cache with auto-expiry
  SAMPLE_CACHE.set(key, { content: compressed, timestamp: now });

  // Schedule cleanup
  setTimeout(() => SAMPLE_CACHE.delete(key), CACHE_TTL);

  return compressed;
}

/**
 * Compresses sample questions into a compact format to reduce tokens
 * Stream format: ~250-350 tokens (vs 400-600 original)
 * Quiz format: ~300-400 tokens (vs 500-700 original)
 */
function compressSamples(questions: SampleQuestion[], format: "stream" | "quiz"): string {
  if (format === "stream") {
    // Compact format for streaming responses (lessons)
    let result = "\n\nExamples (match this style):\n\n";
    questions.forEach((q, idx) => {
      result += `Q${idx + 1}: ${q.question_text}\n`;
      if (q.answer_choices && Array.isArray(q.answer_choices)) {
        // Compact choice format: A) choice
        q.answer_choices.forEach((choice: string, i: number) => {
          result += `${String.fromCharCode(65 + i)}) ${choice}\n`;
        });
      }
      result += `Answer: ${q.correct_answer}\n\n`;
    });
    return result;
  } else {
    // Compact format for quiz generation
    let result = "\n\nStyle reference examples:\n\n";
    questions.forEach((q, idx) => {
      result += `Q${idx + 1}: ${q.question_text}\n`;
      if (q.answer_choices && Array.isArray(q.answer_choices)) {
        q.answer_choices.forEach((choice: string, i: number) => {
          result += `${String.fromCharCode(65 + i)}) ${choice}\n`;
        });
      }
      result += `Correct: ${q.correct_answer}\nWhy: ${q.explanation}\n\n`;
    });
    return result;
  }
}

/**
 * Clears all cached samples (useful for testing or manual cache invalidation)
 */
export function clearSampleCache(): void {
  SAMPLE_CACHE.clear();
}

/**
 * Gets current cache stats for monitoring
 */
export function getCacheStats() {
  return {
    size: SAMPLE_CACHE.size,
    keys: Array.from(SAMPLE_CACHE.keys()),
  };
}
