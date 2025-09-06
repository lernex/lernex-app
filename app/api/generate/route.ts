import { NextRequest } from "next/server";
import OpenAI from "openai";
import { LessonSchema } from "@/lib/schema";
import { take } from "@/lib/rate";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { checkUsageLimit, logUsage } from "@/lib/usage";


export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BLOCKLIST = [
  /suicide|self[-\s]?harm/i,
  /explicit|porn|sexual/i,
  /hate\s*speech|racial\s*slur/i,
  /bomb|weapon|make\s+drugs/i,
];

function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}


export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!take(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured: missing OPENAI_API_KEY" }), { status: 500 });
  }

  // Supabase client (forward the user session for RLS)
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value ?? "";
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );

  // get user id if signed in
  let uid: string | null = null;
  try {
    const { data: auth } = await sb.auth.getUser();
    uid = auth?.user?.id ?? null;
  } catch {
    uid = null;
  }

  if (uid) {
    const ok = await checkUsageLimit(sb, uid);
    if (!ok) {
      return new Response(JSON.stringify({ error: "Usage limit exceeded" }), { status: 403 });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      text,
      subject = "Algebra 1",
      difficulty: difficultyOverride,
    } = body ?? {};

    // -------- Safety gates --------
    if (!text || typeof text !== "string" || normalize(text).length < 30) {
      return new Response(JSON.stringify({ error: "Provide at least ~30 characters of study text." }), { status: 400 });
    }
    if (BLOCKLIST.some((re) => re.test(text))) {
      return new Response(JSON.stringify({ error: "Input contains unsafe content. Try a different passage." }), { status: 400 });
    }
    // ------------------------------

    // -------- Cache check ----------
    const key = sha256(`${uid ?? ip}|${subject}|${normalize(text)}`);
    const { data: cachedRows } = await sb
      .from("lesson_cache")
      .select("lesson")
      .eq("subject", subject)
      .eq("input_hash", key)
      .limit(1);

    if (cachedRows && cachedRows[0]?.lesson) {
      const valid = LessonSchema.safeParse(cachedRows[0].lesson);
      if (valid.success) {
        return new Response(JSON.stringify(valid.data), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }
    }
    // -------------------------------

    // -------- Infer user difficulty from attempts/state ----------
    let difficulty: "intro" | "easy" | "medium" | "hard" = "easy";
    let nextTopicHint = "";

    if (difficultyOverride && ["intro", "easy", "medium", "hard"].includes(difficultyOverride)) {
      difficulty = difficultyOverride as typeof difficulty;
    } else if (uid) {
      // Normalize attempts join shape (object | array | null)
      type RawAttempt = {
        correct_count?: number | null;
        total?: number | null;
        lessons?: { subject?: unknown } | { subject?: unknown }[] | null;
      };
      type FlatAttempt = { correct_count: number; total: number; subject: string | null };

      const { data: recent } = await sb
        .from("attempts")
        .select("correct_count, total, lessons(subject)")
        .order("created_at", { ascending: false })
        .limit(20);

      const flat: FlatAttempt[] = (recent ?? []).map((r: unknown) => {
        const row = r as RawAttempt;
        let subj: string | null = null;
        if (Array.isArray(row.lessons)) {
          const first = row.lessons[0];
          subj = (first?.subject as string | undefined) ?? null;
        } else if (row.lessons && typeof row.lessons === "object") {
          subj = (row.lessons.subject as string | undefined) ?? null;
        }
        return {
          correct_count:
            typeof row.correct_count === "number"
              ? row.correct_count
              : (row.correct_count ?? 0) || 0,
          total:
            typeof row.total === "number"
              ? row.total
              : (row.total ?? 0) || 0,
          subject: subj,
        };
      });

      const subjectAttempts = flat.filter((r) => r.subject === subject);
      const correct = subjectAttempts.reduce((a, r) => a + r.correct_count, 0);
      const total = subjectAttempts.reduce((a, r) => a + r.total, 0);
      const acc = total > 0 ? correct / total : 0.6;

      if (acc < 0.5) difficulty = "intro";
      else if (acc < 0.65) difficulty = "easy";
      else if (acc < 0.8) difficulty = "medium";
      else difficulty = "hard";

      // optional: user-specific next topic hint
      const { data: state } = await sb
        .from("user_subject_state")
        .select("next_topic")
        .eq("user_id", uid)
        .eq("subject", subject)
        .maybeSingle();
      nextTopicHint = (state?.next_topic as string | undefined) ?? "";
    }
    // ------------------------------------------------------------

    // OpenAI call
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-5-nano";
    const temperature = Number(process.env.OPENAI_TEMPERATURE ?? "1");

    const system = `
You create exactly one micro-lesson of 30–80 words and between one and three MCQs with explanations.
Audience: ${subject} student. Adapt to the indicated difficulty.

Return only JSON matching exactly:
{
  "id": string,                   // short slug
  "subject": string,              // e.g., "Algebra 1"
  "topic": string,                // atomic concept (e.g., "Slope of a line")
  "title": string,                // 2–6 words
  "content": string,              // 30–80 words, friendly, factual
  "difficulty": "intro"|"easy"|"medium"|"hard",
  "questions": [
    { "prompt": string, "choices": string[], "correctIndex": number, "explanation": string }
  ]
}
Rules:
- factual and concise; align with the provided passage.
- No extra commentary or code fences.
- If passage is too advanced for the difficulty, simplify the content.
- Prefer 2–3 choices for intro/easy; 3–4 for medium/hard.
- Use standard inline LaTeX like \\( ... \\) for any expressions requiring special formatting (equations, vectors, matrices, etc.). Avoid all HTML tags.
`.trim();

    const userPrompt = `
Subject: ${subject}
Target Difficulty: ${difficulty}
${nextTopicHint ? `Next Topic Hint: ${nextTopicHint}\n` : ""}Source Text:
"""
${text}
"""
Generate the lesson and questions as specified. Output only the JSON object.
`.trim();

    const stream = await client.responses.stream({
      model,
      temperature,
      reasoning: { effort: "minimal" },
      text: { verbosity: "low" },
      response_format: { type: "json_object" },
      input: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    return new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          let full = "";
          let usage: { prompt_tokens?: number | null; completion_tokens?: number | null } | null = null;
          try {
            for await (const event of stream) {
              if (event.type === "response.output_text.delta") {
                full += event.delta;
                controller.enqueue(encoder.encode(event.delta));
              } else if (event.type === "response.completed") {
                usage = event.response?.usage ?? null;
              }
            }
            let parsed: unknown = null;
            try {
              parsed = JSON.parse(full || "{}");
            } catch {
              // ignore parse errors; client will handle
              return;
            }
            const validated = LessonSchema.safeParse(parsed);
            if (validated.success) {
              try {
                await sb.from("lesson_cache").insert({
                  user_id: uid,
                  subject,
                  input_hash: key,
                  lesson: validated.data,
                });
              } catch {
                /* ignore cache errors */
              }
              if (usage) {
                try {
                  await logUsage(sb, uid, ip, model, usage);
                } catch {
                  /* ignore usage log errors */
                }
              }
            }
          } catch (err) {
            controller.error(err as Error);
          } finally {
            controller.close();
          }
        },
      }),
      {
        headers: { "content-type": "text/plain" },
        status: 200,
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
