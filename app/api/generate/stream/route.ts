// app/api/generate/stream/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Groq from "groq-sdk";
import type { ChatCompletionCreateParams } from "groq-sdk/resources/chat/completions";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit } from "@/lib/usage";

// Raised limits per request
const MAX_CHARS = 6000; // allow longer input passages

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const sb = supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    const uid = user?.id ?? null;

    if (uid) {
      const ok = await checkUsageLimit(sb, uid);
      if (!ok) {
        console.warn("[gen/stream] usage-limit", { uid });
        return new Response("Usage limit exceeded", { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const { text, subject = "Algebra 1", mode = "mini" } = (body ?? {}) as {
      text?: string;
      subject?: string;
      mode?: "quick" | "mini" | "full";
    };

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      console.error("[gen/stream] missing GROQ_API_KEY");
      return new Response("Missing GROQ_API_KEY", { status: 500 });
    }
    if (typeof text !== "string" || text.trim().length < 20) {
      return new Response("Provide at least ~20 characters of study text.", { status: 400 });
    }

    const src = text.slice(0, MAX_CHARS);
    const model = "openai/gpt-oss-20b";

    console.log("[gen/stream] request-start", { subject, inputLen: src.length, mode, dt: 0 });

    const enc = new TextEncoder();
    const ai = new Groq({ apiKey: groqApiKey });

    // Adjust style and length based on mode
    const systemQuick = [
      "Answer the user's prompt directly in one very concise paragraph (30–60 words).",
      "Do not add extra context beyond what is needed to answer.",
      "Do not use JSON, markdown, or code fences; avoid HTML tags.",
      "Use standard inline LaTeX like \\(...\\) where needed.",
      "Do NOT use single-dollar $...$ math; prefer \\(...\\) for inline (and \\[...\\] only if necessary).",
      "Always balance {} and math delimiters (\\( with \\), \\[ with \\], $$ with $$).",
      "Use \\langle ... \\rangle for vectors and \\|v\\| for norms.",
      "Do not escape LaTeX macros with double backslashes except for matrix row breaks (e.g., \\ in pmatrix).",
      "Wrap single-letter macro arguments in braces (e.g., \\vec{v}, \\mathbf{v}).",
    ].join(" ");
    const systemMini = [
      "Write a concise micro-lesson of 80–120 words in exactly two short paragraphs.",
      "Answer the user's question and provide a tiny bit of explanation for learning.",
      "Do not use JSON, markdown, or code fences; avoid HTML tags.",
      "Use standard inline LaTeX like \\(...\\) where needed.",
      "Do NOT use single-dollar $...$ math; prefer \\(...\\) for inline (and \\[...\\] only if necessary).",
      "Always balance {} and math delimiters (\\( with \\), \\[ with \\], $$ with $$).",
      "Use \\langle ... \\rangle for vectors and \\|v\\| for norms.",
      "Do not escape LaTeX macros with double backslashes except for matrix row breaks (e.g., \\ in pmatrix).",
      "Wrap single-letter macro arguments in braces (e.g., \\vec{v}, \\mathbf{v}).",
    ].join(" ");
    const systemFull = [
      "Write an in-depth lesson of ~400–700 words across multiple short paragraphs.",
      "Answer the user's question thoroughly, add background, key definitions, step-by-step reasoning, a small worked example, common pitfalls, and a short summary.",
      "Do not use JSON, markdown, or code fences; avoid HTML tags.",
      "Use standard inline LaTeX like \\(...\\) where needed.",
      "Do NOT use single-dollar $...$ math; prefer \\(...\\) for inline (and \\[...\\] only if necessary).",
      "Always balance {} and math delimiters (\\( with \\), \\[ with \\], $$ with $$).",
      "Prefer inline math; for matrices, use pmatrix (use \\\\ for row breaks); use \\langle ... \\rangle for vectors and \\|v\\| for norms.",
      "Do not escape LaTeX macros with double backslashes except for matrix row breaks (e.g., \\ in pmatrix).",
      "Wrap single-letter macro arguments in braces (e.g., \\vec{v}, \\mathbf{v}).",
    ].join(" ");
    const system = mode === "quick" ? systemQuick : mode === "full" ? systemFull : systemMini;

    // Token budgets per mode (clamped to keep responses compact)
    const quickMaxTokens = Math.min(
      360,
      Math.max(200, Number(process.env.GROQ_STREAM_MAX_TOKENS_QUICK ?? "240") || 240),
    );
    const miniMaxTokens = Math.min(
      900,
      Math.max(360, Number(process.env.GROQ_STREAM_MAX_TOKENS_MINI ?? "600") || 600),
    );
    const fullMaxTokens = Math.min(
      1400,
      Math.max(700, Number(process.env.GROQ_STREAM_MAX_TOKENS_FULL ?? "1100") || 1100),
    );
    const maxTokens = mode === "quick" ? quickMaxTokens : mode === "full" ? fullMaxTokens : miniMaxTokens;
    // Explicitly type messages so literal roles don't widen to `string`.
    const baseMessages: ChatCompletionCreateParams["messages"] = [
      { role: "system", content: system },
      { role: "user", content: `Subject: ${subject}\nMode: ${mode}\nSource Text:\n${src}\nWrite the lesson as instructed.` },
    ];

    const streamPromise = ai.chat.completions.create({
      model,
      temperature: 1,
      max_tokens: maxTokens,
      reasoning_effort: "low",
      stream: true,
      messages: baseMessages,
    });

    const bodyStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(enc.encode("\n"));
        let wrote = false;
        let closed = false;
        let fallbackNeeded = false;
        let fallbackReason: string | null = null;
        const startedAt = Date.now();

        const safeEnqueue = (s: string) => {
          if (!closed && s) controller.enqueue(enc.encode(s));
        };
        const doClose = () => {
          if (!closed) {
            closed = true;
            try { controller.close(); } catch {}
          }
        };

        const firstTokenTimer = setTimeout(() => {
          if (!wrote) {
            fallbackNeeded = true;
            fallbackReason = "first-token-timeout";
          }
        }, 7000);

        try {
          const stream = await streamPromise;
          console.log("[gen/stream] upstream-stream-ready", { dt: Date.now() - t0 });
          for await (const chunk of stream) {
            const delta = (chunk?.choices?.[0]?.delta?.content as string | undefined) ?? "";
            if (!delta) continue;
            if (!wrote) {
              console.log("[gen/stream] first-token", { dt: Date.now() - t0 });
              clearTimeout(firstTokenTimer);
              fallbackNeeded = false;
              fallbackReason = null;
            }
            wrote = true;
            safeEnqueue(delta);
          }

          if (!wrote) {
            fallbackNeeded = true;
            fallbackReason = fallbackReason ?? "no-tokens-from-stream";
          }

          console.log("[gen/stream] done", { dt: Date.now() - t0 });
        } catch (e) {
          console.error("[gen/stream] stream-error", e);
          fallbackNeeded = true;
          fallbackReason = "stream-error";
        } finally {
          try { clearTimeout(firstTokenTimer); } catch {}
          if (!wrote && fallbackNeeded) {
            console.warn("[gen/stream] fallback-trigger", { why: fallbackReason, dt: Date.now() - startedAt });
            try {
              const nonStream = await ai.chat.completions.create({
                model,
                temperature: 1,
                max_tokens: maxTokens,
                reasoning_effort: "low",
                messages: baseMessages,
              });
              const full = (nonStream?.choices?.[0]?.message?.content as string | undefined) ?? "";
              if (full) {
                wrote = true;
                safeEnqueue(full);
              } else {
                console.warn("[gen/stream] fallback-empty");
              }
            } catch (err) {
              console.error("[gen/stream] fallback-error", err);
            }
          }
          doClose();
        }
      },
    });

    return new Response(bodyStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("[gen/stream] top-level-error", e);
    return new Response("Server error", { status: 500 });
  }
}
