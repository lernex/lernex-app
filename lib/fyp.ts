import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LessonSchema } from "./schema";
import type { Lesson } from "./schema";
import { checkUsageLimit, logUsage } from "./usage";

type Pace = "slow" | "normal" | "fast";
type Difficulty = "intro" | "easy" | "medium" | "hard";

type UsageSummary = { input_tokens: number | null; output_tokens: number | null } | null;

type LessonOptions = {
  pace?: Pace;
  accuracyPct?: number;
  difficultyPref?: Difficulty;
  avoidIds?: string[];
  avoidTitles?: string[];
  mapSummary?: string;
  structuredContext?: Record<string, unknown>;
};

const MAX_TOKENS = 1400;
const DEFAULT_MODEL = process.env.DEEPINFRA_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const DEFAULT_TEMPERATURE = Number(process.env.DEEPINFRA_TEMPERATURE ?? process.env.GROQ_TEMPERATURE ?? "0.4");

let cachedClient: { apiKey: string; baseUrl: string; client: OpenAI } | null = null;

function getClient() {
  const apiKey = process.env.DEEPINFRA_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing DEEPINFRA_API_KEY");
  const baseUrl = process.env.DEEPINFRA_BASE_URL || "https://api.deepinfra.com/v1/openai";

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
  let normalized = text.replace(/\s+/g, " ").trim();
  let words = normalized.split(" ");

  if (words.length > 95) {
    words = words.slice(0, 95);
    normalized = words.join(" ");
  }

  while (normalized.length > 580 && words.length > 75) {
    words.pop();
    normalized = words.join(" ");
  }

  return normalized;
}

