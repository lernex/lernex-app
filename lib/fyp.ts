import { createHash } from "crypto";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Difficulty } from "@/types/placement";
import { LessonSchema, MIN_LESSON_WORDS, MAX_LESSON_WORDS } from "./schema";
import type { Lesson } from "./schema";
import { checkUsageLimit, logUsage } from "./usage";
import { buildLessonPrompts } from "./lesson-prompts";

type Pace = "slow" | "normal" | "fast";

type UsageSummary = { input_tokens: number | null; output_tokens: number | null } | null;

type LessonOptions = {
  pace?: Pace;
  accuracyPct?: number;
  difficultyPref?: Difficulty;
  avoidIds?: string[];
  avoidTitles?: string[];
  mapSummary?: string;
  structuredContext?: Record<string, unknown>;
  likedIds?: string[];
  savedIds?: string[];
  toneTags?: string[];
  nextTopicHint?: string;
};

const MAX_GUARDRAIL_ITEMS = 6;
const MAX_CONTEXT_CHARS = 600;
const MAX_MAP_SUMMARY_CHARS = 600;

const DEFAULT_MODEL = process.env.CEREBRAS_LESSON_MODEL ?? "gpt-oss-120b";
const DEFAULT_TEMPERATURE = Number(process.env.CEREBRAS_LESSON_TEMPERATURE ?? "1");
const DEFAULT_BASE_URL = process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1";

let cachedClient: { apiKey: string; baseUrl: string; client: OpenAI } | null = null;

function getClient() {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error("Missing CEREBRAS_API_KEY");
  const baseUrl = process.env.CEREBRAS_BASE_URL ?? DEFAULT_BASE_URL;

  if (!cachedClient || cachedClient.apiKey !== apiKey || cachedClient.baseUrl !== baseUrl) {
    cachedClient = {
      apiKey,
      baseUrl,
      client: new OpenAI({ apiKey, baseURL: baseUrl }),
    };
  }

  return cachedClient.client;
}

function clampTemperature(value: number) {
  if (!Number.isFinite(value)) return 0.6;
  return Math.min(1, Math.max(0, value));
}

function collectStrings(value: unknown, depth = 0, seen = new Set<unknown>()): string[] {
  if (depth > 6 || value == null) return [];

  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStrings(entry, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) return [];
    seen.add(value);

    const obj = value as Record<string, unknown>;
    const preferredKeys = ["text", "content", "value", "arguments", "json"];

    let result: string[] = [];
    for (const key of preferredKeys) {
      if (key in obj) {
        result = result.concat(collectStrings(obj[key], depth + 1, seen));
      }
    }

    if (result.length) return result;
    return Object.values(obj).flatMap((entry) => collectStrings(entry, depth + 1, seen));
  }

  return [];
}

function extractAssistantJson(choice: unknown): string {
  if (!choice || typeof choice !== "object") return "";
  const message = (choice as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";

  const msgRecord = message as Record<string, unknown>;
  const candidates = collectStrings(msgRecord.content);

  if (!candidates.length) {
    candidates.push(...collectStrings(msgRecord.reasoning_content));
  }

  if (!candidates.length) {
    const toolCalls = msgRecord.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        if (!call || typeof call !== "object") continue;
        const fn = (call as { function?: { arguments?: unknown } }).function;
        if (!fn || typeof fn !== "object") continue;
        candidates.push(...collectStrings((fn as { arguments?: unknown }).arguments));
      }
    }
  }

  return candidates
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0)
    ?? "";
}

function tryParseJson(text: string): unknown | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  const segments: string[] = [cleaned];
  if (cleaned.startsWith("```")) {
    const withoutFence = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    if (withoutFence) segments.push(withoutFence);
  }

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) segments.push(objectMatch[0]);

  for (const candidate of segments) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        try {
          return JSON.parse(parsed);
        } catch {
          continue;
        }
      }
      return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

function resolveLessonCandidate(raw: string): Lesson | null {
  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const obj = parsed as Record<string, unknown>;
  const possible = [obj];

  if (obj.lesson && typeof obj.lesson === "object" && !Array.isArray(obj.lesson)) {
    possible.push(obj.lesson as Record<string, unknown>);
  }
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    possible.push(obj.data as Record<string, unknown>);
  }

  for (const candidate of possible) {
    const result = LessonSchema.safeParse(candidate);
    if (result.success) return result.data;
  }

  return null;
}

