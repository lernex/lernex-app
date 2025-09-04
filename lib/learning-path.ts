import OpenAI from "openai";
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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-5-nano";
  const temperature = Number(process.env.OPENAI_TEMPERATURE ?? "1");

  if (uid) {
    const ok = await checkUsageLimit(sb, uid);
    if (!ok) throw new Error("Usage limit exceeded");
  }

  const system = `You are a curriculum planner. Given a course name and user mastery, return JSON with:
{
  "course": string,
  "starting_topic": string,
  "topics": [
    { "name": string, "prerequisites": string[], "estimated_lessons": number }
  ]
}
Return strictly JSON.`.trim();

  const userPrompt = `Course: ${course}\nMastery: ${mastery}%${notes ? `\nNotes: ${notes}` : ""}`;

  const completion = await client.chat.completions.create({
    model,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  if (uid && completion.usage) {
    await logUsage(sb, uid, ip, model, completion.usage);
  }

  const content = completion.choices[0].message?.content || "{}";
  return JSON.parse(content) as LearningPath;
}