function buildFallbackLesson(subject: string, topic: string, pace: Pace, accuracy: number | null, difficulty: Difficulty): Lesson {
  const topicLabel = topic.split("> ").pop()?.trim() || topic.trim();
  const subjectLabel = subject.trim() || "your course";
  const accuracyText = typeof accuracy === "number" ? ` and your recent accuracy sits near ${accuracy}%` : " and you're building steady confidence";

  const contentBase = [
    `You're moving at a ${pace} pace${accuracyText}, so celebrate a quick win before revisiting ${topicLabel} in ${subjectLabel}.`,
    `State the idea in one warm sentence, then highlight the rule or pattern it unlocks for future problems.`,
    `Sketch or narrate a small example that shows the idea in action and underline the step that usually trips learners.`,
    `Name one likely misconception and the cue you will use to spot it during the next practice block.`,
    `Close with a concrete next action: teach the summary aloud, solve a related mini problem, or connect the idea to the upcoming playlist checkpoint.`,
  ].join(" ");

  const content = clampFallbackContent(contentBase);

  const questions: Lesson["questions"] = [
    {
      prompt: `Which statement best captures the purpose of ${topicLabel}?`,
      choices: [
        `It explains why ${topicLabel} matters inside ${subjectLabel}.`,
        "It removes meaning and focuses only on memorized numbers.",
        "It applies solely after the topic has disappeared from the course.",
        "It replaces examples with unrelated trivia to stay interesting.",
      ],
      correctIndex: 0,
      explanation: `${topicLabel} anchors a core move in ${subjectLabel}, so start by highlighting its meaning and relevance before pushing into procedures.`,
    },
    {
      prompt: `When you revisit ${topicLabel}, what should you do first to deepen understanding?`,
      choices: [
        "Ignore context and jump straight to a graded assessment.",
        "Restate the concept and walk through a concrete example.",
        "Compare the topic to something totally unrelated for variety.",
        "Never use notes or sketches when reviewing the idea.",
      ],
      correctIndex: 1,
      explanation: `Explaining ${topicLabel} in your own words and pairing it with a specific example makes the idea stick and exposes gaps worth rehearsing.`,
    },
    {
      prompt: `Which reflection helps you plan a smart next step after studying ${topicLabel}?`,
      choices: [
        `Identify one misconception about ${topicLabel} and how you'll monitor it next session.`,
        "List every other topic you would rather study instead.",
        "Decide the concept must be perfect before you practice again.",
        "Promise to avoid peer discussion until the unit is complete.",
      ],
      correctIndex: 0,
      explanation: `Spotting a likely misconception and naming a cue to catch it keeps momentum and prepares you to coach yourself through the next practice block.`,
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

function buildUserPrompt(subject: string, topic: string, pace: Pace, accuracy: number | null, difficulty: Difficulty, opts: LessonOptions = {}) {
  const learnerLines = [
    `- Pace: ${pace}`,
    accuracy != null ? `- Recent accuracy: ${accuracy}%` : `- Recent accuracy: not enough data`,
    `- Target difficulty: ${difficulty}`,
  ];

  if (opts.difficultyPref) {
    learnerLines.push(`- Preferred difficulty: ${opts.difficultyPref}`);
  }

  const guardrails: string[] = [];
  if (opts.avoidIds?.length) guardrails.push(`Avoid lesson IDs: ${opts.avoidIds.slice(-10).join(", ")}`);
  if (opts.avoidTitles?.length) guardrails.push(`Avoid lesson titles: ${opts.avoidTitles.slice(-10).join(", ")}`);

  const contextBlocks: string[] = [];
  if (opts.mapSummary) contextBlocks.push(`Map summary:\n${opts.mapSummary}`);
  if (opts.structuredContext) contextBlocks.push(`Structured context:\n${JSON.stringify(opts.structuredContext, null, 2)}`);

  const parts = [
    `Subject: ${subject}`,
    `Topic: ${topic}`,
    `Learner profile:\n${learnerLines.join("\n")}`,
    `Directions:\n- Open with encouragement tied to their pace${accuracy != null ? " and recent accuracy" : ""}.\n- Break the concept into practical checkpoints with a vivid example.\n- Close with the next action the learner should take.\n- Provide exactly three multiple-choice questions with concise coaching explanations.`,
  ];

  if (guardrails.length) parts.push(`Guardrails:\n- ${guardrails.join("\n- ")}`);
  if (contextBlocks.length) parts.push(contextBlocks.join("\n\n"));

  parts.push("Return only the JSON object for the lesson as described—no extra prose.");

  return parts.join("\n\n");
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

  if (uid) {
    const allowed = await checkUsageLimit(sb, uid);
    if (!allowed) throw new Error("Usage limit exceeded");
  }

  const pace: Pace = opts.pace ?? "normal";
  const accuracy = typeof opts.accuracyPct === "number" ? Math.max(0, Math.min(100, Math.round(opts.accuracyPct))) : null;
  const difficulty: Difficulty = opts.difficultyPref ?? (accuracy != null ? (accuracy < 50 ? "intro" : accuracy < 70 ? "easy" : accuracy < 85 ? "medium" : "hard") : "easy");

  const systemPrompt = `You are Lernex's AI mentor. Create a concise micro-lesson (75-95 words) and three multiple-choice questions with coaching explanations. Use inline LaTeX for math (\\( ... \\)), keep the tone supportive, and finish with a concrete next step.`;
  const userPrompt = buildUserPrompt(subject, topic, pace, accuracy, difficulty, opts);

  const baseRequest = {
    model,
    temperature,
    max_tokens: MAX_TOKENS,
    reasoning: { effort: "medium" as const },
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ],
  };

  const attempts: Array<{ name: string; responseFormat?: { type: "json_object" } }> = [
    { name: "json_object", responseFormat: { type: "json_object" } },
    { name: "text" },
  ];

  let usageSummary: UsageSummary = null;
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const completion = await client.chat.completions.create({
        ...baseRequest,
        ...(attempt.responseFormat ? { response_format: attempt.responseFormat } : {}),
      });

      const usage = completion.usage;
      usageSummary = usage
        ? {
            input_tokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
            output_tokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
          }
        : usageSummary;

      const choice = completion.choices?.[0];
      const raw = extractAssistantJson(choice);
      const lesson = resolveLessonCandidate(raw);

      if (lesson) {
        if (uid && usageSummary) {
          try {
            await logUsage(sb, uid, ip, model, usageSummary, { metadata: { generatorAttempt: attempt.name } });
          } catch (usageErr) {
            console.warn("[fyp] usage log failed", usageErr);
          }
        }
        return lesson;
      }

      lastError = new Error("Invalid lesson format from AI");
    } catch (error) {
      lastError = error;
      const message = typeof (error as { error?: { message?: string } })?.error?.message === "string"
        ? (error as { error: { message: string } }).error.message
        : error instanceof Error
        ? error.message
        : "";

      if (attempt.responseFormat && message.toLowerCase().includes("response_format")) {
        continue;
      }
    }
  }

  console.warn("[fyp] returning fallback lesson", { subject, topic, error: lastError instanceof Error ? lastError.message : lastError });

  if (uid && usageSummary) {
    try {
      await logUsage(sb, uid, ip, model, usageSummary, { metadata: { generatorAttempt: "fallback" } });
    } catch (usageErr) {
      console.warn("[fyp] usage log failed", usageErr);
    }
  }

  return buildFallbackLesson(subject, topic, pace, accuracy, difficulty);
}
