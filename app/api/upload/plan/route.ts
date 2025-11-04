import { NextRequest } from "next/server";
import { take } from "@/lib/rate";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { checkUsageLimit } from "@/lib/usage";
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

const PLANNING_TOOL = {
  type: "function" as const,
  function: {
    name: "create_lesson_plan",
    description: "Create a structured lesson plan from educational content",
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "The primary subject area (e.g., 'Algebra 1', 'Biology', 'World History')",
        },
        lessons: {
          type: "array",
          description: "Array of planned lessons, each covering a distinct topic or concept",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Short slug identifier (letters, numbers, dashes only)",
              },
              title: {
                type: "string",
                description: "Clear, concise title for the lesson (3-8 words)",
              },
              description: {
                type: "string",
                description: "Brief description of what this lesson will cover (15-30 words)",
              },
              estimatedLength: {
                type: "number",
                description: "Estimated character length of source content for this lesson (400-900)",
              },
              textSection: {
                type: "object",
                description: "Character indices in the original text that are most relevant to this lesson (only included if returnSections is true)",
                properties: {
                  start: {
                    type: "number",
                    description: "Starting character index in the original text (0-based)",
                  },
                  end: {
                    type: "number",
                    description: "Ending character index in the original text (exclusive)",
                  },
                },
                required: ["start", "end"],
              },
            },
            required: ["id", "title", "description", "estimatedLength"],
          },
          minItems: 2,
          maxItems: 12,
        },
      },
      required: ["subject", "lessons"],
    },
  },
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
    const ok = await checkUsageLimit(sb, uid);
    if (!ok) {
      return new Response(JSON.stringify({ error: "Usage limit exceeded" }), { status: 403 });
    }
  }

  const userTier = uid ? await fetchUserTier(sb, uid) : 'free';
  const { client, model, provider } = createModelClient(userTier, 'fast');

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
- Sections can overlap if concepts are interconnected, but aim for distinct focus areas` : ''}

Content length guidelines:
- Short content (< 1000 chars): 2-3 lessons
- Medium content (1000-3000 chars): 3-6 lessons
- Long content (> 3000 chars): 6-12 lessons`;

    const userPrompt = `Analyze this educational content and create a structured lesson plan:

${requestedSubject ? `Preferred subject focus: ${requestedSubject}\n\n` : ''}Content (${text.length} characters total):
${text}

Create a lesson plan that breaks this content into logical, bite-sized lessons.${returnSections ? ` For each lesson, specify the textSection with start and end character indices that identify the most relevant portion of the source text for that lesson.` : ''}`;

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      max_tokens: 2000,
      tools: [PLANNING_TOOL],
      tool_choice: { type: "function", function: { name: "create_lesson_plan" } },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const message = completion?.choices?.[0]?.message;
    const toolCalls = message?.tool_calls;

    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      console.error('[plan] No tool calls in response');
      return new Response(
        JSON.stringify({ error: "Failed to generate lesson plan" }),
        { status: 500 }
      );
    }

    const planArgs = toolCalls[0]?.function?.arguments;
    if (!planArgs) {
      console.error('[plan] No arguments in tool call');
      return new Response(
        JSON.stringify({ error: "Failed to generate lesson plan" }),
        { status: 500 }
      );
    }

    const plan: PlanResponse = JSON.parse(planArgs);

    console.log('[plan] Plan created successfully:', {
      totalLessons: plan.lessons.length,
      subject: plan.subject
    });

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
