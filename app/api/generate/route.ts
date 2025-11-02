import { NextRequest } from "next/server";
import OpenAI from "openai";
import { LessonSchema, type Lesson } from "@/lib/schema";
import { take } from "@/lib/rate";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { checkUsageLimit, logUsage } from "@/lib/usage";
import { buildLessonPrompts } from "@/lib/lesson-prompts";
import { supabaseServer } from "@/lib/supabase-server";
import { createModelClient, fetchUserTier } from "@/lib/model-config";
import { shuffleQuizQuestions } from "@/lib/quiz-shuffle";


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

// Fix common LaTeX escaping issues in AI-generated JSON
// The AI sometimes under-escapes LaTeX commands in JSON strings
function fixLatexEscaping(str: string): string {
  let result = str;

  // Fix unescaped LaTeX delimiters: \( → \\(, \) → \\), \[ → \\[, \] → \\]
  // But don't double-escape if already escaped (\\( should stay \\()
  result = result.replace(/([^\\])\\([()[\]])/g, '$1\\\\$2');
  result = result.replace(/^\\([()[\]])/g, '\\\\$1');

  // Fix common LaTeX commands that appear unescaped
  // Pattern matches: \command but not \\command
  const latexCommands = [
    'frac', 'sqrt', 'sum', 'int', 'lim', 'sin', 'cos', 'tan', 'log', 'ln',
    'prod', 'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi', 'infty',
    'leq', 'geq', 'neq', 'cdot', 'times', 'pm', 'to', 'partial', 'nabla',
    'mathbf', 'vec', 'hat', 'bar', 'underline', 'overline'
  ];
  const commandPattern = new RegExp(`([^\\\\])\\\\(${latexCommands.join('|')})\\b`, 'g');
  result = result.replace(commandPattern, '$1\\\\\\\\$2');
  const startPattern = new RegExp(`^\\\\(${latexCommands.join('|')})\\b`, 'g');
  result = result.replace(startPattern, '\\\\\\\\$1');

  return result;
}

// Try to parse JSON with LaTeX escaping fixes
function tryParseJson(text: string): unknown | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  const segments: string[] = [];

  // Try as-is first
  segments.push(cleaned);

  // Remove markdown code fences
  if (cleaned.startsWith("```")) {
    const withoutFence = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    if (withoutFence) segments.push(withoutFence);
  }

  // Extract JSON object (greedy match)
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) segments.push(objectMatch[0]);

  // Try to find JSON after any preamble text
  const jsonStartIndex = cleaned.indexOf('{');
  if (jsonStartIndex > 0) {
    segments.push(cleaned.slice(jsonStartIndex));
  }

  // Add LaTeX-fixed versions
  const fixedCleaned = fixLatexEscaping(cleaned);
  if (fixedCleaned !== cleaned) {
    segments.push(fixedCleaned);
    const fixedObjectMatch = fixedCleaned.match(/\{[\s\S]*\}/);
    if (fixedObjectMatch) segments.push(fixedObjectMatch[0]);
  }

  for (const candidate of segments) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        try {
          return JSON.parse(parsed);
        } catch {
          continue;
        }
      }
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
}

const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CachedLesson = Lesson & { cachedAt?: string };


export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!take(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
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

  // Fetch user tier with cache-busting (always fresh, no stale data)
  const userTier = uid ? await fetchUserTier(sb, uid) : 'free';

  // Use FAST model for immediate lesson generation
  const { client, model, modelIdentifier, provider } = createModelClient(userTier, 'fast');

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
    const topicLabel = `adhoc:${key}`;
    const cachedLessons: CachedLesson[] = [];

    if (uid) {
      const { data: cacheRow } = await sb
        .from("user_topic_lesson_cache")
        .select("lessons")
        .eq("user_id", uid)
        .eq("subject", subject)
        .eq("topic_label", topicLabel)
        .maybeSingle();

      if (Array.isArray(cacheRow?.lessons)) {
        const nowMs = Date.now();
        for (const entry of cacheRow!.lessons as CachedLesson[]) {
          if (!entry || typeof entry !== "object") continue;
          const cachedAt = typeof entry.cachedAt === "string" ? entry.cachedAt : undefined;
          const cachedAtMs = cachedAt ? Date.parse(cachedAt) : NaN;
          if (Number.isFinite(cachedAtMs) && nowMs - cachedAtMs > MAX_CACHE_AGE_MS) continue;
          const validated = LessonSchema.safeParse(entry);
          if (!validated.success) continue;
          const stamped: CachedLesson = { ...validated.data, cachedAt: cachedAt ?? new Date().toISOString() };
          cachedLessons.push(stamped);
        }
        if (cachedLessons.length > 0) {
          return new Response(JSON.stringify(cachedLessons[0]), {
            headers: { "content-type": "application/json" },
            status: 200,
          });
        }
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

    // Model configuration (already set up above with tiered system)
    const temperature = 1;
    const completionMaxTokens = Math.min(
      3200,
      Math.max(900, Number(process.env.CEREBRAS_LESSON_MAX_TOKENS ?? "2200") || 2200),
    );

    const { system, user: userPrompt } = buildLessonPrompts({
      subject,
      difficulty,
      sourceText: text,
      nextTopicHint: nextTopicHint || undefined,
    });

    console.log("[generate] request-start", { subject, difficulty, tier: userTier, provider, model });

    // Create chat completion with tiered model
    const stream = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: completionMaxTokens,
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
              // Use tryParseJson to handle LaTeX escaping issues
              parsed = tryParseJson(full) ?? JSON.parse(full || "{}");
            } catch {
              // ignore parse errors; client will handle
              return;
            }
            const validated = LessonSchema.safeParse(parsed);
            if (validated.success) {
              // Shuffle answer choices to prevent AI bias toward position A
              if (Array.isArray(validated.data.questions)) {
                validated.data.questions = shuffleQuizQuestions(validated.data.questions);
              }

              if (uid) {
                const stampedLesson: CachedLesson = {
                  ...validated.data,
                  cachedAt: new Date().toISOString(),
                };
                try {
                  const existing = cachedLessons.filter(
                    (entry) => entry && entry.id !== stampedLesson.id
                  );
                  const nextCache = [stampedLesson, ...existing].slice(0, 5);
                  await sb
                    .from("user_topic_lesson_cache")
                    .upsert(
                      {
                        user_id: uid,
                        subject,
                        topic_label: topicLabel,
                        lessons: nextCache,
                        updated_at: stampedLesson.cachedAt,
                      },
                      { onConflict: "user_id,subject,topic_label" }
                    );
                } catch {
                  /* ignore cache errors */
                }
              }
            }
          } catch (err) {
            controller.error(err as Error);
          } finally {
            if (usageSummary && (uid || ip)) {
              try {
                await logUsage(sb, uid, ip, modelIdentifier, usageSummary, {
                  metadata: { route: "lesson-stream", subject, difficulty, provider, tier: userTier },
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
    // Log error usage if we have user context
    try {
      const sb = await supabaseServer();
      let uid: string | null = null;
      try {
        const { data: { user } } = await sb.auth.getUser();
        uid = user?.id ?? null;
      } catch {
        uid = null;
      }
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
      if (uid) {
        await logUsage(sb, uid, ip, modelIdentifier, { input_tokens: null, output_tokens: null }, {
          metadata: {
            route: "lesson-stream",
            error: msg,
            errorType: err instanceof Error ? err.name : typeof err,
            provider,
            tier: userTier,
          }
        });
      }
    } catch {
      /* ignore logging errors */
    }
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}