function clampFallbackContent(text: string) {
  const maxChars = 600;
  const sanitized = text.replace(/\s+/g, " ").trim();
  const originalWords = sanitized ? sanitized.split(" ").filter(Boolean) : [];

  if (!originalWords.length) return sanitized;

  let words = originalWords.slice(0, Math.min(originalWords.length, MAX_LESSON_WORDS));
  let normalized = words.join(" ");

  while (normalized.length > maxChars && words.length > MIN_LESSON_WORDS) {
    words.pop();
    normalized = words.join(" ");
  }

  if (words.length < MIN_LESSON_WORDS && originalWords.length >= MIN_LESSON_WORDS) {
    words = originalWords.slice(0, MIN_LESSON_WORDS);
    normalized = words.join(" ");
  }

  normalized = normalized.trim();
  if (!/[.!?]$/.test(normalized)) normalized = `${normalized}.`;

  return normalized;
}

function buildFallbackLesson(subject: string, topic: string, _pace: Pace, _accuracy: number | null, difficulty: Difficulty): Lesson {
  const topicLabel = topic.split("> ").pop()?.trim() || topic.trim();
  const subjectLabel = subject.trim() || "your course";

  const contentBase = [
    `${topicLabel} is a cornerstone idea in ${subjectLabel}. Open with a clear statement of what the concept represents and why it matters.`,
    `Walk through a bite-sized example so each step of the rule is visible, pausing to highlight the move that makes the result work.`,
    `Call out a common snag learners face and what signal tells you to slow down and fix it before the error spreads.`,
    `Close with a next action - solve a related mini-problem, sketch the relationship, or teach the idea aloud to reinforce the pattern.`,
  ].join(" ");

  const content = clampFallbackContent(contentBase);

  const questions: Lesson["questions"] = [
    {
      prompt: `When reviewing ${topicLabel}, what helps the lesson land first?`,
      choices: [
        "Start with the key idea and why it matters.",
        "Skip straight to a test without a refresher.",
        "Memorize every topic in the unit at once.",
        "Ignore earlier skills and only read new notes.",
      ],
      correctIndex: 0,
      explanation: `Leading with the concept and its purpose grounds everything that follows and keeps practice focused.`,
    },
    {
      prompt: `Why include a small example for ${topicLabel}?`,
      choices: [
        "It shows the rule working step by step in a concrete case.",
        "It proves the topic is harder than expected.",
        "It replaces definitions so you can skip them later.",
        "It keeps you from checking whether your steps make sense.",
      ],
      correctIndex: 0,
      explanation: `Seeing the idea in action clarifies how each move fits the definition and highlights the critical step.`,
    },
    {
      prompt: `What is a productive next move after studying ${topicLabel}?`,
      choices: [
        "Tackle a related mini-problem or teach the idea aloud.",
        "Erase your notes to force yourself to start over.",
        "Avoid practice so the concept stays unfamiliar.",
        "Switch subjects immediately to avoid repetition.",
      ],
      correctIndex: 0,
      explanation: `Re-applying the idea right away - by solving or explaining - locks in the pattern before you move on.`,
    },
  ];

  return LessonSchema.parse({
    id: `fallback-${Date.now().toString(36)}`,
    subject,
    topic,
    title: `Quick Look: ${topicLabel}`,
    content,
    difficulty,
    questions,
  });
}

function dedupeStrings(values: string[], limit: number) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const raw = typeof values[i] === "string" ? (values[i] as string).trim() : "";
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    result.push(raw);
    if (result.length >= limit) break;
  }
  return result.reverse();
}

function truncateText(input: string, maxChars: number) {
  const trimmed = input.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function shortHash(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 10) return trimmed;
  return createHash("sha1").update(trimmed).digest("base64url").slice(0, 10);
}

function hashSample(values: string[] | undefined, limit: number) {
  if (!Array.isArray(values) || !values.length) return [];
  return dedupeStrings(values, limit).map(shortHash);
}

function stringifyStructuredContext(context: Record<string, unknown>) {
  try {
    const json = JSON.stringify(context);
    if (!json) return "";
    return truncateText(json, MAX_CONTEXT_CHARS);
  } catch {
    return "";
  }
}

