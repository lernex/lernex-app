// app/api/generate/stream/route.ts
export const runtime = "edge";

import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { text, subject = "Algebra 1" } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return new Response("Missing OPENAI_API_KEY", { status: 500 });
    }
    if (typeof text !== "string" || text.trim().length < 40) {
      return new Response("Provide at least ~40 characters of study text.", { status: 400 });
    }

    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-5-nano",
      temperature: 1, // GPT-5 family: keep at 1 to avoid empty outputs
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "Write a concise micro-lesson (80–120 words). No JSON, no code fences. Friendly, factual, 2 short paragraphs max.",
        },
        { role: "user", content: `Subject: ${subject}\nSource:\n${text}` },
      ],
    });

    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const token = chunk.choices?.[0]?.delta?.content ?? "";
            if (token) controller.enqueue(enc.encode(token));
          }
        } catch (e) {
          controller.error(e);
          return;
        }
        controller.close();
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(msg, { status: 500 });
  }
}
