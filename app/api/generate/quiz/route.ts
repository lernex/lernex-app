// app/api/generate/quiz/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Stream } from "openai/streaming";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import { supabaseServer } from "@/lib/supabase-server";
import { canUserGenerate, logUsage } from "@/lib/usage";
import { normalizeLatex, scanLatex, hasLatexIssues } from "@/lib/latex";
import { createModelClient, fetchUserTier } from "@/lib/model-config";
import { shuffleQuizQuestions } from "@/lib/quiz-shuffle";
import { getCodeInterpreterParams, adjustTokenLimitForCodeInterpreter, usedCodeInterpreter } from "@/lib/code-interpreter";

const MAX_CHARS = 4300;

export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

    if (user) {
      const limitCheck = await canUserGenerate(sb, user.id);
      if (!limitCheck.allowed) {
        console.log('[generate/quiz] Usage limit exceeded for user:', user.id);
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
      console.log('[generate/quiz] Usage limit check passed');
    }
    
    const { text, subject = "Algebra 1", difficulty = "easy", mode = "mini", quizOnly = false } = await req.json();

    if (typeof text !== "string" || text.trim().length < 20) {
      return new Response(JSON.stringify({ error: "Provide >= 20 characters" }), { status: 400 });
    }

    // Fetch user tier with cache-busting (always fresh, no stale data)
    const userTier = user ? await fetchUserTier(sb, user.id) : 'free';

    // Generate page uses FAST model for immediate response
    const { client, model, modelIdentifier, provider } = createModelClient(userTier, 'fast');

    const src = text.slice(0, MAX_CHARS);

    // Question count guidance and context based on mode and quiz-only setting
    let countRule: string;
    let contextRule: string;

    if (quizOnly) {
      // Quiz-only mode: higher question counts, broader coverage
      if (mode === "short") {
        countRule = "Produce 3-4 questions covering key concepts.";
      } else if (mode === "comprehensive") {
        countRule = "Produce 8-12 questions covering all major concepts.";
      } else {
        // standard
        countRule = "Produce 5-7 questions covering main concepts.";
      }
      contextRule = "Use different examples/scenarios.";
    } else {
      // Lesson + quiz mode: questions must be answerable from the lesson
      countRule = mode === "quick"
        ? "Produce 0-1 questions. Prefer 0 if narrowly scoped."
        : mode === "full"
          ? "Produce 3-5 questions."
          : "Produce 2-3 questions.";
      contextRule = "Test concepts with NEW examples. If lesson shows y=3x+5, use y=2x+7. Never reuse lesson's numbers/scenarios. Test understanding, not memorization.";
    }

    // Detect if subject is math-related to require code interpreter
    const isMathSubject = /math|algebra|geometry|calculus|trigonometry|statistics|physics|chemistry/i.test(subject);

    const system = `JSON quiz. Schema: {id, subject, title, difficulty:"intro"|"easy"|"medium"|"hard", questions:[{prompt, choices[], correctIndex, explanation}]}
Rules: ${countRule} ${contextRule} Stay within subject boundaries. Choices≤8w. Explanations≤25w.
LaTeX: Wrap math in \\(...\\) or \\[...\\]. Single backslash only (\\frac not \\\\frac). Use {...} for multi-char sub/super (x_{10} not x_10).
${isMathSubject ? 'CRITICAL: Use code_interpreter tool (Python) to verify ALL calculations and validate answer correctness. This ensures 100% accuracy.' : ''}`.trim();

    // Token limits - higher for quiz-only mode (base limits before code_interpreter overhead)
    let baseMaxTokens: number;
    if (quizOnly) {
      // Quiz-only mode token limits - increased to prevent truncation
      if (mode === "short") {
        baseMaxTokens = Math.min(1800, Math.max(800, Number(process.env.GROQ_QUIZ_MAX_TOKENS_SHORT ?? "1600") || 1600));
      } else if (mode === "comprehensive") {
        baseMaxTokens = Math.min(5000, Math.max(2400, Number(process.env.GROQ_QUIZ_MAX_TOKENS_COMPREHENSIVE ?? "4200") || 4200));
      } else {
        // standard
        baseMaxTokens = Math.min(3200, Math.max(1600, Number(process.env.GROQ_QUIZ_MAX_TOKENS_STANDARD ?? "2900") || 2900));
      }
    } else {
      // Lesson + quiz mode token limits (original)
      const quickMaxTokensBase = Math.min(
        900,
        Math.max(320, Number(process.env.GROQ_QUIZ_MAX_TOKENS_QUICK ?? "600") || 600),
      );
      const miniMaxTokensBase = Math.min(
        1800,
        Math.max(600, Number(process.env.GROQ_QUIZ_MAX_TOKENS_MINI ?? "1200") || 1200),
      );
      const fullMaxTokensBase = Math.min(
        2600,
        Math.max(900, Number(process.env.GROQ_QUIZ_MAX_TOKENS_FULL ?? "1800") || 1800),
      );
      baseMaxTokens = mode === "quick" ? quickMaxTokensBase : mode === "full" ? fullMaxTokensBase : miniMaxTokensBase;
    }

    // Adjust token limits for code_interpreter tool overhead (+500 tokens for quiz calculations)
    const maxTokens = adjustTokenLimitForCodeInterpreter(baseMaxTokens);

    // Helper functions for streaming quiz generation
    const coerceStr = (v: unknown) => {
      if (typeof v === "string") return v;
      if (v == null) return "";
      return String(v).trim();
    };

    const normalizeField = (field: string, value: unknown) => {
      const text = coerceStr(value);
      return normalizeLatex(text);
    };

    const sanitizeQuestion = (
      rawQuestion: { prompt?: unknown; choices?: unknown; correctIndex?: unknown; explanation?: unknown } | null | undefined,
      idx: number,
    ): { prompt: string; choices: string[]; correctIndex: number; explanation: string } => {
      const question = (rawQuestion ?? {}) as {
        prompt?: unknown;
        choices?: unknown;
        correctIndex?: unknown;
        explanation?: unknown;
      };
      const prompt = normalizeField("q" + idx + ".prompt", question.prompt);
      const baseChoices = Array.isArray(question.choices) ? (question.choices as unknown[]).map(coerceStr) : [];
      const maxChoices = difficulty === "intro" || difficulty === "easy" ? 3 : 4;
      const trimmedChoices = baseChoices.filter((c) => c.length > 0).slice(0, Math.max(2, maxChoices));
      const choices = trimmedChoices.map((choice, choiceIdx) => normalizeField("q" + idx + ".choices[" + choiceIdx + "]", choice));
      const rawIdx = question.correctIndex;
      let idxValue = typeof rawIdx === "number" ? rawIdx : Number(rawIdx);
      if (!Number.isFinite(idxValue) || idxValue < 0 || idxValue >= choices.length) idxValue = 0;
      const explanation = normalizeField("q" + idx + ".explanation", question.explanation);
      return { prompt, choices, correctIndex: idxValue, explanation };
    };

    /**
     * Try to parse partial quiz JSON and extract questions
     */
    function tryParseQuestions(buffer: string): { questions: unknown[] | null } {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.questions)) {
          return { questions: parsed.questions };
        }
      } catch {
        // JSON not complete yet, try to extract partial questions array
        // Look for questions array in partial JSON
        const questionsMatch = buffer.match(/"questions"\s*:\s*\[([^\]]*(?:\][^\]]*)*)/);
        if (questionsMatch) {
          try {
            // Try to parse the questions array portion
            const questionsStr = "[" + questionsMatch[1];
            // Count braces to find complete questions
            let depth = 0;
            let inString = false;
            let escaped = false;
            let lastCompleteIndex = -1;

            for (let i = 0; i < questionsStr.length; i++) {
              const ch = questionsStr[i];
              if (inString) {
                if (escaped) {
                  escaped = false;
                } else if (ch === "\\") {
                  escaped = true;
                } else if (ch === '"') {
                  inString = false;
                }
                continue;
              }
              if (ch === '"') {
                inString = true;
                continue;
              }
              if (ch === '{') {
                depth++;
              } else if (ch === '}') {
                depth--;
                if (depth === 0) {
                  lastCompleteIndex = i;
                }
              }
            }

            if (lastCompleteIndex > 0) {
              const completeStr = questionsStr.slice(0, lastCompleteIndex + 1) + "]";
              const parsed = JSON.parse(completeStr);
              if (Array.isArray(parsed)) {
                return { questions: parsed };
              }
            }
          } catch {
            // Partial parse failed
          }
        }
      }
      return { questions: null };
    }

    // Enable streaming for progressive quiz generation
    const userPrompt = quizOnly
      ? `Subject: ${subject}\nMode: ${mode}\nDifficulty: ${difficulty}\nSource:\n${src}\n\nFollow all rules. Use proper LaTeX.`
      : `Subject: ${subject}\nMode: ${mode}\nDifficulty: ${difficulty}\nLesson:\n${src}\nTest concepts with new examples. Change all numbers/variables.`;

    const enc = new TextEncoder();

    // Create streaming response
    const bodyStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = "";
        let usedFallback = false;
        let completion: { usage?: { prompt_tokens?: number; completion_tokens?: number } } | null = null;
        let sentQuestionCount = 0;
        let codeInterpreterUsed = false;

        const safeEnqueue = (data: string) => {
          try {
            controller.enqueue(enc.encode(data));
          } catch (e) {
            console.error('[generate/quiz] enqueue-error', e);
          }
        };

        const doClose = () => {
          try {
            controller.close();
          } catch (e) {
            console.error('[generate/quiz] close-error', e);
          }
        };

        // Get code interpreter params for quiz generation (outside try block for fallback access)
        // REQUIRE code interpreter for math subjects to ensure calculation accuracy
        const codeInterpreterParams = getCodeInterpreterParams({
          enabled: true,
          toolChoice: isMathSubject ? "required" : "auto", // Force for math, optional for others
          maxExecutionTime: 8000,
          tokenOverhead: 500, // Already accounted for in maxTokens
        });

        try {
          // Start streaming completion
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stream = (await client.chat.completions.create({
            model,
            temperature: 0.4,
            max_tokens: maxTokens,
            // IMPORTANT: Removed response_format to allow code_interpreter tool usage
            // The system prompt enforces JSON output without needing json_object mode
            stream: true,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userPrompt },
            ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(codeInterpreterParams as any), // Add code_interpreter tool (Groq-specific format)
          }) as unknown) as Stream<ChatCompletionChunk>;

          // Process stream chunks
          for await (const chunk of stream) {
            const delta = chunk?.choices?.[0]?.delta;
            const content = delta?.content || "";

            // Capture usage and tool usage from chunks
            const chunkUsage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage;
            if (chunkUsage) {
              completion = { usage: chunkUsage };
            }

            // Check if code interpreter was used (available in chunk metadata)
            const chunkMessage = (chunk as unknown as { choices?: Array<{ message?: { executed_tools?: Array<{ type: string }> } }> })?.choices?.[0]?.message;
            if (chunkMessage && !codeInterpreterUsed) {
              codeInterpreterUsed = usedCodeInterpreter(chunkMessage);
            }

            if (content) {
              buffer += content;

              // Try to parse partial questions
              const partial = tryParseQuestions(buffer);
              if (partial.questions && partial.questions.length > sentQuestionCount) {
                // Send new questions that haven't been sent yet
                const newQuestions = partial.questions.slice(sentQuestionCount);
                for (const question of newQuestions) {
                  // Apply normalization and shuffling to each question
                  const sanitized = sanitizeQuestion(question as { prompt?: unknown; choices?: unknown; correctIndex?: unknown; explanation?: unknown }, sentQuestionCount);
                  const shuffled = shuffleQuizQuestions([sanitized])[0];

                  // Send as newline-delimited JSON
                  safeEnqueue(JSON.stringify(shuffled) + "\n");
                  sentQuestionCount++;
                }
              }
            }
          }

          // Final parse to catch any remaining questions
          const final = tryParseQuestions(buffer);
          if (final.questions && final.questions.length > sentQuestionCount) {
            const remainingQuestions = final.questions.slice(sentQuestionCount);
            for (const question of remainingQuestions) {
              const sanitized = sanitizeQuestion(question as { prompt?: unknown; choices?: unknown; correctIndex?: unknown; explanation?: unknown }, sentQuestionCount);
              const shuffled = shuffleQuizQuestions([sanitized])[0];
              safeEnqueue(JSON.stringify(shuffled) + "\n");
              sentQuestionCount++;
            }
          }

        } catch (err: unknown) {
          console.error('[generate/quiz] stream-error', err);
          // Fallback to non-streaming mode
          try {
            usedFallback = true;
            const fallbackCompletion = await client.chat.completions.create({
              model,
              temperature: 0.4,
              max_tokens: maxTokens,
              // IMPORTANT: Removed response_format to allow code_interpreter tool usage
              messages: [
                { role: "system", content: system },
                { role: "user", content: userPrompt },
              ],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...(codeInterpreterParams as any), // Add code_interpreter tool to fallback
            });

            const raw = (fallbackCompletion.choices?.[0]?.message?.content as string | undefined) ?? "{}";
            completion = fallbackCompletion;

            // Check if code interpreter was used in fallback
            const fallbackMessage = fallbackCompletion.choices?.[0]?.message;
            if (fallbackMessage && !codeInterpreterUsed) {
              codeInterpreterUsed = usedCodeInterpreter(fallbackMessage as { executed_tools?: Array<{ type: string }> });
            }

            // Parse and send all questions
            const parsed = tryParseQuestions(raw);
            if (parsed.questions) {
              for (let i = 0; i < parsed.questions.length; i++) {
                const sanitized = sanitizeQuestion(parsed.questions[i] as { prompt?: unknown; choices?: unknown; correctIndex?: unknown; explanation?: unknown }, i);
                const shuffled = shuffleQuizQuestions([sanitized])[0];
                safeEnqueue(JSON.stringify(shuffled) + "\n");
                sentQuestionCount++;
              }
            }
          } catch (fallbackErr) {
            console.error('[generate/quiz] fallback-error', fallbackErr);
            safeEnqueue(JSON.stringify({ error: "Quiz generation failed" }) + "\n");
          }
        }

        // Log usage
        if (user && completion?.usage) {
          const u = completion.usage;
          const mapped = {
            input_tokens: u.prompt_tokens ?? null,
            output_tokens: u.completion_tokens ?? null,
          };

          try {
            await logUsage(sb, user.id, ip, modelIdentifier, mapped, {
              metadata: {
                route: "generate-quiz",
                subject,
                difficulty,
                mode,
                usedFallback,
                sourceTextLength: src.length,
                provider,
                tier: userTier,
                questionCount: sentQuestionCount,
                codeInterpreterUsed,
              }
            });
          } catch (logErr) {
            console.warn('[generate/quiz] usage-log-error', logErr);
          }
        }

        doClose();
      },
    });

    return new Response(bodyStream, {
      headers: {
        "content-type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    // Note: Error logging handled in main try block with proper model context
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
