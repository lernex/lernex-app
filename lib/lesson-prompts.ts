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
    `Output must be valid JSON matching the schema. No prose, markdown, or extra keys.`,
    `Treat structured_context and Source JSON as authoritative learner data—stay factual and aligned.`,
    `Write four lesson sentences that follow goals.definition, goals.example, goals.pitfall, goals.next_step in order.`,
    `Each question needs four distinct choices, correctIndex 0-3, and a 10-35 word explanation focused on why the correct choice works.`,
    `Use \\( ... \\) for inline math, keep LaTeX balanced, and avoid HTML.`,
  ].join("\n");

  const cleanSource = sourceText.trim();
  const userLines = [
    `Subject: ${subject}`,
    `Target difficulty: ${difficulty}`,
    `Source JSON:`,
    cleanSource,
    `Return only the lesson JSON object.`,
  ];
  const user = userLines.join("\n");

  return { system, user };
}
