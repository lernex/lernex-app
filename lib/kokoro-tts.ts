/**
 * Kokoro Text-to-Speech Service (DeepInfra)
 *
 * Generates high-quality speech audio using hexgrad/Kokoro-82M model via DeepInfra.
 * Much more cost-efficient than ElevenLabs: $0.62 per 1M input tokens.
 */

import OpenAI from 'openai';

export interface TTSGenerationResult {
  audioBuffer: ArrayBuffer;
  characterCount: number;
}

/**
 * Generate speech audio from text using hexgrad/Kokoro-82M via DeepInfra
 * @param text - The text to convert to speech (should be pre-translated for best results)
 * @param voice - Voice to use (default: af_bella)
 * @returns Audio buffer and character count for cost tracking
 */
export async function generateSpeech(
  text: string,
  voice: string = 'af_bella'
): Promise<TTSGenerationResult> {
  const apiKey = process.env.DEEPINFRA_API_KEY;

  if (!apiKey) {
    throw new Error('DeepInfra API key not configured');
  }

  try {
    // Initialize OpenAI client with DeepInfra endpoint
    const openai = new OpenAI({
      baseURL: 'https://api.deepinfra.com/v1/openai',
      apiKey: apiKey,
    });

    // Generate speech using OpenAI audio API
    const response = await openai.audio.speech.create({
      model: 'hexgrad/Kokoro-82M',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      voice: voice as any, // Cast to any since OpenAI types don't include custom voices
      input: text,
      response_format: 'wav', // Using WAV format
    });

    // Get audio buffer
    const audioBuffer = await response.arrayBuffer();
    const characterCount = text.length;

    return {
      audioBuffer,
      characterCount,
    };
  } catch (error) {
    console.error('[kokoro-tts] Speech generation failed:', error);
    throw error;
  }
}

/**
 * Calculate the cost of TTS generation
 * hexgrad/Kokoro-82M pricing: $0.62 per 1M input tokens
 * (The character count of the text sent TO the TTS API)
 * @param characterCount - Number of characters in the INPUT text (translated lesson text)
 * @returns Cost in dollars
 */
export function calculateTTSCost(characterCount: number): number {
  const COST_PER_1M_TOKENS = 0.62;
  // Approximate tokens as characters (rough estimate: 1 token ≈ 4 characters for English)
  // Being conservative, we'll assume 1 char = 1 token for simplicity
  return (characterCount / 1_000_000) * COST_PER_1M_TOKENS;
}

/**
 * Available voices for Kokoro-82M TTS
 */
export const KOKORO_VOICES = {
  af_bella: 'af_bella', // Female voice - Bella
  af_sarah: 'af_sarah', // Female voice - Sarah
  am_adam: 'am_adam',   // Male voice - Adam
  am_michael: 'am_michael', // Male voice - Michael
  // Add more voices as they become available
} as const;
