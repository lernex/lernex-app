// app/api/generate/stream/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";
import { createModelClient, getUserTier } from "@/lib/model-config";

// Raised limits per request
const MAX_CHARS = 6000; // allow longer input passages

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    const uid = user?.id ?? null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

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

    if (typeof text !== "string" || text.trim().length < 20) {
      return new Response("Provide at least ~20 characters of study text.", { status: 400 });
    }

    // Fetch user profile to determine tier (always fetch fresh, no cache)
    const { data: profile } = await sb
      .from("profiles")
      .select("subscription_tier")
      .eq("id", uid!)
      .single();
    const userTier = getUserTier(profile || {});

    // Generate page uses FAST model for immediate response
    const { client, model, modelIdentifier, provider } = createModelClient(userTier, 'fast');

    const src = text.slice(0, MAX_CHARS);

    console.log("[gen/stream] request-start", { subject, inputLen: src.length, mode, tier: userTier, provider, model, dt: 0 });

    const enc = new TextEncoder();

    // Adjust style and length based on mode
    const systemQuick = [
      "Answer the user's prompt directly in one very concise paragraph (30–60 words).",
      "CRITICAL: Stay strictly within the boundaries of the specified subject. Do NOT introduce concepts from other subjects or higher-level topics.",
      "For example, if the subject is 'Algebra 1', do NOT include concepts like vectors, norms, calculus, or advanced topics. Only use concepts appropriate for that exact subject level.",
      "Do not add extra context beyond what is needed to answer.",
      "Do not use JSON, markdown, or code fences; avoid HTML tags.",
      "For math, use \\( ... \\) for inline and \\[ ... \\] for display. Do NOT use single-dollar $...$ delimiters.",
      "Always balance delimiters: \\( with \\), \\[ with \\], $$ with $$.",
      "Vectors: \\langle ... \\rangle; Norms: \\|v\\|; Matrices: use pmatrix with \\\\ for row breaks.",
      "Use single backslash for LaTeX commands: \\frac{1}{2}, \\alpha, \\sin(x).",
      "Wrap single-letter macro arguments in braces: \\vec{v}, \\mathbf{v}, \\hat{x}.",
    ].join(" ");
    const systemMini = [
      "Write a concise micro-lesson of 80–120 words in exactly two short paragraphs.",
      "CRITICAL: Stay strictly within the boundaries of the specified subject. Do NOT introduce concepts from other subjects or higher-level topics.",
      "For example, if the subject is 'Algebra 1', do NOT include concepts like vectors, norms, calculus, or advanced topics. Only use concepts appropriate for that exact subject level.",
      "Answer the user's question and provide a tiny bit of explanation for learning.",
      "If you need to organize content, you may use markdown headers (## or ###) to separate sections, but keep it minimal for this short format.",
      "Do not use JSON or code fences; avoid HTML tags.",
      "For math, use \\( ... \\) for inline and \\[ ... \\] for display. Do NOT use single-dollar $...$ delimiters.",
      "Always balance delimiters: \\( with \\), \\[ with \\], $$ with $$.",
      "Vectors: \\langle ... \\rangle; Norms: \\|v\\|; Matrices: use pmatrix with \\\\ for row breaks.",
      "Use single backslash for LaTeX commands: \\frac{1}{2}, \\alpha, \\sin(x).",
      "Wrap single-letter macro arguments in braces: \\vec{v}, \\mathbf{v}, \\hat{x}.",
    ].join(" ");
    const systemFull = [
      "Write an in-depth lesson of ~400–700 words across multiple short paragraphs.",
      "CRITICAL: Stay strictly within the boundaries of the specified subject. Do NOT introduce concepts from other subjects or higher-level topics.",
      "For example, if the subject is 'Algebra 1', do NOT include concepts like vectors, norms, calculus, multivariable calculus, linear algebra, or any advanced mathematics. Only use concepts appropriate for that exact subject level.",
      "If the subject is 'Geometry', only use geometric concepts. If the subject is 'Calculus 1', do not include Calculus 2 or 3 concepts like sequences, series, or multivariable calculus.",
      "Answer the user's question thoroughly, add background, key definitions, step-by-step reasoning, a small worked example, common pitfalls, and a short summary.",
      "IMPORTANT: Organize your lesson into clear sections using markdown headers (## for main sections, ### for subsections). For example: '## Background', '## Key Concepts', '## Worked Example', '## Common Pitfalls', '## Summary'.",
      "Use headers to create visual breaks between different parts of your lesson. This helps students navigate the content.",
      "Do not use JSON or code fences; avoid HTML tags.",
      "For math, use \\( ... \\) for inline and \\[ ... \\] for display. Do NOT use single-dollar $...$ delimiters.",
      "Always balance delimiters: \\( with \\), \\[ with \\], $$ with $$.",
      "Vectors: \\langle ... \\rangle; Norms: \\|v\\|; Matrices: use pmatrix with \\\\ for row breaks.",
      "Use single backslash for LaTeX commands: \\frac{1}{2}, \\alpha, \\sin(x).",
      "Wrap single-letter macro arguments in braces: \\vec{v}, \\mathbf{v}, \\hat{x}.",
    ].join(" ");
    const system = mode === "quick" ? systemQuick : mode === "full" ? systemFull : systemMini;

    // Token budgets per mode (clamped to keep responses compact)
    const quickMaxTokens = Math.min(
      2200,
      Math.max(600, Number(process.env.GROQ_STREAM_MAX_TOKENS_QUICK ?? "1400") || 1400),
    );
    const miniMaxTokens = Math.min(
      3600,
      Math.max(1200, Number(process.env.GROQ_STREAM_MAX_TOKENS_MINI ?? "2400") || 2400),
    );
    const fullMaxTokens = Math.min(
      5200,
      Math.max(2000, Number(process.env.GROQ_STREAM_MAX_TOKENS_FULL ?? "3600") || 3600),
    );
    const maxTokens = mode === "quick" ? quickMaxTokens : mode === "full" ? fullMaxTokens : miniMaxTokens;
    // Explicitly type messages so literal roles don't widen to `string`.
    const baseMessages: ChatCompletionCreateParams["messages"] = [
      { role: "system", content: system },
      { role: "user", content: `Subject: ${subject}\nMode: ${mode}\nSource Text:\n${src}\nWrite the lesson as instructed.` },
    ];

    const streamPromise = client.chat.completions.create({
      model,
      temperature: 1,
      max_tokens: maxTokens,
      reasoning_effort: "medium",
      stream: true,
      messages: baseMessages,
    });

    const bodyStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(enc.encode("\n"));
        let sawContent = false;
        let sawActivity = false;
        let closed = false;
        let fallbackNeeded = false;
        let fallbackReason: string | null = null;
        const startedAt = Date.now();
        let usageSummary: { input_tokens?: number | null; output_tokens?: number | null } | null = null;

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
          if (!sawActivity) {
            fallbackNeeded = true;
            fallbackReason = "first-token-timeout";
          }
        }, 12000);

        try {
          const stream = await streamPromise;
          console.log("[gen/stream] upstream-stream-ready", { dt: Date.now() - t0 });
          for await (const chunk of stream) {
            const choice = chunk?.choices?.[0];
            const delta = choice?.delta ?? {};
            const content = typeof (delta as { content?: unknown }).content === "string"
              ? (delta as { content: string }).content
              : "";
            const reasoning = typeof (delta as { reasoning?: unknown }).reasoning === "string"
              ? (delta as { reasoning: string }).reasoning
              : "";
            const chunkUsage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } } | undefined)?.usage;
            if (chunkUsage) {
              usageSummary = {
                input_tokens: chunkUsage.prompt_tokens ?? null,
                output_tokens: chunkUsage.completion_tokens ?? null,
              };
            }
            if (!sawActivity && (content || reasoning)) {
              console.log("[gen/stream] first-token", { dt: Date.now() - t0 });
              clearTimeout(firstTokenTimer);
              fallbackNeeded = false;
              fallbackReason = null;
            }
            if (reasoning) {
              sawActivity = true;
            }
            if (content) {
              sawActivity = true;
              sawContent = true;
              safeEnqueue(content);
            }
          }

          if (!sawContent) {
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
          if (!sawContent && fallbackNeeded) {
            console.warn("[gen/stream] fallback-trigger", { why: fallbackReason, dt: Date.now() - startedAt });
            try {
              const nonStream = await client.chat.completions.create({
                model,
                temperature: 1,
                max_tokens: maxTokens,
                reasoning_effort: "medium",
                messages: baseMessages,
              });
              const full = (nonStream?.choices?.[0]?.message?.content as string | undefined) ?? "";
              if (full) {
                sawContent = true;
                safeEnqueue(full);
              } else {
                console.warn("[gen/stream] fallback-empty");
              }
              const u = nonStream?.usage;
              if (u) {
                usageSummary = {
                  input_tokens: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
                  output_tokens: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
                };
              }
            } catch (err) {
              console.error("[gen/stream] fallback-error", err);
            }
          }
          if (usageSummary && (uid || ip)) {
            try {
              await logUsage(sb, uid, ip, modelIdentifier, usageSummary, {
                metadata: { route: "lesson-text", mode, subject, provider, tier: userTier },
              });
            } catch (logErr) {
              console.warn("[gen/stream] usage-log-error", logErr);
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
    // Note: Error logging handled in main try block with proper model context
    return new Response("Server error", { status: 500 });
  }
}
