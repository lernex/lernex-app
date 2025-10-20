import { createHash } from "crypto";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Difficulty } from "@/types/placement";
import { LessonSchema, MIN_LESSON_WORDS, MAX_LESSON_WORDS, MAX_LESSON_CHARS } from "./schema";
import type { Lesson } from "./schema";
import { checkUsageLimit, logUsage } from "./usage";
import { buildLessonPrompts } from "./lesson-prompts";

type Pace = "slow" | "normal" | "fast";

type UsageSummary = { input_tokens: number | null; output_tokens: number | null } | null;

type UsageEvent = {
  source: "lesson" | "verification";
  attempt: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  variant?: number;
  variantAttempt?: number;
  responseFormat?: "json_object" | "plain";
};

type VerificationUsageEvent = {
  attempt: number;
  responseFormat: "json_object" | "plain";
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

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

const MAX_CONTEXT_CHARS = 360;

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ECONNABORTED",
]);
const RETRYABLE_ERROR_PATTERN =
  /(timeout|timed out|503|502|bad gateway|service unavailable|temporary unavailable|socket hang up|connection reset|ECONNRESET|ECONNREFUSED)/i;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") return status;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === "number") return statusCode;
  const responseStatus = (error as { response?: { status?: unknown } }).response?.status;
  if (typeof responseStatus === "number") return responseStatus;
  const nestedStatus = (error as { error?: { status?: unknown } }).error?.status;
  if (typeof nestedStatus === "number") return nestedStatus;
  return null;
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isRetryableCompletionError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status != null && RETRYABLE_STATUS_CODES.has(status)) return true;
  const code = getErrorCode(error);
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
  const message = getErrorMessage(error);
  return RETRYABLE_ERROR_PATTERN.test(message);
}

const DEFAULT_MODEL = process.env.CEREBRAS_LESSON_MODEL ?? "gpt-oss-120b";
const DEFAULT_BASE_URL = process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1";
const FALLBACK_TEMPERATURE = 0.4;
const VERIFICATION_RETRY_LIMIT = Math.max(
  1,
  Number(process.env.FYP_VERIFICATION_RETRIES ?? "2") || 2,
);

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

const NON_FATAL_VERIFICATION_REASONS = new Set([
  "verification_call_failed",
  "no_verification_response",
  "invalid_verification_payload",
  "does not acknowledge recent missed quiz",
  "does not acknowledge recent-miss",
  "missing recent-miss acknowledgment",
  "no recent miss acknowledgment",
  "difficulty level too basic",
  "difficulty level too advanced",
  "too basic for",
  "too advanced for",
  "not advanced enough",
  "too superficial",
  "too concise",
  "too brief",
  "missing depth",
  "missing advanced topics",
  "content too superficial",
  "not appropriate for hard difficulty",
  "not appropriate for medium difficulty",
]);

const JSON_RESPONSE_DENYLIST = [/gpt-oss/i];

function normalizeBooleanEnv(value: string | undefined): boolean | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (["1", "true", "yes", "on", "enable"].includes(trimmed)) return true;
  if (["0", "false", "no", "off", "disable"].includes(trimmed)) return false;
  return null;
}

function modelSupportsJsonResponseFormat(model: string): boolean {
  const override = normalizeBooleanEnv(process.env.FYP_ALLOW_JSON_RESPONSE);
  if (override != null) return override;
  return !JSON_RESPONSE_DENYLIST.some((pattern) => pattern.test(model));
}

const supportsBuffer =
  typeof Buffer !== "undefined" && typeof Buffer.byteLength === "function";
const sharedTextEncoder =
  typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

function measureBytes(value: string | null | undefined): number {
  if (!value) return 0;
  if (supportsBuffer) return Buffer.byteLength(value, "utf8");
  if (sharedTextEncoder) return sharedTextEncoder.encode(value).length;
  return value.length;
}

function previewForLog(value: string | null | undefined, max = 180): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= max) return trimmed;
  const overflow = trimmed.length - max;
  return `${trimmed.slice(0, max)}...(+${overflow} chars)`;
}

const STACK_TRIM_PATTERN = /\bat\s+/;

function safeErrorForLog(error: unknown) {
  if (!error) return { message: null, name: null, stack: null, type: typeof error };
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: typeof error.stack === "string"
        ? error.stack.split("\n").slice(0, 6).map((line) => line.trim()).filter((line) => STACK_TRIM_PATTERN.test(line)).join(" | ")
        : null,
      type: "Error",
    };
  }
  if (typeof error === "object") {
    try {
      return { message: JSON.stringify(error), name: null, stack: null, type: "object" };
    } catch {
      return { message: "[unserializable object]", name: null, stack: null, type: "object" };
    }
  }
  return { message: String(error), name: null, stack: null, type: typeof error };
}

function summarizeLessonForLog(lesson: Lesson | null | undefined) {
  if (!lesson) return null;
  const words = typeof lesson.content === "string"
    ? lesson.content.trim().split(/\s+/).filter(Boolean).length
    : null;
  const questionSummaries = Array.isArray(lesson.questions)
    ? lesson.questions.slice(0, 3).map((q, idx) => ({
        idx,
        promptPreview: previewForLog(typeof q.prompt === "string" ? q.prompt : null, 80),
        correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : null,
        explanationPreview: previewForLog(typeof q.explanation === "string" ? q.explanation : null, 80),
      }))
    : null;
  return {
    id: typeof lesson.id === "string" ? lesson.id : null,
    title: typeof lesson.title === "string" ? lesson.title : null,
    difficulty: lesson.difficulty ?? null,
    contentWords: words,
    contentPreview: previewForLog(typeof lesson.content === "string" ? lesson.content : null, 160),
    questionSummaries,
  };
}

