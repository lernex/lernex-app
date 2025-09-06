import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LessonSchema } from "./schema";
import { checkUsageLimit, logUsage } from "./usage";

export async function generateLessonForTopic(
  sb: SupabaseClient,
  uid: string,
  ip: string,
  subject: string,
  topic: string
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

  const system = `You are an adaptive tutor. Generate exactly one micro-lesson of 30–80 words and one to three multiple-choice questions. Each question must include an explanation. Return only JSON matching LessonSchema.`;
  const userPrompt = `Subject: ${subject}\nTopic: ${topic}\nProduce the lesson and questions described above.`;

  const completion = await client.chat.completions.create({
    model,
    temperature,
    reasoning: { effort: "minimal" },
    text: { verbosity: "low" },
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
  const parsed = JSON.parse(content);
  const validated = LessonSchema.safeParse(parsed);
  if (!validated.success) throw new Error("Invalid lesson format from AI");
  return validated.data;
}