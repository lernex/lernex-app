import Groq from "groq-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LessonSchema } from "./schema";
import { checkUsageLimit, logUsage } from "./usage";

const LESSON_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "subject", "topic", "title", "content", "difficulty", "questions"],
  properties: {
    id: { type: "string", minLength: 1 },
    subject: { type: "string", minLength: 1 },
    topic: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    content: { type: "string", minLength: 30, maxLength: 600 },
    difficulty: { type: "string", enum: ["intro", "easy", "medium", "hard"] },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "choices", "correctIndex"],
        properties: {
          prompt: { type: "string", minLength: 1 },
          choices: {
            type: "array",
            minItems: 2,
            maxItems: 6,
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
  }
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");
  const client = new Groq({ apiKey });
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
    ? "Keep the explanation tight: 38-48 words."
    : pace === "slow"
    ? "Lean into detail: 60-75 words."
    : "Aim for 48-60 words with clear sequencing.";
  const accHint = acc !== null ? `Recent accuracy ~${acc}%.` : "";
  const diffHint = diffPref ? `Target difficulty around: ${diffPref}.` : "";
  const avoidHint = [
    avoidIds.length ? `Avoid reusing these lesson IDs: ${avoidIds.map((x) => '"' + x + '"').join(', ')}.` : "",
    avoidTitles.length ? `Avoid reusing these lesson titles: ${avoidTitles.map((x) => '"' + x + '"').join(', ')}.` : "",
  ].filter(Boolean).join(" ");

  const baseSystem = `You are the Lernex adaptive micro-lesson generator.
Return only a valid JSON object that matches LessonSchema with fields: id, subject, topic, title, content, difficulty, questions[].
Global rules:
- content must be a single paragraph of clear text (45-75 words) with no markdown, lists, headings, or quoted dialogue.
- difficulty must be one of "intro", "easy", "medium", "hard" and should reflect the learner guidance provided.
- always produce exactly 3 question objects; each must have a prompt, four plain-text choices, correctIndex (0-based), and an explanation (<=240 chars).
- Ensure each set of choices is distinct, plausible, and only one answer is fully correct.
If the topic is written as "Topic > Subtopic", focus on the Subtopic while briefly tying back to the Topic. Favor practical, course-linked examples when obvious. Use inline LaTeX (\\( ... \\)) sparingly and ensure the JSON stays valid.`;

  const ctxHint = opts?.mapSummary ? `\nMap context: ${opts.mapSummary}` : "";
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

  const attemptPlans: { system: string; mode: ResponseMode }[] = [
    { system: baseSystem, mode: "json_schema" },
    { system: baseSystem, mode: "json_object" },
    { system: baseSystem + "\nImportant: Output must be STRICT JSON with double quotes only. No markdown, no comments.", mode: "json_schema" },
    { system: baseSystem + "\nImportant: Output must be STRICT JSON with double quotes only. No markdown, no comments.", mode: "json_object" },
    { system: baseSystem + "\nFinal attempt: Respond with ONLY a single JSON object matching the schema.", mode: "json_schema" },
    { system: baseSystem + "\nFinal attempt: Respond with only the JSON object and nothing else.", mode: "none" },
  ];

  for (const plan of attemptPlans) {
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
      const validated = LessonSchema.safeParse(parsed);
      if (validated.success) {
        if (uid && usage) {
          try { await logUsage(sb, uid, ip, model, usage); } catch {}
        }
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
  if (validated.success) return validated.data;

  // Attempt minimal normalization before giving up
  const o = parsed as Record<string, unknown>;
  const norm: Record<string, unknown> = { ...o };
  if (!norm.id || typeof norm.id !== "string" || !(norm.id as string).trim()) {
    norm.id = `L-${Math.random().toString(36).slice(2, 10)}`;
  }
  if (!norm.subject || typeof norm.subject !== "string") norm.subject = subject;
  if (!norm.topic || typeof norm.topic !== "string") norm.topic = topic;
  if (!norm.title || typeof norm.title !== "string") norm.title = typeof norm.topic === "string" ? `Quick intro: ${norm.topic}` : "Quick lesson";
  if (typeof norm.content !== "string") norm.content = "This micro-lesson introduces the core idea concisely.";
  // Strip basic HTML tags that sometimes slip in
  if (typeof norm.content === "string") norm.content = (norm.content as string).replace(/<[^>]+>/g, "").slice(0, 600);
  // Difficulty normalize
  const diff = norm.difficulty;
  if (diff !== "intro" && diff !== "easy" && diff !== "medium" && diff !== "hard") norm.difficulty = "easy";
  // Questions minimal fallback
  if (!Array.isArray(norm.questions) || (norm.questions as unknown[]).length === 0) {
    norm.questions = [
      {
        prompt: typeof norm.title === "string" ? `Which statement best reflects: ${norm.title}` : "Quick check",
        choices: [
          "The key idea stated correctly",
          "A common misconception about the idea",
          "An unrelated fact",
          "An incomplete or partially correct view"
        ],
        correctIndex: 0,
        explanation: "This choice captures the essence of the micro-lesson.",
      }
    ];
  } else {
    // Ensure each question has four choices and a valid correctIndex
    type NormQuestion = { prompt?: unknown; choices?: unknown; correctIndex?: unknown; explanation?: unknown };
    norm.questions = (norm.questions as unknown[]).map((raw) => {
      const q = raw as NormQuestion;
      const baseChoices = Array.isArray(q?.choices)
        ? (q.choices as unknown[]).map((choice) => String(choice)).filter((choice) => choice.trim().length > 0).slice(0, 6)
        : [];
      const fallbackPool = [
        "A plausible but incorrect alternative",
        "An unrelated idea",
        "A partially correct statement",
        "A misleading interpretation"
      ];
      let fillerIdx = 0;
      while (baseChoices.length < 4) {
        baseChoices.push(fallbackPool[fillerIdx % fallbackPool.length]);
        fillerIdx += 1;
      }
      const trimmedChoices = baseChoices.slice(0, 4);
      const idx = typeof q?.correctIndex === "number"
        ? Math.max(0, Math.min(trimmedChoices.length - 1, Math.floor(q.correctIndex as number)))
        : 0;
      return {
        prompt: String(q?.prompt ?? "Quick check"),
        choices: trimmedChoices,
        correctIndex: idx,
        explanation: typeof q?.explanation === "string"
          ? (q.explanation as string).slice(0, 240)
          : undefined,
      };
    });
  }

  const revalidated = LessonSchema.safeParse(norm);
  if (revalidated.success) return revalidated.data;
  throw new Error("Invalid lesson format from AI");
}


