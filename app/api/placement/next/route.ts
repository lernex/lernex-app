import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { PlacementState, PlacementItem } from "@/types/placement";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BLOCKLIST = [/suicide|self[-\s]?harm/i, /explicit|porn|sexual/i, /hate\s*speech|racial\s*slur/i, /bomb|weapon|make\s+drugs/i];

function safe(s: string) { return !BLOCKLIST.some((re) => re.test(s)); }

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

  const body = await req.json().catch(() => ({})) as {
    state: PlacementState;
    lastAnswer?: number; // index chosen by the user for the previous item
    lastItem?: PlacementItem;
  };

  const { state, lastAnswer, lastItem } = body;
  if (!state) return NextResponse.json({ error: "Missing state" }, { status: 400 });

  // Update state with last answer (if any)
  if (typeof lastAnswer === "number" && lastItem) {
    const correct = lastAnswer === lastItem.correctIndex;
    state.step = Math.min(state.step + 1, state.maxSteps);
    if (correct) {
      state.correctStreak += 1;
      if (state.correctStreak >= 2 && state.difficulty !== "hard") {
        state.difficulty = nextUp(state.difficulty);
        state.correctStreak = 0;
      }
    } else {
      state.mistakes += 1;
      state.correctStreak = 0;
      if (state.difficulty !== "intro") {
        state.difficulty = nextDown(state.difficulty);
      }
    }

    // Stop conditions
    if (state.step > state.maxSteps || (state.mistakes >= 2 && state.difficulty === "hard")) {
      state.done = true;
    }
  }

  if (state.done) return NextResponse.json({ state, item: null });

  // Build prompt
  const system = `
You generate ONE adaptive placement MCQ.
Return JSON only with:
{
  "subject": string,
  "course": string,
  "prompt": string,
  "choices": string[],
  "correctIndex": number,
  "explanation": string,
  "difficulty": "intro"|"easy"|"medium"|"hard"
}
Rules:
- The question must quickly assess the student's level in the given course.
- Keep it tight, factual, and 1 short step of reasoning.
- Use 2–3 choices for intro/easy; 3–4 for medium/hard; exactly one correct answer.
- Avoid external resources or code blocks.
  `.trim();

  const userPrompt = `
Subject: ${state.subject}
Course: ${state.course}
Target Difficulty: ${state.difficulty}
Step: ${state.step} of ${state.maxSteps}
Task: Create one good discriminator question at this level with choices and a short explanation.
  `.trim();

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-5-nano";
  const temperature = Number(process.env.OPENAI_TEMPERATURE ?? "1");

  const completion = await client.chat.completions.create({
    model,
    temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as PlacementItem;

  // Minimal safety
  if (!safe(parsed.prompt)) {
    return NextResponse.json({ error: "Unsafe content generated; try again" }, { status: 502 });
  }

  // Fill guard fields
  parsed.subject = state.subject;
  parsed.course = state.course;
  parsed.difficulty = parsed.difficulty ?? state.difficulty;

  return NextResponse.json({ state, item: parsed });
}

function nextUp(d: "intro"|"easy"|"medium"|"hard"): "intro"|"easy"|"medium"|"hard" {
  if (d === "intro") return "easy";
  if (d === "easy") return "medium";
  return "hard";
}
function nextDown(d: "intro"|"easy"|"medium"|"hard"): "intro"|"easy"|"medium"|"hard" {
  if (d === "hard") return "medium";
  if (d === "medium") return "easy";
  return "intro";
}
