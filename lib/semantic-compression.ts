// lib/semantic-compression.ts
/**
 * Semantic Compression Utility
 *
 * Provides LLM-based context compression to reduce token usage while
 * preserving semantic meaning and key information.
 *
 * Inspired by LLMLingua and AutoCompressor approaches.
 */

import OpenAI from "openai";
import Groq from "groq-sdk";

// Cache compressed results to avoid re-compression
const compressionCache = new Map<string, { compressed: string; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

interface CompressionOptions {
  /** Target compression rate (0-1). 0.5 = 50% reduction */
  rate?: number;
  /** Maximum output tokens (overrides rate if specified) */
  maxTokens?: number;
  /** Preserve specific keywords/phrases */
  preserve?: string[];
  /** Use cache for identical inputs */
  useCache?: boolean;
  /** Model to use for compression (default: groq gpt-oss-20b for cost & quality) */
  model?: string;
  /** Temperature for compression (lower = more deterministic) */
  temperature?: number;
  /** Provider to use ('groq' | 'openai') - default: groq */
  provider?: 'groq' | 'openai';
}

interface CompressionResult {
  compressed: string;
  originalLength: number;
  compressedLength: number;
  compressionRatio: number;
  cached: boolean;
  tokensEstimate: {
    original: number;
    compressed: number;
    saved: number;
  };
}

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 chars)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Generate cache key for compression options
 */
function getCacheKey(text: string, options: CompressionOptions): string {
  const { rate, maxTokens, preserve } = options;
  const preserveStr = preserve?.sort().join(',') || '';
  return `${text.slice(0, 100)}_${rate}_${maxTokens}_${preserveStr}`;
}

/**
 * Clean expired cache entries
 */
function cleanCache(): void {
  const now = Date.now();
  for (const [key, value] of compressionCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      compressionCache.delete(key);
    }
  }
}

/**
 * Compress text using LLM-based semantic compression
 *
 * @param text - Text to compress
 * @param options - Compression options
 * @returns Compression result with metrics
 *
 * @example
 * ```ts
 * const result = await compressContext(longSystemPrompt, { rate: 0.5 });
 * console.log(`Saved ${result.tokensEstimate.saved} tokens`);
 * ```
 */
export async function compressContext(
  text: string,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    rate = 0.5,
    maxTokens,
    preserve = [],
    useCache = true,
    model = "openai/gpt-oss-20b",
    temperature = 0.3,
    provider = 'groq',
  } = options;

  // Check cache first
  if (useCache) {
    cleanCache();
    const cacheKey = getCacheKey(text, options);
    const cached = compressionCache.get(cacheKey);
    if (cached) {
      const originalTokens = estimateTokens(text);
      const compressedTokens = estimateTokens(cached.compressed);
      return {
        compressed: cached.compressed,
        originalLength: text.length,
        compressedLength: cached.compressed.length,
        compressionRatio: cached.compressed.length / text.length,
        cached: true,
        tokensEstimate: {
          original: originalTokens,
          compressed: compressedTokens,
          saved: originalTokens - compressedTokens,
        },
      };
    }
  }

  const originalTokens = estimateTokens(text);
  const targetTokens = maxTokens || Math.floor(originalTokens * (1 - rate));

  // Build compression prompt
  const preserveInstruction = preserve.length > 0
    ? `CRITICAL: You must preserve these exact terms/phrases: ${preserve.join(", ")}`
    : "";

  const systemPrompt = `You are a semantic text compressor. Your task is to compress the given text to approximately ${targetTokens} tokens (currently ~${originalTokens} tokens) while preserving all key information, meanings, and instructions.

Compression guidelines:
- Remove redundant phrases and verbose explanations
- Keep all critical instructions, rules, and constraints
- Maintain technical terms and specific details
- Use concise language without losing meaning
- Preserve logical structure and flow
- Keep all numbers, formulas, and specific examples
${preserveInstruction}

Output ONLY the compressed text, no explanations or meta-commentary.`;

  try {
    let response;

    if (provider === 'groq') {
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });

      response = await groq.chat.completions.create({
        model,
        temperature,
        max_tokens: Math.min(targetTokens + 100, 8000), // Groq supports up to 8k output
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      });
    } else {
      // Fallback to OpenAI
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      response = await openai.chat.completions.create({
        model,
        temperature,
        max_tokens: Math.min(targetTokens + 100, 4000), // OpenAI cap at 4k
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      });
    }

    const compressed = response.choices[0]?.message?.content || text;
    const compressedTokens = estimateTokens(compressed);

    // Cache result
    if (useCache) {
      const cacheKey = getCacheKey(text, options);
      compressionCache.set(cacheKey, {
        compressed,
        timestamp: Date.now(),
      });
    }

    const result: CompressionResult = {
      compressed,
      originalLength: text.length,
      compressedLength: compressed.length,
      compressionRatio: compressed.length / text.length,
      cached: false,
      tokensEstimate: {
        original: originalTokens,
        compressed: compressedTokens,
        saved: originalTokens - compressedTokens,
      },
    };

    console.log("[semantic-compression]", {
      original: originalTokens,
      compressed: compressedTokens,
      saved: result.tokensEstimate.saved,
      ratio: result.compressionRatio.toFixed(2),
    });

    return result;
  } catch (error) {
    console.error("[semantic-compression] error", error);
    // Fallback: return original text with no compression
    return {
      compressed: text,
      originalLength: text.length,
      compressedLength: text.length,
      compressionRatio: 1,
      cached: false,
      tokensEstimate: {
        original: originalTokens,
        compressed: originalTokens,
        saved: 0,
      },
    };
  }
}

