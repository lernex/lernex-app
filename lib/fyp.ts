import { createHash } from "crypto";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Difficulty } from "@/types/placement";
import { LessonSchema, MIN_LESSON_WORDS, MAX_LESSON_WORDS, MAX_LESSON_CHARS } from "./schema";
import type { Lesson } from "./schema";
import { checkUsageLimit, logUsage } from "./usage";
import { buildLessonPrompts } from "./lesson-prompts";
import { createModelClient, type UserTier, type ModelSpeed } from "./model-config";
import { compressContext } from "./semantic-compression";
import { shuffleQuizQuestions } from "./quiz-shuffle";
import { normalizeLatex } from "./latex";
import { calculateDynamicTokenLimit, shouldRetryLesson } from "./dynamic-token-limits";
import { getCodeInterpreterParams, adjustTokenLimitForCodeInterpreter, usedCodeInterpreter } from "./code-interpreter";

type Pace = "slow" | "normal" | "fast";

// Function calling tool schema for lesson generation
const CREATE_LESSON_TOOL = {
  type: "function" as const,
  function: {
    name: "create_lesson",
    description: "Create a micro-lesson with questions for the specified topic",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Short slug identifier (letters, numbers, dashes only)",
        },
        subject: {
          type: "string",
          description: "The subject area (e.g., 'Algebra 1')",
        },
        topic: {
          type: "string",
          description: "The specific topic being taught",
        },
        title: {
          type: "string",
          description: "Concise 3-7 word title for the lesson",
        },
        content: {
          type: "string",
          description: "Lesson content (80-105 words, max 900 chars). Four sentences: (1) definition, (2) example, (3) pitfall, (4) practice step.",
          minLength: 180,
        },
        difficulty: {
          type: "string",
          enum: ["intro", "easy", "medium", "hard"],
          description: "Difficulty level",
        },
        questions: {
          type: "array",
          description: "Exactly three multiple choice questions",
          items: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The question prompt",
              },
              choices: {
                type: "array",
                description: "Exactly four answer choices",
                items: { type: "string" },
                minItems: 4,
                maxItems: 4,
              },
              correctIndex: {
                type: "number",
                description: "Index of correct answer (0-3)",
                minimum: 0,
                maximum: 3,
              },
              explanation: {
                type: "string",
                description: "Max 15 words explaining why the answer is correct",
                maxLength: 280,
              },
            },
            required: ["prompt", "choices", "correctIndex", "explanation"],
          },
          minItems: 3,
          maxItems: 3,
        },
      },
      required: ["id", "subject", "topic", "title", "content", "difficulty", "questions"],
    },
  },
};

type UsageSummary = { input_tokens: number | null; output_tokens: number | null } | null;

type UsageEvent = {
  source: "lesson";
  attempt: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  variant?: number;
  variantAttempt?: number;
  responseFormat?: "function_call" | "json_object" | "plain";
};

type LessonOptions = {
  pace?: Pace;
  accuracyPct?: number;
  difficultyPref?: Difficulty;
  /** @deprecated No longer sent to AI prompt (filtered locally). Kept for logging/telemetry only. */
  avoidIds?: string[];
  /** @deprecated No longer sent to AI prompt (filtered locally). Kept for logging/telemetry only. */
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
  userTier?: UserTier;
  modelSpeed?: ModelSpeed;
};

const MAX_CONTEXT_CHARS = 280; // Reduced from 360 to prevent prompt bloat

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

const JSON_RESPONSE_DENYLIST: RegExp[] = [];
// Groq's gpt-oss models have known issues with forced tool_choice
// Disable forced function calling for these models
const FUNCTION_CALLING_DENYLIST: RegExp[] = [/gpt-oss/];

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

