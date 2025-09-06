// app/api/generate/quiz/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";

const MAX_CHARS = 4300;
// Allow a bit more room so the model can finish the JSON payload
const MAX_TOKENS = 800;

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
    const completion = await ai.responses.create({
      model,
      temperature: 1,
      max_output_tokens: MAX_TOKENS,
      reasoning: { effort: "minimal" },
      text: { format: { type: "json_object" }, verbosity: "low" },
      input: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Subject: ${subject}\nDifficulty: ${difficulty}\nSource Text:\n${src}\nCreate 2 or 3 fair multiple-choice questions based on the source.`,
        },
      ],
    });

    const raw = completion.output_text ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Sometimes the model includes stray characters before/after the JSON
      // or truncates the output slightly. Attempt to salvage the object.
      try {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}") + 1;
        parsed = JSON.parse(raw.slice(start, end));
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 502 });
      }
    }

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
