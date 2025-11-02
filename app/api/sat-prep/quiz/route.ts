// app/api/sat-prep/quiz/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";
import { createModelClient, fetchUserTier } from "@/lib/model-config";
import { getCachedSampleQuestions } from "@/lib/sat-sample-cache";
import { shuffleQuizQuestions } from "@/lib/quiz-shuffle";
import { normalizeLatex } from "@/lib/latex";

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    const uid = user?.id ?? null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

    if (uid) {
      const ok = await checkUsageLimit(sb, uid);
      if (!ok) {
        console.warn("[sat-prep/quiz] usage-limit", { uid });
        return new Response("Usage limit exceeded", { status: 403 });
      }
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

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.9,
      max_tokens: 3200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const responseText = completion?.choices?.[0]?.message?.content?.trim() ?? "";
    console.log("[sat-prep/quiz] raw-response-length", responseText.length);

    if (!responseText) {
      throw new Error("Empty response from AI");
    }

    // Extract JSON from response
    let jsonText = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error("[sat-prep/quiz] json-parse-error", { responseText, parseErr });
      throw new Error("Failed to parse AI response as JSON");
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
