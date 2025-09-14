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

  const system = `You are an adaptive tutor.
Return only a valid JSON object matching LessonSchema with fields: id, subject, topic, title, content (30–80 words), difficulty, questions[ { prompt, choices[], correctIndex, explanation } ].
Use standard inline LaTeX like \\( ... \\) when needed; avoid HTML tags. Ensure all LaTeX braces are balanced and escape backslashes so the JSON remains valid.`;

  const userPrompt = `Subject: ${subject}\nTopic: ${topic}\nLearner pace: ${pace}. ${accHint} ${diffHint} ${lenHint}
${avoidHint}
Produce exactly one micro-lesson and 1–3 MCQs as specified.`;

  let raw = "";
  let completion: import("groq-sdk/resources/chat/completions").ChatCompletion | null = null;
  try {
    completion = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: 1200,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });
    raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "";
  } catch (err) {
    const e = err as unknown as { error?: { failed_generation?: string } };
    const failed = e?.error?.failed_generation;
    if (typeof failed === "string" && failed.trim().length > 0) {
      raw = failed;
    } else {
      // Retry without JSON mode
      completion = await client.chat.completions.create({
        model,
        temperature,
        max_tokens: 1200,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      });
      raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "";
    }
  }

  if (uid && completion?.usage) {
    const u = completion.usage as unknown as { prompt_tokens?: unknown; completion_tokens?: unknown };
    const prompt = typeof u.prompt_tokens === "number" ? u.prompt_tokens : null;
    const completionTokens = typeof u.completion_tokens === "number" ? u.completion_tokens : null;
    await logUsage(sb, uid, ip, model, { input_tokens: prompt, output_tokens: completionTokens });
  }

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
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const extracted = extractBalancedObject(raw);
    if (!extracted) throw new Error("Invalid lesson format from AI");
    parsed = JSON.parse(extracted);
  }
  
  const validated = LessonSchema.safeParse(parsed);
  if (!validated.success) throw new Error("Invalid lesson format from AI");
  return validated.data;
}
