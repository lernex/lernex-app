// app/api/generate/stream/route.ts
export const runtime = "edge";

import OpenAI from "openai";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";

type ModelSpec = { name: string; delayMs: number };

// Primary + backup (tune order if needed)
const HEDGE: ModelSpec[] = [
  { name: "gpt-5-nano", delayMs: 0 },
  { name: process.env.OPENAI_MODEL || "gpt-4.1-nano", delayMs: 500 },
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
    let usage: { input_tokens?: number | null; output_tokens?: number | null } | null = null;

    // Start a streaming response for a model, with optional abort signal
    const startStream = (model: string, signal?: AbortSignal) =>
      ai.responses.stream(
        {
          model,
          temperature: 1,
          max_output_tokens: MAX_TOKENS,
          reasoning: { effort: "minimal" },
          text: { verbosity: "low" },
          input: [
            {
              role: "system",
              content:
                "Write a concise micro-lesson of 80–120 words in exactly two short paragraphs. Do not use JSON, markdown, HTML, or code fences. Use standard inline LaTeX like \( ... \) for any expressions requiring special formatting (equations, vectors, matrices, etc.). No HTML tags."
            },
            { role: "user", content: `Subject: ${subject}\nSource Text:\n${src}\nWrite the lesson as instructed.` },
          ],
        },
        { signal }
      );

    // Hedged start: launch primary now, backup after a small delay; take the first that responds
    const controllers: (AbortController | undefined)[] = [];
    const winner = await new Promise<AsyncIterable<ResponseStreamEvent>>(
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
          for await (const event of winner) {
            if (event.type === "response.output_text.delta") {
              const token = event.delta;
              if (!token) continue;
              if (first) {
                console.log("[gen/stream] first-token", { dt: Date.now() - t0 });
                first = false;
              }
              controller.enqueue(enc.encode(token));
            } else if (event.type === "response.completed") {
              usage = event.response?.usage ?? null;
            }
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
          controller.error(e as Error);
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
