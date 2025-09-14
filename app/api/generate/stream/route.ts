// app/api/generate/stream/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit } from "@/lib/usage";

// Raised limits per request
const MAX_CHARS = 6000; // allow longer input passages
const MAX_TOKENS = 1000; // larger output budget for complete lessons

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
    const { text, subject = "Algebra 1" } = body ?? {} as { text?: string; subject?: string };

    const fwApiKey = process.env.FIREWORKS_API_KEY;
    if (!fwApiKey) {
      console.error("[gen/stream] missing FIREWORKS_API_KEY");
      return new Response("Missing FIREWORKS_API_KEY", { status: 500 });
    }
    if (typeof text !== "string" || text.trim().length < 20) {
      return new Response("Provide at least ~20 characters of study text.", { status: 400 });
    }

    const src = text.slice(0, MAX_CHARS);
    const model = "accounts/fireworks/models/gpt-oss-20b";

    console.log("[gen/stream] request-start", { subject, inputLen: src.length, dt: 0 });

    const enc = new TextEncoder();
    const ai = new OpenAI({ apiKey: fwApiKey, baseURL: "https://api.fireworks.ai/inference/v1" });

    const system =
      "Write a concise micro-lesson of 80-120 words in exactly two short paragraphs. Do not use JSON, markdown, or code fences. Use standard inline LaTeX like \\( ... \\) for any expressions requiring special formatting (equations, vectors, matrices, etc.). Avoid all HTML tags. Always close any math delimiters you open and prefer inline math (\\( ... \\)) for short expressions. Use \\langle ... \\rangle for vectors and \\|v\\| for norms. Do not escape LaTeX macros with double backslashes except for matrix row breaks (e.g., \\ in pmatrix).\nReasoning: low";

    const streamPromise = ai.chat.completions.create({
      model,
      temperature: 1,
      max_tokens: MAX_TOKENS,
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Subject: ${subject}\nSource Text:\n${src}\nWrite the lesson as instructed.` },
      ],
    });

    const bodyStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Early tiny chunk to help proxies flush streaming
        controller.enqueue(enc.encode("\n"));
        let first = true;
        let emitted = false;
        const firstTimer = setTimeout(() => {
          console.warn("[gen/stream] first-token-timeout", { dt: Date.now() - t0 });
        }, 7000);

        try {
          const stream = await streamPromise;
          console.log("[gen/stream] upstream-stream-ready", { dt: Date.now() - t0 });
          for await (const chunk of stream) {
            const delta = (chunk?.choices?.[0]?.delta?.content as string | undefined) ?? "";
            if (!delta) continue;
            emitted = true;
            if (first) {
              console.log("[gen/stream] first-token", { dt: Date.now() - t0 });
              clearTimeout(firstTimer);
              first = false;
            }
            controller.enqueue(enc.encode(delta));
          }

          if (!emitted) {
            console.warn("[gen/stream] no-tokens-from-stream", { dt: Date.now() - t0 });
            // Fallback: non-streaming single request
            try {
              const nonStream = await ai.chat.completions.create({
                model,
                temperature: 1,
                max_tokens: MAX_TOKENS,
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: `Subject: ${subject}\nSource Text:\n${src}\nWrite the lesson as instructed.` },
                ],
              });
              const full = (nonStream?.choices?.[0]?.message?.content as string | undefined) ?? "";
              if (full) controller.enqueue(enc.encode(full));
            } catch (err) {
              console.error("[gen/stream] fallback-error", err);
            }
          }

          console.log("[gen/stream] done", { dt: Date.now() - t0 });
        } catch (e) {
          console.error("[gen/stream] stream-error", e);
          // Swallow streaming errors; close cleanly so client resolves
        } finally {
          try { clearTimeout(firstTimer); } catch {}
          controller.close();
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
