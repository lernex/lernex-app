// app/api/placement/next/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { PlacementState, PlacementItem } from "@/types/placement";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BLOCKLIST = [/suicide|self[-\s]?harm/i, /explicit|porn|sexual/i, /hate\s*speech|racial\s*slur/i, /bomb|weapon|make\s+drugs/i];
const safe = (s: string) => !BLOCKLIST.some((re) => re.test(s));

function up(d: "intro"|"easy"|"medium"|"hard"): PlacementState["difficulty"] {
  if (d === "intro") return "easy";
  if (d === "easy") return "medium";
  return "hard";
}
function down(d: "intro"|"easy"|"medium"|"hard"): PlacementState["difficulty"] {
  if (d === "hard") return "medium";
  if (d === "medium") return "easy";
  return "intro";
}

export async function POST(req: Request) {
  try {
    const sb = supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

    // Body can be empty on first call
    const bodyText = await req.text();
    let body: { state?: PlacementState; lastAnswer?: number; lastItem?: PlacementItem } = {};
    if (bodyText) {
      try { body = JSON.parse(bodyText); } catch { /* ignore; will init */ }
    }

    let { state, lastAnswer, lastItem } = body;

    // If no state provided, initialize from profile (FIRST CALL)
    if (!state) {
      const { data: prof, error: pe } = await sb
        .from("profiles")
        .select("interests, level_map")
        .eq("id", user.id)
        .maybeSingle();
      if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });

      const interests: string[] = Array.isArray(prof?.interests) ? prof!.interests : [];
      if (!interests.length) {
        return NextResponse.json({ error: "No interests selected" }, { status: 400 });
      }

      // choose first domain with a selected course level, fallback to first interest
      const levelMap = (prof?.level_map || {}) as Record<string, string>;
      const domainWithLevel = interests.find((d) => levelMap && levelMap[d]);
      const subject = domainWithLevel ?? interests[0];
      const course = levelMap[subject] ?? "General";

      state = {
        subject,
        course,
        step: 1,
        maxSteps: 6,
        difficulty: "easy",
        mistakes: 0,
        correctStreak: 0,
        done: false,
      };
      lastAnswer = undefined;
      lastItem = undefined;
      // fall through to generation below
    } else {
      // APPLY last answer to existing state
      if (typeof lastAnswer === "number" && lastItem) {
        const correct = lastAnswer === lastItem.correctIndex;
        state.step = state.step + 1;

        if (correct) {
          state.correctStreak += 1;
          if (state.correctStreak >= 2 && state.difficulty !== "hard") {
            state.difficulty = up(state.difficulty);
            state.correctStreak = 0;
          }
        } else {
          state.mistakes += 1;
          state.correctStreak = 0;
          if (state.difficulty !== "intro") {
            state.difficulty = down(state.difficulty);
          }
        }

        if (state.step > state.maxSteps || (state.mistakes >= 2 && state.difficulty === "hard")) {
          state.done = true;
        }
      }
    }

    if (state.done) {
      return NextResponse.json({ state, item: null }, { headers: { "content-type": "application/json" } });
    }

    // ---------- Generate next question ----------
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-5-nano";
    const temperature = Number(process.env.OPENAI_TEMPERATURE ?? "0.2");

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
- Question should discriminate at the current level quickly.
- 2–3 choices for intro/easy; 3–4 for medium/hard; exactly one correct.
- Keep it concise and safe; no code blocks or external links.
    `.trim();

    const userPrompt = `
Subject: ${state.subject}
Course: ${state.course}
Target Difficulty: ${state.difficulty}
Step: ${state.step} of ${state.maxSteps}
Create one question with choices and a short explanation.
    `.trim();

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
    let item: PlacementItem;
    try {
      item = JSON.parse(raw) as PlacementItem;
    } catch {
      return NextResponse.json({ error: "Model returned invalid JSON" }, { status: 502 });
    }

    if (!safe(item.prompt || "")) {
      return NextResponse.json({ error: "Unsafe content generated" }, { status: 502 });
    }

    item.subject = state.subject;
    item.course = state.course;
    type Diff = PlacementState["difficulty"];
    const isDiff = (d: unknown): d is Diff =>
        d === "intro" || d === "easy" || d === "medium" || d === "hard";

    let finalDiff: Diff = state.difficulty;
    if (isDiff(item.difficulty)) {
        finalDiff = item.difficulty;
    }
    item.difficulty = finalDiff;

    return NextResponse.json({ state, item }, { headers: { "content-type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
