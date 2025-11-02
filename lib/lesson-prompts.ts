import type { Difficulty } from "@/types/placement";

type LessonPromptParams = {
  subject: string;
  difficulty: Difficulty;
  sourceText: string;
  nextTopicHint?: string;
};

export function buildLessonPrompts(params: LessonPromptParams) {
  const { subject, difficulty, sourceText } = params;

  const system = [
    `Generate 1 micro-lesson (80-105 words, 4 sentences) + 3 MCQs as valid JSON.`,
    `Schema: {id, subject, topic, title, content, difficulty, questions:[{prompt, choices[4], correctIndex, explanation}]}`,
    `Rules: Content=4 sentences (definition→example→pitfall→practice), 80-105w, <900 chars. Questions: 4 choices, <15w explanations. Math: Use LaTeX with single backslash delimiters: \\(inline\\) \\[display\\]. Example: \\(x^2 + 1\\) or \\[\\frac{a}{b}\\]. In JSON strings, escape backslashes: "\\\\(" becomes \\( when parsed. Use structured_context + focus cues. Reference learner.recents if present (5-10w bridge/miss). Self-check accuracy, difficulty, structure before responding.`,
  ].join("\n");

  const cleanSource = sourceText.trim();
  const userLines = [
    `Subject: ${subject}`,
    `Difficulty: ${difficulty}. Adjust complexity accordingly.`,
  ];
  if (cleanSource) {
    userLines.push(`Focus cues:`);
    userLines.push(cleanSource);
  } else {
    userLines.push(`Focus cues: None beyond structured context.`);
  }
  userLines.push(
    `Use the Structured context JSON message for learner profile, preferences, and pacing details.`
  );
  userLines.push(
    `\nREMINDER: Output ONLY valid JSON with no markdown formatting or code blocks.`
  );
  const user = userLines.join("\n");

  return { system, user };
}
