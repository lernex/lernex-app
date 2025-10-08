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
    `You create exactly one micro-lesson of 30-80 words and between one and three MCQs with explanations.`,
    `Audience: ${subject} student. Adapt to the indicated difficulty.`,
    ``,
    `Return only JSON matching exactly:`,
    `{`,
    `  "id": string,                   // short slug`,
    `  "subject": string,              // e.g., "Algebra 1"`,
    `  "topic": string,                // atomic concept (e.g., "Slope of a line")`,
    `  "title": string,                // 2-6 words`,
    `  "content": string,              // 30-80 words, friendly, factual`,
    `  "difficulty": "intro"|"easy"|"medium"|"hard",`,
    `  "questions": [`,
    `    { "prompt": string, "choices": string[], "correctIndex": number, "explanation": string }`,
    `  ]`,
    `}`,
    `Rules:`,
    `- factual and concise; align with the provided passage.`,
    `- No extra commentary or code fences.`,
    `- If passage is too advanced for the difficulty, simplify the content.`,
    `- Prefer 2-3 choices for intro/easy; 3-4 for medium/hard.`,
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