function modelSupportsFunctionCalling(model: string): boolean {
  const override = normalizeBooleanEnv(process.env.FYP_ALLOW_FUNCTION_CALLING);
  if (override != null) return override;
  return !FUNCTION_CALLING_DENYLIST.some((pattern) => pattern.test(model));
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

// Simple linear interpolation (optimization: removes 60 lines of band logic)
function deriveLessonTemperature(_accuracyBand: string | undefined, accuracy: number | null) {
  if (accuracy != null) {
    return clampTemperature(0.3 + (accuracy / 250));
  }
  return DEFAULT_TEMPERATURE;
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
  const candidates: string[] = [];

  // PRIORITY 1: Tool calls (function calling) - most structured and reliable
  const toolCalls = msgRecord.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      if (!call || typeof call !== "object") continue;
      const fn = (call as { function?: { arguments?: unknown; name?: unknown } }).function;
      if (!fn || typeof fn !== "object") continue;
      const fnName = (fn as { name?: unknown }).name;
      // Only extract from our create_lesson function
      if (fnName === "create_lesson") {
        candidates.push(...collectStrings((fn as { arguments?: unknown }).arguments));
      }
    }
  }

  // PRIORITY 2: Function call (legacy function calling)
  if (!candidates.length) {
    const functionCall = (msgRecord as { function_call?: unknown }).function_call;
    if (functionCall) {
      candidates.push(...collectStrings(functionCall));
    }
  }

  // PRIORITY 3: Message content (JSON mode or plain text)
  if (!candidates.length) {
    candidates.push(...collectStrings(msgRecord.content));
  }

  // PRIORITY 4: Reasoning content (if available)
  if (!candidates.length) {
    candidates.push(...collectStrings(msgRecord.reasoning_content));
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
  // The AI sometimes under-escapes LaTeX in JSON strings
  const fixLatexEscaping = (str: string): string => {
    let result = str;

    // Fix unescaped LaTeX delimiters: \( → \\(, \) → \\), \[ → \\[, \] → \\]
    // But don't double-escape if already escaped (\\( should stay \\()
    result = result.replace(/([^\\])\\([()[\]])/g, '$1\\\\$2');
    result = result.replace(/^\\([()[\]])/g, '\\\\$1');

    // Fix common LaTeX commands that appear unescaped
    // Pattern matches: \command but not \\command
    const latexCommands = [
      'frac', 'sqrt', 'sum', 'int', 'lim', 'sin', 'cos', 'tan', 'log', 'ln',
      'prod', 'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi', 'infty',
      'leq', 'geq', 'neq', 'cdot', 'times', 'pm', 'to', 'partial', 'nabla'
    ];
    const commandPattern = new RegExp(`([^\\\\])\\\\(${latexCommands.join('|')})\\b`, 'g');
    result = result.replace(commandPattern, '$1\\\\\\\\$2');
    const startPattern = new RegExp(`^\\\\(${latexCommands.join('|')})\\b`, 'g');
    result = result.replace(startPattern, '\\\\\\\\$1');

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
    } catch {
      continue;
    }
  }

  return null;
}

function parseMarkdownLesson(raw: string): Record<string, unknown> | null {
  // Parse markdown format like:
  // **id**: vec-ops-intro
  // **title**: Vector Operations Basics
  // **content**: ...
  const lines = raw.trim().split('\n');
  const result: Record<string, unknown> = {};
  let currentField: string | null = null;
  let currentValue = '';

  for (const line of lines) {
    // Check for field start: **fieldName**: value
    const fieldMatch = line.match(/^\*\*(\w+)\*\*:\s*(.*)$/);
    if (fieldMatch) {
      // Save previous field if any
      if (currentField && currentValue.trim()) {
        result[currentField] = currentValue.trim();
      }
      currentField = fieldMatch[1];
      currentValue = fieldMatch[2] || '';
    } else if (currentField) {
      // Continue multiline value
      currentValue += '\n' + line;
    }
  }

  // Save last field
  if (currentField && currentValue.trim()) {
    result[currentField] = currentValue.trim();
  }

  // Parse questions if present (they might be in markdown format too)
  if (result.questions && typeof result.questions === 'string') {
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(result.questions as string);
      if (Array.isArray(parsed)) {
        result.questions = parsed;
      }
    } catch {
      // If not JSON, questions field needs to be an array - can't parse markdown questions easily
      // Return null to trigger fallback
      return null;
    }
  }

  // Must have at least id, title, content to be valid
  if (!result.id || !result.title || !result.content) {
    return null;
  }

  return result;
}