/**
 * Batch compress multiple text segments
 * Useful for compressing different parts of context independently
 */
export async function compressContextBatch(
  segments: Array<{ key: string; text: string; options?: CompressionOptions }>,
  globalOptions: CompressionOptions = {}
): Promise<Record<string, CompressionResult>> {
  const results: Record<string, CompressionResult> = {};

  // Process in parallel for efficiency
  await Promise.all(
    segments.map(async ({ key, text, options }) => {
      const mergedOptions = { ...globalOptions, ...options };
      results[key] = await compressContext(text, mergedOptions);
    })
  );

  return results;
}

/**
 * Smart chunked compression for very large texts
 * Splits text into chunks, compresses each, then combines
 */
export async function compressLargeContext(
  text: string,
  options: CompressionOptions & { chunkSize?: number } = {}
): Promise<CompressionResult> {
  const { chunkSize = 3000, ...compressionOptions } = options;

  // If text is small enough, compress normally
  if (text.length <= chunkSize) {
    return compressContext(text, compressionOptions);
  }

  // Split into logical chunks (by paragraphs/sections)
  const chunks = splitIntoChunks(text, chunkSize);

  // Compress each chunk
  const compressedChunks = await Promise.all(
    chunks.map((chunk) => compressContext(chunk, compressionOptions))
  );

  // Combine compressed chunks
  const compressed = compressedChunks.map((r) => r.compressed).join("\n\n");
  const originalTokens = estimateTokens(text);
  const compressedTokens = estimateTokens(compressed);

  return {
    compressed,
    originalLength: text.length,
    compressedLength: compressed.length,
    compressionRatio: compressed.length / text.length,
    cached: false,
    tokensEstimate: {
      original: originalTokens,
      compressed: compressedTokens,
      saved: originalTokens - compressedTokens,
    },
  };
}

/**
 * Split text into chunks at logical boundaries (paragraphs, sections)
 */
function splitIntoChunks(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = "";
  for (const para of paragraphs) {
    if (currentChunk.length + para.length <= maxChunkSize) {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = para;

      // If single paragraph exceeds chunk size, force split
      if (currentChunk.length > maxChunkSize) {
        const words = currentChunk.split(" ");
        currentChunk = "";
        let wordChunk = "";
        for (const word of words) {
          if (wordChunk.length + word.length <= maxChunkSize) {
            wordChunk += (wordChunk ? " " : "") + word;
          } else {
            chunks.push(wordChunk);
            wordChunk = word;
          }
        }
        currentChunk = wordChunk;
      }
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

/**
 * Utility: Clear compression cache (useful for testing)
 */
export function clearCompressionCache(): void {
  compressionCache.clear();
}

/**
 * Utility: Get cache statistics
 */
export function getCacheStats() {
  cleanCache();
  return {
    size: compressionCache.size,
    keys: Array.from(compressionCache.keys()).map((k) => k.slice(0, 50) + "..."),
  };
}
