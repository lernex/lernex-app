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
    `Output must be valid, complete JSON matching the schema below. No prose, markdown, or extra keys.`,
    `Schema: {"id":string,"subject":string,"topic":string,"title":string,"content":string,"difficulty":"intro"|"easy"|"medium"|"hard","questions":[{"prompt":string,"choices":[string,string,string,string],"correctIndex":0|1|2|3,"explanation":string},{"prompt":string,"choices":[string,string,string,string],"correctIndex":0|1|2|3,"explanation":string},{"prompt":string,"choices":[string,string,string,string],"correctIndex":0|1|2|3,"explanation":string}]}`,
    `CRITICAL WORD COUNT: The content field must be 80-105 words total - count carefully before responding. If over 105 words, you MUST cut it down. Each question explanation must be 10-35 words.`,
    `Treat the structured_context JSON message and the focus cues text as authoritative learner data -- stay factual and aligned.`,
    `When learner.recents.previous_lesson is present, reference it as a quick bridge (5-10 words max). When learner.recents.recent_miss is present, acknowledge it briefly (5-10 words) and suggest one concrete improvement.`,
    `Set subject to the Subject line, topic to structured_context.summary.focus, and difficulty to the requested difficulty.`,
    `content must be exactly four sentences: (1) definition sentence, (2) example with concrete numbers/setup, (3) common pitfall to avoid, (4) next step for practice. Target 90-100 words total and keep under 900 characters.`,
    `Provide id as a short slug (letters, numbers, or dashes) and title as a concise 3-7 word phrase about the topic.`,
    `Each question needs four distinct choices, correctIndex 0-3, and a 10-30 word explanation focused on why the correct choice works.`,
    `MATH FORMATTING (CRITICAL - READ CAREFULLY):`,
    `- Inline math: use \\( and \\) delimiters — Example: "content": "The formula \\\\(x^2 + y^2 = r^2\\\\) represents..."`,
    `- Display math: use \\[ and \\] delimiters — Example: "content": "Integral: \\\\[\\\\int_0^1 x\\\\,dx = \\\\frac{1}{2}\\\\]"`,
    `- Commands: \\frac, \\sqrt, \\sin, \\cos, \\tan, \\log, \\ln, \\int, \\sum, \\prod, \\lim, \\alpha, \\beta, \\theta, etc.`,
    `- In JSON, backslashes must be escaped: Write \\\\( not \\(, write \\\\frac not \\frac, write \\\\alpha not \\alpha`,
    `- Balance delimiters: Every \\\\( needs \\\\), every \\\\[ needs \\\\]`,
    `- Can also use $...$ for inline: "The area is $\\\\pi r^2$" but \\\\(...\\\\) is preferred`,
    `- Avoid HTML. Use LaTeX for all math notation.`,
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
