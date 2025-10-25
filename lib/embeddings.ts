import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate an embedding vector for the given text using OpenAI's text-embedding-3-small model
 * This is optimized for cost and speed while maintaining good quality
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot generate embedding for empty text");
  }

  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.trim().slice(0, 8000), // Limit to ~8k chars to stay within token limits
      encoding_format: "float",
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("[embeddings] Failed to generate embedding:", error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two embedding vectors
 * Returns a value between -1 and 1, where 1 means identical, 0 means orthogonal, -1 means opposite
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) {
    throw new Error("Cannot compute similarity for empty vectors");
  }

  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Check if a lesson is semantically similar to any recent lessons
 * Returns the highest similarity score found
 */
export function findMaxSimilarity(
  lessonEmbedding: number[],
  recentEmbeddings: number[][]
): number {
  if (!recentEmbeddings || recentEmbeddings.length === 0) {
    return 0;
  }

  let maxSimilarity = 0;

  for (const recentEmbedding of recentEmbeddings) {
    try {
      const similarity = cosineSimilarity(lessonEmbedding, recentEmbedding);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
    } catch (error) {
      console.warn("[embeddings] Failed to compute similarity:", error);
      continue;
    }
  }

  return maxSimilarity;
}
