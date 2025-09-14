// app/api/generate/quiz/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Groq from "groq-sdk";
import type { ChatCompletion } from "groq-sdk/resources/chat/completions";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";

const MAX_CHARS = 4300;
// Allow a bit more room so the model can finish the JSON payload
const MAX_TOKENS = 900;

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

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return new Response(
        JSON.stringify({ error: "Missing GROQ_API_KEY" }),
        { status: 500 }
      );
    }
    if (typeof text !== "string" || text.trim().length < 20) {
      return new Response(JSON.stringify({ error: "Provide ≥ 20 characters" }), { status: 400 });
    }

    const src = text.slice(0, MAX_CHARS);

   const system = `
Return ONLY a valid JSON object (no prose) matching exactly:
{
  "id": string,
  "subject": string,
  "title": string,
  "difficulty": "intro"|"easy"|"medium"|"hard",
  "questions": [
    { "prompt": string, "choices": string[], "correctIndex": number, "explanation": string }
  ]
}
Rules:
- Produce 2–3 multiple-choice questions.
- Keep choices short (<= 8 words). Keep explanations concise (<= 25 words).
- Use inline LaTeX with \\( ... \\) for math. Do NOT use plain $...$.
- Always close math delimiters and balance braces { }.
- Vector: \\langle a,b \\rangle; Norms: \\|v\\|; Matrices may use pmatrix with row breaks (\\).
- Avoid HTML tags and code fences.
- JSON must be valid; escape backslashes so LaTeX survives JSON, but logical content must not be double-escaped (macros should start with a single backslash at runtime).
`.trim();

    const model = "openai/gpt-oss-20b";
    let raw = "";

    const ai = new Groq({ apiKey: groqApiKey });
    let completion: ChatCompletion | null = null;
    try {
      completion = await ai.chat.completions.create({
        model,
        temperature: 0.4,
        max_tokens: MAX_TOKENS,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Subject: ${subject}\nDifficulty: ${difficulty}\nSource Text:\n${src}\nCreate 2 or 3 fair multiple-choice questions based on the source.`,
          },
        ],
      });
      raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "";
    } catch (err: unknown) {
      const e = err as unknown as { error?: { failed_generation?: string } };
      const failed = e?.error?.failed_generation;
      if (typeof failed === "string" && failed.trim().length > 0) {
        raw = failed;
      } else {
        // Retry without JSON mode
        try {
          completion = await ai.chat.completions.create({
            model,
            temperature: 0.4,
            max_tokens: MAX_TOKENS,
            reasoning_effort: "low",
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: `Subject: ${subject}\nDifficulty: ${difficulty}\nSource Text:\n${src}\nCreate 2 or 3 fair multiple-choice questions based on the source.`,
              },
            ],
          });
          raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "";
        } catch (_e: unknown) {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 502 });
        }
      }
    }
    if (!raw) raw = "{}";
    if (user && completion?.usage) {
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

    // Normalize/sanitize the quiz object to maximize front-end formatting success
    const obj = parsed as {
      id?: string;
      subject?: string;
      title?: string;
      difficulty?: string;
      questions?: { prompt?: unknown; choices?: unknown; correctIndex?: unknown; explanation?: unknown }[];
    };
    const coerceStr = (v: unknown) => (typeof v === "string" ? v : String(v ?? "").trim());
    const normalizeMath = (s: string) => {
      // Replace $...$ with \(...\) to align with our renderer
      // Only replace when a matching single '$' exists ahead (avoid currency)
      let out = s.replace(/\$(?!\$)([^$\n]{1,300})\$/g, (_m, inner) => `\\(${inner}\)`);
      // Normalize double-backslashed delimiters
      out = out.split("\\\\(").join("\\(").split("\\\\)").join("\\)");
      out = out.split("\\\\[").join("\\[").split("\\\\]").join("\\]");
      return out;
    };
    const sanitizeQuestion = (q: { prompt?: unknown; choices?: unknown; correctIndex?: unknown; explanation?: unknown }) => {
      const prompt = normalizeMath(coerceStr(q.prompt));
      let choices = Array.isArray(q.choices) ? q.choices.map(coerceStr) : [] as string[];
      // Enforce reasonable choice counts
      const diff = (obj.difficulty as string) ?? "easy";
      const maxChoices = diff === "intro" || diff === "easy" ? 3 : 4;
      choices = choices.filter((c) => c.length > 0).slice(0, Math.max(2, maxChoices));
      choices = choices.map(normalizeMath);
      // Coerce index (default to 0)
      const rawIdx = (q as { correctIndex?: unknown }).correctIndex;
      let idx = typeof rawIdx === "number" ? rawIdx : Number(rawIdx);
      if (!Number.isFinite(idx) || idx < 0 || idx >= choices.length) idx = 0;
      const explanation = normalizeMath(coerceStr(q.explanation));
      return { prompt, choices, correctIndex: idx, explanation };
    };
    if (Array.isArray(obj.questions)) {
      obj.questions = obj.questions.map(sanitizeQuestion);
    }

    // Note: Bedrock usage logging is handled in the generation route; here we log only for OpenAI path above.

    return new Response(JSON.stringify(obj), {
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
      status: 200,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
