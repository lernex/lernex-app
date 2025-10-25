// app/api/sat-prep/stream/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";
import { createModelClient, fetchUserTier } from "@/lib/model-config";
import { getCachedSampleQuestions } from "@/lib/sat-sample-cache";

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
        console.warn("[sat-prep/stream] usage-limit", { uid });
        return new Response("Usage limit exceeded", { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const { section = "math", topic = "algebra", topicLabel = "Algebra" } = (body ?? {}) as {
      section?: string;
      topic?: string;
      topicLabel?: string;
    };

    // Fetch user tier with cache-busting (always fresh, no stale data)
    const userTier = uid ? await fetchUserTier(sb, uid) : 'free';

    // SAT Prep uses FAST model for immediate response
    const { client, model, modelIdentifier, provider } = createModelClient(userTier, 'fast');

    console.log("[sat-prep/stream] request-start", { section, topic, topicLabel, tier: userTier, provider, model, dt: 0 });

    // Fetch sample SAT questions using cached version (reduces DB calls + tokens)
    const exampleContext = await getCachedSampleQuestions(sb, section, topic, "stream");
    const hasExamples = exampleContext.length > 0;

    if (!hasExamples) {
      console.log(`[sat-prep/stream] no questions found for section "${section}", generating without examples`);
    }

    const enc = new TextEncoder();

    // Detect question type for better prompt targeting
    const isDataQuestion = topic.includes('graph') || topic.includes('table') || topic.includes('data');
    const isVocabQuestion = ['contextual-meaning', 'context-clues', 'precise-word-choice', 'technical-vocabulary', 'nuanced-vocabulary', 'inference-from-evidence', 'synonym-recognition', 'spatial-vocabulary', 'advanced-vocabulary', 'contrast-interpretation'].includes(topic);

    const questionTypeGuidance = isDataQuestion
      ? "Focus on strategies for reading graphs and tables: check axes, units, scale, and labels. Explain how to compare values and identify trends."
      : isVocabQuestion
      ? "Focus on strategies for determining word meaning from context: look for signal words, surrounding sentences, and logical relationships."
      : "Focus on passage analysis strategies: identifying main ideas, understanding author's purpose, and drawing inferences from textual evidence.";

    const systemPrompt = [
      `You are an expert SAT prep tutor. Create a comprehensive mini-lesson for SAT ${section} on the topic of ${topicLabel}.`,
      "Your lesson should be 150-200 words and include:",
      "1. A brief introduction to the concept",
      "2. Key strategies for approaching these questions on the SAT",
      "3. Common mistakes to avoid",
      "4. A worked example demonstrating the concept",
      "",
      questionTypeGuidance,
      "",
      "CRITICAL: Your lesson must emulate the exact style, difficulty, and format of real SAT questions.",
      hasExamples
        ? "Use the provided real SAT question examples as a reference for style, difficulty, and formatting. Match their tone and complexity."
        : "Model your content after official SAT question patterns and difficulty levels.",
      "",
      "Use ## for sections if needed.",
      "Do not use JSON or code fences; avoid HTML tags.",
      "Math: \\( ... \\) for inline and \\[ ... \\] for display. Balance pairs. Commands: \\frac \\sqrt \\alpha etc.",
      "Make the content practical and test-focused.",
    ].join(" ");

    const userPrompt = [
      `SAT Section: ${section}`,
      `Topic: ${topicLabel}`,
      exampleContext,
      "Write the SAT prep lesson as instructed above.",
    ].join("\n");

    const maxTokens = 2800;
    const baseMessages: ChatCompletionCreateParams["messages"] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const streamPromise = client.chat.completions.create({
      model,
      temperature: 0.8,
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
          console.log("[sat-prep/stream] upstream-stream-ready", { dt: Date.now() - t0 });
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
              console.log("[sat-prep/stream] first-token", { dt: Date.now() - t0 });
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

          console.log("[sat-prep/stream] done", { dt: Date.now() - t0 });
        } catch (e) {
          console.error("[sat-prep/stream] stream-error", e);
          fallbackNeeded = true;
          fallbackReason = "stream-error";
        } finally {
          try { clearTimeout(firstTokenTimer); } catch {}
          if (!sawContent && fallbackNeeded) {
            console.warn("[sat-prep/stream] fallback-trigger", { why: fallbackReason, dt: Date.now() - startedAt });
            try {
              const nonStream = await client.chat.completions.create({
                model,
                temperature: 0.8,
                max_tokens: maxTokens,
                reasoning_effort: "medium",
                messages: baseMessages,
              });
              const full = (nonStream?.choices?.[0]?.message?.content as string | undefined) ?? "";
              if (full) {
                sawContent = true;
                safeEnqueue(full);
              } else {
                console.warn("[sat-prep/stream] fallback-empty");
              }
              const u = nonStream?.usage;
              if (u) {
                usageSummary = {
                  input_tokens: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
                  output_tokens: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
                };
              }
            } catch (err) {
              console.error("[sat-prep/stream] fallback-error", err);
            }
          }
          if (usageSummary && (uid || ip)) {
            try {
              await logUsage(sb, uid, ip, modelIdentifier, usageSummary, {
                metadata: { route: "sat-prep-lesson", section, topic, provider, tier: userTier },
              });
            } catch (logErr) {
              console.warn("[sat-prep/stream] usage-log-error", logErr);
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
    console.error("[sat-prep/stream] top-level-error", e);
    // Note: Error logging handled in main try block with proper model context
    return new Response("Server error", { status: 500 });
  }
}
