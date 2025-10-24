// app/api/sat-prep/quiz/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";
import { createModelClient, fetchUserTier } from "@/lib/model-config";

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

    // Fetch sample SAT questions from database
    // Try topic-specific query first, fall back to section-only query if no matches
    let { data: sampleQuestions } = await sb
      .from("sat_questions")
      .select("question_text, answer_choices, correct_answer, explanation")
      .eq("section", section)
      .or(`tags.cs.{${topic}},topic.ilike.%${topic}%`)
      .limit(3);

    // If no topic-specific questions found, get any questions from this section
    if (!sampleQuestions || sampleQuestions.length === 0) {
      console.log(`[sat-prep/quiz] no questions for topic "${topic}", trying section-only`);
      const fallbackResult = await sb
        .from("sat_questions")
        .select("question_text, answer_choices, correct_answer, explanation")
        .eq("section", section)
        .limit(3);
      sampleQuestions = fallbackResult.data;
    }

    const hasExamples = sampleQuestions && sampleQuestions.length > 0;
    let exampleContext = "";

    if (hasExamples && sampleQuestions) {
      const questions = sampleQuestions as Array<{ question_text?: string; answer_choices?: unknown; correct_answer?: string; explanation?: string }>;
      exampleContext = "\n\nReal SAT question examples for style reference:\n\n";
      questions.forEach((q, idx) => {
        exampleContext += `Example ${idx + 1}:\n${q.question_text}\n`;
        if (q.answer_choices && Array.isArray(q.answer_choices)) {
          q.answer_choices.forEach((choice: string, i: number) => {
            exampleContext += `${String.fromCharCode(65 + i)}) ${choice}\n`;
          });
        }
        exampleContext += `Correct: ${q.correct_answer}\nExplanation: ${q.explanation}\n\n`;
      });
    } else {
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
      `You are an SAT question generator. Create exactly 3 multiple-choice questions for SAT ${section} on the topic of ${topicLabel}.`,
      "",
      "CRITICAL: You MUST return ONLY valid JSON with no extra text, no markdown, no code fences.",
      "The JSON must match this exact schema:",
      JSON.stringify({
        id: "sat-math-algebra",
        subject: `SAT ${section.charAt(0).toUpperCase() + section.slice(1)}`,
        topic: topicLabel,
        title: `SAT ${topicLabel} Practice`,
        difficulty: "medium",
        questions: [
          {
            prompt: "Question text here...",
            choices: ["Choice A", "Choice B", "Choice C", "Choice D"],
            correctIndex: 0,
            explanation: "Explanation text here...",
          },
        ],
      }),
      "",
      "IMPORTANT REQUIREMENTS:",
      "- Each question must emulate real SAT style and difficulty",
      hasExamples
        ? "- Use the provided real SAT examples to match style, tone, and complexity"
        : "- Match official SAT question patterns",
      formatGuidance,
      "- Each question has exactly 4 choices",
      "- correctIndex is 0-3 (A=0, B=1, C=2, D=3)",
      "- Explanations should be 15-40 words",
      "- For math: use \\( ... \\) for inline, \\[ ... \\] for display",
      "- Questions should test understanding, not just memorization",
      "- Vary difficulty across the 3 questions",
      "",
      "Return ONLY the JSON object, nothing else.",
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
      reasoning_effort: "medium",
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
