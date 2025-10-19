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
  learnerProfile?: string;
  likedLessonDescriptors?: string[];
  savedLessonDescriptors?: string[];
  previousLessonSummary?: string;
  accuracyBand?: string;
  recentMissSummary?: string;
  knowledge?: {
    definition?: string;
    applications?: string[];
    prerequisites?: string[];
    reminders?: string[];
  };
  personalization?: {
    style?: { prefer?: string[]; avoid?: string[] };
    lessons?: { leanInto?: string[]; avoid?: string[]; saved?: string[] };
  };
};

const MAX_GUARDRAIL_ITEMS = 6;
const MAX_CONTEXT_CHARS = 360;
const MAX_MAP_SUMMARY_CHARS = 360;

const LESSON_RESPONSE_SCHEMA = {
  name: "lesson_payload",
  schema: {
    type: "object",
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      subject: { type: "string" },
      topic: { type: "string" },
      title: { type: "string" },
      content: { type: "string" },
      difficulty: { type: "string", enum: ["intro", "easy", "medium", "hard"] },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            prompt: { type: "string" },
            choices: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
            },
            correctIndex: { type: "integer", minimum: 0 },
            explanation: { type: "string" },
          },
          required: ["prompt", "choices", "correctIndex", "explanation"],
        },
      },
    },
    required: ["id", "subject", "topic", "title", "content", "difficulty", "questions"],
  },
} as const;

const LESSON_VERIFICATION_SCHEMA = {
  name: "lesson_verification",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      valid: { type: "boolean" },
      reasons: {
        type: "array",
        items: { type: "string" },
        minItems: 0,
        maxItems: 6,
      },
    },
    required: ["valid"],
  },
} as const;

const DEFAULT_MODEL = process.env.CEREBRAS_LESSON_MODEL ?? "gpt-oss-120b";
const DEFAULT_BASE_URL = process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1";
const FALLBACK_TEMPERATURE = 0.4;

const resolveNumericEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const TEMPERATURE_MIN = resolveNumericEnv(process.env.CEREBRAS_LESSON_TEMPERATURE_MIN, 0.3);
const TEMPERATURE_MAX = resolveNumericEnv(process.env.CEREBRAS_LESSON_TEMPERATURE_MAX, 0.5);
const TEMPERATURE_FLOOR = Math.min(TEMPERATURE_MIN, TEMPERATURE_MAX);
const TEMPERATURE_CEIL = Math.max(TEMPERATURE_MIN, TEMPERATURE_MAX);

function clampTemperature(value: number) {
  if (!Number.isFinite(value)) {
    return Math.min(Math.max(FALLBACK_TEMPERATURE, TEMPERATURE_FLOOR), TEMPERATURE_CEIL);
  }
  return Math.max(TEMPERATURE_FLOOR, Math.min(TEMPERATURE_CEIL, value));
}

const DEFAULT_TEMPERATURE = clampTemperature(resolveNumericEnv(process.env.CEREBRAS_LESSON_TEMPERATURE, FALLBACK_TEMPERATURE));
const TEMPERATURE_BY_BAND: Record<string, number> = {
  early: clampTemperature(0.33),
  developing: clampTemperature(0.36),
  steady: clampTemperature(0.4),
  high: clampTemperature(0.45),
};

function deriveLessonTemperature(accuracyBand: string | undefined, accuracy: number | null) {
  const normalizedBand = typeof accuracyBand === "string" ? accuracyBand.trim().toLowerCase() : null;
  if (normalizedBand && normalizedBand in TEMPERATURE_BY_BAND) {
    return TEMPERATURE_BY_BAND[normalizedBand];
  }
  if (accuracy != null) {
    if (accuracy < 50) return clampTemperature(0.33);
    if (accuracy < 70) return clampTemperature(0.36);
    if (accuracy < 85) return clampTemperature(0.4);
    return clampTemperature(0.45);
  }
  return DEFAULT_TEMPERATURE;
}

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

type LessonVerificationTarget = {
  subject: string;
  topic: string;
  difficulty: Difficulty;
  knowledge?: LessonOptions["knowledge"];
  recentMissSummary?: string | null;
};

