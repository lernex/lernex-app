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

    const fwApiKey = process.env.FIREWORKS_API_KEY;
    if (!fwApiKey) {
      return new Response(
        JSON.stringify({ error: "Missing FIREWORKS_API_KEY" }),
        { status: 500 }
      );
    }
    if (typeof text !== "string" || text.trim().length < 20) {
      return new Response(JSON.stringify({ error: "Provide ≥ 20 characters" }), { status: 400 });
    }

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
Generate two or three multiple-choice questions with short choices. Use standard inline LaTeX like \\( ... \\) for any expressions requiring special formatting (equations, vectors, matrices, etc.). Avoid all HTML tags and extra commentary. Always close any math delimiters you open; prefer inline math (\\( ... \\)) for expressions in sentences. Use vector notation with \\langle ... \\rangle and norms with \\|v\\| (not angle brackets or plain pipes). Do not escape LaTeX macros with double backslashes except for matrix row breaks (e.g., \\ in pmatrix).
Reasoning: low
`.trim();

    const model = "accounts/fireworks/models/gpt-oss-20b";
    let raw = "{}";

    const ai = new OpenAI({
      apiKey: fwApiKey,
      baseURL: "https://api.fireworks.ai/inference/v1",
    });
    const completion = await ai.chat.completions.create({
      model,
      temperature: 1,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Subject: ${subject}\nDifficulty: ${difficulty}\nSource Text:\n${src}\nCreate 2 or 3 fair multiple-choice questions based on the source.`,
        },
      ],
    });
    raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "{}";
    if (user && completion.usage) {
      const u = completion.usage;
      let mapped: { input_tokens?: number | null; output_tokens?: number | null } | null = null;
      if (u && typeof u === "object") {
        const rec = (u as unknown) as { prompt_tokens?: unknown; completion_tokens?: unknown };
        const prompt = typeof rec.prompt_tokens === "number" ? rec.prompt_tokens : null;
        const completionTokens = typeof rec.completion_tokens === "number" ? rec.completion_tokens : null;
        mapped = { input_tokens: prompt, output_tokens: completionTokens };
      }
      if (mapped) {
        try {
          await logUsage(sb, user.id, ip, model, mapped);
        } catch {
          /* ignore */
        }
      }
    }
    // Robust JSON parsing with balanced-brace extraction fallback
    function extractBalancedObject(s: string): string | null {
      let i = 0;
      const n = s.length;
      let depth = 0;
      let start = -1;
      let inStr = false;
      let escaped = false;
      for (; i < n; i++) {
        const ch = s[i];
        if (inStr) {
          if (escaped) {
            escaped = false;
          } else if (ch === "\\") {
            escaped = true;
          } else if (ch === '"') {
            inStr = false;
          }
          continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            return s.slice(start, i + 1);
          }
        }
      }
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const extracted = extractBalancedObject(raw);
      if (!extracted) {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 502 });
      }
      try {
        parsed = JSON.parse(extracted);
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 502 });
      }
    }

    // Note: Bedrock usage logging is handled in the generation route; here we log only for OpenAI path above.

    return new Response(JSON.stringify(parsed), {
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
