import { NextRequest } from "next/server";
import OpenAI from "openai";
import { LessonSchema, type Lesson } from "@/lib/schema";
import { take } from "@/lib/rate";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { canUserGenerate, logUsage } from "@/lib/usage";
import { buildLessonPrompts } from "@/lib/lesson-prompts";
import { supabaseServer } from "@/lib/supabase-server";
import { createModelClient, fetchUserTier } from "@/lib/model-config";
import { shuffleQuizQuestions } from "@/lib/quiz-shuffle";
import { compressContext } from "@/lib/semantic-compression";
import { calculateDynamicTokenLimit } from "@/lib/dynamic-token-limits";
import { fixLatexEscaping, tryParseJsonWithLatex } from "@/lib/latex-utils";
import type { PipelineConfig } from "@/lib/pipeline-types";

// Function calling tool schema for lesson generation (saves ~80-120 tokens per lesson)
const CREATE_LESSON_TOOL = {
  type: "function" as const,
  function: {
    name: "create_lesson",
    description: "Create a micro-lesson with questions for the specified topic",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Short slug identifier (letters, numbers, dashes only)",
        },
        subject: {
          type: "string",
          description: "The subject area (e.g., 'Algebra 1')",
        },
        topic: {
          type: "string",
          description: "The specific topic being taught",
        },
        title: {
          type: "string",
          description: "Concise 3-7 word title for the lesson",
        },
        content: {
          type: "string",
          description: "Lesson content (80-105 words, max 900 chars). Four sentences: (1) definition, (2) example, (3) pitfall, (4) practice step.",
          minLength: 180,
        },
        difficulty: {
          type: "string",
          enum: ["intro", "easy", "medium", "hard"],
          description: "Difficulty level",
        },
        questions: {
          type: "array",
          description: "Exactly three multiple choice questions",
          items: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The question prompt",
              },
              choices: {
                type: "array",
                description: "Exactly four answer choices",
                items: { type: "string" },
                minItems: 4,
                maxItems: 4,
              },
              correctIndex: {
                type: "number",
                description: "Index of correct answer (0-3)",
                minimum: 0,
                maximum: 3,
              },
              explanation: {
                type: "string",
                description: "Max 15 words explaining why the answer is correct",
                maxLength: 280,
              },
            },
            required: ["prompt", "choices", "correctIndex", "explanation"],
          },
          minItems: 3,
          maxItems: 3,
        },
      },
      required: ["id", "subject", "topic", "title", "content", "difficulty", "questions"],
    },
  },
};


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

const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CachedLesson = Lesson & { cachedAt?: string };


