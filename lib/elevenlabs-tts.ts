/**
 * ElevenLabs Text-to-Speech Service
 *
 * Generates high-quality speech audio using ElevenLabs Eleven V3 model.
 * Supports expressive speech with emotion tags and natural intonation.
 */

export interface TTSGenerationResult {
  audioBuffer: ArrayBuffer;
  characterCount: number;
}

/**
 * Generate speech audio from text using ElevenLabs Eleven V3
 * @param text - The text to convert to speech (should be pre-translated for best results)
 * @param voiceId - Optional ElevenLabs voice ID (defaults to Liam)
 * @returns Audio buffer and character count for cost tracking
 */
export async function generateSpeech(
  text: string,
  voiceId: string = 'TX3LPaxmHKxFdv7VOQHJ' // Liam - natural, engaging voice
): Promise<TTSGenerationResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured');
  }

  try {
    // ElevenLabs API endpoint for text-to-speech with Eleven V3 model
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_v3', // Using Eleven V3 which supports expression tags
        voice_settings: {
          stability: 0.5, // Balance between consistency and expressiveness
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const characterCount = text.length;

    return {
      audioBuffer,
      characterCount,
    };
  } catch (error) {
    console.error('[elevenlabs-tts] Speech generation failed:', error);
    throw error;
  }
}

/**
 * Calculate the cost of TTS generation
 * ElevenLabs pricing: $0.30 per 1000 INPUT characters
 * (The character count of the text sent TO the ElevenLabs API)
 * @param characterCount - Number of characters in the INPUT text (translated lesson text)
 * @returns Cost in dollars
 */
export function calculateTTSCost(characterCount: number): number {
  const COST_PER_1000_CHARS = 0.3;
  return (characterCount / 1000) * COST_PER_1000_CHARS;
}

/**
 * List of available ElevenLabs voices suitable for educational content
 * You can customize this list based on your preferences
 */
export const EDUCATIONAL_VOICES = {
  liam: 'TX3LPaxmHKxFdv7VOQHJ', // Natural, engaging voice (default)
  adam: 'pNInz6obpgDQGcFmaJgB', // Clear, professional male voice
  rachel: '21m00Tcm4TlvDq8ikWAM', // Calm, clear female voice
  domi: 'AZnzlk1XvdvUeBnXmlld', // Strong, confident female voice
  antoni: 'ErXwobaYiN019PkySvjV', // Well-rounded, friendly male voice
};
