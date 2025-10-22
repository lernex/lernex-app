// app/api/sat-prep/stream/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const sb = supabaseServer();
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

    const cerebrasApiKey = process.env.CEREBRAS_API_KEY;
    if (!cerebrasApiKey) {
      console.error("[sat-prep/stream] missing CEREBRAS_API_KEY");
      return new Response("Missing CEREBRAS_API_KEY", { status: 500 });
    }

    const cerebrasBaseUrl = process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1";
    const model = process.env.CEREBRAS_STREAM_MODEL ?? "gpt-oss-120b";

    console.log("[sat-prep/stream] request-start", { section, topic, topicLabel, dt: 0 });

    // Fetch sample SAT questions from database
    // Try topic-specific query first, fall back to section-only query if no matches
    let { data: sampleQuestions } = await sb
      .from("sat_questions")
      .select("question_text, answer_choices, correct_answer, explanation")
      .eq("section", section)
      .or(`tags.cs.{${topic}},topic.ilike.%${topic}%`)
      .limit(3);

    // If no topic-specific questions found, get any questions from this section
    if (!sampleQuestions || sampleQuestions.length === 0) {
      console.log(`[sat-prep/stream] no questions for topic "${topic}", trying section-only`);
      const fallbackResult = await sb
        .from("sat_questions")
        .select("question_text, answer_choices, correct_answer, explanation")
        .eq("section", section)
        .limit(3);
      sampleQuestions = fallbackResult.data;
    }

    const hasExamples = sampleQuestions && sampleQuestions.length > 0;
    let exampleContext = "";

    if (hasExamples && sampleQuestions) {
      exampleContext = "\n\nHere are some real SAT question examples for reference:\n\n";
      sampleQuestions.forEach((q, idx) => {
        exampleContext += `Example ${idx + 1}:\n${q.question_text}\n`;
        if (q.answer_choices && Array.isArray(q.answer_choices)) {
          q.answer_choices.forEach((choice: string, i: number) => {
            exampleContext += `${String.fromCharCode(65 + i)}) ${choice}\n`;
          });
        }
        exampleContext += `Correct Answer: ${q.correct_answer}\n\n`;
      });
    } else {
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
      "IMPORTANT: Organize your lesson into clear sections using markdown headers (## for main sections, ### for subsections). For example: '## Overview', '## Key Strategies', '## Common Mistakes', '## Example', '## Tips'.",
      "Use headers to create visual breaks between different parts of your lesson. This helps students navigate the content.",
      "Do not use JSON or code fences; avoid HTML tags.",
      "For math, use \\( ... \\) for inline and \\[ ... \\] for display equations.",
      "Always balance delimiters: \\( with \\), \\[ with \\].",
      "Use single backslash for LaTeX commands: \\frac{1}{2}, \\alpha, \\sin(x).",
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

    const client = new OpenAI({
      apiKey: cerebrasApiKey,
      baseURL: cerebrasBaseUrl,
    });

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
              await logUsage(sb, uid, ip, model, usageSummary, {
                metadata: { route: "sat-prep-lesson", section, topic },
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
    const msg = e instanceof Error ? e.message : "Server error";
    // Log error usage if we have user context
    try {
      const sb = supabaseServer();
      const { data: { user } } = await sb.auth.getUser();
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
      if (user) {
        const model = process.env.CEREBRAS_STREAM_MODEL ?? "gpt-oss-120b";
        await logUsage(sb, user.id, ip, model, { input_tokens: null, output_tokens: null }, {
          metadata: {
            route: "sat-prep-lesson",
            error: msg,
            errorType: e instanceof Error ? e.name : typeof e,
          }
        });
      }
    } catch {
      /* ignore logging errors */
    }
    return new Response("Server error", { status: 500 });
  }
}