type MessageSummary = {
  idx: number;
  role: OpenAI.ChatCompletionMessageParam["role"];
  type: string;
  length?: number;
  preview?: string | null;
  totalParts?: number;
  parts?: Array<{
    partIdx: number;
    type: string;
    length?: number;
    preview?: string | null;
  }>;
};

function summarizeMessages(messages: OpenAI.ChatCompletionMessageParam[]): MessageSummary[] {
  return messages.map((message, idx) => {
    const content = message.content;
    if (typeof content === "string") {
      return {
        idx,
        role: message.role,
        type: "text",
        length: content.length,
        preview: previewForLog(content, 160),
      };
    }
    if (Array.isArray(content)) {
      const parts = content.slice(0, 4).map((part, partIdx) => {
        if (!part || typeof part !== "object") {
          return { partIdx, type: typeof part };
        }
        const typeCandidate =
          "type" in part && typeof (part as { type?: unknown }).type === "string"
            ? ((part as { type: string }).type)
            : "unknown";
        let textValue: string | null = null;
        if ("text" in part) {
          const textCandidate = (part as { text?: unknown }).text;
          if (textCandidate && typeof textCandidate === "object") {
            const value = (textCandidate as { value?: unknown }).value;
            if (typeof value === "string") {
              textValue = value;
            }
          }
        }
        return {
          partIdx,
          type: typeCandidate,
          length: textValue ? textValue.length : undefined,
          preview: textValue ? previewForLog(textValue, 80) : undefined,
        };
      });
      return {
        idx,
        role: message.role,
        type: "parts",
        totalParts: content.length,
        parts,
      };
    }
    return {
      idx,
      role: message.role,
      type: typeof content,
    };
  });
}

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
    const functionCall = (msgRecord as { function_call?: unknown }).function_call;
    if (functionCall) {
      candidates.push(...collectStrings(functionCall));
    }
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

  const segments: string[] = [];

  // Try as-is first
  segments.push(cleaned);

  // Remove markdown code fences
  if (cleaned.startsWith("```")) {
    const withoutFence = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    if (withoutFence) segments.push(withoutFence);
  }

  // Extract JSON object (greedy match)
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) segments.push(objectMatch[0]);

  // Try to find JSON after any preamble text
  const jsonStartIndex = cleaned.indexOf('{');
  if (jsonStartIndex > 0) {
    segments.push(cleaned.slice(jsonStartIndex));
  }

  // Fix common LaTeX escaping issues: \( should be \\( in JSON
  // The AI sometimes generates \( when it should be \\(
  const fixLatexEscaping = (str: string): string => {
    // Replace single backslash before ( or ) or [ or ] with double backslash
    // This handles LaTeX delimiters that need escaping in JSON
    let result = str;

    // Fix \( and \) - inline LaTeX delimiters
    result = result.replace(/([^\\])\\([()])/g, '$1\\\\$2');
    result = result.replace(/^\\([()])/g, '\\\\$1');

    // Fix \[ and \] - display LaTeX delimiters
    result = result.replace(/([^\\])\\([\[\]])/g, '$1\\\\$2');
    result = result.replace(/^\\([\[\]])/g, '\\\\$1');

    // Fix other common LaTeX escapes that might appear in content
    result = result.replace(/([^\\])\\(frac|sqrt|sum|int|lim|sin|cos|tan|log|ln)/g, '$1\\\\$2');
    result = result.replace(/^\\(frac|sqrt|sum|int|lim|sin|cos|tan|log|ln)/g, '\\\\$1');

    return result;
  };

  const fixedCleaned = fixLatexEscaping(cleaned);
  if (fixedCleaned !== cleaned) {
    segments.push(fixedCleaned);
    const fixedObjectMatch = fixedCleaned.match(/\{[\s\S]*\}/);
    if (fixedObjectMatch) segments.push(fixedObjectMatch[0]);
  }

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
    } catch (err) {
      // Log parse errors for debugging
      if (segments.indexOf(candidate) === 0) {
        try {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.debug("[fyp] tryParseJson: first attempt failed", {
            error: errorMsg,
            candidatePreview: candidate.slice(0, 200),
          });
          // If it's a LaTeX escaping issue, log more details
          if (errorMsg.includes("Bad escaped character") || errorMsg.includes("escape")) {
            const escapeMatches = candidate.match(/\\[^\\"\\/bfnrtu]/g);
            if (escapeMatches) {
              console.debug("[fyp] tryParseJson: detected unescaped LaTeX sequences", {
                sequences: escapeMatches.slice(0, 10),
              });
            }
          }
        } catch {}
      }
      continue;
    }
  }

  return null;
}

