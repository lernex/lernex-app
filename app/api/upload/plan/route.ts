import { NextRequest } from "next/server";
import { take } from "@/lib/rate";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { canUserGenerate, logUsage } from "@/lib/usage";
import { createModelClient, fetchUserTier } from "@/lib/model-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TextSection = {
  start: number;
  end: number;
};

type LessonPlan = {
  id: string;
  title: string;
  description: string;
  estimatedLength: number;
  textSection?: TextSection;
};

type PlanResponse = {
  lessons: LessonPlan[];
  totalLessons: number;
  subject: string;
};

export async function POST(req: NextRequest) {
  console.log('[plan] POST request received');

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

  if (!take(ip)) {
    console.log('[plan] Rate limit exceeded for IP:', ip);
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value ?? "";
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );

  let uid: string | null = null;
  try {
    const { data: auth } = await sb.auth.getUser();
    uid = auth?.user?.id ?? null;
  } catch {
    uid = null;
  }

  if (uid) {
    const limitCheck = await canUserGenerate(sb, uid);
    if (!limitCheck.allowed) {
      console.log('[upload/plan] Usage limit exceeded for user:', uid);
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
    console.log('[upload/plan] Usage limit check passed');
  }

  const userTier = uid ? await fetchUserTier(sb, uid) : 'free';
  const { client, model, modelIdentifier, provider } = createModelClient(userTier, 'fast');

  try {
    const body = await req.json();
    const { text, subject: requestedSubject, returnSections = false } = body;

    if (!text || typeof text !== "string" || text.length < 100) {
      return new Response(
        JSON.stringify({ error: "Content too short for lesson planning" }),
        { status: 400 }
      );
    }

    console.log('[plan] Creating lesson plan...', {
      textLength: text.length,
      requestedSubject,
      returnSections,
      provider,
      model
    });

    const systemPrompt = `You are an expert educational content planner. Your task is to analyze educational content and create a structured lesson plan.

Guidelines:
- Create 2-12 mini-lessons depending on content length and complexity
- Each lesson should cover ONE distinct concept or topic
- Lessons should build on each other logically
- Keep lessons bite-sized (5-10 minutes each)
- Identify the primary subject area
- Ensure comprehensive coverage without redundancy
${returnSections ? `- For each lesson, identify the most relevant section of the source text by specifying start and end character indices (0-based, end exclusive)
- Text sections should be 300-800 characters long and contain the core content needed for that lesson
- Sections can overlap if concepts are interconnected, but aim for distinct focus areas
- IMPORTANT: You can ESTIMATE/APPROXIMATE the character indices - no need to count every character precisely. Use rough estimates based on content structure (e.g., "paragraph 2 starts around char 200")` : ''}

Content length guidelines:
- Short content (< 1000 chars): 2-3 lessons
- Medium content (1000-3000 chars): 3-6 lessons
- Long content (> 3000 chars): 6-12 lessons`;

    const userPrompt = `Analyze this educational content and create a structured lesson plan:

${requestedSubject ? `Preferred subject focus: ${requestedSubject}\n\n` : ''}Content (${text.length} characters total):
${text}

Create a lesson plan that breaks this content into logical, bite-sized lessons.${returnSections ? ` For each lesson, specify the textSection with start and end character indices that identify the most relevant portion of the source text for that lesson. You can approximate/estimate the indices - no need to count characters precisely.` : ''}`;

    // Use prompt-based JSON generation (Groq's gpt-oss models don't support json_schema)
    const enhancedSystemPrompt = systemPrompt + `\n\nIMPORTANT: Respond with ONLY a valid JSON object matching this exact schema (no markdown, no code fences):
{
  "subject": "string",
  "lessons": [
    {
      "id": "string (slug format)",
      "title": "string (concise)",
      "description": "string (15-30 words)",
      "estimatedLength": number (400-900)${returnSections ? ',\n      "textSection": { "start": number, "end": number }' : ''}
    }
  ] (2-12 lessons)
}`;

    // gpt-oss models use reasoning tokens (like o1), so they need higher limits
    // Planning is a simpler task - use low reasoning effort to save tokens
    const completionMaxTokens = model.includes('gpt-oss')
      ? 4000 // Lower limit OK since we use reasoning_effort: "low"
      : 2500; // Higher limit for planning even on non-reasoning models

    const completionParams: {
      model: string;
      temperature: number;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
      reasoning_effort?: "low" | "medium" | "high";
    } = {
      model,
      temperature: 0.7,
      max_tokens: completionMaxTokens,
      messages: [
        { role: "system", content: enhancedSystemPrompt },
        { role: "user", content: userPrompt },
      ],
    };

    // Use low reasoning effort for gpt-oss models (planning is straightforward)
    if (model.includes('gpt-oss')) {
      completionParams.reasoning_effort = "low";
    }

    const completion = await client.chat.completions.create(completionParams);

    const message = completion?.choices?.[0]?.message;
    const content = message?.content;

    console.log('[plan] Response analysis:', {
      hasCompletion: !!completion,
      hasChoices: !!completion?.choices,
      choicesLength: completion?.choices?.length || 0,
      hasMessage: !!message,
      hasContent: !!content,
      contentType: typeof content,
      contentLength: typeof content === 'string' ? content.length : 0,
      preview: typeof content === 'string' ? content.slice(0, 200) : 'N/A',
      fullMessage: JSON.stringify(message, null, 2).slice(0, 500)
    });

    if (!content || typeof content !== 'string') {
      console.error('[plan] No content in response');
      console.error('[plan] Full completion object:', JSON.stringify(completion, null, 2));
      return new Response(
        JSON.stringify({ error: "Failed to generate lesson plan" }),
        { status: 500 }
      );
    }

    const plan: PlanResponse = JSON.parse(content);

    console.log('[plan] Plan created successfully:', {
      totalLessons: plan.lessons.length,
      subject: plan.subject
    });

    // Log API usage for cost tracking
    const usage = completion?.usage;
    if (usage && (uid || ip)) {
      try {
        await logUsage(sb, uid, ip, modelIdentifier, {
          input_tokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
          output_tokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
        }, {
          metadata: {
            route: "upload-plan",
            subject: plan.subject,
            lessonCount: plan.lessons.length,
            provider,
            tier: userTier
          },
        });
        console.log('[plan] Usage logged successfully');
      } catch (logError) {
        console.error('[plan] Failed to log usage:', logError);
      }
    }

    return new Response(
      JSON.stringify(plan),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      }
    );
  } catch (err) {
    console.error('[plan] Error:', err);
    const msg = err instanceof Error ? err.message : "Planning failed";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
