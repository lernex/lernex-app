import { NextRequest } from "next/server";
import OpenAI from "openai";
import { LessonSchema } from "@/lib/schema";
import { take } from "@/lib/rate";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { checkUsageLimit, logUsage } from "@/lib/usage";
import { buildLessonPrompts } from "@/lib/lesson-prompts";


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

  const cerebrasApiKey = process.env.CEREBRAS_API_KEY;
  if (!cerebrasApiKey) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured: missing CEREBRAS_API_KEY" }),
      { status: 500 }
    );
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
    if (!text || typeof text !== "string" || normalize(text).length < 20) {
      return new Response(JSON.stringify({ error: "Provide at least ~20 characters of study text." }), { status: 400 });
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

    // Model/provider selection (Cerebras)
    const cerebrasBaseUrl = process.env.CEREBRAS_BASE_URL ?? "https://api.cerebras.ai/v1";
    const model = process.env.CEREBRAS_LESSON_MODEL ?? "gpt-oss-120b";
    const temperature = 1;
    const completionMaxTokens = Math.min(
      3200,
      Math.max(900, Number(process.env.GROQ_LESSON_MAX_TOKENS ?? "2200") || 2200),
    );

    const { system, user: userPrompt } = buildLessonPrompts({
      subject,
      difficulty,
      sourceText: text,
      nextTopicHint: nextTopicHint || undefined,
    });

    // Cerebras Chat Completions (streaming)
    const client = new OpenAI({
      apiKey: cerebrasApiKey,
      baseURL: cerebrasBaseUrl,
    });
    const stream = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: completionMaxTokens,
      reasoning_effort: "medium",
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    return new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          let full = "";
          let wrote = false;
          let usageSummary: { input_tokens?: number | null; output_tokens?: number | null } | null = null;
          try {
            for await (const chunk of stream) {
              const choice = chunk?.choices?.[0];
              const delta = choice?.delta ?? {};
              const content = typeof (delta as { content?: unknown }).content === "string"
                ? (delta as { content: string }).content
                : "";
              if (content) {
                full += content;
                controller.enqueue(encoder.encode(content));
                wrote = true;
              }
              const chunkUsage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } } | undefined)?.usage;
              if (chunkUsage) {
                usageSummary = {
                  input_tokens: typeof chunkUsage.prompt_tokens === "number" ? chunkUsage.prompt_tokens : null,
                  output_tokens: typeof chunkUsage.completion_tokens === "number" ? chunkUsage.completion_tokens : null,
                };
              }
            }
            if (!wrote) {
              try {
                const fallback = await client.chat.completions.create({
                  model,
                  temperature,
                  max_tokens: completionMaxTokens,
                  reasoning_effort: "medium",
                  messages: [
                    { role: "system", content: system },
                    { role: "user", content: userPrompt },
                  ],
                });
                const backup = (fallback?.choices?.[0]?.message?.content as string | undefined) ?? "";
                if (backup) {
                  full = backup;
                  controller.enqueue(encoder.encode(backup));
                  wrote = true;
                } else {
                  console.warn("[gen/lesson] fallback-empty");
                }
                const u = fallback?.usage;
                if (u) {
                  usageSummary = {
                    input_tokens: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
                    output_tokens: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
                  };
                }
              } catch (fallbackErr) {
                console.error("[gen/lesson] fallback-error", fallbackErr);
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
            }
          } catch (err) {
            controller.error(err as Error);
          } finally {
            if (usageSummary && (uid || ip)) {
              try {
                await logUsage(sb, uid, ip, model, usageSummary, {
                  metadata: { route: "lesson-stream", subject, difficulty },
                });
              } catch (logErr) {
                console.warn("[gen/lesson] usage-log-error", logErr);
              }
            }
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

