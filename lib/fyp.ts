import OpenAI from "openai";
import { LessonSchema } from "./schema";

export async function generateLessonForTopic(subject: string, topic: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-5-nano";
  const temperature = Number(process.env.OPENAI_TEMPERATURE ?? "1");

  const system = `You are an adaptive tutor. Create one micro-lesson (30-80 words) and 1-3 multiple-choice questions with explanations. Return strict JSON matching LessonSchema.`;
  const userPrompt = `Subject: ${subject}\nTopic: ${topic}`;

  const completion = await client.chat.completions.create({
    model,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0].message?.content || "{}";
  const parsed = JSON.parse(content);
  const validated = LessonSchema.safeParse(parsed);
  if (!validated.success) throw new Error("Invalid lesson format from AI");
  return validated.data;
}