async function verifyLessonAlignment(
  client: OpenAI,
  model: string,
  lesson: Lesson,
  target: LessonVerificationTarget,
) {
  const knowledgeLines = collectKnowledgeEntries(target.knowledge);
  const knowledgeSummary = knowledgeLines.length ? knowledgeLines.join(" | ") : null;

  const systemPrompt = [
    "You are a quality gate that validates micro-lessons for alignment and fidelity.",
    "Return strict JSON matching { \"valid\": boolean, \"reasons\": string[] }.",
    "Reject lessons that skip the requested topic, mismatch the target difficulty, misstate facts, or ignore recent-miss cues.",
    "Reasons should be concise phrases explaining any issue you detect.",
  ].join("\n");

  const userLines = [
    `Subject: ${target.subject}`,
    `Requested topic: ${target.topic}`,
    `Target difficulty: ${target.difficulty}`,
    target.recentMissSummary ? `Recent miss signal: ${target.recentMissSummary}` : null,
    knowledgeSummary ? `Anchor knowledge: ${knowledgeSummary}` : null,
    `Lesson JSON:`,
    JSON.stringify(lesson),
    `Respond with the verification JSON only.`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: clampTemperature(0.1),
      max_tokens: 260,
      response_format: { type: "json_schema", json_schema: LESSON_VERIFICATION_SCHEMA },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userLines },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return { valid: false, reasons: ["no_verification_response"] };
    const parsed = tryParseJson(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { valid: false, reasons: ["invalid_verification_payload"] };
    }
    const result = parsed as { valid?: unknown; reasons?: unknown };
    const valid = typeof result.valid === "boolean" ? result.valid : false;
    const reasons = Array.isArray(result.reasons)
      ? result.reasons
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length)
          .slice(0, 6)
      : [];
    return { valid, reasons };
  } catch (error) {
    console.warn("[fyp] verification failed", error);
    return { valid: false, reasons: ["verification_call_failed"] };
  }
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
  const focusKeyword = topicLabel.split(" ").slice(0, 3).join(" ");

  const contentBase = [
    `${topicLabel} is a cornerstone idea in ${subjectLabel}. Open with a clear statement of what ${topicLabel} represents and why learners will see it again soon.`,
    `Walk through a bite-sized example that explicitly uses ${focusKeyword}, pausing to highlight the move that usually unlocks the result.`,
    `Call out a common snag (for example, mixing up the sign change or forgetting to balance the ${focusKeyword} step) and describe the quick check that catches it.`,
    `Close with a next action - solve a related mini-problem that still uses ${focusKeyword}, sketch the relationship, or teach the idea aloud to reinforce the pattern.`,
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

function sanitizeStructuredContext(context: Record<string, unknown>) {
  const prune = (value: unknown, depth: number): unknown => {
    if (depth > 4) return undefined;
    if (value == null) return value;
    if (typeof value === "string") {
      return truncateText(value, Math.min(MAX_CONTEXT_CHARS, 220));
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (Array.isArray(value)) {
      const items: unknown[] = [];
      for (const entry of value) {
        if (items.length >= 6) break;
        const sanitized = prune(entry, depth + 1);
        if (sanitized === undefined) continue;
        items.push(sanitized);
      }
      return items;
    }
    if (typeof value === "object") {
      const result: Record<string, unknown> = {};
      const entries = Object.entries(value as Record<string, unknown>);
      for (let idx = 0; idx < entries.length && idx < 8; idx += 1) {
        const [key, raw] = entries[idx];
        const sanitized = prune(raw, depth + 1);
        if (sanitized === undefined) continue;
        result[key] = sanitized;
      }
      return result;
    }
    return undefined;
  };

  const sanitized = prune(context, 0);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return {};
  }
  return sanitized as Record<string, unknown>;
}

function buildStructuredContextPayload(context: Record<string, unknown>) {
  try {
    const sanitized = sanitizeStructuredContext(context);
    return { type: "structured_context", data: sanitized };
  } catch {
    return { type: "structured_context", data: {} };
  }
}

function collectKnowledgeEntries(knowledge: LessonOptions["knowledge"] | undefined): string[] {
  if (!knowledge) return [];
  const entries: string[] = [];
  const definition = typeof knowledge.definition === "string" ? knowledge.definition.trim() : "";
  if (definition) {
    entries.push(`definition: ${truncateText(definition, 240)}`);
  }
  if (Array.isArray(knowledge.applications)) {
    const apps = dedupeStrings(
      knowledge.applications.filter((entry): entry is string => typeof entry === "string"),
      3,
    ).map((entry) => truncateText(entry, 110));
    if (apps.length) {
      entries.push(`applications: ${apps.join(" | ")}`);
    }
  }
  if (Array.isArray(knowledge.prerequisites)) {
    const prereqs = dedupeStrings(
      knowledge.prerequisites.filter((entry): entry is string => typeof entry === "string"),
      4,
    ).map((entry) => truncateText(entry, 100));
    if (prereqs.length) {
      entries.push(`prerequisites: ${prereqs.join(" | ")}`);
    }
  }
  if (Array.isArray(knowledge.reminders)) {
    const reminders = dedupeStrings(
      knowledge.reminders.filter((entry): entry is string => typeof entry === "string"),
      3,
    ).map((entry) => truncateText(entry, 100));
    if (reminders.length) {
      entries.push(`reminders: ${reminders.join(" | ")}`);
    }
  }
  return entries;
}

function buildSourceText(
  subject: string,
  topic: string,
  pace: Pace,
  accuracy: number | null,
  difficulty: Difficulty,
  opts: LessonOptions = {}
) {
  const subjectLine = subject.trim() || "General studies";
  const topicLine = topic.trim() || "Current concept";

  const clampList = (values: string[] | undefined, limit: number) => {
    if (!Array.isArray(values) || !values.length) return [];
    return dedupeStrings(
      values
        .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry ?? "").trim()))
        .filter((entry) => entry.length > 0),
      limit
    );
  };

  const knowledgePayload: Record<string, unknown> = {};
  if (opts.knowledge) {
    const { definition, applications, prerequisites, reminders } = opts.knowledge;
    if (typeof definition === "string" && definition.trim()) {
      knowledgePayload.definition = truncateText(definition.trim(), 220);
    }
    const apps = clampList(applications, 3).map((entry) => truncateText(entry, 110));
    if (apps.length) knowledgePayload.applications = apps;
    const prereqs = clampList(prerequisites, 4).map((entry) => truncateText(entry, 100));
    if (prereqs.length) knowledgePayload.prerequisites = prereqs;
    const rems = clampList(reminders, 3).map((entry) => truncateText(entry, 100));
    if (rems.length) knowledgePayload.reminders = rems;
  }

  const profile: Record<string, unknown> = {
    pace,
    target_difficulty: difficulty,
  };
  if (typeof opts.accuracyBand === "string" && opts.accuracyBand.trim()) {
    profile.accuracy_band = opts.accuracyBand.trim();
  } else if (accuracy != null) {
    profile.accuracy_pct = accuracy;
  }
  if (opts.difficultyPref && opts.difficultyPref !== difficulty) {
    profile.requested_difficulty = opts.difficultyPref;
  }
  if (typeof opts.learnerProfile === "string" && opts.learnerProfile.trim()) {
    profile.note = truncateText(opts.learnerProfile.trim(), MAX_CONTEXT_CHARS);
  }
  if (opts.nextTopicHint && opts.nextTopicHint.trim()) {
    profile.next_topic_hint = truncateText(opts.nextTopicHint.trim(), 160);
  }

  const recents: Record<string, unknown> = {};
  if (opts.previousLessonSummary && opts.previousLessonSummary.trim()) {
    recents.previous_lesson = truncateText(opts.previousLessonSummary.trim(), MAX_CONTEXT_CHARS);
  }
  if (opts.recentMissSummary && opts.recentMissSummary.trim()) {
    recents.recent_miss = truncateText(opts.recentMissSummary.trim(), 140);
  }

  const preferences: Record<string, unknown> = {};
  const toneHints = opts.toneTags ? dedupeStrings(opts.toneTags, 4) : [];
  if (toneHints.length) preferences.tone_hints = toneHints;

  const stylePrefs: Record<string, unknown> = {};
  const lessonPrefs: Record<string, unknown> = {};
  const personalization = opts.personalization ?? {};
  if (personalization.style) {
    const prefer = clampList(personalization.style.prefer, 6);
    const avoid = clampList(personalization.style.avoid, 6);
    if (prefer.length) stylePrefs.prefer = prefer;
    if (avoid.length) stylePrefs.avoid = avoid;
  }
  const leanInto = personalization.lessons?.leanInto
    ? clampList(personalization.lessons.leanInto, 6)
    : clampList(opts.likedLessonDescriptors, 4);
  if (leanInto.length) lessonPrefs.lean_into = leanInto;
  const avoidLessons = personalization.lessons?.avoid
    ? clampList(personalization.lessons.avoid, 6)
    : [];
  if (avoidLessons.length) lessonPrefs.avoid = avoidLessons;
  const savedLessons = personalization.lessons?.saved
    ? clampList(personalization.lessons.saved, 4)
    : clampList(opts.savedLessonDescriptors, 3);
  if (savedLessons.length) lessonPrefs.saved = savedLessons;
  if (Object.keys(stylePrefs).length) preferences.style = stylePrefs;
  if (Object.keys(lessonPrefs).length) preferences.lessons = lessonPrefs;

  const guardrails: Record<string, unknown> = {};
  if (opts.avoidTitles?.length) {
    const titles = clampList(opts.avoidTitles, MAX_GUARDRAIL_ITEMS);
    if (titles.length) guardrails.avoid_titles = titles;
  }
  if (opts.avoidIds?.length) {
    const ids = clampList(opts.avoidIds, MAX_GUARDRAIL_ITEMS);
    if (ids.length) guardrails.avoid_ids = ids;
  }

  const facts: Record<string, unknown> = {
    subject: subjectLine,
    focus: topicLine,
  };
  const progress: Record<string, unknown> = {
    pace,
  };
  if (opts.accuracyBand) {
    progress.accuracy_band = opts.accuracyBand;
  } else if (accuracy != null) {
    progress.accuracy_pct = accuracy;
  }
  if (opts.mapSummary) {
    const summary = truncateText(opts.mapSummary, MAX_MAP_SUMMARY_CHARS);
    if (summary) progress.map = summary;
  }
  if (Object.keys(progress).length) facts.progress = progress;
  if (Object.keys(knowledgePayload).length) facts.knowledge = knowledgePayload;

  const payload: Record<string, unknown> = {
    facts,
    learner: {
      profile,
      ...(Object.keys(recents).length ? { recents } : {}),
    },
    goals: {
      definition: "Explain the core idea plainly in one sentence.",
      example: "Give one concrete example or walkthrough.",
      pitfall: "Highlight a common misconception and how to fix it.",
      next_step: "End with one actionable next step for the learner.",
    },
  };
  if (Object.keys(preferences).length) payload.preferences = preferences;
  if (Object.keys(guardrails).length) payload.guardrails = guardrails;

  const prune = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const pruned = value.map((item) => prune(item)).filter((item) => {
        if (item == null) return false;
        if (typeof item === "string") return item.trim().length > 0;
        if (Array.isArray(item)) return item.length > 0;
        if (typeof item === "object") return Object.keys(item as Record<string, unknown>).length > 0;
        return true;
      });
      return pruned;
    }
    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const pruned = prune(raw);
        const isEmptyObject = pruned && typeof pruned === "object" && !Array.isArray(pruned) && Object.keys(pruned as Record<string, unknown>).length === 0;
        const isEmptyArray = Array.isArray(pruned) && pruned.length === 0;
        if (
          pruned == null ||
          (typeof pruned === "string" && !pruned.trim()) ||
          isEmptyObject ||
          isEmptyArray
        ) {
          continue;
        }
        result[key] = pruned;
      }
      return result;
    }
    if (typeof value === "string") {
      return value.trim();
    }
    return value;
  };

  const cleaned = prune(payload) as Record<string, unknown>;
  return JSON.stringify(cleaned);
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
  const completionMaxTokens = Math.min(
    3200,
    Math.max(900, Number(process.env.CEREBRAS_LESSON_MAX_TOKENS ?? "2200") || 2200),
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
  const temperature = deriveLessonTemperature(opts.accuracyBand, accuracy);

  const sourceText = buildSourceText(subject, topic, pace, accuracy, difficulty, opts);
  const { system: systemPrompt, user: userPrompt } = buildLessonPrompts({
    subject,
    difficulty,
    sourceText,
    nextTopicHint: opts.nextTopicHint,
  });

  type ChatContentPart =
    | { type: "input_text"; text: string }
    | { type: "input_json"; json: unknown };
  type ChatMessage = {
    role: "system" | "user";
    content: string | ChatContentPart[];
    name?: string;
  };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];
  if (opts.structuredContext) {
    messages.push({
      role: "user",
      name: "structured_context",
      content: [{ type: "input_json", json: buildStructuredContextPayload(opts.structuredContext) }],
    });
  }
  messages.push({ role: "user", content: userPrompt });

  const requestPayload = {
    model,
    temperature,
    max_tokens: completionMaxTokens,
    reasoning_effort: "medium" as const,
    response_format: { type: "json_schema" as const, json_schema: LESSON_RESPONSE_SCHEMA },
    messages,
  };

  let usageSummary: UsageSummary = null;
  let lastError: unknown = null;
  let lastVerification: { valid: boolean; reasons: string[] } | null = null;

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
    const structuredDigest = opts.structuredContext
      ? createHash("sha1").update(JSON.stringify(opts.structuredContext)).digest("hex").slice(0, 12)
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
      structuredContextDigest: structuredDigest ?? undefined,
      accuracyBand: opts.accuracyBand ?? undefined,
      learnerProfile: opts.learnerProfile ?? undefined,
      likedDescriptors: Array.isArray(opts.likedLessonDescriptors) && opts.likedLessonDescriptors.length
        ? dedupeStrings(opts.likedLessonDescriptors, 4)
        : undefined,
      savedDescriptors: Array.isArray(opts.savedLessonDescriptors) && opts.savedLessonDescriptors.length
        ? dedupeStrings(opts.savedLessonDescriptors, 3)
        : undefined,
      personalizationStylePrefer: Array.isArray(opts.personalization?.style?.prefer) && opts.personalization.style?.prefer.length
        ? dedupeStrings(opts.personalization.style.prefer, 4)
        : undefined,
      personalizationStyleAvoid: Array.isArray(opts.personalization?.style?.avoid) && opts.personalization.style?.avoid.length
        ? dedupeStrings(opts.personalization.style.avoid, 4)
        : undefined,
      previousLessonSummary: typeof opts.previousLessonSummary === "string" && opts.previousLessonSummary.trim()
        ? truncateText(opts.previousLessonSummary, 200)
        : undefined,
      recentMissSummary: opts.recentMissSummary ?? undefined,
    };
    if (lastVerification) {
      metadata.verification = {
        valid: lastVerification.valid,
        ...(lastVerification.reasons.length ? { reasons: lastVerification.reasons } : {}),
      };
    }
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

  const validateLessonCandidate = async (candidate: Lesson | null) => {
    if (!candidate) return null;
    const verification = await verifyLessonAlignment(client, model, candidate, {
      subject,
      topic,
      difficulty,
      knowledge: opts.knowledge,
      recentMissSummary: opts.recentMissSummary ?? null,
    });
    lastVerification = verification;
    if (!verification.valid) {
      const detail = verification.reasons.length ? verification.reasons.join("; ") : "unspecified issue";
      lastError = new Error(`Lesson failed verification: ${detail}`);
      return null;
    }
    return candidate;
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
    const lessonCandidate = resolveLessonCandidate(raw);
    const verifiedLesson = await validateLessonCandidate(lessonCandidate);

    if (verifiedLesson) {
      await logLessonUsage("single", usageSummary);
      return verifiedLesson;
    }

    if (!lastError) lastError = new Error("Invalid lesson format from AI");
  } catch (error) {
    const fallbackGenerated = (error as { error?: { failed_generation?: string } })?.error?.failed_generation;
    if (typeof fallbackGenerated === "string" && fallbackGenerated.trim().length > 0) {
      const lessonCandidate = resolveLessonCandidate(fallbackGenerated.trim());
      const verifiedLesson = await validateLessonCandidate(lessonCandidate);
      if (verifiedLesson) {
        await logLessonUsage("single", usageSummary);
        return verifiedLesson;
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