function buildSourceText(
  subject: string,
  topic: string,
  pace: Pace,
  accuracy: number | null,
  difficulty: Difficulty,
  opts: LessonOptions = {}
) {
  const sections: string[] = [];
  const subjectLine = subject.trim() || "General studies";
  const topicLine = topic.trim() || "Current concept";
  sections.push(`Subject: ${subjectLine}\nTopic Focus: ${topicLine}`);

  const learnerSignals: string[] = [
    `- Pace preference: ${pace}`,
    accuracy != null
      ? `- Recent accuracy: ${accuracy}%`
      : `- Recent accuracy unavailable`,
    `- Target difficulty: ${difficulty}`,
  ];
  if (opts.difficultyPref && opts.difficultyPref !== difficulty) {
    learnerSignals.push(`- Learner requested difficulty: ${opts.difficultyPref}`);
  }
  sections.push(
    [
      "Learner Profile (calibrate tone; do not echo these stats verbatim):",
      learnerSignals.join("\n"),
    ].join("\n"),
  );

  const preferenceLines: string[] = [];
  const likedHashes = opts.likedIds ? dedupeStrings(opts.likedIds, 6).map(shortHash) : [];
  const savedHashes = opts.savedIds ? dedupeStrings(opts.savedIds, 6).map(shortHash) : [];
  const toneTags = opts.toneTags ? dedupeStrings(opts.toneTags, 6) : [];

  if (likedHashes.length) preferenceLines.push(`- Learner responded well to recent lessons: ${likedHashes.join(", ")}`);
  if (savedHashes.length) preferenceLines.push(`- Saved lessons to revisit (hashed ids): ${savedHashes.join(", ")}`);
  if (toneTags.length) preferenceLines.push(`- Preferred lesson tone cues: ${toneTags.join(", ")}`);
  if (preferenceLines.length) {
    sections.push(
      [
        "Preference Signals (reinforce effective patterns without repeating identical content):",
        preferenceLines.join("\n"),
      ].join("\n"),
    );
  }

  sections.push(
    [
      "Lesson Goals:",
      "- Explain the core idea plainly and connect it to prior knowledge.",
      "- Include a compact example or scenario that shows the idea in action.",
      "- Call out one common misconception and how to avoid it.",
      "- End with a concrete next step or prompt to keep practising.",
      "Keep the tone encouraging but content-focused; avoid meta commentary about pace or accuracy.",
    ].join("\n"),
  );

  if (opts.mapSummary) {
    const summary = truncateText(opts.mapSummary, MAX_MAP_SUMMARY_CHARS);
    if (summary) sections.push(`Learning Path Summary:\n${summary}`);
  }

  if (opts.structuredContext) {
    const structured = stringifyStructuredContext(opts.structuredContext);
    if (structured) sections.push(`Structured Context (JSON excerpt):\n${structured}`);
  }

  const guardrails: string[] = [];
  if (opts.avoidTitles?.length) {
    const titles = dedupeStrings(opts.avoidTitles, MAX_GUARDRAIL_ITEMS);
    if (titles.length) guardrails.push(`Avoid reusing lesson titles: ${titles.join("; ")}`);
  }
  if (opts.avoidIds?.length) {
    const ids = dedupeStrings(opts.avoidIds, MAX_GUARDRAIL_ITEMS);
    if (ids.length) guardrails.push(`Avoid lesson ids: ${ids.join(", ")}`);
  }

  if (guardrails.length) {
    sections.push(`Guardrails:\n- ${guardrails.join("\n- ")}`);
  }

  return sections.join("\n\n").trim();
}

