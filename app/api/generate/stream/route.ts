export const runtime = "edge";

import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { text, subject = "Algebra 1" } = await req.json();

    if (!process.env.OPENAI_API_KEY) return new Response("Missing OPENAI_API_KEY", { status: 500 });
    if (typeof text !== "string" || text.trim().length < 40) {
      return new Response("Provide at least ~40 characters of study text.", { status: 400 });
    }

    const MAX_CHARS = 2000; // cap input to keep TTFB low
    const src = text.slice(0, MAX_CHARS);

    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const t0 = Date.now();
    const completion = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-5-nano",
      temperature: 1,
      stream: true,
      messages: [
        {
          role: "system",
          content: "Write a concise micro-lesson (80–120 words). No JSON, no code fences. Friendly, factual.",
        },
        { role: "user", content: `Subject: ${subject}\nSource:\n${src}` },
      ],
    });

    const enc = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Early flush to defeat buffering on some edges/CDNs
          controller.enqueue(enc.encode("\n"));
          // Log when request hits the edge
          console.log("[gen/stream] start", { dt: 0 });

          let first = true;
          for await (const chunk of completion) {
            const token = chunk.choices?.[0]?.delta?.content ?? "";
            if (token) {
              if (first) {
                console.log("[gen/stream] first-token", { dt: Date.now() - t0 });
                first = false;
              }
              controller.enqueue(enc.encode(token));
            }
          }

          console.log("[gen/stream] done", { dt: Date.now() - t0 });
        } catch (e) {
          console.error("[gen/stream] error", e);
          controller.error(e);
          return;
        }
        controller.close();
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
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(msg, { status: 500 });
  }
}
