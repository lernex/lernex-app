// app/api/generate/quiz/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";

const MAX_CHARS = 4300;
const MAX_TOKENS = 480;

export async function POST(req: Request) {
  try {
    const sb = supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

    if (user) {
      const ok = await checkUsageLimit(sb, user.id);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Usage limit exceeded" }), { status: 403 });
      }
    }
    
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
Return only JSON matching exactly:
{
  "id": string,
  "subject": string,
  "title": string,
  "difficulty": "intro"|"easy"|"medium"|"hard",
  "questions": [
    { "prompt": string, "choices": string[], "correctIndex": number, "explanation": string }
  ]
}
Generate two or three multiple-choice questions with short choices. Use standard inline LaTeX like \\( ... \\) for any expressions requiring special formatting (equations, vectors, matrices, etc.). Avoid all HTML tags and extra commentary.
`.trim();

    const model = "gpt-5-nano";
    const completion = await ai.chat.completions.create({
      model,
      temperature: 1,
      max_tokens: MAX_TOKENS,
      reasoning: { effort: "minimal" },
      text: { verbosity: "low" },
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Subject: ${subject}\nDifficulty: ${difficulty}\nSource Text:\n${src}\nCreate 2 or 3 fair multiple-choice questions based on the source.` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 502 }); }

    if (user && completion.usage) {
      try {
        await logUsage(sb, user.id, ip, model, completion.usage);
      } catch {
        /* ignore */
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
