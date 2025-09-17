// app/api/generate/quiz/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Groq from "groq-sdk";
import type { ChatCompletion } from "groq-sdk/resources/chat/completions";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";
import { normalizeLatex, scanLatex, hasLatexIssues } from "@/lib/latex";

const MAX_CHARS = 4300;

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
    
    const { text, subject = "Algebra 1", difficulty = "easy", mode = "mini" } = await req.json();

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return new Response(
        JSON.stringify({ error: "Missing GROQ_API_KEY" }),
        { status: 500 }
      );
    }
    if (typeof text !== "string" || text.trim().length < 20) {
      return new Response(JSON.stringify({ error: "Provide >= 20 characters" }), { status: 400 });
    }

    const src = text.slice(0, MAX_CHARS);

    // Question count guidance based on mode
    const countRule = mode === "quick"
      ? "Produce 0-1 multiple-choice questions. Prefer 0 if the user''s request is a narrowly scoped factual question."
      : mode === "full"
        ? "Produce 3-5 multiple-choice questions."
        : "Produce 2-3 multiple-choice questions.";

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
- ${countRule}
- Keep choices short (<= 8 words). Keep explanations concise (<= 25 words).
- Use inline LaTeX with \\( ... \\) for math. Do NOT use single-dollar $...$ delimiters; prefer \\( ... \\) for inline and \\[ ... \\] only if necessary.
- Always balance {} and math delimiters (\\( pairs with \\), \\[ with \\], $$ with $$).
- Vector: \\langle a,b \\rangle; Norms: \\|v\\|; Matrices may use pmatrix with row breaks (\\).
- Avoid HTML tags and code fences.
- Wrap single-letter macro arguments in braces (e.g., \\vec{v}, \\mathbf{v}, \\hat{v}).
- JSON must be valid; escape backslashes so LaTeX survives JSON, and do not double-escape macros. After parsing, macros must start with a single backslash.
`.trim();

    const model = "openai/gpt-oss-20b";
    const quickMaxTokens = Math.min(
      320,
      Math.max(220, Number(process.env.GROQ_QUIZ_MAX_TOKENS_QUICK ?? "260") || 260),
    );
    const miniMaxTokens = Math.min(
      900,
      Math.max(360, Number(process.env.GROQ_QUIZ_MAX_TOKENS_MINI ?? "620") || 620),
    );
    const fullMaxTokens = Math.min(
      1400,
      Math.max(700, Number(process.env.GROQ_QUIZ_MAX_TOKENS_FULL ?? "1050") || 1050),
    );
    const maxTokens = mode === "quick" ? quickMaxTokens : mode === "full" ? fullMaxTokens : miniMaxTokens;
    let raw = "";
    let usedFallback = false;

    const ai = new Groq({ apiKey: groqApiKey });
    let completion: ChatCompletion | null = null;
    try {
      completion = await ai.chat.completions.create({
        model,
        temperature: 0.4,
        max_tokens: maxTokens,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Subject: ${subject}
Mode: ${mode}
Difficulty: ${difficulty}
Source Text:
${src}
Create fair multiple-choice questions based on the source, following the rules.`,
          },
        ],
      });
      raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "";
    } catch (err: unknown) {
      const e = err as unknown as { error?: { failed_generation?: string } };
      const failed = e?.error?.failed_generation;
      if (typeof failed === "string" && failed.trim().length > 0) {
        raw = failed;
        usedFallback = true;
      } else {
        // Retry without JSON mode
        try {
          usedFallback = true;
          completion = await ai.chat.completions.create({
            model,
            temperature: 0.4,
            max_tokens: maxTokens,
            reasoning_effort: "low",
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: `Subject: ${subject}
Mode: ${mode}
Difficulty: ${difficulty}
Source Text:
${src}
Create fair multiple-choice questions based on the source, following the rules.`,
              },
            ],
          });
          raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "";
        } catch {
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
    const coerceStr = (v: unknown) => {
      if (typeof v === "string") return v;
      if (v == null) return "";
      return String(v).trim();
    };
    const latexDiagnostics: { field: string; scan: ReturnType<typeof scanLatex> }[] = [];
    const recordDiagnostics = (field: string, value: string) => {
      if (!value) return;
      const scan = scanLatex(value);
      if (hasLatexIssues(scan)) {
        latexDiagnostics.push({ field, scan });
      }
    };
    const normalizeField = (field: string, value: unknown) => {
      const text = coerceStr(value);
      const normalized = normalizeLatex(text);
      recordDiagnostics(field, normalized);
      return normalized;
    };

    obj.id = coerceStr(obj.id);
    const normalizedSubject = normalizeField("subject", obj.subject ?? subject);
    obj.subject = normalizedSubject || subject;
    obj.title = normalizeField("title", obj.title);
    const allowedDifficulty = new Set(["intro", "easy", "medium", "hard"]);
    obj.difficulty = typeof obj.difficulty === "string" && allowedDifficulty.has(obj.difficulty)
      ? obj.difficulty
      : difficulty;

    const sanitizeQuestion = (
      rawQuestion: { prompt?: unknown; choices?: unknown; correctIndex?: unknown; explanation?: unknown } | null | undefined,
      idx: number,
    ) => {
      const question = (rawQuestion ?? {}) as {
        prompt?: unknown;
        choices?: unknown;
        correctIndex?: unknown;
        explanation?: unknown;
      };
      const prompt = normalizeField("q" + idx + ".prompt", question.prompt);
      const baseChoices = Array.isArray(question.choices) ? (question.choices as unknown[]).map(coerceStr) : [];
      const maxChoices = obj.difficulty === "intro" || obj.difficulty === "easy" ? 3 : 4;
      const trimmedChoices = baseChoices.filter((c) => c.length > 0).slice(0, Math.max(2, maxChoices));
      const choices = trimmedChoices.map((choice, choiceIdx) => normalizeField("q" + idx + ".choices[" + choiceIdx + "]", choice));
      const rawIdx = question.correctIndex;
      let idxValue = typeof rawIdx === "number" ? rawIdx : Number(rawIdx);
      if (!Number.isFinite(idxValue) || idxValue < 0 || idxValue >= choices.length) idxValue = 0;
      const explanation = normalizeField("q" + idx + ".explanation", question.explanation);
      return { prompt, choices, correctIndex: idxValue, explanation };
    };

    if (Array.isArray(obj.questions)) {
      obj.questions = obj.questions.map((q, idx) => sanitizeQuestion(q, idx));
    } else {
      obj.questions = [];
    }

    if (latexDiagnostics.length > 0) {
      console.warn("[quiz] latex-anomalies", {
        quizId: obj.id,
        fallback: usedFallback,
        issues: latexDiagnostics.map(({ field, scan }) => ({
          field,
          doubleEscapedMacros: scan.doubleEscapedMacros,
          unmatchedInlinePairs: scan.unmatchedInlinePairs,
          unmatchedDisplayPairs: scan.unmatchedDisplayPairs,
          oddDollarBlocks: scan.oddDollarBlocks,
        })),
      });
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
