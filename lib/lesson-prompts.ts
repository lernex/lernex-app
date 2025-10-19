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
    `Output must be valid JSON matching the schema below. No prose, markdown, or extra keys.`,
    `Schema: {"id":string,"subject":string,"topic":string,"title":string,"content":string,"difficulty":"intro"|"easy"|"medium"|"hard","questions":[{"prompt":string,"choices":[string,string,string,string],"correctIndex":0|1|2|3,"explanation":string},{"prompt":string,"choices":[string,string,string,string],"correctIndex":0|1|2|3,"explanation":string},{"prompt":string,"choices":[string,string,string,string],"correctIndex":0|1|2|3,"explanation":string}]}`,
    `Treat structured_context and Source JSON as authoritative learner data -- stay factual and aligned.`,
    `Set subject to the Subject line, topic to facts.focus in the Source JSON, and difficulty to the requested difficulty.`,
    `content must be exactly four sentences following goals.definition, goals.example, goals.pitfall, goals.next_step in that order and stay within 80-105 words.`,
    `Provide id as a short slug (letters, numbers, or dashes) and title as a concise 3-7 word phrase about the topic.`,
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
