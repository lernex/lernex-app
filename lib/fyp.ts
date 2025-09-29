import Groq from "groq-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LessonSchema } from "./schema";
import type { Question } from "./schema";
import { checkUsageLimit, logUsage } from "./usage";

let groqCache: { apiKey: string; client: Groq } | null = null;

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");
  if (!groqCache || groqCache.apiKey !== apiKey) {
    groqCache = { apiKey, client: new Groq({ apiKey }) };
  }
  return groqCache.client;
}

const LESSON_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "subject", "topic", "title", "content", "difficulty", "questions"],
  properties: {
    id: { type: "string", minLength: 1 },
    subject: { type: "string", minLength: 1 },
    topic: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    content: { type: "string", minLength: 180, maxLength: 600 },
    difficulty: { type: "string", enum: ["intro", "easy", "medium", "hard"] },
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "choices", "correctIndex"],
        properties: {
          prompt: { type: "string", minLength: 1 },
          choices: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "string", minLength: 1 }
          },
          correctIndex: { type: "integer", minimum: 0 },
          explanation: { type: "string", minLength: 3, maxLength: 280 }
        }
      }
    },
    mediaUrl: { type: "string", format: "uri" },
    mediaType: { type: "string", enum: ["image", "video"] }
  }
} as const;

const QUESTIONS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: LESSON_JSON_SCHEMA.properties.questions.items,
    },
  },
} as const;

type Pace = "slow" | "normal" | "fast";
type Difficulty = "intro" | "easy" | "medium" | "hard";
const MIN_LESSON_WORDS = 60;

