// app/api/generate/quiz/route.ts
import { NextRequest } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { text, subject = "Algebra 1", difficulty = "easy" } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), { status: 500 });
    }
    if (typeof text !== "string" || text.trim().length < 40) {
      return new Response(JSON.stringify({ error: "Provide ≥ 40 characters" }), { status: 400 });
    }

    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `
Return STRICT JSON only:
{
  "id": string,
  "subject": string,
  "topic": string,
  "title": string,
  "difficulty": "intro"|"easy"|"medium"|"hard",
  "questions": [
    { "prompt": string, "choices": string[], "correctIndex": number, "explanation": string }
  ]
}
No commentary. 1–3 MCQs. Keep choices concise.
    `.trim();

    const user = `
Subject: ${subject}
Target Difficulty: ${difficulty}
Use the source to craft fair questions.
    `.trim();

    const completion = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-5-nano",
      temperature: 1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
        { role: "user", content: `Source:\n${text}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Model returned invalid JSON" }), { status: 502 });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