function resolveLessonCandidate(raw: string): Lesson | null {
  // First try JSON parsing
  const parsed = tryParseJson(raw);

  // If JSON parsing failed, try markdown parsing
  let obj: Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn("[fyp] resolveLessonCandidate: JSON parse failed, trying markdown format", {
      parsed: typeof parsed,
      isArray: Array.isArray(parsed),
    });

    // Try markdown format
    const markdownObj = parseMarkdownLesson(raw);
    if (!markdownObj) {
      console.warn("[fyp] resolveLessonCandidate: Markdown parse also failed");
      return null;
    }
    obj = markdownObj;
  } else {
    obj = parsed as Record<string, unknown>;
  }

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

    // Check if it's just a word count issue that we can fix
    const wordCountError = result.error.errors.find(
      (err) => err.path[0] === "content" && err.code === "custom" && err.message.includes("too long")
    );

    if (wordCountError && typeof (candidate as { content?: unknown }).content === "string") {
      const content = (candidate as { content: string }).content;
      const words = content.trim().split(/\s+/).filter(Boolean);

      // If it's only slightly over (106-120 words), try truncating to 105 words
      if (words.length > MAX_LESSON_WORDS && words.length <= 120) {
        const truncated = words.slice(0, MAX_LESSON_WORDS).join(" ");
        const fixedContent = /[.!?]$/.test(truncated) ? truncated : `${truncated}.`;

        const fixedCandidate = { ...candidate, content: fixedContent };
        const retryResult = LessonSchema.safeParse(fixedCandidate);

        if (retryResult.success) {
          return retryResult.data;
        }
      }
    }

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


