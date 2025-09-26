import Groq from "groq-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LessonSchema } from "./schema";
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

type Pace = "slow" | "normal" | "fast";
type Difficulty = "intro" | "easy" | "medium" | "hard";
const MIN_LESSON_WORDS = 60;
const MAX_LESSON_WORDS = 100;

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

  const lenHint = pace === "fast"
    ? `Keep the explanation focused in ${MIN_LESSON_WORDS}-${Math.min(78, MAX_LESSON_WORDS)} words with tight transitions.`
    : pace === "slow"
    ? `Lean into detail: ${Math.max(72, MIN_LESSON_WORDS)}-${MAX_LESSON_WORDS} words with calm pacing.`
    : `Aim for ${MIN_LESSON_WORDS}-${Math.min(88, MAX_LESSON_WORDS)} words with clear sequencing.`;
  const accHint = acc !== null ? `Recent accuracy ~${acc}%.` : "";
  const diffHint = diffPref ? `Target difficulty around: ${diffPref}.` : "";
  const avoidHint = [
    avoidIds.length ? `Avoid reusing these lesson IDs: ${avoidIds.map((x) => '"' + x + '"').join(', ')}.` : "",
    avoidTitles.length ? `Avoid reusing these lesson titles: ${avoidTitles.map((x) => '"' + x + '"').join(', ')}.` : "",
  ].filter(Boolean).join(" ");

  const baseSystem = `You are the Lernex adaptive micro-lesson generator.
Return only a valid JSON object that matches LessonSchema with fields: id, subject, topic, title, content, difficulty, questions[].
Teaching blueprint:
- Write content as one cohesive paragraph of 5-6 sentences (~${MIN_LESSON_WORDS}-${MAX_LESSON_WORDS} words) with no markdown, lists, headings, or dialogue.
- Sentence flow:
  1. Use a relatable hook that names the topic and nods to the subject.
  2. Define the concept plainly, highlighting essential vocabulary.
  3. Walk through one concrete example (use numbers/symbols the learner would see in class).
  4. Explain why the example works, calling out the reasoning steps.
  5. Warn about a common misconception or pitfall.
  6. Close with a quick prompt that nudges the learner to try a similar move.
- Keep the voice encouraging yet precise; avoid filler or meta commentary.
- Use pace/difficulty hints to set depth; if accuracy is below 60%, weave in reassurance and retrieval cues.
- Questions: produce exactly 3 MCQs. Q1 should confirm recall, Q2 should apply the idea, Q3 should target a likely misconception. Provide four distinct choices as plain strings (no numbering or objects) and <=240-char explanations tied back to the lesson.
- When context JSON or map summaries are provided, ground all facts in that data and avoid inventing new entities.
If the topic is written as "Topic > Subtopic", focus on the Subtopic while briefly linking back to the Topic. Favor practical, course-linked examples when obvious. Use inline LaTeX (\\( ... \\)) sparingly and keep the JSON valid.`;

  const contextJson = opts?.structuredContext
    ? JSON.stringify(opts.structuredContext, null, 2)
    : null;
  const ctxHint = contextJson
    ? `\nContext JSON (authoritative):\n${contextJson}`
    : opts?.mapSummary
    ? `\nMap summary: ${opts.mapSummary}`
    : "";
  const userPrompt = `Subject: ${subject}\nTopic: ${topic}\nLearner pace: ${pace}. ${accHint} ${diffHint} ${lenHint}
${avoidHint}
Generate one micro-lesson and exactly three multiple-choice questions following the constraints.${ctxHint}\nReturn only the JSON object.`;

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
    const semicolonParts = normalized.split(/\s*[;|]\s*/).map(stripChoicePrefix).filter(Boolean);
    if (semicolonParts.length >= 2 && semicolonParts.length <= 6) return semicolonParts;
    return [stripChoicePrefix(normalized)];
  };

  const extractChoiceTexts = (value: unknown): string[] => {
    if (typeof value === "string") return splitCompoundOption(value);
    if (typeof value === "number" || typeof value === "boolean") return [String(value)];
    if (Array.isArray(value)) {
      return value.flatMap((entry) => extractChoiceTexts(entry));
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const keys = ["text", "value", "option", "answer", "content", "label", "body", "choice", "statement", "response"];
      const collected: string[] = [];
      for (const key of keys) {
        const raw = obj[key];
        if (typeof raw === "string") collected.push(...splitCompoundOption(raw));
        else if (Array.isArray(raw)) collected.push(...extractChoiceTexts(raw));
      }
      return collected;
    }
    return [];
  };

  const collectChoiceVariants = (rawChoices: unknown[]) => {
    const items: { text: string; rawIndex: number }[] = [];
    const seen = new Set<string>();

    rawChoices.forEach((entry, rawIndex) => {
      const pieces = extractChoiceTexts(entry).map((piece) => piece.trim()).filter(Boolean);
      for (const piece of pieces) {
        const key = normalizeChoiceKey(piece);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        items.push({ text: piece, rawIndex });
        if (items.length >= 8) break;
      }
    });

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
      `An idea that does not answer "${promptLabel}"`,
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

  // Questions minimal fallback
  if (!Array.isArray(norm.questions) || (norm.questions as unknown[]).length === 0) {
    norm.questions = [
      {
        prompt: typeof norm.title === "string" ? `Which statement best reflects: ${norm.title}` : "Quick check",
        choices: [
          `The key idea about ${canonicalTopic}`,
          `A common misconception about ${canonicalTopic}`,
          "An unrelated fact",
          "An incomplete or partially correct view",
        ],
        correctIndex: 0,
        explanation: "This choice captures the essence of the micro-lesson.",
      }
    ];
  } else {
    type NormQuestion = { prompt?: unknown; choices?: unknown; correctIndex?: unknown; explanation?: unknown };
    const normalized = (norm.questions as unknown[]).map((raw, questionIdx) => {
      const q = raw as NormQuestion;
      const promptText =
        typeof q?.prompt === "string" && q.prompt.trim().length
          ? q.prompt.trim()
          : typeof norm.title === "string"
          ? `Check your understanding: ${norm.title}`
          : "Quick check";
      const rawChoices = Array.isArray(q?.choices) ? (q.choices as unknown[]) : [];
      const parsedChoices = collectChoiceVariants(rawChoices);
      const rawCorrectIndex =
        typeof q?.correctIndex === "number"
          ? Math.max(0, Math.floor(q.correctIndex as number))
          : null;

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
    while (normalized.length < 3) {
      const promptText = `Reinforce the core idea (${normalized.length + 1}/3)`;
      const usedKeys = new Set<string>();
      const fallback = buildFallbackChoices(promptText, normalized.length, usedKeys, 4);
      normalized.push({
        prompt: promptText,
        choices: fallback.slice(0, 4),
        correctIndex: 0,
        explanation: "Select the option that best matches the lesson's main takeaway.",
      });
    }
    norm.questions = normalized.slice(0, 3);
  }
  const revalidated = LessonSchema.safeParse(norm);
  if (revalidated.success) {
    await recordUsage(lastAttemptIndex);
    return revalidated.data;
  }
  throw new Error("Invalid lesson format from AI");
}
