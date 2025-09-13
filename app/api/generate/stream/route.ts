// app/api/generate/stream/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit } from "@/lib/usage";

const MAX_CHARS = 2200; // cap input to keep TTFB low
const MAX_TOKENS = 380; // allow a bit more room to finish math

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const sb = supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    const uid = user?.id ?? null;

    if (uid) {
      const ok = await checkUsageLimit(sb, uid);
      if (!ok) {
        return new Response("Usage limit exceeded", { status: 403 });
      }
    }

    const { text, subject = "Algebra 1" } = await req.json();

    const fwApiKey = process.env.FIREWORKS_API_KEY;
    if (!fwApiKey) {
      return new Response("Missing FIREWORKS_API_KEY", { status: 500 });
    }
    if (typeof text !== "string" || text.trim().length < 20) {
      return new Response("Provide at least ~20 characters of study text.", { status: 400 });
    }

    const src = text.slice(0, MAX_CHARS);
    const model = "accounts/fireworks/models/gpt-oss-20b";
    const endpoint = "https://api.fireworks.ai/inference/v1/chat/completions";

    console.log("[gen/stream] request-start", { dt: 0 });

    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Early tiny chunk to defeat buffering in some paths
          controller.enqueue(enc.encode("\n"));

          const sseRes = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${fwApiKey}`,
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify({
              model,
              temperature: 1,
              max_tokens: MAX_TOKENS,
              stream: true,
              messages: [
                {
                  role: "system",
                  content:
                    "Write a concise micro-lesson of 80-120 words in exactly two short paragraphs. Do not use JSON, markdown, or code fences. Use standard inline LaTeX like \\( ... \\) for any expressions requiring special formatting (equations, vectors, matrices, etc.). Avoid all HTML tags. Always close any math delimiters you open and prefer inline math (\\( ... \\)) for short expressions. Use \\langle ... \\rangle for vectors and \\|v\\| for norms. Do not escape LaTeX macros with double backslashes except for matrix row breaks (e.g., \\ in pmatrix).\nReasoning: low",
                },
                {
                  role: "user",
                  content: `Subject: ${subject}\nSource Text:\n${src}\nWrite the lesson as instructed.`,
                },
              ],
            }),
          });

          let first = true;
          let emitted = false;
          if (sseRes.ok && sseRes.body) {
            const reader = sseRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              // Process complete SSE events separated by double newlines
              let idx;
              while ((idx = buffer.indexOf("\n\n")) !== -1) {
                const event = buffer.slice(0, idx).trim();
                buffer = buffer.slice(idx + 2);
                const lines = event.split("\n");
                for (const line of lines) {
                  if (!line.startsWith("data:")) continue;
                  const data = line.slice(5).trim();
                  if (!data) continue;
                  if (data === "[DONE]") {
                    buffer = ""; // end of stream
                    break;
                  }
                  try {
                    const json = JSON.parse(data);
                    const token = (json?.choices?.[0]?.delta?.content as string | undefined) || "";
                    if (token) {
                      emitted = true;
                      if (first) {
                        console.log("[gen/stream] first-token", { dt: Date.now() - t0 });
                        first = false;
                      }
                      controller.enqueue(enc.encode(token));
                    }
                  } catch {
                    // ignore non-JSON lines
                  }
                }
              }
            }
          }

          // Fallback: if stream yielded nothing or failed, fetch once non-streaming
          if (!emitted) {
            try {
              const nonStream = await fetch(endpoint, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${fwApiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model,
                  temperature: 1,
                  max_tokens: MAX_TOKENS,
                  messages: [
                    {
                      role: "system",
                      content:
                        "Write a concise micro-lesson of 80-120 words in exactly two short paragraphs. Do not use JSON, markdown, or code fences. Use standard inline LaTeX like \\( ... \\) for any expressions requiring special formatting (equations, vectors, matrices, etc.). Avoid all HTML tags. Always close any math delimiters you open and prefer inline math (\\( ... \\)) for short expressions. Use \\langle ... \\rangle for vectors and \\|v\\| for norms. Do not escape LaTeX macros with double backslashes except for matrix row breaks (e.g., \\ in pmatrix).\nReasoning: low",
                    },
                    {
                      role: "user",
                      content: `Subject: ${subject}\nSource Text:\n${src}\nWrite the lesson as instructed.`,
                    },
                  ],
                }),
              });
              if (nonStream.ok) {
                const json = await nonStream.json();
                const txt = (json?.choices?.[0]?.message?.content as string | undefined) || "";
                if (txt) controller.enqueue(enc.encode(txt));
              }
            } catch (err) {
              console.error("[gen/stream] fallback failed", err);
            }
          }

          console.log("[gen/stream] done", { dt: Date.now() - t0 });
        } catch (e) {
          console.error("[gen/stream] error", e);
          // Avoid surfacing stream errors to HTTP; just close.
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

