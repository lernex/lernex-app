// app/api/generate/quiz/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";
import { parseQuizTex } from "@/lib/latex";

const MAX_CHARS = 4300;
const MAX_TOKENS = 500;

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
Produce only LaTeX for a short multiple-choice quiz with two or three questions.
Begin with three comment lines providing metadata exactly as:
% Title: <short quiz title>
% Subject: <subject>
% Difficulty: <intro|easy|medium|hard>

Then output:
\\begin{enumerate}
\\item <question text>
\\begin{enumerate}[label=\\Alph*.]
\\item <choice>
... (2-4 choices)
\\end{enumerate}
\\textbf{Answer:} <letter>\\\\
<optional explanation>
\\item ...
\\end{enumerate}
No JSON, markdown, HTML, or commentary. All text must be LaTeX-ready.
`.trim();

    const model = "gpt-5-nano";
    const completion = await ai.responses.create({
      model,
      temperature: 1,
      max_output_tokens: MAX_TOKENS,
      reasoning: { effort: "minimal" },
      text: { verbosity: "low" },
      input: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Subject: ${subject}\nDifficulty: ${difficulty}\nSource Text:\n${src}\nCreate 2 or 3 fair multiple-choice questions based on the source.`,
        },
      ],
    });

    const raw = (completion.output_text ?? "").trim();
    const parsed = parseQuizTex(raw);

    if (user && completion.usage) {
      try {
        await logUsage(sb, user.id, ip, model, completion.usage);
      } catch {
        /* ignore */
      }
    }

    const resp = {
      id: crypto.randomUUID(),
      subject: (parsed.subject as string) || subject,
      title: (parsed.title as string) || `Quiz on ${subject}`,
      difficulty: (parsed.difficulty as string) || difficulty,
      questions: parsed.questions,
      tex: raw,
    };

    return new Response(JSON.stringify(resp), {
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
