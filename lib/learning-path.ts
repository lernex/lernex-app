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
      max_tokens: 15000,
      reasoning_effort: "high",
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
        max_tokens: 15000,
        reasoning_effort: "high",
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

/**
 * Ensure a learning path exists for a user + subject + course, generating and persisting it if absent or invalid.
 * Returns the path.
 */
export async function ensureLearningPath(
  sb: SupabaseClient,
  uid: string,
  ip: string,
  subject: string,
  course: string,
  mastery: number,
  notes = ""
) {
  // Check for existing path
  const { data: existing } = await sb
    .from("user_subject_state")
    .select("path, course, next_topic, difficulty")
    .eq("user_id", uid)
    .eq("subject", subject)
    .maybeSingle();

  const currentPath = existing?.path as LearningPath | null;
  const valid = currentPath && Array.isArray(currentPath.topics) && currentPath.topics.length > 0;
  if (valid && existing?.course === course) {
    return currentPath as LearningPath;
  }

  // Generate fresh path if missing/invalid or course changed
  const path = await generateLearningPath(sb, uid, ip, course, mastery, notes);
  const next_topic = path.starting_topic || (Array.isArray(path.topics) && path.topics[0]?.name) || null;
  const difficulty: "intro" | "easy" | "medium" | "hard" =
    mastery < 35 ? "intro" : mastery < 55 ? "easy" : mastery < 75 ? "medium" : "hard";

  await sb
    .from("user_subject_state")
    .upsert({
      user_id: uid,
      subject,
      course,
      mastery,
      difficulty,
      next_topic,
      path,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,subject" });

  return path;
}