export async function generateLessonForTopic(
  sb: SupabaseClient,
  uid: string,
  ip: string,
  subject: string,
  topic: string,
  opts: LessonOptions = {}
): Promise<Lesson> {
  const client = getClient();
  const model = DEFAULT_MODEL;
  const temperature = clampTemperature(DEFAULT_TEMPERATURE);
  const completionMaxTokens = Math.min(
    3200,
    Math.max(900, Number(process.env.GROQ_LESSON_MAX_TOKENS ?? "2200") || 2200),
  );

  if (uid) {
    const allowed = await checkUsageLimit(sb, uid);
    if (!allowed) throw new Error("Usage limit exceeded");
  }

  const pace: Pace = opts.pace ?? "normal";
  const accuracy = typeof opts.accuracyPct === "number"
    ? Math.max(0, Math.min(100, Math.round(opts.accuracyPct)))
    : null;
  const difficulty: Difficulty =
    opts.difficultyPref
      ?? (accuracy != null
        ? (accuracy < 50 ? "intro" : accuracy < 70 ? "easy" : accuracy < 85 ? "medium" : "hard")
        : "easy");

  const sourceText = buildSourceText(subject, topic, pace, accuracy, difficulty, opts);
  const { system: systemPrompt, user: userPrompt } = buildLessonPrompts({
    subject,
    difficulty,
    sourceText,
    nextTopicHint: opts.nextTopicHint,
  });

  const requestPayload = {
    model,
    temperature,
    max_tokens: completionMaxTokens,
    reasoning_effort: "medium" as const,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ],
  };

  let usageSummary: UsageSummary = null;
  let lastError: unknown = null;

  const logLessonUsage = async (
    attempt: "single" | "fallback",
    summary: UsageSummary,
    errorDetails?: unknown,
  ) => {
    if (!uid) return;
    const usagePayload = summary ?? { input_tokens: null, output_tokens: null };
    const avoidSample = hashSample(opts.avoidIds, 6);
    const likedSample = hashSample(opts.likedIds, 6);
    const savedSample = hashSample(opts.savedIds, 6);
    const toneSample = Array.isArray(opts.toneTags) ? dedupeStrings(opts.toneTags, 6) : [];
    const structuredKeys = opts.structuredContext
      ? Object.keys(opts.structuredContext).slice(0, 6)
      : null;
    const metadata: Record<string, unknown> = {
      feature: "fyp-lesson",
      route: "fyp",
      generatorAttempt: attempt,
      subject,
      topic,
      pace,
      difficulty,
      accuracyPct: accuracy,
      avoidIdsCount: Array.isArray(opts.avoidIds) ? opts.avoidIds.length : 0,
      avoidIdsSample: avoidSample.length ? avoidSample : undefined,
      avoidTitlesCount: Array.isArray(opts.avoidTitles) ? opts.avoidTitles.length : 0,
      likedCount: Array.isArray(opts.likedIds) ? opts.likedIds.length : 0,
      likedSample: likedSample.length ? likedSample : undefined,
      savedCount: Array.isArray(opts.savedIds) ? opts.savedIds.length : 0,
      savedSample: savedSample.length ? savedSample : undefined,
      toneTags: toneSample.length ? toneSample : undefined,
      nextTopicHintProvided: Boolean(opts.nextTopicHint && opts.nextTopicHint.trim().length > 0),
      mapSummary: opts.mapSummary ?? undefined,
      structuredContextKeys: structuredKeys ?? undefined,
    };
    if (summary == null) metadata.missingUsage = true;
    if (errorDetails) {
      metadata.error = errorDetails instanceof Error ? errorDetails.message : String(errorDetails);
    }
    try {
      await logUsage(sb, uid, ip, model, usagePayload, { metadata });
    } catch (usageErr) {
      console.warn("[fyp] usage log failed", usageErr);
    }
  };

  try {
    const completion = await client.chat.completions.create(requestPayload);

    const usage = completion.usage;
    if (usage) {
      usageSummary = {
        input_tokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
        output_tokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
      };
    }

    const choice = completion.choices?.[0];
    const messageContent = choice?.message?.content;
    const raw = typeof messageContent === "string" && messageContent.trim().length > 0
      ? messageContent.trim()
      : extractAssistantJson(choice);
    const lesson = resolveLessonCandidate(raw);

    if (lesson) {
      await logLessonUsage("single", usageSummary);
      return lesson;
    }

    lastError = new Error("Invalid lesson format from AI");
  } catch (error) {
    const fallbackGenerated = (error as { error?: { failed_generation?: string } })?.error?.failed_generation;
    if (typeof fallbackGenerated === "string" && fallbackGenerated.trim().length > 0) {
      const lesson = resolveLessonCandidate(fallbackGenerated);
      if (lesson) {
        await logLessonUsage("single", usageSummary);
        return lesson;
      }
      lastError = new Error("Invalid lesson format from AI");
    } else {
      lastError = error;
    }
  }

  console.warn("[fyp] returning fallback lesson", {
    subject,
    topic,
    error: lastError instanceof Error ? lastError.message : lastError,
  });

  await logLessonUsage("fallback", usageSummary, lastError);

  return buildFallbackLesson(subject, topic, pace, accuracy, difficulty);
}


