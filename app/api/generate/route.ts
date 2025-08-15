import { NextRequest } from "next/server";
import OpenAI from "openai";
import { LessonSchema } from "@/lib/schema";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

import { take } from "@/lib/rate";
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!take(ip)) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
  try {
    const body = await req.json().catch(() => ({}));
    const { text, subject = "General" } = body ?? {};

    if (!text || typeof text !== "string" || text.length < 40) {
      return new Response(JSON.stringify({ error: "Provide at least ~40 characters of study text." }), { status: 400 });
    }

    const system = `
You generate ONE micro-lesson (30–80 words) from the user's study text,
then a single multiple-choice question (2–6 choices) with exactly one correct answer.
Return STRICT JSON matching this TypeScript type (no code fencing):

{
  "id": string,
  "subject": string,
  "title": string,
  "content": string,     // 30–100 words
  "questions": [         // exactly 3 MCQs
    { "prompt": string, "choices": string[], "correctIndex": number },
    { "prompt": string, "choices": string[], "correctIndex": number },
    { "prompt": string, "choices": string[], "correctIndex": number }
  ]
}
Rules: factual, concise, 1 correct choice per question, no commentary.
    `.trim();

    const userPrompt = `
Subject: ${subject}
Source text:
"""
${text}
"""
    `.trim();

    // Use a small, fast model; adjust as desired
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Model returned invalid JSON." }), { status: 502 });
    }

    const validated = LessonSchema.safeParse(parsed);
    if (!validated.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: validated.error.flatten() }), { status: 422 });
    }

    return new Response(JSON.stringify(validated.data), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
