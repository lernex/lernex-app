import type { Difficulty } from "@/types/placement";

type LessonPromptParams = {
  subject: string;
  difficulty: Difficulty;
  sourceText: string;
  nextTopicHint?: string;
};

export function buildLessonPrompts(params: LessonPromptParams) {
  const { subject, difficulty, sourceText, nextTopicHint } = params;

  const system = [
    `You create exactly one micro-lesson of 80-105 words and exactly three MCQs with explanations.`,
    `Audience: ${subject} student. Adapt to the indicated difficulty.`,
    ``,
    `Return only JSON matching exactly:`,
    `{`,
    `  "id": string,                   // short slug`,
    `  "subject": string,              // e.g., "Algebra 1"`,
    `  "topic": string,                // atomic concept (e.g., "Slope of a line")`,
    `  "title": string,                // 2-6 words`,
    `  "content": string,              // 80-105 words, friendly, factual`,
    `  "difficulty": "intro"|"easy"|"medium"|"hard",`,
    `  "questions": [                  // exactly 3 items`,
    `    { "prompt": string, "choices": [string, string, string, string], "correctIndex": number, "explanation": string }`,
    `  ]`,
    `}`,
    `Rules:`,
    `- Keep the lesson factual, encouraging, and 80-105 words (roughly 180-600 characters).`,
    `- Provide exactly three questions; each question must have four distinct answer choices and correctIndex 0-3.`,
    `- Include a brief rationale (10-35 words) in each explanation focusing on why the correct choice is right.`,
    `- Align strictly with the provided passage; simplify when needed for lower difficulty.`,
    `- Output pure JSON (double quotes, no trailing commas, no markdown, no code fences).`,
    `- Use standard inline LaTeX like \\( ... \\) for any expressions requiring special formatting (equations, vectors, matrices, etc.). Avoid all HTML tags.`,
    `- Do NOT use single-dollar $...$ math; prefer \\( ... \\) for inline and \\[ ... \\] only if necessary.`,
    `- Always balance {} and math delimiters (\\( pairs with \\), \\[ with \\], $$ with $$).`,
    `- Wrap single-letter macro arguments in braces (e.g., \\vec{v}, \\mathbf{v}, \\hat{v}).`,
    `- Escape backslashes so LaTeX macros appear with a single backslash after JSON parsing; do not double-escape macros. Prefer \\\\ only for matrix row breaks in pmatrix.`,
  ].join("\n");

  const cleanSource = sourceText.trim();
  const user = [
    `Subject: ${subject}`,
    `Target Difficulty: ${difficulty}`,
    `Output must stay within the JSON schema: 80-105 word content, exactly 3 questions, 4 answer choices per question, and explanations for each.`,
    nextTopicHint ? `Next Topic Hint: ${nextTopicHint}` : null,
    `Source Text:`,
    `"""`,
    cleanSource,
    `"""`,
    `Generate the lesson and questions as specified. Output only the JSON object.`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { system, user };
}