function resolveLessonCandidate(raw: string): Lesson | null {
  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn("[fyp] resolveLessonCandidate: JSON parse failed or invalid type", {
      parsed: typeof parsed,
      isArray: Array.isArray(parsed),
    });
    return null;
  }

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

    console.warn("[fyp] resolveLessonCandidate: Schema validation failed", {
      errors: result.error.errors.slice(0, 5),
      candidatePreview: {
        id: (candidate as { id?: unknown }).id,
        title: (candidate as { title?: unknown }).title,
        contentLength: typeof (candidate as { content?: unknown }).content === "string"
          ? (candidate as { content: string }).content.length
          : null,
        questionsCount: Array.isArray((candidate as { questions?: unknown }).questions)
          ? (candidate as { questions: unknown[] }).questions.length
          : null,
      },
    });
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
  captureUsage?: (event: VerificationUsageEvent) => void,
) {
  const computeVerificationRetryDelay = (attempt: number) => {
    const base = 220;
    const growth = Math.pow(1.7, Math.max(0, attempt));
    const jitter = Math.random() * 90;
    const delayMs = Math.round(base * growth + jitter);
    return Math.min(1800, Math.max(0, delayMs));
  };
  const knowledgeLines = collectKnowledgeEntries(target.knowledge);
  const knowledgeSummary = knowledgeLines.length ? knowledgeLines.join(" | ") : null;

  const systemPrompt = [
    "You are a quality gate that validates micro-lessons for alignment and fidelity.",
    "Return strict JSON matching { \"valid\": boolean, \"reasons\": string[] }.",
    "The lesson is already structurally valid (correct word count, 3 questions). Focus ONLY on:",
    "1. Does the topic match what was requested?",
    "2. Are there obvious factual errors or contradictions?",
    "3. Is the content coherent and educational?",
    "Set valid=true if the lesson covers the topic correctly with no major errors.",
    "IMPORTANT: These are 80-105 word MICRO-LESSONS by design.",
    "- Do NOT reject for being 'too concise', 'too brief', or 'too superficial'.",
    "- Do NOT reject for 'missing depth' or 'missing advanced topics' - brevity is the goal.",
    "- Do NOT reject for difficulty level unless it's completely wrong (e.g., calculus for intro level).",
    "- Do NOT reject for not mentioning recent-miss - that is optional and nice-to-have.",
    "Reject ONLY for: wrong topic, major factual errors, or completely incoherent content.",
    "Reasons should be concise phrases explaining any critical issue you detect.",
  ].join("\n");

  const contentWords = typeof lesson.content === "string" ? lesson.content.trim().split(/\s+/).filter(Boolean).length : 0;
  const lessonSummary = [
    `ID: ${lesson.id}`,
    `Title: ${lesson.title}`,
    `Topic: ${lesson.topic}`,
    `Difficulty: ${lesson.difficulty}`,
    `Content: ${contentWords} words (80-105 required)`,
    `Content preview: ${typeof lesson.content === "string" ? lesson.content.slice(0, 300) : ""}...`,
    `Questions: ${Array.isArray(lesson.questions) ? lesson.questions.length : 0} MCQs (3 required)`,
    `Note: This is a preview. The full lesson has been provided correctly.`,
  ].join("\n");

  const userLines = [
    `Subject: ${target.subject}`,
    `Requested topic: ${target.topic}`,
    `Target difficulty: ${target.difficulty}`,
    target.recentMissSummary ? `Recent miss signal: ${target.recentMissSummary}` : null,
    knowledgeSummary ? `Anchor knowledge: ${knowledgeSummary}` : null,
    `Lesson to verify:`,
    lessonSummary,
    `Respond with the verification JSON only.`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userLines },
  ];

  const jsonResponseSupported = modelSupportsJsonResponseFormat(model);
  let useResponseFormat = jsonResponseSupported;
  let switchedToPlain = !jsonResponseSupported;

  for (let attempt = 0; attempt < VERIFICATION_RETRY_LIMIT; attempt += 1) {
    try {
      const attemptFormat: "json_object" | "plain" = useResponseFormat ? "json_object" : "plain";
      const completion = await client.chat.completions.create({
        model,
        temperature: clampTemperature(0.1),
        max_tokens: 800,
        messages,
        ...(useResponseFormat ? { response_format: { type: "json_object" as const } } : {}),
      });
      const usage = completion.usage;
      captureUsage?.({
        attempt: attempt + 1,
        responseFormat: attemptFormat,
        promptTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null,
        completionTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null,
        totalTokens: typeof usage?.total_tokens === "number" ? usage.total_tokens : null,
      });
      const choice = completion.choices?.[0];
      const raw = typeof choice?.message?.content === "string" && choice.message.content.trim().length
        ? choice.message.content
        : extractAssistantJson(choice);
      try {
        console.debug("[fyp] verification response preview", {
          subject: target.subject,
          topic: target.topic,
          attempt: attempt + 1,
          rawPreview: previewForLog(raw, 200),
        });
      } catch (previewErr) {
        console.warn("[fyp] verification preview log failed", previewErr);
      }
      if (!raw) {
        console.warn("[fyp] verification returned empty content", {
          subject: target.subject,
          topic: target.topic,
          difficulty: target.difficulty,
          attempt: attempt + 1,
          finishReason: completion.choices?.[0]?.finish_reason ?? null,
          usedResponseFormat: useResponseFormat,
          model,
        });
        if (attempt < VERIFICATION_RETRY_LIMIT - 1) {
          if (useResponseFormat && !switchedToPlain) {
            console.warn("[fyp] verification retrying without JSON response_format");
            useResponseFormat = false;
            switchedToPlain = true;
          }
          const delayMs = computeVerificationRetryDelay(attempt);
          if (delayMs > 0) await delay(delayMs);
          continue;
        }
        return { valid: false, reasons: ["no_verification_response"] };
      }
      const parsed = tryParseJson(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        console.warn("[fyp] verification returned non-JSON payload", {
          subject: target.subject,
          topic: target.topic,
          difficulty: target.difficulty,
          attempt: attempt + 1,
          rawPreview: typeof raw === "string" ? raw.slice(0, 160) : null,
        });
        if (attempt < VERIFICATION_RETRY_LIMIT - 1) {
          if (useResponseFormat && !switchedToPlain) {
            console.warn("[fyp] verification retrying without JSON response_format");
            useResponseFormat = false;
            switchedToPlain = true;
          }
          const delayMs = computeVerificationRetryDelay(attempt);
          if (delayMs > 0) await delay(delayMs);
          continue;
        }
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
      const status = getErrorStatus(error);
      const code = getErrorCode(error);
      const message = getErrorMessage(error);
      const fallbackToPlain =
        useResponseFormat &&
        !switchedToPlain &&
        (status === 400 ||
          status === 415 ||
          status === 422 ||
          /response[_-]?format|json[_-]?schema|invalid/i.test(message));
      const retryableTransport =
        attempt < VERIFICATION_RETRY_LIMIT - 1 && isRetryableCompletionError(error);
      const willRetry = fallbackToPlain || retryableTransport;
      console.warn("[fyp] verification transport error", {
        subject: target.subject,
        topic: target.topic,
        difficulty: target.difficulty,
        attempt: attempt + 1,
        status,
        code,
        message,
        retryable: willRetry,
        fallbackToPlain,
      });
      if (fallbackToPlain) {
        useResponseFormat = false;
        switchedToPlain = true;
        continue;
      }
      if (retryableTransport) {
        const delayMs = computeVerificationRetryDelay(attempt);
        if (delayMs > 0) await delay(delayMs);
        continue;
      }
      return { valid: false, reasons: ["verification_call_failed"] };
    }
  }

  return { valid: false, reasons: ["verification_call_failed"] };
}

