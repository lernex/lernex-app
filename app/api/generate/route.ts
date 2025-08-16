import { NextRequest } from "next/server";
import OpenAI from "openai";
import { LessonSchema } from "@/lib/schema";
import { take } from "@/lib/rate";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

// Never prerender this route
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // simple in-memory rate limit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!take(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
  }

  // Create OpenAI client *inside* handler
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured: missing OPENAI_API_KEY" }), { status: 500 });
  }
  const client = new OpenAI({ apiKey });

  try {
    const body = await req.json().catch(() => ({}));
    const { text, subject = "General" } = body ?? {};

    if (!text || typeof text !== "string" || text.length < 40) {
      return new Response(JSON.stringify({ error: "Provide at least ~40 characters of study text." }), { status: 400 });
    }

    const system = `
Return STRICT JSON:
{
  "id": string,
  "subject": string,
  "title": string,
  "content": string,     // 30–100 words
  "questions": [
    { "prompt": string, "choices": string[], "correctIndex": number },
    { "prompt": string, "choices": string[], "correctIndex": number },
    { "prompt": string, "choices": string[], "correctIndex": number }
  ]
}
Rules: concise, factual, no markdown or commentary.
`.trim();

    const userPrompt = `
Subject: ${subject}
Source text:
"""
${text}
"""
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-5-nano",       // you can A/B with an env later
      temperature: 1,          // structured/consistent
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Model returned invalid JSON." }), { status: 502 });
    }

    const validated = LessonSchema.safeParse(parsed);
    if (!validated.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: validated.error.flatten() }), { status: 422 });
    }

    // ---------- BEST-EFFORT: persist lesson if the user is logged in ----------
    try {
      // ⬇️ inside your POST handler, before creating the Supabase client
      const cookieStore = await cookies(); // ✅ Next 15 expects await here
      const accessToken = cookieStore.get("sb-access-token")?.value ?? "";

      // Create a Supabase client that forwards the user session via Authorization
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const sb = createClient(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });

      // who is the user?
      const { data: auth } = await sb.auth.getUser();
      const uid = auth?.user?.id;

      if (uid) {
        const { subject, title, content, questions } = validated.data as {
          subject: string; title: string; content: string; questions: unknown;
        };

        await sb.from("lessons").insert({
          user_id: uid,
          subject,
          title,
          content,
          questions, // jsonb
        });
      }
    } catch {
      // ignore persistence errors in MVP; generation still succeeds
    }
    // ------------------------------------------------------------------------

    return new Response(JSON.stringify(validated.data), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
