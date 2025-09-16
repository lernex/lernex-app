import Groq from "groq-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LessonSchema } from "./schema";
import { checkUsageLimit, logUsage } from "./usage";

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
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
  const temperature = Number(process.env.GROQ_TEMPERATURE ?? "1");

  if (uid) {
    const ok = await checkUsageLimit(sb, uid);
    if (!ok) throw new Error("Usage limit exceeded");
  }

  const pace = opts?.pace ?? "normal";
  const acc = typeof opts?.accuracyPct === "number" ? Math.max(0, Math.min(100, Math.round(opts!.accuracyPct!))) : null;
  const diffPref = opts?.difficultyPref ?? undefined;
  const avoidIds = (opts?.avoidIds ?? []).slice(-20);
  const avoidTitles = (opts?.avoidTitles ?? []).slice(-20);

  const lenHint = pace === "fast" ? "Aim near 30–45 words." : pace === "slow" ? "Aim near 60–80 words." : "Aim near 45–65 words.";
  const accHint = acc !== null ? `Recent accuracy ~${acc}%.` : "";
  const diffHint = diffPref ? `Target difficulty around: ${diffPref}.` : "";
  const avoidHint = [
    avoidIds.length ? `Avoid reusing these lesson IDs: ${avoidIds.map((x) => '"'+x+'"').join(', ')}.` : "",
    avoidTitles.length ? `Avoid reusing these lesson titles: ${avoidTitles.map((x) => '"'+x+'"').join(', ')}.` : "",
  ].filter(Boolean).join(" ");

  const baseSystem = `You are an adaptive tutor.
Return only a valid JSON object matching this exact schema named LessonSchema with fields: id, subject, topic, title, content (30–80 words), difficulty, questions[ { prompt, choices[], correctIndex, explanation } ].
If topic is of the form "Topic > Subtopic", focus the lesson tightly on the Subtopic while briefly tying back to Topic.
Favor practical examples that relate to adjacent courses when obvious from the topic phrasing. Avoid HTML tags. DO NOT include markdown code fences. Use inline LaTeX (\\( ... \\)) only when helpful; ensure JSON remains valid.`;

  const ctxHint = opts?.mapSummary ? `\nMap context: ${opts.mapSummary}` : "";
  const userPrompt = `Subject: ${subject}\nTopic: ${topic}\nLearner pace: ${pace}. ${accHint} ${diffHint} ${lenHint}
${avoidHint}
Produce exactly one micro-lesson and 1–3 MCQs as specified.${ctxHint}\nReturn only the JSON object.`;

  async function callOnce(system: string, jsonMode = true) {
    // Returns [raw, usage]
    let completion: import("groq-sdk/resources/chat/completions").ChatCompletion | null = null;
    try {
      completion = await client.chat.completions.create({
        model,
        temperature,
        max_tokens: 1200,
        reasoning_effort: "low",
        ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
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
      // Re-throw to allow caller to retry differently
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

  // Up to 3 attempts with increasingly strict guidance
  const systems = [
    baseSystem,
    baseSystem + "\nImportant: Output must be STRICT JSON with double quotes only. No markdown, no comments.",
    baseSystem + "\nFinal attempt: Respond with ONLY a single JSON object matching the schema."
  ];
  let parsed: unknown | null = null;
  for (let attempt = 0; attempt < systems.length; attempt++) {
    try {
      const [r, u] = await callOnce(systems[attempt], /*jsonMode*/ true);
      raw = r; usage = u;
    } catch {
      // Fallback without enforced JSON mode
      try {
        const [r, u] = await callOnce(systems[attempt], /*jsonMode*/ false);
        raw = r; usage = u;
      } catch {
        continue; // move to next attempt
      }
    }
    if (!raw) continue;
    // Parse as JSON or extract object from text
    try {
      parsed = JSON.parse(raw);
    } catch {
      const extracted = (() => {
        let i = 0, depth = 0, start = -1, inStr = false, escaped = false;
        const n = raw.length;
        for (; i < n; i++) {
          const ch = raw[i]!;
          if (inStr) { if (escaped) { escaped = false; } else if (ch === "\\") { escaped = true; } else if (ch === '"') { inStr = false; } continue; }
          if (ch === '"') { inStr = true; continue; }
          if (ch === '{') { if (depth === 0) start = i; depth++; }
          else if (ch === '}') { depth--; if (depth === 0 && start !== -1) return raw.slice(start, i + 1); }
        }
        return null;
      })();
      if (extracted) {
        try { parsed = JSON.parse(extracted); } catch { parsed = null; }
      } else {
        parsed = null;
      }
    }
    if (parsed) {
      // Try validate; if ok, log usage and break; otherwise continue attempts
      const validated = LessonSchema.safeParse(parsed);
      if (validated.success) {
        if (uid && usage) {
          try { await logUsage(sb, uid, ip, model, usage); } catch {}
        }
        return validated.data;
      }
    }
  }

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
  try {
    parsed = JSON.parse(raw);
  } catch {
    const extracted = extractBalancedObject(raw);
    if (!extracted) throw new Error("Invalid lesson format from AI");
    parsed = JSON.parse(extracted);
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
        choices: ["The key idea stated correctly", "An unrelated idea", "A partially correct idea"],
        correctIndex: 0,
        explanation: "This choice captures the essence of the micro-lesson.",
      }
    ];
  } else {
    // Ensure each question has a valid correctIndex
    type NormQuestion = { prompt?: unknown; choices?: unknown; correctIndex?: unknown; explanation?: unknown };
    norm.questions = (norm.questions as unknown[]).map((raw) => {
      const q = raw as NormQuestion;
      const choices = Array.isArray(q?.choices)
        ? (q.choices as unknown[]).map((c) => String(c)).slice(0, 6)
        : ["Yes", "No"];
      const idx = typeof q?.correctIndex === "number"
        ? Math.max(0, Math.min(choices.length - 1, Math.floor(q.correctIndex as number)))
        : 0;
      return {
        prompt: String(q?.prompt ?? "Quick check"),
        choices,
        correctIndex: idx,
        explanation: typeof q?.explanation === "string" ? (q.explanation as string) : undefined,
      };
    });
  }

  const revalidated = LessonSchema.safeParse(norm);
  if (revalidated.success) return revalidated.data;
  throw new Error("Invalid lesson format from AI");
}
