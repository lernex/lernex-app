import type { Difficulty } from "@/types/placement";

type LessonPromptParams = {
  subject: string;
  difficulty: Difficulty;
  sourceText: string;
  nextTopicHint?: string;
  lessonPlan?: {
    title: string;
    description: string;
  };
};

export function buildLessonPrompts(params: LessonPromptParams) {
  const { subject, difficulty, sourceText, lessonPlan } = params;

  const system = [
    `Generate 1 micro-lesson (80-105 words, 4 sentences) + 3 MCQs using the create_lesson function.`,
    `Content structure: 4 sentences (definition→example→pitfall→practice), 80-105w, <900 chars.`,
    `Questions: 4 choices each, <15w explanations. Math: Use LaTeX with escaped backslashes in JSON. Example: "\\\\(x^2 + 1\\\\)" or "\\\\[\\\\frac{a}{b}\\\\]" will render as \\(x^2 + 1\\) and \\[\\frac{a}{b}\\].`,
    `Use structured_context + focus cues from the user message. Reference learner.recents if present (5-10w bridge). Self-check accuracy, difficulty, structure before calling the function.`,
  ].join("\n");

  const cleanSource = sourceText.trim();
  const userLines = [
    `Subject: ${subject}`,
    `Difficulty: ${difficulty}. Adjust complexity accordingly.`,
  ];

  // If we have a lesson plan, add it as targeted guidance
  if (lessonPlan) {
    userLines.push(`\nLesson Target:`);
    userLines.push(`Title: ${lessonPlan.title}`);
    userLines.push(`Focus: ${lessonPlan.description}`);
    userLines.push(`\nCreate a lesson specifically covering the above topic using the content below.`);
  }

  if (cleanSource) {
    userLines.push(`\n${lessonPlan ? 'Source' : 'Focus'} content:`);
    userLines.push(cleanSource);
  } else {
    userLines.push(`Focus cues: None beyond structured context.`);
  }

  userLines.push(
    `\nUse the Structured context JSON message for learner profile, preferences, and pacing details.`
  );
  userLines.push(
    `\nCall the create_lesson function with the structured lesson data.`
  );
  const user = userLines.join("\n");

  return { system, user };
}
