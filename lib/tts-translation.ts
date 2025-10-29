/**
 * TTS Translation Service
 *
 * Transforms lesson text into natural, expressive speech that ElevenLabs can read effectively.
 * Uses DeepInfra GPT-OSS-20B to:
 * - Convert LaTeX and mathematical notation into readable text
 * - Add expression tags like [sighs], [pauses], [chuckles] for natural delivery
 * - Make the content more engaging and conversational
 */

import OpenAI from 'openai';

const TRANSLATION_SYSTEM_PROMPT = `You are an expert educational text formatter. Your job is to transform educational lesson text into clear, grammatically correct speech that sounds natural when read aloud by a text-to-speech system.

Your transformations should:

1. **Convert Mathematical Notation to Natural Speech:**
   - Fractions: \\frac{3}{5} → "3 over 5"
   - Division: 3/5 → "3 over 5" or "3 divided by 5"
   - Multiplication: 5 × 6 → "5 times 6"
   - Powers/Exponents: 3^4 or 3⁴ → "3 to the power of 4" or "3 to the fourth power"
   - Square roots: √16 → "the square root of 16"
   - Equations: x + 2 = 5 → "x plus 2 equals 5"
   - Inequalities: x ≤ 5 → "x is less than or equal to 5"
   - Variables: Spell them out clearly (e.g., "x" → "x", "α" → "alpha")
   - Percentages: 25% → "25 percent"

2. **Apply Proper Grammar and Punctuation:**
   - Add commas for natural pauses and clarity
   - Use proper sentence structure
   - Break up long, complex sentences into shorter, digestible ones
   - Add appropriate conjunctions and transitions

3. **Maintain Natural Flow:**
   - Use conversational transitions: "Now,", "So,", "In other words,"
   - Include clarifying phrases: "that is,", "which means,", "for example,"
   - Keep the tone educational but approachable

4. **Preserve Educational Content:**
   - Keep all core concepts and definitions intact
   - Maintain accuracy of all examples and explanations
   - Don't remove important details
   - Ensure technical terms are clearly pronounced

5. **Keep It Clean and Simple:**
   - No special audio tags or sound effects
   - No dramatic expressions or emotions
   - Just clear, grammatically correct, naturally flowing text
   - Focus on clarity and proper pronunciation

Example transformation:

Before: "Artificial Intelligence (AI) is the design of computer systems that emulate human cognitive functions such as reasoning, learning, and perception, and problem solving. For instance, a rule‑based chatbot with 50 predefined intents can answer 200 queries per hour, whereas a neural network trained on 10,000 dialogues processes 500 queries in the same time in real time."

After: "Artificial Intelligence, or AI, is the design of computer systems that emulate human cognitive functions, such as reasoning, learning, perception, and problem solving. For instance, a rule-based chatbot with 50 predefined intents can answer 200 queries per hour. In contrast, a neural network trained on 10,000 dialogues can process 500 queries in the same amount of time, and it does so in real time."

Before: "To solve \\frac{3}{5} + \\frac{2}{5}, add the numerators: 3+2=5, keep denominator 5. Result: \\frac{5}{5}=1"

After: "To solve 3 over 5 plus 2 over 5, add the numerators: 3 plus 2 equals 5, and keep the denominator as 5. The result is 5 over 5, which equals 1."

Now transform the following lesson text:`;

/**
 * Translates lesson text into natural, expressive speech
 */
export async function translateLessonForTTS(lessonText: string): Promise<{ translatedText: string; inputTokens: number; outputTokens: number }> {
  // Use DeepInfra GPT-OSS-20B for translation (for both free and paid tiers as per requirements)
  const client = new OpenAI({
    apiKey: process.env.DEEPINFRA_API_KEY,
    baseURL: 'https://api.deepinfra.com/v1/openai',
  });

  try {
    const completion = await client.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: TRANSLATION_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: lessonText
        }
      ],
      temperature: 0.8, // Higher temperature for more creative, natural variations
      max_tokens: 4000,
    });

    const translatedText = completion.choices[0]?.message?.content || lessonText;
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;

    return {
      translatedText,
      inputTokens,
      outputTokens
    };
  } catch (error) {
    console.error('[tts-translation] Translation failed:', error);
    // Fallback to original text if translation fails
    return {
      translatedText: lessonText,
      inputTokens: 0,
      outputTokens: 0
    };
  }
}
