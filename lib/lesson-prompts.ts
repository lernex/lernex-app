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
    `Treat the structured_context JSON message and the focus cues text as authoritative learner data -- stay factual and aligned.`,
    `Focus cues only summarize knowledge anchors and guardrails; rely on the structured_context payload for learner profile, preferences, and pacing.`,
    `When learner.recents.previous_lesson is present, reference it as a quick bridge. When learner.recents.recent_miss is present, acknowledge it plainly and coach the learner on how to improve.`,
    `Set subject to the Subject line, topic to structured_context.summary.focus, and difficulty to the requested difficulty.`,
    `content must be exactly four sentences following goals.definition, goals.example, goals.pitfall, goals.next_step in that order, stay within 80-105 words, and keep under 720 characters.`,
    `Provide id as a short slug (letters, numbers, or dashes) and title as a concise 3-7 word phrase about the topic.`,
    `Each question needs four distinct choices, correctIndex 0-3, and a 10-35 word explanation focused on why the correct choice works.`,
    `Use \\( ... \\) for inline math, keep LaTeX balanced, and avoid HTML.`,
  ].join("\n");

  const cleanSource = sourceText.trim();
  const userLines = [
    `Subject: ${subject}`,
    `Target difficulty: ${difficulty}`,
  ];
  if (cleanSource) {
    userLines.push(`Focus cues:`);
    userLines.push(cleanSource);
  } else {
    userLines.push(`Focus cues: None beyond structured context.`);
  }
  userLines.push(
    `Use the Structured context JSON message for learner profile, preferences, and pacing details.`,
    `Return only the lesson JSON object.`
  );
  const user = userLines.join("\n");

  return { system, user };
}
