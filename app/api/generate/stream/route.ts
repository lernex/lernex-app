// app/api/generate/stream/route.ts
export const runtime = "edge";

import OpenAI from "openai";

type ModelSpec = { name: string; delayMs: number };

// Primary + backup (tune order if needed)
const HEDGE: ModelSpec[] = [
  { name: process.env.OPENAI_MODEL || "gpt-5-nano", delayMs: 0 },
  { name: "gpt-4o-mini", delayMs: 600 },
];

const MAX_CHARS = 2000;   // cap input to keep TTFB low
const MAX_TOKENS = 220;   // cap output tokens for snappier completions

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const { text, subject = "Algebra 1" } = await req.json();

    if (!process.env.OPENAI_API_KEY) return new Response("Missing OPENAI_API_KEY", { status: 500 });
    if (typeof text !== "string" || text.trim().length < 40) {
      return new Response("Provide at least ~40 characters of study text.", { status: 400 });
    }

    const src = text.slice(0, MAX_CHARS);
    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.log("[gen/stream] request-start", { dt: 0 });

    // Start a streaming completion for a model, with optional abort signal
    const startStream = (model: string, signal?: AbortSignal) =>
      ai.chat.completions.create(
        {
          model,
          temperature: 1,
          stream: true,             // <- streaming overload
          max_tokens: MAX_TOKENS,   // <- correct param for chat completions
          messages: [
            {
              role: "system",
              content:
                "Write a concise micro-lesson (80–120 words). Two short paragraphs. No JSON, no code fences.",
            },
            { role: "user", content: `Subject: ${subject}\nSource:\n${src}` },
          ],
        },
        { signal }
      );

    // Hedged start: launch primary now, backup after a small delay; use the first that responds
    const controllers: AbortController[] = [];
    const winner = await new Promise<AsyncIterable<any>>((resolve, reject) => {
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
                if (j !== idx && c) { try { c.abort(); } catch {} }
              });
              resolve(stream as any);
            } else {
              try { ac.abort(); } catch {}
            }
          } catch (err) {
            // if last hedge fails and none resolved, reject
            if (!resolved && idx === HEDGE.length - 1) reject(err as Error);
          }
        }, delayMs);
      });

      // safety timeout if nothing responds
      setTimeout(() => { if (!resolved) reject(new Error("hedge-timeout")); }, 10000);
    });

    console.log("[gen/stream] after-openai-call", { dt: Date.now() - t0 });

    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Early tiny chunk to defeat buffering in some paths
          controller.enqueue(enc.encode("\n"));

          let first = true;
          for await (const chunk of (winner as any)) {
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