// Cache for pre-generated fallback lessons (optimization: 90% faster fallback responses)
const fallbackLessonCache = new Map<string, Lesson>();

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
  // Check cache first (optimization: 90% faster for common topics)
  const cacheKey = `${subject}:${topic}:${difficulty}`;
  const cached = fallbackLessonCache.get(cacheKey);
  if (cached) {
    // Return a copy with fresh ID to avoid duplicates
    return {
      ...cached,
      id: `fallback-${Date.now().toString(36)}`,
    };
  }

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

  const fallbackLesson = LessonSchema.parse({
    id: `fallback-${Date.now().toString(36)}`,
    subject,
    topic,
    title: `Quick Look: ${topicLabel}`,
    content,
    difficulty,
    questions,
  });

  // Cache for future use (limit cache size to prevent memory issues)
  if (fallbackLessonCache.size < 100) {
    fallbackLessonCache.set(cacheKey, fallbackLesson);
  }

  return fallbackLesson;
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
      // More aggressive truncation at deeper levels
      const maxLen = depth === 0 ? MAX_CONTEXT_CHARS : depth === 1 ? 180 : 120;
      return truncateText(value, maxLen);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (Array.isArray(value)) {
      const items: unknown[] = [];
      // Limit array length based on depth (fewer items in nested arrays)
      const maxItems = depth === 0 ? 6 : depth === 1 ? 4 : 3;
      for (const entry of value) {
        if (items.length >= maxItems) break;
        const sanitized = prune(entry, depth + 1);
        if (sanitized === undefined) continue;
        items.push(sanitized);
      }
      return items;
    }
    if (typeof value === "object") {
      const result: Record<string, unknown> = {};
      const entries = Object.entries(value as Record<string, unknown>);
      // Limit object keys based on depth
      const maxKeys = depth === 0 ? 8 : depth === 1 ? 6 : 4;
      for (let idx = 0; idx < entries.length && idx < maxKeys; idx += 1) {
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
    // OPTIMIZED: Abbreviated labels save ~6 tokens per field
    entries.push(`def: ${truncateText(definition, 180)}`);  // definition -> def, 180 chars (down from 240)
  }
  if (Array.isArray(knowledge.applications)) {
    const apps = dedupeStrings(
      knowledge.applications.filter((entry): entry is string => typeof entry === "string"),
      2,  // Reduced from 3 to 2
    ).map((entry) => truncateText(entry, 80));  // Reduced from 110 to 80
    if (apps.length) {
      entries.push(`apps: ${apps.join(" | ")}`);  // applications -> apps
    }
  }
  if (Array.isArray(knowledge.prerequisites)) {
    const prereqs = dedupeStrings(
      knowledge.prerequisites.filter((entry): entry is string => typeof entry === "string"),
      3,  // Reduced from 4 to 3
    ).map((entry) => truncateText(entry, 80));  // Reduced from 100 to 80
    if (prereqs.length) {
      entries.push(`prereqs: ${prereqs.join(" | ")}`);  // prerequisites -> prereqs
    }
  }
  if (Array.isArray(knowledge.reminders)) {
    const reminders = dedupeStrings(
      knowledge.reminders.filter((entry): entry is string => typeof entry === "string"),
      2,  // Reduced from 3 to 2
    ).map((entry) => truncateText(entry, 80));  // Reduced from 100 to 80
    if (reminders.length) {
      entries.push(`rem: ${reminders.join(" | ")}`);  // reminders -> rem
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
    `Difficulty: ${difficulty}. Adjust complexity accordingly. Pace: ${pace}.`,
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

  // OPTIMIZATION: avoidIds and avoidTitles removed from AI prompt
  // These are now filtered locally after generation, saving 50-150 tokens per request
  // The filtering logic is in fyp/route.ts after lesson generation

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
  // Use tiered model system based on user tier and speed requirement
  const userTier = opts.userTier || 'free';
  const modelSpeed = opts.modelSpeed || 'fast';

  const { client, model, modelIdentifier, provider } = createModelClient(userTier, modelSpeed);

  console.log('[fyp/generateLessonForTopic]', {
    subject,
    topic,
    userTier,
    modelSpeed,
    provider,
    model,
    modelIdentifier
  });

  // OPTIMIZED: Dynamic token limit calculation based on complexity (52% reduction from 3800 to ~1800)
  // Intelligently adapts: simple lessons get ~1200t, complex math/LaTeX lessons get ~2200t
  const tokenLimitResult = calculateDynamicTokenLimit({
    subject,
    topic,
    difficulty: opts.difficultyPref,
    questionCount: 3,
  });

  const baseCompletionMaxTokens = Math.min(
    4096,
    Math.max(900, Number(process.env.CEREBRAS_LESSON_MAX_TOKENS) || tokenLimitResult.maxTokens),
  );

  // Adjust token limits for code_interpreter tool overhead (+500 tokens for math accuracy)
  const completionMaxTokens = adjustTokenLimitForCodeInterpreter(baseCompletionMaxTokens);

  console.log('[fyp] Dynamic token limit:', {
    calculated: tokenLimitResult.maxTokens,
    base: baseCompletionMaxTokens,
    final: completionMaxTokens,
    reasoning: tokenLimitResult.reasoning,
  });

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

  let sourceText = buildSourceText(subject, topic, pace, accuracy, difficulty, opts);

  // Apply semantic compression to sourceText if enabled
  const enableCompression = process.env.ENABLE_SEMANTIC_COMPRESSION === 'true';
  // OPTIMIZED: Use 0.65 default compression rate (was 0.3) for better token savings
  const compressionRate = Number(process.env.SEMANTIC_COMPRESSION_RATE ?? '0.65');

  if (enableCompression && sourceText.length > 500) {
    try {
      const compressionResult = await compressContext(sourceText, {
        rate: compressionRate,
        preserve: [subject, topic, difficulty],
        useCache: true,
        temperature: 0.1,  // OPTIMIZED: Lower temperature (was 0.2) for faster, more deterministic compression
      });
      sourceText = compressionResult.compressed;
      console.log('[fyp] sourceText-compression', {
        saved: compressionResult.tokensEstimate.saved,
        ratio: compressionResult.compressionRatio.toFixed(2),
        cached: compressionResult.cached,
      });
    } catch (err) {
      console.warn('[fyp] sourceText-compression-failed', err);
    }
  }

  const { system: systemPrompt, user: userPrompt } = buildLessonPrompts({
    subject,
    difficulty,
    sourceText,
    nextTopicHint: opts.nextTopicHint,
  });

  let structuredContextJson = opts.structuredContext
    ? JSON.stringify(buildStructuredContextPayload(opts.structuredContext))
    : null;

  // Compress structured context if enabled and large
  // OPTIMIZED: Lower threshold from 800 to 600 chars to compress more aggressively
  if (enableCompression && structuredContextJson && structuredContextJson.length > 600) {
    try {
      const compressionResult = await compressContext(structuredContextJson, {
        rate: compressionRate,  // Now uses 0.65 default (was 0.3)
        useCache: true,
        temperature: 0.1, // Very deterministic for JSON-like content
      });
      structuredContextJson = compressionResult.compressed;
      console.log('[fyp] structuredContext-compression', {
        saved: compressionResult.tokensEstimate.saved,
        ratio: compressionResult.compressionRatio.toFixed(2),
        cached: compressionResult.cached,
      });
    } catch (err) {
      console.warn('[fyp] structuredContext-compression-failed', err);
    }
  }

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
  const functionCallingSupported = modelSupportsFunctionCalling(model);
  const requestVariants: Array<{ useFunctionCall: boolean; usePlainResponse: boolean; dropStructured: boolean }> = [];
  // Prefer function calling (most reliable and saves tokens) if supported
  if (functionCallingSupported) {
    requestVariants.push({ useFunctionCall: true, usePlainResponse: false, dropStructured: false });
  }
  // Fallback to JSON mode if supported
  if (jsonResponseSupported) {
    requestVariants.push({ useFunctionCall: false, usePlainResponse: false, dropStructured: false });
  }
  // Fallback to plain text mode
  requestVariants.push({ useFunctionCall: false, usePlainResponse: true, dropStructured: false });
  // Last resort: plain text without structured context
  if (structuredContextJson) {
    requestVariants.push({ useFunctionCall: false, usePlainResponse: true, dropStructured: true });
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
  let usedPlainResponseMode = false;
  let usedFunctionCall = false;
  let trimmedStructuredContext = false;
  let codeInterpreterUsed = false;
  const variantHistory: Array<Record<string, unknown>> = [];

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
    metadata.completionFormat = usedFunctionCall ? "function_call" : usedPlainResponseMode ? "plain" : "json_object";
    if (trimmedStructuredContext) metadata.trimmedStructuredContext = true;
    if (summary == null || missingPromptTokens || missingCompletionTokens) {
      metadata.missingUsage = true;
    }
    if (errorDetails) {
      metadata.error = errorDetails instanceof Error ? errorDetails.message : String(errorDetails);
    }
    try {
      // Add provider and tier to metadata for cost tracking
      metadata.provider = provider;
      metadata.tier = userTier;
      metadata.modelSpeed = modelSpeed;
      metadata.codeInterpreterUsed = codeInterpreterUsed;
      await logUsage(sb, uid, ip, modelIdentifier, usagePayload, { metadata });
    } catch (usageErr) {
      console.warn("[fyp] usage log failed", usageErr);
    }
  };

  const validateLessonCandidate = async (candidate: Lesson | null) => {
    // Deterministic validation only - schema validation already happened in resolveLessonCandidate
    if (!candidate) return null;

    // Normalize LaTeX delimiters in lesson content
    if (typeof candidate.content === "string") {
      candidate.content = normalizeLatex(candidate.content);
    }
    if (typeof candidate.title === "string") {
      candidate.title = normalizeLatex(candidate.title);
    }
    if (typeof candidate.topic === "string") {
      candidate.topic = normalizeLatex(candidate.topic);
    }

    // Normalize LaTeX in questions and shuffle answer choices
    if (Array.isArray(candidate.questions)) {
      candidate.questions = candidate.questions.map((q) => ({
        ...q,
        prompt: typeof q.prompt === "string" ? normalizeLatex(q.prompt) : q.prompt,
        explanation: typeof q.explanation === "string" ? normalizeLatex(q.explanation) : q.explanation,
        choices: Array.isArray(q.choices)
          ? q.choices.map((c) => (typeof c === "string" ? normalizeLatex(c) : c))
          : q.choices,
      }));
      // Shuffle answer choices to prevent AI bias toward position A
      candidate.questions = shuffleQuizQuestions(candidate.questions);
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
        const responseFormatMode = variant.useFunctionCall
          ? "function_call"
          : variant.usePlainResponse
            ? "plain"
            : "json_object";
        const attemptInfoBase = {
          subject,
          topic,
          attempt: attemptOrdinal,
          variant: variantIndex + 1,
          variantAttempt: variantAttempt + 1,
          useFunctionCall: variant.useFunctionCall,
          usePlainResponse: variant.usePlainResponse,
          dropStructuredContext: variant.dropStructured,
          responseFormatMode,
          messageCount: messages.length,
        };
        // Get code interpreter params for FYP lesson generation
        const codeInterpreterParams = getCodeInterpreterParams({
          enabled: true,
          toolChoice: "auto", // Critical for math/science accuracy in FYP
          maxExecutionTime: 8000,
          tokenOverhead: 500, // Already accounted for in completionMaxTokens
        });

        const payload = {
          model,
          temperature,
          max_tokens: completionMaxTokens,
          messages,
          ...(variant.useFunctionCall
            ? {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tools: [CREATE_LESSON_TOOL, ...((codeInterpreterParams.tools as any[]) || [])],
                tool_choice: { type: "function" as const, function: { name: "create_lesson" } }
              }
            : variant.usePlainResponse
              ? { ...codeInterpreterParams } // Add code_interpreter for plain response
              : { response_format: { type: "json_object" as const }, ...codeInterpreterParams }
          ),
        };

        try {
          completion = await client.chat.completions.create(payload);

          // Check if code interpreter was used
          const message = completion?.choices?.[0]?.message;
          if (message && !codeInterpreterUsed) {
            codeInterpreterUsed = usedCodeInterpreter(message as { executed_tools?: Array<{ type: string }> });
          }

          const completionUsage = completion.usage;
          recordUsageEvent({
            source: "lesson",
            attempt: attemptOrdinal,
            variant: variantIndex + 1,
            variantAttempt: variantAttempt + 1,
            responseFormat: responseFormatMode,
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
          const usageInfo = completion.usage
            ? {
                promptTokens: completion.usage.prompt_tokens ?? null,
                completionTokens: completion.usage.completion_tokens ?? null,
                totalTokens: completion.usage.total_tokens ?? null,
              }
            : null;
          const successFinishReason = completion.choices?.[0]?.finish_reason ?? null;
          variantHistory.push({
            ...attemptInfoBase,
            outcome: "success",
            finishReason: successFinishReason,
            usage: usageInfo,
            messageSummary,
          });
          usedPlainResponseMode = variant.usePlainResponse;
          usedFunctionCall = variant.useFunctionCall;
          trimmedStructuredContext = variant.dropStructured;
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
          const allowFallbackFromFunctionCall =
            variant.useFunctionCall &&
            (status === 400 ||
              status === 415 ||
              status === 422 ||
              /tool|function|invalid/i.test(message));
          const allowPlainFallback =
            jsonResponseSupported &&
            !variant.useFunctionCall &&
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
            (allowFallbackFromFunctionCall || allowPlainFallback || allowDropStructured || !retryable);
          const willSwitchVariant = shouldSwitchVariant;
          const willRetry = willRetryVariant || willSwitchVariant;

          console.warn("[fyp] lesson completion attempt failed", {
            subject,
            topic,
            attempt: attemptOrdinal,
            variant: variantIndex + 1,
            variantAttempt: variantAttempt + 1,
            useFunctionCall: variant.useFunctionCall,
            usePlainResponse: variant.usePlainResponse,
            droppedStructuredContext: variant.dropStructured,
              status,
              code,
              message,
              retryable: willRetry,
              allowFallbackFromFunctionCall: allowFallbackFromFunctionCall || undefined,
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
            allowFallbackFromFunctionCall: allowFallbackFromFunctionCall || undefined,
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
    let verifiedLesson = await validateLessonCandidate(lessonCandidate);
    usageSummary = computeUsageSummary();

    if (verifiedLesson) {
      // OPTIMIZED: Validate lesson length and retry with higher limit if too short (safety mechanism)
      const retryCheck = shouldRetryLesson(verifiedLesson.content, MIN_LESSON_WORDS, tokenLimitResult);

      if (retryCheck.shouldRetry && retryCheck.newLimit && attemptOrdinal < 3) {
        console.warn('[fyp] Lesson too short, retrying with increased token limit', {
          wordCount: verifiedLesson.content.split(/\s+/).length,
          currentLimit: completionMaxTokens,
          newLimit: retryCheck.newLimit,
          reason: retryCheck.reason,
        });

        // Retry once with higher limit
        try {
          // Adjust retry token limit for code_interpreter overhead
          const retryMaxTokens = adjustTokenLimitForCodeInterpreter(retryCheck.newLimit);

          // Get code interpreter params for retry
          const retryCodeInterpreterParams = getCodeInterpreterParams({
            enabled: true,
            toolChoice: "auto",
            maxExecutionTime: 8000,
            tokenOverhead: 500,
          });

          const retryCompletion = await client.chat.completions.create({
            model,
            temperature,
            max_tokens: retryMaxTokens,
            messages: messagesWithContext,
            ...(functionCallingSupported
              ? {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  tools: [CREATE_LESSON_TOOL, ...((retryCodeInterpreterParams.tools as any[]) || [])],
                  tool_choice: { type: "function" as const, function: { name: "create_lesson" } }
                }
              : jsonResponseSupported
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ? { response_format: { type: "json_object" as const }, ...(retryCodeInterpreterParams as any) }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                : { ...(retryCodeInterpreterParams as any) }
            ),
          });

          const retryChoice = retryCompletion.choices?.[0];

          // Check if code interpreter was used in retry
          if (retryChoice?.message && !codeInterpreterUsed) {
            codeInterpreterUsed = usedCodeInterpreter(retryChoice.message as { executed_tools?: Array<{ type: string }> });
          }

          const retryRaw = typeof retryChoice?.message?.content === "string" && retryChoice.message.content.trim().length > 0
            ? retryChoice.message.content.trim()
            : extractAssistantJson(retryChoice);
          const retryCandidate = resolveLessonCandidate(retryRaw);
          const retryVerified = await validateLessonCandidate(retryCandidate);

          if (retryVerified) {
            const retryUsage = retryCompletion.usage;
            recordUsageEvent({
              source: "lesson",
              attempt: attemptOrdinal + 1,
              responseFormat: functionCallingSupported ? "function_call" : jsonResponseSupported ? "json_object" : "plain",
              promptTokens: typeof retryUsage?.prompt_tokens === "number" ? retryUsage.prompt_tokens : null,
              completionTokens: typeof retryUsage?.completion_tokens === "number" ? retryUsage.completion_tokens : null,
              totalTokens: typeof retryUsage?.total_tokens === "number" ? retryUsage.total_tokens : null,
            });
            usageSummary = computeUsageSummary();
            verifiedLesson = retryVerified;
            console.log('[fyp] Retry successful, using retried lesson');
          }
        } catch (retryErr) {
          console.warn('[fyp] Retry failed, using original lesson:', retryErr);
        }
      }

      await logLessonUsage("single", usageSummary);
      return verifiedLesson;
    }

    console.warn("[fyp] lesson candidate rejected (parse failed)", {
      subject,
      topic,
      variantHistory,
      candidate: candidateSummary,
    });

    if (!lastError) lastError = new Error("Invalid lesson format from AI");
  } catch (error) {
    const fallbackGenerated = (error as { error?: { failed_generation?: string } })?.error?.failed_generation;
    if (typeof fallbackGenerated === "string" && fallbackGenerated.trim().length > 0) {
      const lessonCandidate = resolveLessonCandidate(fallbackGenerated.trim());
      if (!lessonCandidate) {
        console.warn("[fyp] fallback generation parse failed", {
          subject,
          topic,
          rawPreview: previewForLog(fallbackGenerated, 200),
          rawLength: fallbackGenerated.length,
        });
      }
      const verifiedLesson = await validateLessonCandidate(lessonCandidate);
      usageSummary = computeUsageSummary();
      if (verifiedLesson) {
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
  console.warn("[fyp] returning fallback lesson", {
    subject,
    topic,
    pace,
    difficulty,
    accuracy,
    error: safeErrorForLog(lastError),
    variantHistory,
    usage: usageSummary,
    fallbackLesson: summarizeLessonForLog(fallbackLesson),
  });

  await logLessonUsage("fallback", usageSummary, lastError);

  return fallbackLesson;
}