export async function generateLessonForTopic(
  sb: SupabaseClient,
  uid: string,
  ip: string,
  subject: string,
  topic: string,
  opts?: {
    pace?: Pace;
    accuracyPct?: number; // 0-100
    difficultyPref?: Difficulty;
    avoidIds?: string[];
    avoidTitles?: string[];
    mapSummary?: string;
    structuredContext?: Record<string, unknown>;
  }
) {
  const client = getGroqClient();
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const envTemp = Number(process.env.GROQ_TEMPERATURE ?? "0.4");
  const temperature = Number.isFinite(envTemp) ? Math.min(1, Math.max(0, envTemp)) : 0.6;

  if (uid) {
    const ok = await checkUsageLimit(sb, uid);
    if (!ok) throw new Error("Usage limit exceeded");
  }

  const pace = opts?.pace ?? "normal";
  const acc = typeof opts?.accuracyPct === "number" ? Math.max(0, Math.min(100, Math.round(opts!.accuracyPct!))) : null;
  const diffPref = opts?.difficultyPref ?? undefined;
  const avoidIds = (opts?.avoidIds ?? []).slice(-20);
  const avoidTitles = (opts?.avoidTitles ?? []).slice(-20);

  const baseSystem = `
You create exactly one micro-lesson of 30–80 words and between one and three MCQs with explanations.
Audience: ${subject} student. Adapt to the indicated difficulty.

Return only JSON matching exactly:
{
  "id": string,                   // short slug
  "subject": string,              // e.g., "Algebra 1"
  "topic": string,                // atomic concept (e.g., "Slope of a line")
  "title": string,                // 2–6 words
  "content": string,              // 30–80 words, friendly, factual
  "difficulty": "intro"|"easy"|"medium"|"hard",
  "questions": [
    { "prompt": string, "choices": string[], "correctIndex": number, "explanation": string }
  ]
}
Rules:
- factual and concise; align with the provided passage.
- No extra commentary or code fences.
- If passage is too advanced for the difficulty, simplify the content.
- Prefer 2–3 choices for intro/easy; 3–4 for medium/hard.
 - Use standard inline LaTeX like \\( ... \\) for any expressions requiring special formatting (equations, vectors, matrices, etc.). Avoid all HTML tags.
 - Do NOT use single-dollar $...$ math; prefer \\( ... \\) for inline and \\[ ... \\] only if necessary.
 - Always balance {} and math delimiters (\\( pairs with \\), \\[ with \\], $$ with $$).
 - Wrap single-letter macro arguments in braces (e.g., \\vec{v}, \\mathbf{v}, \\hat{v}).
 - Escape backslashes so LaTeX macros appear with a single backslash after JSON parsing; do not double-escape macros. Prefer \\\\ only for matrix row breaks in pmatrix.
`.trim();

  const contextJson = opts?.structuredContext
    ? JSON.stringify(opts.structuredContext, null, 2)
    : null;
  const targetDifficulty: Difficulty = diffPref && ["intro", "easy", "medium", "hard"].includes(diffPref)
    ? diffPref
    : acc !== null
    ? (acc < 50 ? "intro" : acc < 65 ? "easy" : acc < 80 ? "medium" : "hard")
    : "easy";

  const sourceSegments: string[] = [
    `Topic from level map: ${topic}`,
    `Learner pace: ${pace}`,
  ];
  if (acc !== null) sourceSegments.push(`Recent accuracy about ${acc}%.`);
  if (avoidIds.length) sourceSegments.push(`Avoid repeating lesson IDs: ${avoidIds.join(", ")}.`);
  if (avoidTitles.length) sourceSegments.push(`Avoid repeating lesson titles: ${avoidTitles.join(", ")}.`);
  if (opts?.mapSummary) sourceSegments.push(`Map summary: ${opts.mapSummary}`);
  if (contextJson) sourceSegments.push(`Structured context:\n${contextJson}`);

  const sourceText = sourceSegments.join("\n\n").trim() || `Topic: ${topic}\nFocus on essentials for ${subject}.`;

  const userPrompt = `
Subject: ${subject}
Target Difficulty: ${targetDifficulty}
Source Text:
"""
${sourceText}
"""
Generate the lesson and questions as specified. Output only the JSON object.
`.trim();

  const MAX_LESSON_TOKENS = Number(process.env.GROQ_LESSON_MAX_TOKENS ?? "1500");
  type ResponseMode = "json_schema" | "json_object" | "none";

  async function callOnce(system: string, mode: ResponseMode) {
    let completion: import("groq-sdk/resources/chat/completions").ChatCompletion | null = null;
    const responseFormat = mode === "json_schema"
      ? { response_format: { type: "json_schema" as const, json_schema: { name: "lesson_schema", schema: LESSON_JSON_SCHEMA } } }
      : mode === "json_object"
      ? { response_format: { type: "json_object" as const } }
      : {};
    try {
      completion = await client.chat.completions.create({
        model,
        temperature,
        max_tokens: MAX_LESSON_TOKENS,
        ...responseFormat,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      });
    } catch (err) {
      const e = err as unknown as { error?: { failed_generation?: string } };
      const failed = e?.error?.failed_generation;
      if (typeof failed === "string" && failed.trim().length > 0) {
        return [failed, null] as const;
      }
      throw err;
    }
    const raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "";
    const u = completion?.usage as unknown as { prompt_tokens?: unknown; completion_tokens?: unknown } | null;
    const usage = u ? {
      input_tokens: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
      output_tokens: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
    } : null;
    return [raw, usage] as const;
  }

  let raw = "";
  let usage: { input_tokens: number | null; output_tokens: number | null } | null = null;
  let parsed: unknown | null = null;
  let lastCandidate: unknown | null = null;
  let lastAttemptIndex: number | null = null;

  const recordUsage = async (planIndex: number | null) => {
    if (!uid || !usage) return;
    const metadata = planIndex != null ? { fallbackStep: planIndex } : undefined;
    try {
      await logUsage(sb, uid, ip, model, usage, metadata ? { metadata } : undefined);
    } catch {}
  };

  const attemptPlans: { system: string; mode: ResponseMode }[] = [
    { system: baseSystem, mode: "json_schema" },
    { system: baseSystem, mode: "json_object" },
    { system: baseSystem + "\nImportant: Output must be STRICT JSON with double quotes only. No markdown, no comments.", mode: "json_schema" },
    { system: baseSystem + "\nImportant: Output must be STRICT JSON with double quotes only. No markdown, no comments.", mode: "json_object" },
    { system: baseSystem + "\nFinal attempt: Respond with ONLY a single JSON object matching the schema.", mode: "json_schema" },
    { system: baseSystem + "\nFinal attempt: Respond with only the JSON object and nothing else.", mode: "none" },
  ];

  for (let planIndex = 0; planIndex < attemptPlans.length; planIndex++) {
    const plan = attemptPlans[planIndex];
    try {
      const [r, u] = await callOnce(plan.system, plan.mode);
      raw = r;
      usage = u;
    } catch {
      continue;
    }
    if (!raw) continue;
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (plan.mode !== "none") {
        const extracted = extractBalancedObject(raw);
        if (extracted) {
          try { parsed = JSON.parse(extracted); } catch { parsed = null; }
        } else {
          parsed = null;
        }
      } else {
        parsed = null;
      }
    }
    if (parsed) {
      lastAttemptIndex = planIndex;
      const validated = LessonSchema.safeParse(parsed);
      if (validated.success) {
        await recordUsage(planIndex);
        return validated.data;
      }
      lastCandidate = parsed;
    }
  }
  parsed = lastCandidate;

  // If we reach here, parsed may still be non-conforming or null. Try normalization once more.
  if (!raw) raw = "{}";
  function extractBalancedObject(s: string): string | null {
    let i = 0, depth = 0, start = -1, inStr = false, escaped = false;
    const n = s.length;
    for (; i < n; i++) {
      const ch = s[i];
      if (inStr) {
        if (escaped) { escaped = false; }
        else if (ch === "\\") { escaped = true; }
        else if (ch === '"') { inStr = false; }
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') { if (depth === 0) start = i; depth++; }
      else if (ch === '}') { depth--; if (depth === 0 && start !== -1) return s.slice(start, i + 1); }
    }
    return null;
  }
  if (!parsed) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      const extracted = extractBalancedObject(raw);
      if (!extracted) throw new Error("Invalid lesson format from AI");
      parsed = JSON.parse(extracted);
    }
  }

  // Validate, allow a light normalization pass for common issues
  const validated = LessonSchema.safeParse(parsed);
  if (validated.success) {
    await recordUsage(lastAttemptIndex);
    return validated.data;
  }

  // Attempt minimal normalization before giving up
  const o = parsed as Record<string, unknown>;
  const norm: Record<string, unknown> = { ...o };
  if (!norm.id || typeof norm.id !== "string" || !(norm.id as string).trim()) {
    norm.id = `L-${Math.random().toString(36).slice(2, 10)}`;
  }
  if (!norm.subject || typeof norm.subject !== "string") norm.subject = subject;
  if (!norm.topic || typeof norm.topic !== "string") norm.topic = topic;
  if (!norm.title || typeof norm.title !== "string") norm.title = typeof norm.topic === "string" ? `Quick intro: ${norm.topic}` : "Quick lesson";
  if (typeof norm.content !== "string") {
    norm.content = "This micro-lesson explores the concept through a short narrative that introduces the definition, connects it to a familiar scenario, walks through a worked example, and previews how the idea will be applied in upcoming practice so learners stay confident and curious.";
  }
  // Strip basic HTML tags that sometimes slip in
  if (typeof norm.content === "string") {
    const cleaned = (norm.content as string).replace(/<[^>]+>/g, "").slice(0, 600).trim();
    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (wordCount >= MIN_LESSON_WORDS) {
      norm.content = cleaned;
    } else {
      const rawTopic = typeof norm.topic === "string" && norm.topic.trim() ? (norm.topic as string).trim() : topic;
      const topicLabel = rawTopic && rawTopic.trim().length ? rawTopic.trim() : "this idea";
      const subjectLabel = subject && subject.trim().length ? subject.trim() : "your course";
      const extras = [
        cleaned,
        `Picture how ${topicLabel.toLowerCase()} shows up in ${subjectLabel.toLowerCase()} problems you have seen recently.`,
        `State the definition in your own words, then connect it to one short example you could explain in two calm steps.`,
        `Point out a mistake a learner might make with ${topicLabel.toLowerCase()} and clarify why it fails.`,
        `Finish by describing how you will recognise ${topicLabel.toLowerCase()} the next time you practise.`,
      ].filter(Boolean);
      const fallback = extras.join(" ").trim().slice(0, 600);
      norm.content = fallback.length > 0 ? fallback : `Summarise ${topicLabel} clearly, link it to a tiny example, warn about a trap, and end with a cue you can reuse while studying ${subjectLabel}.`;
    }
  }
  // Difficulty normalize
  const diff = norm.difficulty;
  if (diff !== "intro" && diff !== "easy" && diff !== "medium" && diff !== "hard") norm.difficulty = "easy";

  const canonicalTopic = typeof norm.topic === "string" && norm.topic.trim().length
    ? norm.topic.trim()
    : topic;

  const canonicalTitle = typeof norm.title === "string" && norm.title.trim().length
    ? norm.title.trim()
    : null;

  const normalizeChoiceKey = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

  const stripChoicePrefix = (input: string) =>
    input
      .replace(/^[\s\-*_\u2022]*(?:[A-Da-d]|[0-9]{1,2})[\.\):\-]\s*/, "")
      .replace(/^[\s\-*_\u2022]+/, "")
      .trim();

  const splitCompoundOption = (input: string): string[] => {
    const normalized = input.replace(/\r\n?/g, "\n").trim();
    if (!normalized) return [];
    const newlineParts = normalized.split(/\n+/).map(stripChoicePrefix).filter(Boolean);
    if (newlineParts.length >= 2 && newlineParts.length <= 6) return newlineParts;
    const delimiterParts = normalized.split(/\s*[;|/]\s*/).map(stripChoicePrefix).filter(Boolean);
    if (delimiterParts.length >= 2 && delimiterParts.length <= 6) return delimiterParts;
    return [stripChoicePrefix(normalized)];
  };

  const extractChoiceTexts = (value: unknown, depth = 0): string[] => {
    if (depth > 6 || value == null) return [];
    if (typeof value === "string") return splitCompoundOption(value);
    if (typeof value === "number" || typeof value === "boolean") return [String(value)];
    if (Array.isArray(value)) {
      return value.flatMap((entry) => extractChoiceTexts(entry, depth + 1));
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const results: string[] = [];
      const preferredKeys = [
        "text",
        "value",
        "option",
        "answer",
        "content",
        "label",
        "body",
        "choice",
        "statement",
        "response",
        "correct",
        "incorrect",
        "correctChoice",
        "incorrectChoices",
        "true",
        "false",
      ];
      for (const key of preferredKeys) {
        if (!(key in obj)) continue;
        const raw = obj[key];
        if (typeof raw === "string") {
          results.push(...splitCompoundOption(raw));
        } else if (Array.isArray(raw) || (raw && typeof raw === "object")) {
          results.push(...extractChoiceTexts(raw, depth + 1));
        }
      }
      for (const [key, val] of Object.entries(obj)) {
        if (preferredKeys.includes(key)) continue;
        if (typeof val === "string") {
          results.push(...splitCompoundOption(val));
        } else if (Array.isArray(val) || (val && typeof val === "object")) {
          results.push(...extractChoiceTexts(val, depth + 1));
        }
      }
      return results;
    }
    return [];
  };

  const collectChoiceVariants = (rawChoices: unknown) => {
    const items: { text: string; rawIndex: number }[] = [];
    const seen = new Set<string>();
    const visited = new Set<unknown>();
    const queue: { value: unknown; rawIndex: number }[] = [];

    const enqueue = (value: unknown, rawIndex: number) => {
      if (value && typeof value === "object") {
        if (visited.has(value)) return;
        visited.add(value);
      }
      queue.push({ value, rawIndex });
    };

    if (Array.isArray(rawChoices)) {
      rawChoices.forEach((entry, idx) => enqueue(entry, idx));
    } else if (rawChoices && typeof rawChoices === "object") {
      let idx = 0;
      for (const entry of Object.values(rawChoices as Record<string, unknown>)) {
        enqueue(entry, idx);
        idx += 1;
      }
    } else if (rawChoices !== undefined) {
      enqueue(rawChoices, 0);
    }

    while (queue.length) {
      const { value, rawIndex } = queue.shift()!;
      const pieces = extractChoiceTexts(value).map((piece) => piece.trim()).filter(Boolean);
      for (const piece of pieces) {
        const key = normalizeChoiceKey(piece);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        items.push({ text: piece, rawIndex });
        if (items.length >= 12) break;
      }
      if (items.length >= 12) break;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const entry of Object.values(value as Record<string, unknown>)) {
          if (entry && typeof entry === "object") enqueue(entry, rawIndex);
        }
      }
    }

    return items;
  };

  const buildFallbackChoices = (
    prompt: string,
    questionIdx: number,
    used: Set<string>,
    needed: number
  ): string[] => {
    const topicLabel = canonicalTopic || "the concept";
    const trimmedPrompt = prompt.trim().replace(/\s+/g, " ");
    const promptLabel = trimmedPrompt.length ? trimmedPrompt : `the lesson on ${topicLabel}`;
    const base = [
      `The accurate statement about ${topicLabel}`,
      `A tempting misconception about ${topicLabel}`,
      `An idea that does not address "${promptLabel}"`,
      "A partially correct statement missing key reasoning",
      "A choice that contradicts the lesson's explanation",
      "An unrelated detail to ignore",
    ];
    const results: string[] = [];

    for (let offset = 0; offset < base.length && results.length < needed; offset++) {
      const candidate = base[(questionIdx + offset) % base.length];
      const key = normalizeChoiceKey(candidate);
      if (used.has(key)) continue;
      used.add(key);
      results.push(candidate);
    }

    let counter = 1;
    while (results.length < needed) {
      const candidate = `${promptLabel} option ${counter}`;
      const key = normalizeChoiceKey(candidate);
      if (!used.has(key)) {
        used.add(key);
        results.push(candidate);
      }
      counter += 1;
    }

    return results;
  };

  const makeFallbackQuestion = (questionIdx: number): Question => {
    const promptText = questionIdx === 0
      ? `Quick check: ${canonicalTopic}`
      : `Reinforce the core idea (${questionIdx + 1}/3)`;
    const usedKeys = new Set<string>();
    const fallbackChoices = buildFallbackChoices(promptText, questionIdx, usedKeys, 4);
    return {
      prompt: promptText,
      choices: fallbackChoices.slice(0, 4),
      correctIndex: 0,
      explanation: "Select the choice that best matches the lesson's main idea.",
    };
  };

  const sanitizeQuestions = (rawQuestions: unknown[]): Question[] => {
    const arr = Array.isArray(rawQuestions) ? rawQuestions : [];
    const sanitized = arr.map((raw, questionIdx): Question => {
      type NormQuestion = { prompt?: unknown; choices?: unknown; correctIndex?: unknown; explanation?: unknown };
      const q = raw as NormQuestion;
      const promptText =
        typeof q?.prompt === "string" && q.prompt.trim().length
          ? q.prompt.trim()
          : canonicalTitle
          ? `Check your understanding: ${canonicalTitle}`
          : `Check your understanding: ${canonicalTopic}`;
      const parsedChoices = collectChoiceVariants(q?.choices);
      const numericCorrect =
        typeof q?.correctIndex === "number"
          ? Math.floor(q.correctIndex as number)
          : typeof q?.correctIndex === "string"
          ? Math.floor(Number(q.correctIndex))
          : NaN;
      const rawCorrectIndex = Number.isFinite(numericCorrect) && numericCorrect >= 0 ? numericCorrect : null;

      let workingChoices = parsedChoices.slice();
      if (workingChoices.length > 4) {
        if (rawCorrectIndex != null) {
          const correctEntryIdx = workingChoices.findIndex((choice) => choice.rawIndex === rawCorrectIndex);
          if (correctEntryIdx >= 0 && correctEntryIdx >= 4) {
            const correctEntry = workingChoices[correctEntryIdx];
            const preserved = workingChoices.slice(0, 3);
            workingChoices = [...preserved, correctEntry];
          } else {
            workingChoices = workingChoices.slice(0, 4);
          }
        } else {
          workingChoices = workingChoices.slice(0, 4);
        }
      }

      let correctIndex = 0;
      if (rawCorrectIndex != null) {
        const match = workingChoices.findIndex((choice) => choice.rawIndex === rawCorrectIndex);
        if (match >= 0) correctIndex = match;
      }

      let choiceTexts = workingChoices.map((choice) => choice.text);
      const usedKeys = new Set<string>(choiceTexts.map((choice) => normalizeChoiceKey(choice)));

      if (choiceTexts.length === 0) {
        const fallback = buildFallbackChoices(promptText, questionIdx, usedKeys, 4);
        choiceTexts = fallback.slice(0, 4);
        correctIndex = 0;
      } else if (choiceTexts.length < 4) {
        const needed = 4 - choiceTexts.length;
        const fallback = buildFallbackChoices(promptText, questionIdx, usedKeys, needed);
        choiceTexts = choiceTexts.concat(fallback.slice(0, needed));
      }

      if (correctIndex >= choiceTexts.length) correctIndex = 0;

      return {
        prompt: promptText,
        choices: choiceTexts.slice(0, 4),
        correctIndex,
        explanation:
          typeof q?.explanation === "string" && q.explanation.trim().length
            ? q.explanation.slice(0, 240).trim()
            : undefined,
      };
    });

    while (sanitized.length < 3) {
      sanitized.push(makeFallbackQuestion(sanitized.length));
    }

    return sanitized.slice(0, 3);
  };

  const placeholderChoicePatterns = [
    /^the (accurate|key) (statement|idea)/i,
    /^a tempting misconception/i,
    /^an idea that does not/i,
    /^a partially correct/i,
    /^a choice that contradicts/i,
    /^an unrelated detail/i,
    /option \d+$/i,
  ];

  const placeholderPromptPatterns = [
    /^check your understanding:/i,
    /^reinforce the core idea/i,
    /^quick check/i,
  ];

  const isPlaceholderChoice = (choice: string) =>
    placeholderChoicePatterns.some((re) => re.test(choice.trim()));

  const isPlaceholderPrompt = (prompt: string) =>
    placeholderPromptPatterns.some((re) => re.test(prompt.trim()));

  const shouldRegenerateQuestions = (questions: Question[]) => {
    let weakCount = 0;
    for (const q of questions) {
      const placeholderChoices = q.choices.filter(isPlaceholderChoice).length;
      const placeholderPrompt = isPlaceholderPrompt(q.prompt);
      if (placeholderChoices >= 2 || placeholderPrompt) {
        weakCount += 1;
      }
    }
    return weakCount >= 2;
  };

  const recordAuxUsage = async (
    usageSummary: { input_tokens: number | null; output_tokens: number | null } | null,
    metadata?: Record<string, unknown>
  ) => {
    if (!uid || !usageSummary) return;
    try {
      await logUsage(sb, uid, ip, model, usageSummary, metadata ? { metadata } : undefined);
    } catch {}
  };

  const regenerateQuestionsWithAI = async (): Promise<Question[] | null> => {
    const lessonContent = typeof norm.content === "string" ? norm.content : "";
    const trimmedLesson = lessonContent.trim();
    if (!trimmedLesson) return null;

    const quizMode: "quick" | "mini" | "full" = "mini";
    const countRule = quizMode === "quick"
      ? "Produce 0-1 multiple-choice questions. Prefer 0 if the user's request is a narrowly scoped factual question."
      : quizMode === "full"
        ? "Produce 3-5 multiple-choice questions."
        : "Produce 2-3 multiple-choice questions.";

    const regenSystem = `
Return ONLY a valid JSON object (no prose) matching exactly:
{
  "id": string,
  "subject": string,
  "title": string,
  "difficulty": "intro"|"easy"|"medium"|"hard",
  "questions": [
    { "prompt": string, "choices": string[], "correctIndex": number, "explanation": string }
  ]
}
Rules:
- ${countRule}
- Keep choices short (<= 8 words). Keep explanations concise (<= 25 words).
- Use inline LaTeX with \\( ... \\) for math. Do NOT use single-dollar $...$ delimiters; prefer \\( ... \\) for inline and \\[ ... \\] only if necessary.
- Always balance {} and math delimiters (\\( pairs with \\), \\[ with \\], $$ with $$).
- Vector: \\langle a,b \\rangle; Norms: \\|v\\|; Matrices may use pmatrix with row breaks (\\).
- Avoid HTML tags and code fences.
- Wrap single-letter macro arguments in braces (e.g., \\vec{v}, \\mathbf{v}, \\hat{v}).
- JSON must be valid; escape backslashes so LaTeX survives JSON, and do not double-escape macros. After parsing, macros must start with a single backslash.
`.trim();

    const additionalContext: string[] = [];
    if (contextJson) additionalContext.push(`Structured context JSON:\n${contextJson}`);
    else if (opts?.mapSummary) additionalContext.push(`Map summary: ${opts.mapSummary}`);
    if (opts?.structuredContext && !contextJson) {
      additionalContext.push(`Additional context:\n${JSON.stringify(opts.structuredContext, null, 2)}`);
    }
    const contextBlock = additionalContext.join("\n\n").trim();

    const lessonDifficulty: Difficulty =
      typeof norm.difficulty === "string" && ["intro", "easy", "medium", "hard"].includes(norm.difficulty as string)
        ? (norm.difficulty as Difficulty)
        : targetDifficulty;

    const quizSourceText = [trimmedLesson, contextBlock].filter(Boolean).join("\n\n") || trimmedLesson;
    const regenPrompt = `
Subject: ${subject}
Mode: ${quizMode}
Difficulty: ${lessonDifficulty}
Source Text:
${quizSourceText}
Create fair multiple-choice questions based on the source, following the rules.
`.trim();

    try {
      const regenCompletion = await client.chat.completions.create({
        model,
        temperature: 0.35,
        max_tokens: 700,
        response_format: { type: "json_schema", json_schema: { name: "lesson_quiz_schema", schema: QUESTIONS_JSON_SCHEMA } },
        messages: [
          { role: "system", content: regenSystem },
          { role: "user", content: regenPrompt },
        ],
      });

      const usage = regenCompletion?.usage
        ? {
            input_tokens: typeof regenCompletion.usage.prompt_tokens === "number" ? regenCompletion.usage.prompt_tokens : null,
            output_tokens: typeof regenCompletion.usage.completion_tokens === "number" ? regenCompletion.usage.completion_tokens : null,
          }
        : null;
      await recordAuxUsage(usage, { fallbackStep: "quiz-regenerate" });

      const regenRaw = (regenCompletion.choices?.[0]?.message?.content as string | undefined) ?? "";
      let regenParsed: unknown;
      try {
        regenParsed = JSON.parse(regenRaw);
      } catch {
        const extracted = extractBalancedObject(regenRaw);
        if (!extracted) return null;
        regenParsed = JSON.parse(extracted);
      }

      const questionsRaw = Array.isArray((regenParsed as { questions?: unknown[] })?.questions)
        ? (regenParsed as { questions: unknown[] }).questions
        : [];
      if (!questionsRaw.length) return null;

      const sanitized = sanitizeQuestions(questionsRaw);
      return sanitized;
    } catch {
      return null;
    }
  };

  const initialQuestions = Array.isArray(norm.questions) ? norm.questions : [];
  let sanitizedQuestions = sanitizeQuestions(initialQuestions);

  if (shouldRegenerateQuestions(sanitizedQuestions)) {
    const regenerated = await regenerateQuestionsWithAI();
    if (regenerated && regenerated.length === 3) {
      sanitizedQuestions = regenerated;
    }
  }

  norm.questions = sanitizedQuestions;
  const revalidated = LessonSchema.safeParse(norm);
  if (revalidated.success) {
    await recordUsage(lastAttemptIndex);
    return revalidated.data;
  }
  throw new Error("Invalid lesson format from AI");
}