export async function POST(req: NextRequest) {
  console.log('[generate] POST request received');

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  console.log('[generate] Client IP:', ip);

  if (!take(ip)) {
    console.log('[generate] Rate limit exceeded for IP:', ip);
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
    console.log('[generate] User authenticated:', uid ? 'yes' : 'no');
  } catch (authError) {
    console.log('[generate] Auth error:', authError instanceof Error ? authError.message : 'Unknown');
    uid = null;
  }

  if (uid) {
    const limitCheck = await canUserGenerate(sb, uid);
    if (!limitCheck.allowed) {
      console.log('[generate] Usage limit exceeded for user:', uid);
      return new Response(
        JSON.stringify({
          error: "Usage limit exceeded",
          limitData: limitCheck,
        }),
        {
          status: 429,
          headers: { "content-type": "application/json" },
        }
      );
    }
    console.log('[generate] Usage limit check passed');
  }

  // Fetch user tier with cache-busting (always fresh, no stale data)
  const userTier = uid ? await fetchUserTier(sb, uid) : 'free';
  console.log('[generate] User tier:', userTier);

  // Declare these outside try block so they're available in catch for error logging
  let modelIdentifier = 'unknown';
  let provider = 'unknown';

  try {
    console.log('[generate] Parsing request body...');
    const body = await req.json().catch(() => ({}));
    const {
      text,
      subject = "Algebra 1",
      difficulty: difficultyOverride,
      lessonPlan, // Optional: { title, description } from planning phase
      isOptimizedExcerpt = false, // Flag to skip semantic compression for pre-extracted textSections
      pipelineConfig, // Optional: PipelineConfig from upload-router for optimal processing
    } = body ?? {};

    // Extract pipeline settings or use defaults
    const modelSpeed = pipelineConfig?.generation?.modelSpeed || 'fast';
    const enableSemanticCompression = pipelineConfig?.generation?.enableSemanticCompression ?? true;
    const compressionRate = pipelineConfig?.generation?.compressionRate || 0.65;
    const maxTokensPerLesson = pipelineConfig?.generation?.maxTokensPerLesson || 1400;

    console.log('[generate] Pipeline config:', {
      tier: pipelineConfig?.tier || 'default',
      modelSpeed,
      enableSemanticCompression,
      compressionRate,
      maxTokensPerLesson,
    });

    // Create model client with pipeline-specified speed
    const modelClient = createModelClient(userTier, modelSpeed);
    const client = modelClient.client;
    const model = modelClient.model;
    modelIdentifier = modelClient.modelIdentifier;
    provider = modelClient.provider;
    const config = modelClient.config;
    console.log('[generate] Model selected:', { model, provider, tier: userTier, speed: modelSpeed });

    console.log('[generate] Request params:', {
      textLength: text?.length || 0,
      subject,
      difficulty: difficultyOverride || 'auto',
      isOptimizedExcerpt,
    });

    // -------- Safety gates --------
    if (!text || typeof text !== "string" || normalize(text).length < 20) {
      console.log('[generate] Insufficient text length:', text?.length || 0);
      return new Response(JSON.stringify({ error: "Provide at least ~20 characters of study text." }), { status: 400 });
    }
    if (BLOCKLIST.some((re) => re.test(text))) {
      console.log('[generate] Blocked content detected');
      return new Response(JSON.stringify({ error: "Input contains unsafe content. Try a different passage." }), { status: 400 });
    }
    console.log('[generate] Safety checks passed');
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

    // OPTIMIZED: Dynamic token limit calculation with boost for gpt-oss models
    // gpt-oss models use reasoning tokens (like o1), so they need higher limits
    const tokenLimitResult = calculateDynamicTokenLimit({
      subject,
      difficulty,
      topic: text.slice(0, 200), // Use text preview as topic hint
      questionCount: 3,
    });

    // Model configuration (already set up above with tiered system)
    const temperature = 1;

    // gpt-oss models need 3-4x more tokens due to reasoning token consumption
    const baseLimit = Number(process.env.CEREBRAS_LESSON_MAX_TOKENS) || tokenLimitResult.maxTokens;
    const completionMaxTokens = model.includes('gpt-oss')
      ? Math.min(6400, Math.max(2400, baseLimit * 3)) // 3x for reasoning models
      : Math.min(3200, Math.max(900, baseLimit));

    console.log('[generate] Dynamic token limit:', {
      calculated: tokenLimitResult.maxTokens,
      final: completionMaxTokens,
      reasoning: tokenLimitResult.reasoning,
    });

    // Apply semantic compression to input text if enabled by pipeline config
    // OPTIMIZATION: Skip compression for pre-extracted textSection excerpts to preserve educational context
    // textSection excerpts are already optimized (300-800 chars, focused content)
    let compressedText = text;
    if (enableSemanticCompression && !isOptimizedExcerpt && text.length > 500) {
      try {
        const { compressed } = await compressContext(text, {
          rate: compressionRate,
          useCache: true,
          temperature: 0.1,
        });
        compressedText = compressed;
        console.log('[generate] Compressed input text:', {
          original: text.length,
          compressed: compressed.length,
          rate: compressionRate,
          reduction: `${(((text.length - compressed.length) / text.length) * 100).toFixed(1)}%`,
        });
      } catch (err) {
        console.warn('[generate] Compression failed:', err);
      }
    } else if (!enableSemanticCompression) {
      console.log('[generate] Semantic compression disabled by pipeline config');
    } else if (isOptimizedExcerpt) {
      console.log('[generate] Skipping semantic compression - text is pre-optimized excerpt');
    }

    const { system, user: userPrompt } = buildLessonPrompts({
      subject,
      difficulty,
      sourceText: compressedText, // Changed from text
      nextTopicHint: nextTopicHint || undefined,
      lessonPlan: lessonPlan ? { title: lessonPlan.title, description: lessonPlan.description } : undefined,
    });

    console.log("[generate] request-start", { subject, difficulty, tier: userTier, provider, model });

    // Validate API configuration
    if (!config.apiKey) {
      console.error('[generate] Missing API key for provider:', provider);
      throw new Error(`Missing API key for provider: ${provider}`);
    }

    console.log('[generate] Creating chat completion stream with JSON mode...', {
      model,
      provider,
      hasApiKey: !!config.apiKey,
      textLength: text.length,
      temperature,
      maxTokens: completionMaxTokens
    });

    // OPTIMIZED: Try structured outputs first (for when Groq fixes the bug), fallback to prompt-based
    // Known issue: Groq's gpt-oss models currently ignore json_schema (regression reported 3 weeks ago)
    // Workaround: Enhanced prompt engineering ensures JSON compliance even when json_schema is ignored
    // Note: For gpt-oss models, we use default (medium) reasoning effort for high-quality lessons
    const enhancedSystem = system + `\n\nIMPORTANT: Respond with ONLY a valid JSON object matching this exact schema (no markdown, no code fences):
{
  "id": "string (slug format)",
  "subject": "string",
  "topic": "string",
  "title": "string (3-7 words)",
  "content": "string (80-105 words, 4 sentences)",
  "difficulty": "intro" | "easy" | "medium" | "hard",
  "questions": [
    {
      "prompt": "string",
      "choices": ["string", "string", "string", "string"],
      "correctIndex": 0-3,
      "explanation": "string (max 15 words)"
    }
  ] (exactly 3 questions)
}`;

    let stream;
    try {
      // OPTIMIZED: Use prompt-based JSON generation (Groq's gpt-oss models have json_schema bug)
      // When Groq fixes the bug, we can re-enable json_schema structured outputs
      // See: https://community.groq.com/t/structured-outputs-ignored-by-openai-gpt-oss-120b/687

      // gpt-oss models use reasoning tokens (like o1), which improves output quality
      // Token limits have been increased 3x for these models to accommodate reasoning
      stream = await client.chat.completions.create({
        model,
        temperature,
        max_tokens: completionMaxTokens,
        stream: true,
        messages: [
          { role: "system", content: enhancedSystem },
          { role: "user", content: userPrompt },
        ],
      });
      console.log('[generate] Stream created successfully');
    } catch (streamCreationError) {
      console.error('[generate] Failed to create stream:', streamCreationError);
      console.error('[generate] Stream creation error details:', {
        name: streamCreationError instanceof Error ? streamCreationError.name : typeof streamCreationError,
        message: streamCreationError instanceof Error ? streamCreationError.message : String(streamCreationError),
        provider,
        model,
      });
      throw streamCreationError;
    }

    console.log('[generate] Creating response stream...');
    return new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          console.log('[generate] Stream started');
          const encoder = new TextEncoder();
          let full = "";
          let wrote = false;
          let chunkCount = 0;
          let finishReason: string | null = null;
          let usageSummary: { input_tokens?: number | null; output_tokens?: number | null } | null = null;
          try {
            console.log('[generate] Beginning to process chunks...');
            for await (const chunk of stream) {
              chunkCount++;
              if (chunkCount <= 5) {
                console.log(`[generate] Chunk ${chunkCount}:`, JSON.stringify(chunk, null, 2).slice(0, 500));
              }

              // Check if the chunk contains an error
              if (chunk && typeof chunk === 'object' && 'error' in chunk) {
                const error = chunk.error as { message?: string; type?: string; code?: string };
                console.error('[generate] Stream chunk contains error:', error);
                throw new Error(error.message || 'Stream error from provider');
              }

              const choice = chunk?.choices?.[0];
              const delta = choice?.delta ?? {};

              if (chunkCount <= 5) {
                console.log(`[generate] Chunk ${chunkCount} delta:`, JSON.stringify(delta, null, 2));
              }

              // Track finish reason
              if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
                console.log('[generate] Stream finished with reason:', finishReason);
              }

              // OPTIMIZED: Handle JSON mode content (primary path)
              // When using JSON mode, content comes in delta.content
              const content = typeof (delta as { content?: unknown }).content === "string"
                ? (delta as { content: string }).content
                : "";
              if (content) {
                full += content;
                controller.enqueue(encoder.encode(content));
                wrote = true;
                if (chunkCount <= 5) {
                  console.log(`[generate] Chunk ${chunkCount} added ${content.length} chars to full (total: ${full.length})`);
                }
              }

              const chunkUsage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } } | undefined)?.usage;
              if (chunkUsage) {
                usageSummary = {
                  input_tokens: typeof chunkUsage.prompt_tokens === "number" ? chunkUsage.prompt_tokens : null,
                  output_tokens: typeof chunkUsage.completion_tokens === "number" ? chunkUsage.completion_tokens : null,
                };
              }
            }

            console.log('[generate] Stream processing complete:', {
              wrote,
              chunkCount,
              fullLength: full.length,
              finishReason,
              preview: full.slice(0, 200)
            });

            if (!wrote || full.length === 0) {
              console.log('[generate] No data written or empty response, attempting non-streaming fallback...');
              try {
                // OPTIMIZED: Fallback uses same prompt-based approach (no json_schema due to Groq bug)
                const fallback = await client.chat.completions.create({
                  model,
                  temperature,
                  max_tokens: completionMaxTokens,
                  messages: [
                    { role: "system", content: enhancedSystem },
                    { role: "user", content: userPrompt },
                  ],
                });

                // Extract from content
                const message = fallback?.choices?.[0]?.message;
                const backup = (message?.content as string | undefined) ?? "";

                console.log('[generate] Fallback response:', {
                  hasMessage: !!message,
                  hasContent: !!backup,
                  contentLength: backup.length,
                  preview: backup.slice(0, 200)
                });

                if (backup) {
                  full = backup;
                  controller.enqueue(encoder.encode(backup));
                  wrote = true;
                } else {
                  console.warn("[gen/lesson] fallback-empty - no content in message");
                  console.warn("[gen/lesson] Full fallback response:", JSON.stringify(fallback, null, 2));
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
              // Use tryParseJsonWithLatex to handle LaTeX escaping issues
              parsed = tryParseJsonWithLatex(full) ?? JSON.parse(full || "{}");
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
            console.error('[generate] Error in stream processing:', err);
            console.error('[generate] Stream error stack:', err instanceof Error ? err.stack : 'No stack');
            console.error('[generate] Error details:', {
              name: err instanceof Error ? err.name : typeof err,
              message: err instanceof Error ? err.message : String(err),
              cause: err instanceof Error ? err.cause : undefined,
            });

            // Enqueue a more informative error message to the client
            const errorMessage = err instanceof Error
              ? err.message
              : 'Unknown streaming error';
            controller.enqueue(encoder.encode(JSON.stringify({
              error: true,
              message: errorMessage,
              details: 'Check server logs for more information'
            })));
            controller.error(err as Error);
          } finally {
            console.log('[generate] Stream processing complete. Chunks processed:', chunkCount, 'Total chars:', full.length);
            if (usageSummary && (uid || ip)) {
              try {
                await logUsage(sb, uid, ip, modelIdentifier, usageSummary, {
                  metadata: { route: "lesson-stream", subject, difficulty, provider, tier: userTier },
                });
                console.log('[generate] Usage logged successfully');
              } catch (logErr) {
                console.warn("[gen/lesson] usage-log-error", logErr);
              }
            }
            console.log('[generate] Closing stream controller');
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
    console.error('[generate] Error in POST handler:', err);
    console.error('[generate] Error stack:', err instanceof Error ? err.stack : 'No stack');
    const msg = err instanceof Error ? err.message : "Server error";
    // Log error usage for cost tracking (even for anonymous users)
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
      if (uid || ip) {
        await logUsage(sb, uid, ip, modelIdentifier, { input_tokens: null, output_tokens: null }, {
          metadata: {
            route: "lesson-stream",
            error: msg,
            errorType: err instanceof Error ? err.name : typeof err,
            provider,
            tier: userTier,
          }
        });
        console.log('[generate] Error usage logged');
      }
    } catch (logError) {
      console.error('[generate] Error logging usage:', logError);
    }
    console.log('[generate] Returning error response:', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}

