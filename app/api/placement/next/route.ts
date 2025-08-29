// app/api/placement/next/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import type { PlacementState, PlacementItem, Difficulty, PlacementNextResponse } from "@/types/placement";
import { supabaseServer } from "@/lib/supabase-server";

const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Safety
const BLOCKLIST = [/suicide|self[-\s]?harm/i, /explicit|porn|sexual/i, /hate\s*speech|racial\s*slur/i, /bomb|weapon|make\s+drugs/i];
const isSafe = (s: string) => !!s && !BLOCKLIST.some((re) => re.test(s));

// Difficulty ladder
const up = (d: Difficulty): Difficulty => (d === "intro" ? "easy" : d === "easy" ? "medium" : "hard");
const down = (d: Difficulty): Difficulty => (d === "hard" ? "medium" : d === "medium" ? "easy" : "intro");

// Deterministic state transition (used both server + client thinking)
function nextState(prev: PlacementState, correct: boolean): PlacementState {
  const s: PlacementState = { ...prev, step: prev.step + 1 };
  if (correct) {
    s.correctStreak += 1;
    if (s.correctStreak >= 2 && s.difficulty !== "hard") {
      s.difficulty = up(s.difficulty);
      s.correctStreak = 0;
    }
  } else {
    s.mistakes += 1;
    s.correctStreak = 0;
    if (s.difficulty !== "intro") s.difficulty = down(s.difficulty);
  }
  if (s.step > s.maxSteps || (s.mistakes >= 2 && s.difficulty === "hard")) s.done = true;
  return s;
}

async function makeQuestion(state: PlacementState): Promise<PlacementItem | null> {
  if (state.done) return null;

  const system = `
Return STRICT JSON only:
{
  "subject": string,
  "course": string,
  "prompt": string,
  "choices": string[],
  "correctIndex": number,
  "explanation": string,
  "difficulty": "intro"|"easy"|"medium"|"hard"
}
No commentary. Keep concise. 2–3 choices for intro/easy; 3–4 for medium/hard; exactly one correct.
`.trim();

  const user = `
Subject: ${state.subject}
Course: ${state.course}
Target Difficulty: ${state.difficulty}
Step: ${state.step} of ${state.maxSteps}
Create ONE discriminative MCQ with short explanation.
`.trim();

  // Small, fast, JSON-clean model; cap tokens for speed
  const completion = await ai.chat.completions.create({
    model: "gpt-4.1-nano",
    temperature: 1,
    response_format: { type: "json_object" },
    max_tokens: 1000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let item: PlacementItem;
  try {
    item = JSON.parse(raw) as PlacementItem;
  } catch {
    return null; // let client request again; keeps UX flowing
  }
  if (!isSafe(item.prompt)) return null;

  // Normalize fields and difficulty fallback
  item.subject = state.subject;
  item.course = state.course;
  const diff: Difficulty =
    typeof item.difficulty === "string" && ["intro", "easy", "medium", "hard"].includes(item.difficulty)
      ? (item.difficulty as Difficulty)
      : state.difficulty;
  item.difficulty = diff;

  // Ensure well-formed choices/correctIndex
  if (!Array.isArray(item.choices) || typeof item.correctIndex !== "number") return null;
  if (item.correctIndex < 0 || item.correctIndex >= item.choices.length) return null;

  return item;
}

export async function POST(req: Request) {
  try {
    // Auth (server component client works on Edge with “cookies”)
    const sb = supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

    const bodyText = await req.text();
    let body: { state?: PlacementState; lastAnswer?: number; lastItem?: PlacementItem } = {};
    if (bodyText) { try { body = JSON.parse(bodyText); } catch { /* ignore */ } }

    // If no state provided, bootstrap from profile (like your START route logic)
    let state = body.state;
    if (!state) {
      const { data: prof, error } = await sb
        .from("profiles")
        .select("interests, level_map")
        .eq("id", user.id)
        .maybeSingle();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

      const interests: string[] = Array.isArray(prof?.interests) ? prof!.interests : [];
      if (!interests.length) return new Response(JSON.stringify({ error: "No interests" }), { status: 400 });

      const levelMap = (prof?.level_map || {}) as Record<string, string>;
      const subject = interests.find((s) => levelMap[s]) ?? interests[0];
      const course = levelMap[subject] ?? "General";

      state = {
        subject,
        course,
        step: 1,
        maxSteps: 6,
        difficulty: /algebra\s*1|geometry|biology|chemistry/i.test(course) ? "medium" : "easy",
        mistakes: 0,
        correctStreak: 0,
        done: false,
      };
    }

    // 1) If client provided last answer, advance state on server (keeps canonical)
    if (typeof body.lastAnswer === "number" && body.lastItem) {
      const correct = body.lastAnswer === body.lastItem.correctIndex;
      state = nextState(state, correct);
    }

    // If finished, return early
    if (state.done) {
      const payload: PlacementNextResponse = { state, item: null };
      return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
    }

    // 2) Produce the current question (if client doesn't already have one)
    // We always (re)generate here so client can simply render what we send.
    const nowPromise = makeQuestion(state);

    // 3) Compute the two branch states and prefetch them in parallel
    const stateIfRight = nextState(state, true);
    const stateIfWrong = nextState(state, false);

    const rightPromise = makeQuestion(stateIfRight);
    const wrongPromise = makeQuestion(stateIfWrong);

    const [nowItem, rightItem, wrongItem] = await Promise.all([nowPromise, rightPromise, wrongPromise]);

    const payload: PlacementNextResponse = {
      state,
      item: nowItem,
      branches: {
        right: { state: stateIfRight, item: rightItem },
        wrong: { state: stateIfWrong, item: wrongItem },
      },
    };
    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
