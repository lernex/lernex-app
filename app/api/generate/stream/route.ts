// app/api/generate/stream/route.ts
export const runtime = "edge";

import OpenAI from "openai";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";

const MAX_CHARS = 2200;  // cap input to keep TTFB low
const MAX_TOKENS = 380;  // allow a bit more room to finish math

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

    const fwApiKey = process.env.FIREWORKS_API_KEY;
    if (!fwApiKey) {
      return new Response("Missing FIREWORKS_API_KEY", { status: 500 });
    }
    if (typeof text !== "string" || text.trim().length < 40) {
      return new Response("Provide at least ~40 characters of study text.", { status: 400 });
    }

    const src = text.slice(0, MAX_CHARS);
    const ai = new OpenAI({
      apiKey: fwApiKey,
      baseURL: "https://api.fireworks.ai/inference/v1",
    });

    console.log("[gen/stream] request-start", { dt: 0 });

    let chosenModel = "";
    let usage: { input_tokens?: number | null; output_tokens?: number | null } | null = null;
    const model = "accounts/fireworks/models/gpt-oss-20b";
    chosenModel = model;
    const winner = await ai.chat.completions.create({
      model,
      temperature: 1,
      max_tokens: MAX_TOKENS,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "Write a concise micro-lesson of 80–120 words in exactly two short paragraphs. Do not use JSON, markdown, or code fences. Use standard inline LaTeX like \\( ... \\) for any expressions requiring special formatting (equations, vectors, matrices, etc.). Avoid all HTML tags. Always close any math delimiters you open and prefer inline math (\\( ... \\)) for short expressions. Use \\langle ... \\rangle for vectors and \\|v\\| for norms. Do not escape LaTeX macros with double backslashes except for matrix row breaks (e.g., \\ in pmatrix).\nReasoning: low",
        },
        { role: "user", content: `Subject: ${subject}\nSource Text:\n${src}\nWrite the lesson as instructed.` },
      ],
    });

    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Early tiny chunk to defeat buffering in some paths
          controller.enqueue(enc.encode("\n"));

          let first = true;
          for await (const chunk of winner) {
            const token = (chunk?.choices?.[0]?.delta?.content as string | undefined) ?? "";
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
