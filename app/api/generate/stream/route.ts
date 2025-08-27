// app/api/generate/stream/route.ts
export const runtime = "edge";

import OpenAI from "openai";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";

type ModelSpec = { name: string; delayMs: number };

// Primary + backup (tune order if needed)
const HEDGE: ModelSpec[] = [
  { name: "gpt-4.1-nano", delayMs: 0 },      // try this first
  { name: process.env.OPENAI_MODEL || "gpt-4o-mini", delayMs: 300 }, // backup
];

const MAX_CHARS = 2000;  // cap input to keep TTFB low
const MAX_TOKENS = 220;  // cap output tokens for snappier completions

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const { text, subject = "Algebra 1" } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return new Response("Missing OPENAI_API_KEY", { status: 500 });
    }
    if (typeof text !== "string" || text.trim().length < 40) {
      return new Response("Provide at least ~40 characters of study text.", { status: 400 });
    }

    const src = text.slice(0, MAX_CHARS);
    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.log("[gen/stream] request-start", { dt: 0 });

    // Start a streaming completion for a model, with optional abort signal
    const startStream = (model: string, signal?: AbortSignal): Promise<AsyncIterable<ChatCompletionChunk>> =>
      ai.chat.completions.create(
        {
          model,
          temperature: 1,
          stream: true,           // streaming overload
          max_tokens: MAX_TOKENS, // chat-completions param
          messages: [
            {
              role: "system",
              content: "Write a concise micro-lesson (80–120 words). Two short paragraphs. No JSON, no code fences.",
            },
            { role: "user", content: `Subject: ${subject}\nSource:\n${src}` },
          ],
        },
        { signal }
      ) as unknown as Promise<AsyncIterable<ChatCompletionChunk>>;

    // Hedged start: launch primary now, backup after a small delay; take the first that responds
    const controllers: (AbortController | undefined)[] = [];
    const winner: AsyncIterable<ChatCompletionChunk> = await new Promise<AsyncIterable<ChatCompletionChunk>>(
      (resolve, reject) => {
        let resolved = false;

        HEDGE.forEach(({ name, delayMs }, idx) => {
          setTimeout(async () => {
            if (resolved) return;
            const ac = new AbortController();
            controllers[idx] = ac;

            try {
              const stream = await startStream(name, ac.signal);
              if (!resolved) {
                resolved = true;
                console.log("[gen/stream] first-model", { model: name, dt: Date.now() - t0 });
                // cancel the others
                controllers.forEach((c, j) => {
                  if (j !== idx && c) {
                    try { c.abort(); } catch { /* noop */ }
                  }
                });
                resolve(stream);
              } else {
                try { ac.abort(); } catch { /* noop */ }
              }
            } catch (err) {
              // If this attempt fails and it's the last hedge, reject
              if (!resolved && idx === HEDGE.length - 1) reject(err as Error);
            }
          }, delayMs);
        });

        // Safety timeout if nothing resolves
        setTimeout(() => { if (!resolved) reject(new Error("hedge-timeout")); }, 10_000);
      }
    );

    console.log("[gen/stream] after-openai-call", { dt: Date.now() - t0 });

    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Early tiny chunk to defeat buffering in some paths
          controller.enqueue(enc.encode("\n"));

          let first = true;
          for await (const chunk of winner) {
            const token = chunk.choices?.[0]?.delta?.content ?? "";
            if (!token) continue;
            if (first) {
              console.log("[gen/stream] first-token", { dt: Date.now() - t0 });
              first = false;
            }
            controller.enqueue(enc.encode(token));
          }

          console.log("[gen/stream] done", { dt: Date.now() - t0 });
        } catch (e) {
          console.error("[gen/stream] error", e);
          controller.error(e);
          return;
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("[gen/stream] top-level error", e);
    return new Response("Server error", { status: 500 });
  }
}
