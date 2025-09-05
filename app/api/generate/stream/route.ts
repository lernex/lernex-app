// app/api/generate/stream/route.ts
export const runtime = "edge";

import OpenAI from "openai";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";

type ModelSpec = { name: string; delayMs: number };

// Primary + backup (tune order if needed)
const HEDGE: ModelSpec[] = [
  { name: "gpt-4.1-nano", delayMs: 0 },      // try this first
  { name: process.env.OPENAI_MODEL || "gpt-4o-mini", delayMs: 300 }, // backup
];

const MAX_CHARS = 2200;  // cap input to keep TTFB low
const MAX_TOKENS = 250;  // cap output tokens for snappier completions

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
        return new Response("Usage limit exceeded", { status: 403 });
      }
    }

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

    let chosenModel = "";
    let usage: { prompt_tokens?: number | null; completion_tokens?: number | null } | null = null;

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
              content:
                "Write a concise micro-lesson (80–120 words). Two short paragraphs. No JSON, no code fences. Wrap any expressions requiring special formatting (equations, vectors, matrices, etc.) in their own <div>...</div> blocks so the client can style them separately.",
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
                chosenModel = name;
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
            if (chunk.usage) usage = chunk.usage;
            if (!token) continue;
            if (first) {
              console.log("[gen/stream] first-token", { dt: Date.now() - t0 });
              first = false;
            }
            controller.enqueue(enc.encode(token));
          }

          console.log("[gen/stream] done", { dt: Date.now() - t0 });
          if (uid && usage) {
            try {
              await logUsage(sb, uid, ip, chosenModel, usage);
            } catch {
              /* ignore */
            }
          }
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
