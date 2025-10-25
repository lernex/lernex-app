// app/api/generate/stream/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";
import { createModelClient, fetchUserTier } from "@/lib/model-config";
import { compressContext } from "@/lib/semantic-compression";

// Raised limits per request
const MAX_CHARS = 6000; // allow longer input passages

/**
 * Attempts to parse partial JSON incrementally
 * Returns the parsed content if available, null otherwise
 */
function tryParsePartial(buffer: string): { content: string | null; parsed: boolean } {
  // Try to parse complete JSON first
  try {
    const parsed = JSON.parse(buffer);
    if (parsed && typeof parsed === "object" && "content" in parsed) {
      return { content: parsed.content, parsed: true };
    }
  } catch {
    // JSON not complete yet, try to extract partial content
    // Look for content field in partial JSON
    const contentMatch = buffer.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (contentMatch && contentMatch[1]) {
      // Unescape JSON string
      try {
        const unescaped = JSON.parse(`"${contentMatch[1]}"`);
        return { content: unescaped, parsed: false };
      } catch {
        // Return raw if unescape fails
        return { content: contentMatch[1], parsed: false };
      }
    }
  }
  return { content: null, parsed: false };
}

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

    // Fetch user tier with cache-busting (always fresh, no stale data)
    const userTier = await fetchUserTier(sb, uid!);

    // Generate page uses FAST model for immediate response
    const { client, model, modelIdentifier, provider } = createModelClient(userTier, 'fast');

    const src = text.slice(0, MAX_CHARS);

    console.log("[gen/stream] request-start", { subject, inputLen: src.length, mode, tier: userTier, provider, model, dt: 0 });

    const enc = new TextEncoder();

    // Common rules extracted to reduce duplication
    const SUBJECT_BOUNDARY_RULE = "CRITICAL: Stay strictly within the boundaries of the specified subject. Do NOT introduce concepts from other subjects or higher-level topics. For example, if the subject is 'Algebra 1', do NOT include concepts like vectors, norms, calculus, or advanced topics. Only use concepts appropriate for that exact subject level.";
    const MATH_FORMATTING_RULES = "Math: \\(inline\\) \\[display\\]. Escape in JSON: \\\\(. Balance pairs. Commands: \\frac \\sqrt \\alpha etc.";
    const FORMAT_RESTRICTION = "Do not use JSON or code fences; avoid HTML tags.";

    // Unified prompt builder function
    const buildPrompt = (mode: "quick" | "mini" | "full"): string => {
      const modeSpecs: Record<"quick" | "mini" | "full", string[]> = {
        quick: [
          "Answer the user's prompt directly in one very concise paragraph (30–60 words).",
          "Do not add extra context beyond what is needed to answer.",
        ],
        mini: [
          "Write a concise micro-lesson of 80–120 words in exactly two short paragraphs.",
          "Answer the user's question and provide a tiny bit of explanation for learning.",
          "Use ## for sections if needed.",
        ],
        full: [
          "Write an in-depth lesson of ~400–700 words across multiple short paragraphs.",
          "If the subject is 'Geometry', only use geometric concepts. If the subject is 'Calculus 1', do not include Calculus 2 or 3 concepts like sequences, series, or multivariable calculus.",
          "Answer the user's question thoroughly, add background, key definitions, step-by-step reasoning, a small worked example, common pitfalls, and a short summary.",
          "Use ## for sections if needed.",
        ],
      };

      return [
        ...modeSpecs[mode],
        SUBJECT_BOUNDARY_RULE,
        FORMAT_RESTRICTION,
        MATH_FORMATTING_RULES,
      ].join(" ");
    };

    const system = buildPrompt(mode);
    let compressedSrc = src;

    // Apply semantic compression if enabled and input is large
    const enableCompression = process.env.ENABLE_SEMANTIC_COMPRESSION === 'true';
    const compressionRate = Number(process.env.SEMANTIC_COMPRESSION_RATE ?? '0.35');

    if (enableCompression && src.length > 1000) {
      try {
        const compressionResult = await compressContext(src, {
          rate: compressionRate,
          preserve: [subject],
          useCache: true,
          temperature: 0.3,
        });
        compressedSrc = compressionResult.compressed;
        console.log('[gen/stream] sourceText-compression', {
          saved: compressionResult.tokensEstimate.saved,
          ratio: compressionResult.compressionRatio.toFixed(2),
          cached: compressionResult.cached,
        });
      } catch (err) {
        console.warn('[gen/stream] sourceText-compression-failed', err);
      }
    }

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
      { role: "user", content: `Subject: ${subject}\nMode: ${mode}\nSource Text:\n${compressedSrc}\nWrite the lesson as instructed.` },
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

        // Buffer for incremental JSON parsing
        let buffer = "";
        let lastSentLength = 0;
        let isLikelyJSON = false;
        let jsonCheckDone = false;

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

              // Add to buffer for incremental parsing
              buffer += content;

              // Auto-detect JSON on first chunk
              if (!jsonCheckDone) {
                jsonCheckDone = true;
                const trimmed = buffer.trim();
                isLikelyJSON = trimmed.startsWith('{') || trimmed.startsWith('[');
              }

              // If it looks like JSON, try incremental parsing
              if (isLikelyJSON) {
                const partial = tryParsePartial(buffer);
                if (partial.content) {
                  // Only send new content to avoid duplicates
                  const newContent = partial.content.slice(lastSentLength);
                  if (newContent) {
                    safeEnqueue(newContent);
                    lastSentLength = partial.content.length;
                  }
                }
              } else {
                // Plain text mode: stream directly (existing behavior)
                safeEnqueue(content);
              }
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

                // Apply same JSON parsing logic to fallback
                const trimmed = full.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                  const partial = tryParsePartial(full);
                  safeEnqueue(partial.content ?? full);
                } else {
                  safeEnqueue(full);
                }
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
