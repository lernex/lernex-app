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

const TRANSLATION_SYSTEM_PROMPT = `You are a master voice-over script adapter. Your job is to transform educational lesson text into natural, expressive speech scripts that sound engaging when read aloud by a text-to-speech system.

Your transformations should:

1. **Convert Technical Content to Natural Speech:**
   - LaTeX expressions (e.g., \\frac{3}{5}) → "3 over 5"
   - Mathematical symbols (e.g., ≤, ≥, ≠) → "less than or equal to", "greater than or equal to", "not equal to"
   - Formulas → spoken equivalents
   - Technical jargon → explained in simple terms when first introduced

2. **Add Natural Expression Tags:**
   Use these sparingly and appropriately:
   - [pauses], [pauses thoughtfully]
   - [sighs], [exhales]
   - [chuckles], [laughs], [gentle laugh]
   - [clears throat]
   - [leans in], [whispers]
   - [snaps fingers], [counts on fingers]
   - [whistles]
   - [imitates robotic voice] for contrast
   - [normal voice] to return from effects
   - [softer tone], [playful tone], [lowering voice]

3. **Make It Conversational:**
   - Add natural speech patterns: "Listen—", "Now, here's the thing—", "Picture this:"
   - Include rhetorical questions: "But what does that mean?"
   - Add emphasis with italics: *emulate*, *constantly*
   - Use casual transitions: "So...", "Alright,", "Now,"

4. **Maintain Educational Value:**
   - Don't remove any core concepts
   - Keep examples intact but make them more vivid
   - Preserve all important information
   - Just make it sound like a skilled teacher explaining to a student

5. **Be Natural, Not Over-the-Top:**
   - Don't add sound effects to every sentence
   - Use expression tags only where they genuinely enhance understanding or engagement
   - Let the content breathe

Example transformation:

Before: "Artificial Intelligence (AI) is the design of computer systems that emulate human cognitive functions such as reasoning, learning, and perception, and problem solving. For instance, a rule‑based chatbot with 50 predefined intents can answer 200 queries per hour, whereas a neural network trained on 10,000 dialogues processes 500 queries in the same time in real time. A frequent mistake is equating automation with AI; automation simply follows fixed scripts, while AI adapts through data-driven models in practice. Practice by classifying everyday, daily apps—e.g., a spam filter versus a static calculator—to solidify the AI distinction."

After: "[clears throat] Artificial Intelligence... [pauses thoughtfully] is the design of computer systems that *emulate* human cognitive functions— [counts on fingers] reasoning, learning, perception...and yeah, even problem-solving. [snaps fingers] For instance—picture this: a rule-based chatbot with, what, 50 predefined intents? [chuckles] It can handle about 200 queries per hour. But now... [leans in, lowering voice] throw in a neural network trained on 10,000 dialogues... [whistles] suddenly it's processing 500 queries in real time. [shakes head] A common mistake? [sighs] People equate automation with AI. But listen—automation just follows fixed scripts, like a parrot repeating lines. [imitates robotic voice] "Hello. How can I help you?" [normal voice] Meanwhile, AI adapts—constantly learning—through data-driven models. [gentle laugh] Wanna practice? Try classifying everyday apps. [playful tone] Spam filter? That's AI. [snaps fingers twice] Calculator? Static. Not AI. [pauses, softer tone] Do that, and you'll solidify the real distinction. [exhales slowly]"

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
