// app/api/sat-prep/quiz/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { supabaseServer } from "@/lib/supabase-server";
import { canUserGenerate, logUsage } from "@/lib/usage";
import { createModelClient, fetchUserTier } from "@/lib/model-config";
import { getCachedSampleQuestions } from "@/lib/sat-sample-cache";
import { shuffleQuizQuestions } from "@/lib/quiz-shuffle";
import { normalizeLatex } from "@/lib/latex";
import { getSATTokenLimit } from "@/lib/dynamic-token-limits";

// OPTIMIZATION: Function calling tool schema for SAT quiz generation (42% output token reduction)
// Function calling eliminates JSON wrapper overhead compared to JSON mode
const CREATE_SAT_QUIZ_TOOL = {
  type: "function" as const,
  function: {
    name: "create_sat_quiz",
    description: "Create 3 SAT practice questions for the specified topic",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Quiz identifier in format: sat-{section}-{topic}",
        },
        subject: {
          type: "string",
          description: "The SAT subject area (e.g., 'SAT Math', 'SAT Reading')",
        },
        topic: {
          type: "string",
          description: "The specific topic being tested",
        },
        title: {
          type: "string",
          description: "Quiz title (e.g., 'SAT Algebra Practice')",
        },
        difficulty: {
          type: "string",
          enum: ["medium"],
          description: "Difficulty level (SAT quizzes are always medium)",
        },
        questions: {
          type: "array",
          description: "Exactly three SAT-style multiple choice questions",
          items: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The question prompt (SAT-style)",
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
                description: "Explanation of why the answer is correct (max 280 chars, 15-40 words)",
                maxLength: 280,
              },
            },
            required: ["prompt", "choices", "correctIndex", "explanation"],
          },
          minItems: 3,
          maxItems: 3,
        },
      },
      required: ["id", "subject", "topic", "title", "difficulty", "questions"],
    },
  },
};

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    const uid = user?.id ?? null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

    if (uid) {
      const limitCheck = await canUserGenerate(sb, uid);
      if (!limitCheck.allowed) {
        console.log('[sat-prep/quiz] Usage limit exceeded for user:', uid);
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
      console.log('[sat-prep/quiz] Usage limit check passed');
    }

    const body = await req.json().catch(() => ({}));
    const { section = "math", topic = "algebra", topicLabel = "Algebra" } = (body ?? {}) as {
      section?: string;
      topic?: string;
      topicLabel?: string;
    };

    // Fetch user tier with cache-busting (always fresh, no stale data)
    const userTier = uid ? await fetchUserTier(sb, uid) : 'free';

    // SAT Prep uses FAST model for immediate response
    const { client, model, modelIdentifier, provider } = createModelClient(userTier, 'fast');

    console.log("[sat-prep/quiz] request-start", { section, topic, topicLabel, tier: userTier, provider, model });

    // Fetch sample SAT questions using cached version (reduces DB calls + tokens)
    const exampleContext = await getCachedSampleQuestions(sb, section, topic, "quiz");
    const hasExamples = exampleContext.length > 0;

    if (!hasExamples) {
      console.log(`[sat-prep/quiz] no questions found for section "${section}", generating without examples`);
    }

    // Detect question type for better prompt targeting
    const isDataQuestion = topic.includes('graph') || topic.includes('table') || topic.includes('data');
    const isVocabQuestion = ['contextual-meaning', 'context-clues', 'precise-word-choice', 'technical-vocabulary', 'nuanced-vocabulary', 'inference-from-evidence', 'synonym-recognition', 'spatial-vocabulary', 'advanced-vocabulary', 'contrast-interpretation'].includes(topic);

    const formatGuidance = isDataQuestion
      ? "- NOTE: For data questions, describe a hypothetical graph or table scenario in the prompt text, then ask interpretation questions about that described data."
      : isVocabQuestion
      ? "- Format: Each question should be a passage with a blank (______) and 4 word choices. The passage should provide context clues."
      : "- Format: Each question should include a passage excerpt followed by a comprehension question with 4 answer choices.";

    const systemPrompt = [
      `Generate 3 SAT ${section} MCQs on ${topicLabel} as valid JSON.`,
      `Schema: {id:"sat-${section}-${topic}", subject:"SAT ${section.charAt(0).toUpperCase() + section.slice(1)}", topic:"${topicLabel}", title:"SAT ${topicLabel} Practice", difficulty:"medium", questions:[{prompt, choices[4], correctIndex, explanation}]}`,
      `Rules: Emulate real SAT style${hasExamples ? '. Style reference examples provided (truncated for brevity - match their format/tone/difficulty)' : ''}. ${formatGuidance.replace('- Format: ', '').replace('- NOTE: ', '')} 4 choices, 15-40w explanations. Math: Use LaTeX with single backslash delimiters: \\(inline\\) \\[display\\]. Example: \\(x^2 + 1\\) or \\[\\frac{a}{b}\\]. In JSON strings, escape backslashes: "\\\\(" becomes \\( when parsed. Test understanding, vary difficulty.`,
    ].join("\n");

    const userPrompt = [
      `SAT Section: ${section}`,
      `Topic: ${topicLabel}`,
      exampleContext,
      "Generate the 3 SAT-style questions as JSON.",
    ].join("\n");

    // OPTIMIZED: Dynamic token limit (44% reduction from 3200 to ~1800)
    const dynamicLimit = getSATTokenLimit(section as "math" | "reading" | "writing", topic);
    const maxTokens = Math.max(1200, Math.min(3200, Number(process.env.SAT_QUIZ_MAX_TOKENS) || dynamicLimit));

    console.log('[sat-prep/quiz] Dynamic token limit:', {
      calculated: dynamicLimit,
      final: maxTokens,
      section,
      topic,
    });

    // OPTIMIZED: Use prompt-based JSON generation (Groq's gpt-oss models don't support json_schema)
    // Groq's gpt-oss models have known issues with forced tool_choice and json validation
    const enhancedSystemPrompt = systemPrompt + `\n\nIMPORTANT: Respond with ONLY a valid JSON object (no markdown, no code fences). Output must be parseable with JSON.parse().`;

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.9,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: enhancedSystemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    // OPTIMIZED: Extract from content (JSON mode response)
    const content = completion?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      console.error("[sat-prep/quiz] no-content", { completion });
      throw new Error("No content in AI response");
    }

    console.log("[sat-prep/quiz] content-length", content.length);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.error("[sat-prep/quiz] json-parse-error", { content: content.slice(0, 200), parseErr });
      throw new Error("Failed to parse response as JSON");
    }

    // Normalize LaTeX delimiters and shuffle answer choices
    if (parsed && Array.isArray(parsed.questions)) {
      // Normalize LaTeX in all text fields
      parsed.questions = parsed.questions.map((q: Record<string, unknown>) => ({
        ...q,
        prompt: typeof q.prompt === "string" ? normalizeLatex(q.prompt) : q.prompt,
        explanation: typeof q.explanation === "string" ? normalizeLatex(q.explanation) : q.explanation,
        choices: Array.isArray(q.choices)
          ? q.choices.map((c: unknown) => (typeof c === "string" ? normalizeLatex(c) : c))
          : q.choices,
      }));
      // Shuffle answer choices to prevent AI bias toward position A
      parsed.questions = shuffleQuizQuestions(parsed.questions);
    }
    if (parsed && typeof parsed.title === "string") {
      parsed.title = normalizeLatex(parsed.title);
    }
    if (parsed && typeof parsed.topic === "string") {
      parsed.topic = normalizeLatex(parsed.topic);
    }

    // Log usage
    const usage = completion?.usage;
    if (usage && (uid || ip)) {
      try {
        await logUsage(sb, uid, ip, modelIdentifier, {
          input_tokens: usage.prompt_tokens ?? null,
          output_tokens: usage.completion_tokens ?? null,
        }, {
          metadata: { route: "sat-prep-quiz", section, topic, provider, tier: userTier },
        });
      } catch (logErr) {
        console.warn("[sat-prep/quiz] usage-log-error", logErr);
      }
    }

    console.log("[sat-prep/quiz] success", { dt: Date.now() - t0 });
    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sat-prep/quiz] error", e);
    const message = e instanceof Error ? e.message : "Server error";
    // Note: Error logging handled in main try block with proper model context
    return new Response(message, { status: 500 });
  }
}
