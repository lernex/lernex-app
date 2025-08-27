// app/api/generate/quiz/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import OpenAI from "openai";

const MAX_CHARS = 3000;
const MAX_TOKENS = 380;

export async function POST(req: Request) {
  try {
    const { text, subject = "Algebra 1", difficulty = "easy" } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), { status: 500 });
    }
    if (typeof text !== "string" || text.trim().length < 40) {
      return new Response(JSON.stringify({ error: "Provide ≥ 40 characters" }), { status: 400 });
    }

    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const src = text.slice(0, MAX_CHARS);

    const system = `
Return STRICT JSON only:
{
  "id": string,
  "subject": string,
  "title": string,
  "difficulty": "intro"|"easy"|"medium"|"hard",
  "questions": [
    { "prompt": string, "choices": string[], "correctIndex": number, "explanation": string }
  ]
}
No commentary. 2–3 MCQs. Keep choices short.
`.trim();

    const completion = await ai.chat.completions.create({
      model: "gpt-4.1-nano",     // small, cheap, fast for JSON
      temperature: 1,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Subject: ${subject}\nDifficulty: ${difficulty}\nCreate fair MCQs from:\n${src}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 502 }); }

    return new Response(JSON.stringify(parsed), {
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