function clampFallbackContent(text: string) {
  const maxChars = MAX_LESSON_CHARS;
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

  const lines: string[] = [
    `Subject: ${subjectLine}`,
    `Topic focus: ${topicLine}`,
    `Target difficulty: ${difficulty}; pace: ${pace}`,
  ];
  if (accuracy != null) {
    lines.push(`Recent accuracy: ${accuracy}%`);
  }

  const knowledgeEntries = collectKnowledgeEntries(opts.knowledge);
  if (knowledgeEntries.length) {
    lines.push("Anchor knowledge:");
    for (const entry of knowledgeEntries.slice(0, 4)) {
      lines.push(`- ${entry}`);
    }
  }

  const trimmedTitleGuards = Array.isArray(opts.avoidTitles)
    ? dedupeStrings(
        opts.avoidTitles
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0),
        4,
      )
    : [];
  if (trimmedTitleGuards.length) {
    lines.push(`Avoid reusing titles: ${trimmedTitleGuards.join(" | ")}`);
  }

  const trimmedIdGuards = Array.isArray(opts.avoidIds)
    ? dedupeStrings(
        opts.avoidIds
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0),
        4,
      )
    : [];
  if (trimmedIdGuards.length) {
    lines.push(`Avoid lessons with ids: ${trimmedIdGuards.join(" | ")}`);
  }

  if (opts.nextTopicHint && opts.nextTopicHint.trim()) {
    lines.push(`Upcoming: ${truncateText(opts.nextTopicHint.trim(), 120)}`);
  }

  return lines.join("\n");
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
    4096,
    Math.max(900, Number(process.env.CEREBRAS_LESSON_MAX_TOKENS ?? "3200") || 3200),
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

  const structuredContextJson = opts.structuredContext
    ? JSON.stringify(buildStructuredContextPayload(opts.structuredContext))
    : null;

  const baseMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];
  if (structuredContextJson) {
    baseMessages.push({
      role: "user",
      content: `Structured context JSON:\n${structuredContextJson}`,
    });
  }

  const messagesWithContext: OpenAI.ChatCompletionMessageParam[] = [
    ...baseMessages,
    { role: "user", content: userPrompt },
  ];

  const messagesWithoutContext: OpenAI.ChatCompletionMessageParam[] =
    structuredContextJson != null
      ? [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ]
      : messagesWithContext;

  const jsonResponseSupported = modelSupportsJsonResponseFormat(model);
  const requestVariants: Array<{ usePlainResponse: boolean; dropStructured: boolean }> = [];
  if (jsonResponseSupported) {
    requestVariants.push({ usePlainResponse: false, dropStructured: false });
  }
  requestVariants.push({ usePlainResponse: true, dropStructured: false });
  if (structuredContextJson) {
    requestVariants.push({ usePlainResponse: true, dropStructured: true });
  }
  const variantRetryLimit = Math.max(
    1,
    Number(process.env.FYP_LESSON_VARIANT_RETRIES ?? "2") || 2,
  );
  const computeVariantRetryDelay = (attemptOrdinal: number) => {
    const base = 260;
    const growth = Math.pow(1.8, Math.max(0, attemptOrdinal));
    const jitter = Math.random() * 120;
    const delayMs = Math.round(base * growth + jitter);
    return Math.min(2200, Math.max(0, delayMs));
  };

  let usageSummary: UsageSummary = null;
  let lastError: unknown = null;
  let lastVerification: { valid: boolean; reasons: string[] } | null = null;
  let usedPlainResponseMode = false;
  let trimmedStructuredContext = false;
  const variantHistory: Array<Record<string, unknown>> = [];
  const verificationDiagnostics: Array<Record<string, unknown>> = [];

  const sourceTextBytes = measureBytes(sourceText);
  const structuredContextBytes = structuredContextJson ? measureBytes(structuredContextJson) : 0;
  const structuredContextKeys = opts.structuredContext
    ? Object.keys(opts.structuredContext).length
    : 0;
  const avoidIdsSample = hashSample(opts.avoidIds, 6);
  const avoidTitlesSample = hashSample(opts.avoidTitles, 6);
  const likedSample = hashSample(opts.likedIds, 6);
  const savedSample = hashSample(opts.savedIds, 6);
  const toneSample = Array.isArray(opts.toneTags) ? dedupeStrings(opts.toneTags, 6) : [];
  const mapSummaryPreview = previewForLog(opts.mapSummary, 160);
  const previousLessonPreview = previewForLog(opts.previousLessonSummary, 160);
  const recentMissPreview = previewForLog(opts.recentMissSummary, 120);
  const knowledgeKeys = opts.knowledge
    ? Object.entries(opts.knowledge)
        .filter(([, value]) => {
          if (typeof value === "string") return Boolean(value.trim());
          return Array.isArray(value) && value.length > 0;
        })
        .map(([key]) => key)
    : [];
  const personalizationStyle = opts.personalization?.style;
  const personalizationLessons = opts.personalization?.lessons;
  const personalizationSummary = opts.personalization
    ? {
        hasStyle: Boolean(personalizationStyle),
        stylePreferCount: Array.isArray(personalizationStyle?.prefer)
          ? personalizationStyle.prefer.length
          : 0,
        styleAvoidCount: Array.isArray(personalizationStyle?.avoid)
          ? personalizationStyle.avoid.length
          : 0,
        lessonsLeanIntoCount: Array.isArray(personalizationLessons?.leanInto)
          ? personalizationLessons.leanInto.length
          : 0,
        lessonsAvoidCount: Array.isArray(personalizationLessons?.avoid)
          ? personalizationLessons.avoid.length
          : 0,
        lessonsSavedCount: Array.isArray(personalizationLessons?.saved)
          ? personalizationLessons.saved.length
          : 0,
      }
    : null;

  const usageEvents: UsageEvent[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let missingPromptTokens = false;
  let missingCompletionTokens = false;

  const recordUsageEvent = (event: UsageEvent) => {
    usageEvents.push(event);
    if (typeof event.promptTokens === "number") {
      totalPromptTokens += event.promptTokens;
    } else {
      missingPromptTokens = true;
    }
    if (typeof event.completionTokens === "number") {
      totalCompletionTokens += event.completionTokens;
    } else {
      missingCompletionTokens = true;
    }
  };

  const computeUsageSummary = (): UsageSummary => {
    if (!usageEvents.length) return null;
    return {
      input_tokens: totalPromptTokens,
      output_tokens: totalCompletionTokens,
    };
  };

  try {
    console.debug("[fyp] lesson request summary", {
      subject,
      topic,
      pace,
      difficulty,
      accuracy,
      accuracyBand: opts.accuracyBand ?? null,
      sourceTextBytes,
      sourceTextPreview: previewForLog(sourceText, 200),
      structuredContextBytes,
      structuredContextKeys,
      structuredContextPreview: previewForLog(structuredContextJson, 200),
      avoidIdsCount: Array.isArray(opts.avoidIds) ? opts.avoidIds.length : 0,
      avoidIdsSample,
      avoidTitlesCount: Array.isArray(opts.avoidTitles) ? opts.avoidTitles.length : 0,
      avoidTitlesSample,
      likedCount: Array.isArray(opts.likedIds) ? opts.likedIds.length : 0,
      likedSample,
      savedCount: Array.isArray(opts.savedIds) ? opts.savedIds.length : 0,
      savedSample,
      toneTags: toneSample,
      nextTopicHint: previewForLog(opts.nextTopicHint, 80),
      learnerProfilePreview: previewForLog(opts.learnerProfile, 120),
      mapSummaryPreview,
      previousLessonPreview,
      recentMissPreview,
      knowledgeKeys,
      personalization: personalizationSummary,
    });
  } catch (summaryErr) {
    console.warn("[fyp] lesson request summary log failed", summaryErr);
  }

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
    if (usageEvents.length) {
      metadata.usageBreakdown = usageEvents.map((event) => {
        const base: Record<string, unknown> = {
          source: event.source,
          attempt: event.attempt,
          responseFormat: event.responseFormat ?? null,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          totalTokens: event.totalTokens,
        };
        if (typeof event.variant === "number") base.variant = event.variant;
        if (typeof event.variantAttempt === "number") base.variantAttempt = event.variantAttempt;
        return base;
      });
      metadata.usageTotals = {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
      };
      if (missingPromptTokens || missingCompletionTokens) {
        metadata.usageIncomplete = {
          missingPromptTokens,
          missingCompletionTokens,
        };
      }
    }
    metadata.completionFormat = usedPlainResponseMode ? "plain" : "json_object";
    if (trimmedStructuredContext) metadata.trimmedStructuredContext = true;
    if (lastVerification) {
      metadata.verification = {
        valid: lastVerification.valid,
        ...(lastVerification.reasons.length ? { reasons: lastVerification.reasons } : {}),
      };
    }
    if (summary == null || missingPromptTokens || missingCompletionTokens) {
      metadata.missingUsage = true;
    }
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
    try {
      console.debug("[fyp] verification begin", {
        subject,
        topic,
        lessonId: candidate.id,
        difficulty,
        knowledgeKeys,
        recentMissSummary: previewForLog(opts.recentMissSummary, 120),
      });
    } catch (verificationLogErr) {
      console.warn("[fyp] verification begin log failed", verificationLogErr);
    }
    const verification = await verifyLessonAlignment(
      client,
      model,
      candidate,
      {
        subject,
        topic,
        difficulty,
        knowledge: opts.knowledge,
        recentMissSummary: opts.recentMissSummary ?? null,
      },
      (event) => {
        recordUsageEvent({
          source: "verification",
          attempt: event.attempt,
          responseFormat: event.responseFormat,
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens,
          totalTokens: event.totalTokens,
        });
      },
    );
    lastVerification = verification;
    usageSummary = computeUsageSummary();
    const normalizedReasons = verification.reasons.map((reason) =>
      typeof reason === "string" ? reason.trim() : ""
    );
    const fatalReasons = normalizedReasons.filter(
      (reason) => {
        if (!reason.length) return false;
        const lowerReason = reason.toLowerCase();
        for (const nonFatal of NON_FATAL_VERIFICATION_REASONS) {
          if (lowerReason.includes(nonFatal.toLowerCase())) return false;
        }
        return true;
      }
    );
    const accepted = verification.valid || !fatalReasons.length;
    verificationDiagnostics.push({
      lessonId: candidate.id ?? null,
      valid: verification.valid,
      reasons: verification.reasons,
      normalizedReasons,
      fatalReasons,
      accepted,
      timestamp: new Date().toISOString(),
    });
    if (!verification.valid && !fatalReasons.length) {
      console.warn("[fyp] verification inconclusive - accepting lesson", {
        subject,
        topic,
        lessonId: candidate.id,
        reasons: verification.reasons,
      });
      return candidate;
    }
    if (!accepted) {
      const detail = fatalReasons.join("; ") || "unspecified issue";
      console.warn("[fyp] lesson rejected by verification", {
        subject,
        topic,
        lessonId: candidate.id,
        reasons: fatalReasons,
        difficulty,
      });
      lastError = new Error(`Lesson failed verification: ${detail}`);
      return null;
    }
    try {
      console.debug("[fyp] verification accepted", {
        subject,
        topic,
        lessonId: candidate.id,
        reasons: verification.reasons,
      });
    } catch (verificationSuccessLogErr) {
      console.warn("[fyp] verification accepted log failed", verificationSuccessLogErr);
    }
    return candidate;
  };

  try {
    let completion: Awaited<ReturnType<typeof client.chat.completions.create>> | null = null;
    let lastCompletionError: unknown = null;
    let attemptOrdinal = 0;

    outer: for (let variantIndex = 0; variantIndex < requestVariants.length; variantIndex += 1) {
      const variant = requestVariants[variantIndex];
      for (let variantAttempt = 0; variantAttempt < variantRetryLimit; variantAttempt += 1) {
        attemptOrdinal += 1;
        usedPlainResponseMode = variant.usePlainResponse;
        trimmedStructuredContext = variant.dropStructured;
        const messages = variant.dropStructured ? messagesWithoutContext : messagesWithContext;
        const messageSummary = summarizeMessages(messages);
        const responseFormatMode = variant.usePlainResponse ? "plain" : "json_object";
        const attemptInfoBase = {
          subject,
          topic,
          attempt: attemptOrdinal,
          variant: variantIndex + 1,
          variantAttempt: variantAttempt + 1,
          usePlainResponse: variant.usePlainResponse,
          dropStructuredContext: variant.dropStructured,
          responseFormatMode,
          messageCount: messages.length,
        };
        try {
          console.debug("[fyp] lesson completion attempt begin", {
            subject,
            topic,
            attempt: attemptOrdinal,
            variant: variantIndex + 1,
            variantAttempt: variantAttempt + 1,
            usePlainResponse: variant.usePlainResponse,
            dropStructuredContext: variant.dropStructured,
            messageCount: messages.length,
            responseFormatMode,
            messageSummary,
          });
        } catch (attemptLogErr) {
          console.warn("[fyp] lesson completion attempt summary failed", attemptLogErr);
        }
        const payload = {
          model,
          temperature,
          max_tokens: completionMaxTokens,
          messages,
          ...(variant.usePlainResponse ? {} : { response_format: { type: "json_object" as const } }),
        };

        try {
          completion = await client.chat.completions.create(payload);
          const completionUsage = completion.usage;
          recordUsageEvent({
            source: "lesson",
            attempt: attemptOrdinal,
            variant: variantIndex + 1,
            variantAttempt: variantAttempt + 1,
            responseFormat: variant.usePlainResponse ? "plain" : "json_object",
            promptTokens: typeof completionUsage?.prompt_tokens === "number"
              ? completionUsage.prompt_tokens
              : null,
            completionTokens: typeof completionUsage?.completion_tokens === "number"
              ? completionUsage.completion_tokens
              : null,
            totalTokens: typeof completionUsage?.total_tokens === "number"
              ? completionUsage.total_tokens
              : null,
          });
          usageSummary = computeUsageSummary();
          try {
            const usageInfo = completion.usage
              ? {
                  promptTokens: completion.usage.prompt_tokens ?? null,
                  completionTokens: completion.usage.completion_tokens ?? null,
                  totalTokens: completion.usage.total_tokens ?? null,
                }
              : null;
            const finishReason = completion.choices?.[0]?.finish_reason ?? null;
            console.debug("[fyp] lesson completion attempt success", {
              subject,
              topic,
              attempt: attemptOrdinal,
              variant: variantIndex + 1,
              variantAttempt: variantAttempt + 1,
              usePlainResponse: variant.usePlainResponse,
              dropStructuredContext: variant.dropStructured,
              finishReason,
              usage: usageInfo,
            });
            variantHistory.push({
              ...attemptInfoBase,
              outcome: "success",
              finishReason,
              usage: usageInfo,
              messageSummary,
            });
          } catch (successLogErr) {
            console.warn("[fyp] lesson completion success log failed", successLogErr);
          }
          usedPlainResponseMode = variant.usePlainResponse;
          trimmedStructuredContext = variant.dropStructured;
          if (variant.usePlainResponse) {
            const logFn = jsonResponseSupported ? console.warn : console.debug;
            logFn("[fyp] completion plain-response mode", {
              subject,
              topic,
              attempt: attemptOrdinal,
              fallback: jsonResponseSupported,
            });
          }
          if (variant.dropStructured) {
            console.warn("[fyp] structured context trimmed for completion", {
              subject,
              topic,
              attempt: attemptOrdinal,
            });
          }

          const choice = completion.choices?.[0];
          const finishReason = choice?.finish_reason ?? null;
          const wasTruncatedCompletion = finishReason === "length";

          if (wasTruncatedCompletion) {
            const hasMoreVariants = variantIndex < requestVariants.length - 1;
            if (hasMoreVariants && !variant.dropStructured && structuredContextJson) {
              console.warn("[fyp] completion truncated, will retry without structured context", {
                subject,
                topic,
                attempt: attemptOrdinal,
                variant: variantIndex + 1,
                finishReason,
              });
              variantHistory.push({
                ...attemptInfoBase,
                outcome: "truncated",
                finishReason,
                usage: completion.usage
                  ? {
                      promptTokens: completion.usage.prompt_tokens ?? null,
                      completionTokens: completion.usage.completion_tokens ?? null,
                      totalTokens: completion.usage.total_tokens ?? null,
                    }
                  : null,
                messageSummary,
              });
              break;
            }
          }

          break outer;
        } catch (error) {
          lastCompletionError = error;
          const status = getErrorStatus(error);
          const code = getErrorCode(error);
          const message = getErrorMessage(error);
          const retryable = isRetryableCompletionError(error);
          const hasMoreVariantRetries = variantAttempt < variantRetryLimit - 1;
          const hasMoreVariants = variantIndex < requestVariants.length - 1;
          const allowPlainFallback =
            jsonResponseSupported &&
            !variant.usePlainResponse &&
            (status === 400 ||
              status === 415 ||
              status === 422 ||
              /response[_-]?format|json[_-]?schema|invalid/i.test(message));
          const allowDropStructured =
            Boolean(structuredContextJson) &&
            !variant.dropStructured &&
            (status === 400 ||
              status === 413 ||
              status === 414 ||
              retryable);
          const willRetryVariant = retryable && hasMoreVariantRetries;
          const shouldSwitchVariant =
            !willRetryVariant &&
            hasMoreVariants &&
            (allowPlainFallback || allowDropStructured || !retryable);
          const willSwitchVariant = shouldSwitchVariant;
          const willRetry = willRetryVariant || willSwitchVariant;

          console.warn("[fyp] lesson completion attempt failed", {
            subject,
            topic,
            attempt: attemptOrdinal,
            variant: variantIndex + 1,
            variantAttempt: variantAttempt + 1,
            usePlainResponse: variant.usePlainResponse,
            droppedStructuredContext: variant.dropStructured,
              status,
              code,
              message,
              retryable: willRetry,
              allowPlainFallback: allowPlainFallback || undefined,
              allowDropStructured: allowDropStructured || undefined,
            });
          variantHistory.push({
            ...attemptInfoBase,
            outcome: "error",
            status,
            code,
            message,
            retryable: willRetry,
            allowPlainFallback: allowPlainFallback || undefined,
            allowDropStructured: allowDropStructured || undefined,
            error: safeErrorForLog(error),
            messageSummary,
          });

          if (willRetryVariant) {
            const delayMs = computeVariantRetryDelay(attemptOrdinal - 1);
            if (delayMs > 0) {
              await delay(delayMs);
            }
            continue;
          }
          if (willSwitchVariant) {
            console.warn("[fyp] lesson completion switching variant", {
              subject,
              topic,
              attempt: attemptOrdinal,
              currentVariant: variantIndex + 1,
              nextVariant: variantIndex + 2,
              allowPlainFallback: allowPlainFallback || undefined,
              allowDropStructured: allowDropStructured || undefined,
            });
            break;
          }
          throw error;
        }
      }
    }

    if (!completion) {
      throw lastCompletionError ?? new Error("lesson_generation_failed");
    }

    usageSummary = computeUsageSummary();

    const choice = completion.choices?.[0];
    const messageContent = choice?.message?.content;
    const raw = typeof messageContent === "string" && messageContent.trim().length > 0
      ? messageContent.trim()
      : extractAssistantJson(choice);
    const rawLength = typeof raw === "string" ? raw.length : null;
    const finishReason = choice?.finish_reason ?? null;
    const wasTruncated = finishReason === "length";
    const lessonCandidate = resolveLessonCandidate(raw);
    const candidateSummary = summarizeLessonForLog(lessonCandidate);
    if (!lessonCandidate) {
      console.warn("[fyp] lesson candidate parse failed", {
        subject,
        topic,
        rawPreview: previewForLog(typeof raw === "string" ? raw : null, 200),
        rawLength,
        rawType: typeof raw,
        finishReason,
        wasTruncated,
      });

      if (wasTruncated && !trimmedStructuredContext && structuredContextJson) {
        lastError = new Error("Response truncated due to token limit - will retry without structured context");
        console.warn("[fyp] truncation detected, forcing structured context removal on next attempt", {
          subject,
          topic,
          attempt: attemptOrdinal,
        });
      }
    }
    try {
      console.debug("[fyp] lesson completion candidate parsed", {
        subject,
        topic,
        attempt: attemptOrdinal,
        candidate: candidateSummary,
        rawLength,
      });
    } catch (candidateLogErr) {
      console.warn("[fyp] lesson candidate log failed", candidateLogErr);
    }
    const verifiedLesson = await validateLessonCandidate(lessonCandidate);
    usageSummary = computeUsageSummary();

    if (verifiedLesson) {
      try {
        const lessonSummary = summarizeLessonForLog(verifiedLesson);
        console.debug("[fyp] lesson generation success summary", {
          subject,
          topic,
          lesson: lessonSummary,
          pace,
          difficulty,
          accuracy,
          usage: usageSummary,
          usedPlainResponseMode,
          trimmedStructuredContext,
          variantHistory,
          verificationDiagnostics,
        });
      } catch (successSummaryErr) {
        console.warn("[fyp] lesson success summary log failed", successSummaryErr);
      }
      await logLessonUsage("single", usageSummary);
      return verifiedLesson;
    }

    try {
      console.warn("[fyp] lesson candidate rejected after verification", {
        subject,
        topic,
        lastVerification,
        variantHistory,
        candidate: candidateSummary,
      });
    } catch (rejectionLogErr) {
      console.warn("[fyp] lesson rejection summary log failed", rejectionLogErr);
    }

    if (!lastError) lastError = new Error("Invalid lesson format from AI");
  } catch (error) {
    const fallbackGenerated = (error as { error?: { failed_generation?: string } })?.error?.failed_generation;
    if (typeof fallbackGenerated === "string" && fallbackGenerated.trim().length > 0) {
      const lessonCandidate = resolveLessonCandidate(fallbackGenerated.trim());
      const fallbackCandidateSummary = summarizeLessonForLog(lessonCandidate);
      if (!lessonCandidate) {
        console.warn("[fyp] fallback generation parse failed", {
          subject,
          topic,
          rawPreview: previewForLog(fallbackGenerated, 200),
          rawLength: fallbackGenerated.length,
        });
      } else {
        console.debug("[fyp] fallback generation candidate parsed", {
          subject,
          topic,
          candidate: fallbackCandidateSummary,
        });
      }
      const verifiedLesson = await validateLessonCandidate(lessonCandidate);
      usageSummary = computeUsageSummary();
      if (verifiedLesson) {
        try {
          const lessonSummary = summarizeLessonForLog(verifiedLesson);
          console.debug("[fyp] fallback generation success summary", {
            subject,
            topic,
            lesson: lessonSummary,
            pace,
            difficulty,
            accuracy,
            usage: usageSummary,
            usedPlainResponseMode,
            trimmedStructuredContext,
            variantHistory,
            verificationDiagnostics,
          });
        } catch (fallbackSuccessErr) {
          console.warn("[fyp] fallback success summary log failed", fallbackSuccessErr);
        }
        await logLessonUsage("single", usageSummary);
        return verifiedLesson;
      }
      lastError = new Error("Invalid lesson format from AI");
    } else {
      lastError = error;
    }
  }

  const fallbackLesson = buildFallbackLesson(subject, topic, pace, accuracy, difficulty);
  usageSummary = computeUsageSummary();
  try {
    console.warn("[fyp] returning fallback lesson", {
      subject,
      topic,
      pace,
      difficulty,
      accuracy,
      error: safeErrorForLog(lastError),
      variantHistory,
      verificationDiagnostics,
      usage: usageSummary,
      fallbackLesson: summarizeLessonForLog(fallbackLesson),
    });
  } catch (fallbackLogErr) {
    console.warn("[fyp] fallback summary log failed", fallbackLogErr);
  }

  await logLessonUsage("fallback", usageSummary, lastError);

  return fallbackLesson;
}


