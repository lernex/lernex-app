import { NextRequest } from "next/server";
import OpenAI from "openai";
import { LessonSchema } from "@/lib/schema";
import { take } from "@/lib/rate";

// Optional but nice: ensure this is never prerendered
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // simple in-memory rate limit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!take(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
  }

  // ✅ Only read & create the client *inside* the handler
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // During local dev, put this in .env.local
    // On Vercel, add it in Project → Settings → Environment Variables
    return new Response(JSON.stringify({ error: "Server misconfigured: missing OPENAI_API_KEY" }), { status: 500 });
  }
  const client = new OpenAI({ apiKey });

  try {
    const body = await req.json().catch(() => ({}));
    const { text, subject = "General" } = body ?? {};

    if (!text || typeof text !== "string" || text.length < 40) {
      return new Response(JSON.stringify({ error: "Provide at least ~40 characters of study text." }), { status: 400 });
    }

    const system = `
Return STRICT JSON:
{
  "id": string,
  "subject": string,
  "title": string,
  "content": string,     // 30–100 words
  "questions": [
    { "prompt": string, "choices": string[], "correctIndex": number },
    { "prompt": string, "choices": string[], "correctIndex": number },
    { "prompt": string, "choices": string[], "correctIndex": number }
  ]
}
Rules: concise, factual, no markdown or commentary.
`.trim();

    const userPrompt = `
Subject: ${subject}
Source text:
"""
${text}
"""
`.trim();

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
