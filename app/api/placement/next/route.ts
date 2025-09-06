// app/api/placement/next/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlacementState, PlacementItem, Difficulty, PlacementNextResponse } from "@/types/placement";
import { supabaseServer } from "@/lib/supabase-server";
import { checkUsageLimit, logUsage } from "@/lib/usage";

const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const MAX_TOKENS = 600;

// Safety
const BLOCKLIST = [/suicide|self[-\s]?harm/i, /explicit|porn|sexual/i, /hate\s*speech|racial\s*slur/i, /bomb|weapon|make\s+drugs/i];
const isSafe = (s: string) => !!s && !BLOCKLIST.some((re) => re.test(s));

// Difficulty ladder
const up = (d: Difficulty): Difficulty => (d === "intro" ? "easy" : d === "easy" ? "medium" : "hard");
const down = (d: Difficulty): Difficulty => (d === "hard" ? "medium" : d === "medium" ? "easy" : "intro");

// Deterministic state transition (used both server + client thinking)
function nextState(prev: PlacementState, correct: boolean): PlacementState {
  let s: PlacementState = { ...prev, step: prev.step + 1, asked: [...prev.asked] };
  if (correct) {
    s.correctStreak += 1;
    if (s.difficulty !== "hard") {
      s.difficulty = up(s.difficulty);
    }
  } else {
    s.mistakes += 1;
    s.correctStreak = 0;
    if (s.difficulty !== "intro") s.difficulty = down(s.difficulty);
  }
  if (s.step > s.maxSteps || (s.mistakes >= 2 && s.difficulty === "hard")) s.done = true;

  if (s.done && s.remaining.length) {
    const [next, ...rest] = s.remaining;
    s = {
      subject: next.subject,
      course: next.course,
      step: 1,
      maxSteps: 7,
      difficulty: "intro",
      mistakes: 0,
      correctStreak: 0,
      done: false,
      asked: [],
      remaining: rest,
    };
  } else {
    s.remaining = prev.remaining;
  }
  return s;
}

async function makeQuestion(
  state: PlacementState,
  sb: SupabaseClient,
  uid: string,
  ip: string,
  avoid: string[] = [],
  depth = 0
): Promise<PlacementItem | null> {
  if (state.done) return null;
  if (uid) {
    const ok = await checkUsageLimit(sb, uid);
    if (!ok) return null;
  }

const system = `
Return JSON:
{
  "subject": string,
  "course": string,
  "prompt": string,
  "choices": string[],
  "correctIndex": number,
  "explanation": string,
  "difficulty": "intro"|"easy"|"medium"|"hard"
}
Generate one concise multiple-choice question. For intro/easy use 2–3 choices; for medium/hard use 3–4 choices. Exactly one answer must be correct.
Difficulty reflects how deep into the course's units the question is: "intro" covers foundational early units, "easy" early units, "medium" mid-course units, and "hard" late or advanced units.
Keep strictly to the standard curriculum for the given course and avoid topics from more advanced classes.
Use standard inline LaTeX like \( ... \) for any expressions requiring special formatting (equations, vectors, matrices, etc.). Avoid HTML, markdown, and code fences.
`.trim();

const avoidText =
    avoid.length > 0
      ? `Avoid reusing or closely mirroring any of these questions: ${avoid.map((a) => `"${a}"`).join("; ")}`
      : "";

  const user = `
Subject: ${state.subject}
Course: ${state.course}
Target Difficulty: ${state.difficulty}
Step: ${state.step} of ${state.maxSteps}
${avoidText}
Create exactly one discriminative multiple-choice question from the course's appropriate units. Include a short explanation. The question should address a key topic within the course's own syllabus.
`.trim();

  // Small, fast, JSON-clean model; cap tokens for speed
  const model = "gpt-5-nano";
  const completion = await ai.responses.create({
    model,
    temperature: 1,
    max_output_tokens: MAX_TOKENS,
    reasoning: { effort: "low" },
    text: { format: { type: "json_object" }, verbosity: "low" },
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  if (uid && completion.usage) {
    try {
      await logUsage(sb, uid, ip, model, completion.usage);
    } catch {
      /* ignore */
    }
  }

  const raw = completion.output_text ?? "{}";
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

  // If model ignored instructions, retry a couple times
  if (avoid.some((a) => a.trim() === item.prompt.trim()) && depth < 2) {
    return makeQuestion(state, sb, uid, ip, avoid, depth + 1);
  }

  return item;
}

export async function POST(req: Request) {
  try {
    // Auth (server component client works on Edge with “cookies”)
    const sb = supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

    const ok = await checkUsageLimit(sb, user.id);
    if (!ok) {
      return new Response(JSON.stringify({ error: "Usage limit exceeded" }), { status: 403 });
    }

    const bodyText = await req.text();
    let body: { state?: PlacementState; lastAnswer?: number; lastItem?: PlacementItem } = {};
    if (bodyText) { try { body = JSON.parse(bodyText); } catch { /* ignore */ } }

    // If no state provided, bootstrap from profile (like your START route logic)
    let state: PlacementState;
    if (body.state) {
      state = body.state;
      if (!Array.isArray(state.asked)) state.asked = [];
    } else {
      const { data: prof, error } = await sb
        .from("profiles")
        .select("interests, level_map")
        .eq("id", user.id)
        .maybeSingle();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

      const interests: string[] = Array.isArray(prof?.interests) ? prof!.interests : [];
      if (!interests.length) return new Response(JSON.stringify({ error: "No interests" }), { status: 400 });

      const levelMap = (prof?.level_map || {}) as Record<string, string>;
      const courses = interests
        .filter((s) => levelMap[s])
        .map((s) => ({ subject: s, course: levelMap[s]! }));
      if (!courses.length) return new Response(JSON.stringify({ error: "No course selected for any interest" }), { status: 400 });

      const [first, ...rest] = courses;

      state = {
        subject: first.subject,
        course: first.course,
        step: 1,
        maxSteps: 7,
        difficulty: "intro",
        mistakes: 0,
        correctStreak: 0,
        done: false,
        asked: [],
        remaining: rest,
      };
    }

    // 1) If client provided last answer, advance state on server (keeps canonical)
    if (typeof body.lastAnswer === "number" && body.lastItem) {
      const correct = body.lastAnswer === body.lastItem.correctIndex;
      state = nextState(state, correct);
    }

    // If finished and no remaining courses, return early
    if (state.done && (!state.remaining || state.remaining.length === 0)) {
      const payload: PlacementNextResponse = { state, item: null };
      return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
    }

    // 2) Produce the current question first, avoiding duplicates
    const nowItem = await makeQuestion(state, sb, user.id, ip, state.asked);
    if (nowItem) state.asked.push(nowItem.prompt);

    // 3) Compute the two branch states and prefetch them (avoid repeating current or previous)
    const stateIfRight = nextState(state, true);
    const stateIfWrong = nextState(state, false);
    const avoidForBranches = state.asked;

    const [rightItem, wrongItem] = await Promise.all([
      makeQuestion(stateIfRight, sb, user.id, ip, avoidForBranches),
      makeQuestion(stateIfWrong, sb, user.id, ip, avoidForBranches),
    ]);
    if (rightItem) stateIfRight.asked.push(rightItem.prompt);
    if (wrongItem) stateIfWrong.asked.push(wrongItem.prompt);

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
