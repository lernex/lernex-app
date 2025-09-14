import Groq from "groq-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkUsageLimit, logUsage } from "./usage";

export type LearningPath = {
  course: string;
  starting_topic: string;
  topics: { name: string; prerequisites: string[]; estimated_lessons: number }[];
};

export async function generateLearningPath(
  sb: SupabaseClient,
  uid: string,
  ip: string,
  course: string,
  mastery: number,
  notes = ""

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

  const system = `You are a curriculum planner. Given a course name and user mastery, respond only with a valid JSON object matching the following structure:
{
  "course": string,
  "starting_topic": string,
  "topics": [
    { "name": string, "prerequisites": string[], "estimated_lessons": number }
  ]
}
Ensure the JSON is valid; avoid HTML; balance any LaTeX braces if present.`.trim();

  const userPrompt = `Course: ${course}\nMastery: ${mastery}%${notes ? `\nNotes: ${notes}` : ""}\nCreate a learning path in the specified format.`;

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
  try {
    return JSON.parse(raw) as LearningPath;
  } catch {
    const extracted = extractBalancedObject(raw);
    if (!extracted) throw new Error("Invalid learning path JSON");
    return JSON.parse(extracted) as LearningPath;
  }
}
