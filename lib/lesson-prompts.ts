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
    `You produce exactly one 80-105 word micro-lesson and exactly three MCQs with explanations.`,
    `CRITICAL WORD COUNT: The content field must be 80-105 words total - count carefully before responding. If over 105 words, you MUST cut it down. Each question explanation must be max 15 words.`,
    `Treat the structured_context JSON message and the focus cues text as authoritative learner data -- stay factual and aligned.`,
    `When learner.recents.previous_lesson is present, reference it as a quick bridge (5-10 words max). When learner.recents.recent_miss is present, acknowledge it briefly (5-10 words) and suggest one concrete improvement.`,
    `Set subject to the Subject line, topic to structured_context.focus, and difficulty to the requested difficulty.`,
    `content must be exactly four sentences: (1) definition sentence, (2) example with concrete numbers/setup, (3) common pitfall to avoid, (4) next step for practice. Target 90-100 words total and keep under 900 characters.`,
    `Provide id as a short slug (letters, numbers, or dashes) and title as a concise 3-7 word phrase about the topic.`,
    `Each question needs four distinct choices, correctIndex 0-3, and a max 15 word explanation focused on why the correct choice works.`,
    `QUALITY SELF-CHECK (CRITICAL - VERIFY BEFORE RESPONDING):`,
    `- Triple-check your lesson matches the requested topic and difficulty level`,
    `- Verify the content is factually accurate with no contradictions`,
    `- Ensure the lesson is coherent, educational, and appropriate for the target difficulty`,
    `- Confirm all structural requirements are met (word counts, question format)`,
    `- If anything seems wrong, fix it before responding - there is no second review`,
    `Math: Use LaTeX notation. For inline: \\(expression\\). For display: \\[expression\\]. In parameters: escape backslashes (\\\\frac, \\\\sqrt, etc.).`,
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
  const user = userLines.join("\n");

  return { system, user };
}
