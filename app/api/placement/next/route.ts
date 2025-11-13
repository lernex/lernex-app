// app/api/placement/next/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlacementState, PlacementItem, Difficulty, PlacementNextResponse } from "@/types/placement";
import { supabaseServer } from "@/lib/supabase-server";
import { canUserGenerate, logUsage } from "@/lib/usage";
import { createModelClient, fetchUserTier } from "@/lib/model-config";
import { shuffleQuestionChoices } from "@/lib/quiz-shuffle";
import { LEVELS_BY_DOMAIN } from "@/data/domains";
const MAX_TOKENS = Math.min(
  1800,
  Math.max(
    800,
    Number(process.env.CEREBRAS_PLACEMENT_MAX_TOKENS ?? process.env.GROQ_PLACEMENT_MAX_TOKENS ?? "1300") || 1300,
  ),
);

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
      maxSteps: 6,
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
  aiClient: OpenAI,
  model: string,
  modelIdentifier: string,
  provider: string,
  userTier: string,
  avoid: string[] = [],
  depth = 0
): Promise<PlacementItem | null> {
  if (state.done) return null;
// Keep two variants: a normal template and a tighter one for retries
const systemNormal = `
Return ONLY valid JSON (no prose):
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
- intro/easy: 2-3 choices; medium/hard: 3-4 choices
- Choices: <=8w each. Explanation: <=25w
- Standard curriculum only (no advanced topics)
- Math: Use LaTeX with escaped backslashes in JSON. Example: "\\\\(x^2\\\\)" or "\\\\[\\\\frac{a}{b}\\\\]" renders as \\(x^2\\) and \\[\\frac{a}{b}\\]
`.trim();

const systemTight = `
Return ONLY valid JSON (no prose):
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
- EXACTLY 2 choices (intro/easy), 3 choices (medium/hard)
- Explanation: <=15w
- Math: Escaped LaTeX only. Example: "\\\\(x\\\\)" → \\(x\\)
`.trim();

  // Limit avoid list to keep token budget small
  const MAX_AVOID = 3;
  const trimmedAvoid = (avoid || [])
    .slice(-MAX_AVOID)
    .map((a) => (typeof a === "string" ? a : String(a ?? "")))
    .map((a) => (a.length > 100 ? a.slice(0, 100) : a));

  const avoidText =
    trimmedAvoid.length > 0
      ? `Avoid reusing or closely mirroring any of these questions: ${trimmedAvoid.map((a) => `"${a}"`).join("; ")}`
      : "";

  const user = `
Subject: ${state.subject}
Course: ${state.course}
Difficulty: ${state.difficulty}
Step: ${state.step}/${state.maxSteps}
${avoidText}
Create 1 multiple-choice question from course syllabus. Include brief explanation.
`.trim();

  const TEMP = 0.4; // lower temp for more stable JSON
  const systemPrompt = depth === 0 ? systemNormal : systemTight;

  async function runQuery(
    jsonMode: boolean,
    system: string,
    maxTokens: number
  ): Promise<{ raw: string; completion: ChatCompletion | null }> {
    try {
      const completion = await aiClient.chat.completions.create({
        model,
        temperature: TEMP,
        max_tokens: maxTokens,
        reasoning_effort: "medium",
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const content = completion.choices?.[0]?.message?.content as string | undefined;
      return { raw: content ?? "", completion };
    } catch (err: unknown) {
      try {
        console.error("[placement][makeQuestion] completion error", {
          jsonMode,
          depth,
          subject: state.subject,
          course: state.course,
          difficulty: state.difficulty,
          maxTokens,
          message: err instanceof Error ? err.message : String(err),
        });
      } catch {}
      if (jsonMode) {
        const failed = (err as { error?: { failed_generation?: string } } | null)?.error?.failed_generation;
        if (typeof failed === "string" && failed.trim().length > 0) {
          return { raw: failed.trim(), completion: null };
        }
      }
      return { raw: "", completion: null };
    }
  }

  const fallbackMaxTokens = Math.max(400, Math.floor(MAX_TOKENS * 0.75));
  let { raw, completion } = await runQuery(true, systemPrompt, MAX_TOKENS);

  function extractBalancedObject(s: string): string | null {
    let i = 0;
    const n = s.length;
    let depth = 0;
    let start = -1;
    let inStr = false;
    let escaped = false;
    for (; i < n; i++) {
      const ch = s[i];
      if (inStr) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          return s.slice(start, i + 1);
        }
      }
    }
    return null;
  }

  function parsePlacement(input: string): PlacementItem | null {
    if (!input) return null;
    try {
      return JSON.parse(input) as PlacementItem;
    } catch {
      const extracted = extractBalancedObject(input);
      if (!extracted) return null;
      try {
        return JSON.parse(extracted) as PlacementItem;
      } catch {
        return null;
      }
    }
  }

  let item = parsePlacement(raw);

  if (!item) {
    const fallback = await runQuery(false, systemTight, fallbackMaxTokens);
    raw = fallback.raw;
    if (fallback.completion) completion = fallback.completion;
    item = parsePlacement(raw);
    if (!item) {
      return null;
    }
  }

  if (uid && completion?.usage) {
    const u = completion.usage;
    let mapped: { input_tokens?: number | null; output_tokens?: number | null } | null = null;
    if (u && typeof u === "object") {
      const rec = (u as unknown) as { prompt_tokens?: unknown; completion_tokens?: unknown };
      const prompt = typeof rec.prompt_tokens === "number" ? rec.prompt_tokens : null;
      const completionTokens = typeof rec.completion_tokens === "number" ? rec.completion_tokens : null;
      mapped = { input_tokens: prompt, output_tokens: completionTokens };
    }
    if (mapped) {
      try {
        await logUsage(sb, uid, ip, modelIdentifier, mapped, {
          metadata: {
            route: "placement-test",
            subject: state.subject,
            course: state.course,
            difficulty: state.difficulty,
            step: state.step,
            maxSteps: state.maxSteps,
            mistakes: state.mistakes,
            correctStreak: state.correctStreak,
            provider,
            tier: userTier,
          }
        });
      } catch {
        /* ignore */
      }
    }
  }

  if (!isSafe(item.prompt)) { return null; }


  // Normalize fields and difficulty fallback
  item.subject = state.subject;
  item.course = state.course;
  const diff: Difficulty =
    typeof item.difficulty === "string" && ["intro", "easy", "medium", "hard"].includes(item.difficulty)
      ? (item.difficulty as Difficulty)
      : state.difficulty;
  item.difficulty = diff;

  // Ensure well-formed choices/correctIndex
  if (!Array.isArray(item.choices)) { return null; }
  // Normalize and trim choices
  item.choices = item.choices.map((c) => String((c as unknown) ?? "").trim()).filter((c) => c.length > 0);
  // Enforce reasonable choice counts; we can slice extra distractors but keep first (correct) element
  const maxChoices = (item.difficulty === "intro" || item.difficulty === "easy") ? 3 : 4;
  if (item.choices.length > maxChoices) item.choices = item.choices.slice(0, maxChoices);
  if (item.choices.length < 2) { return null; }
  // If model failed to set a valid index, default to 0 per instruction
  const rawIdx = (item as unknown as { correctIndex: unknown }).correctIndex;
  let idx = typeof rawIdx === "number" ? rawIdx : Number(rawIdx);
  if (!Number.isFinite(idx) || idx < 0 || idx >= item.choices.length) { idx = 0; }
  item.correctIndex = Math.floor(idx);

  // Shuffle answer choices using utility function to prevent AI bias toward position A
  shuffleQuestionChoices(item);

  // If model ignored instructions, retry a couple times
  if (avoid.some((a) => a.trim() === item.prompt.trim()) && depth < 2) {
    return makeQuestion(state, sb, uid, ip, aiClient, model, modelIdentifier, provider, userTier, avoid, depth + 1);
  }

  return item;
}

export async function POST(req: Request) {
  // Auth (server component client works on Edge with "cookies")
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

  const limitCheck = await canUserGenerate(sb, user.id);
  if (!limitCheck.allowed) {
    console.log('[placement/next] Usage limit exceeded for user:', user.id);
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
  console.log('[placement/next] Usage limit check passed');

  // Fetch user tier with cache-busting (always fresh, no stale data)
  const userTier = await fetchUserTier(sb, user.id);

  // Use FAST model for immediate placement test response
  const { client: ai, model, modelIdentifier, provider } = createModelClient(userTier, 'fast');

  try {
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

      const profile = prof as { interests?: unknown; level_map?: unknown } | null;
      const interests: string[] = Array.isArray(profile?.interests) ? profile.interests as string[] : [];
      if (!interests.length) return new Response(JSON.stringify({ error: "No interests" }), { status: 400 });

      const levelMap = (profile?.level_map || {}) as Record<string, string>;

      // Get existing subject states to filter out already-completed courses
      const { data: existingStates, error: statesError } = await sb
        .from("user_subject_state")
        .select("course")
        .eq("user_id", user.id);

      if (statesError) {
        console.error("[placement/next] Failed to fetch user_subject_state:", statesError);
      }

      const completedCourses = new Set(
        Array.isArray(existingStates) ? existingStates.map((s: { course: string }) => s.course) : []
      );

      // Detect if using new model (interests = courses) or old model (interests = domains)
      const allValidCourses = Object.values(LEVELS_BY_DOMAIN).flat();
      const interestIsCourse = (item: string) => allValidCourses.includes(item);

      console.log("[placement/next] Bootstrap state:", {
        userId: user.id.slice(0, 8),
        interests,
        levelMap,
        completedCourses: Array.from(completedCourses),
        usingNewModel: interests.some(interestIsCourse)
      });

      // Extract courses based on data model
      let courses: Array<{ subject: string; course: string }>;

      if (interests.some(interestIsCourse)) {
        // New model: interests contains courses directly (e.g., ["Calculus 2", "AP Chemistry"])
        courses = interests
          .filter(interestIsCourse)
          .map((course) => {
            // Find the domain for this course
            const domain = Object.entries(LEVELS_BY_DOMAIN).find(([, coursesArray]) =>
              coursesArray.includes(course)
            )?.[0];
            return { subject: domain || "General", course };
          });
      } else {
        // Old model: interests contains domains, get courses from level_map
        courses = interests
          .filter((s) => levelMap[s])
          .map((s) => {
            const course = levelMap[s]!;
            // Find the domain for this course
            const domain = Object.entries(LEVELS_BY_DOMAIN).find(([, coursesArray]) =>
              coursesArray.includes(course)
            )?.[0];
            return { subject: domain || s, course };
          });
      }

      // Filter out courses that already have subject states
      courses = courses.filter(({ course }) => {
        const shouldInclude = !completedCourses.has(course);
        console.log(`[placement/next] Course "${course}": ${shouldInclude ? "INCLUDE (needs placement)" : "SKIP (already completed)"}`);
        return shouldInclude;
      });

      console.log("[placement/next] Courses needing placement:", courses.map(c => c.course));

      if (!courses.length) return new Response(JSON.stringify({ error: "No course selected for any interest" }), { status: 400 });

      const [first, ...rest] = courses;

      state = {
        subject: first.subject,
        course: first.course,
        step: 1,
        maxSteps: 6,
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
    const MAX_TRIES = 3;
    let nowItem: PlacementItem | null = null;
    for (let i = 0; i < MAX_TRIES && !nowItem; i++) {
      if (i > 0) { /* retry */ }
      nowItem = await makeQuestion(state, sb, user.id, ip, ai, model, modelIdentifier, provider, userTier, state.asked);
    }
    // If we could not generate a question but we are not truly finished,
    // return an error instead of { item: null } to avoid clients treating this
    // as completion and redirecting away mid-session.
    if (!nowItem && !(state.done && (!state.remaining || state.remaining.length === 0))) {
      return new Response(
        JSON.stringify({ error: "Could not generate question. Please try again." }),
        { status: 503, headers: { "content-type": "application/json" } }
      );
    }
    if (nowItem) state.asked.push(nowItem.prompt);

    // 3) Optionally prefetch branches (opt-in via PLACEMENT_PREFETCH=1)
    const PREFETCH_BRANCHES = process.env.PLACEMENT_PREFETCH === "1";
    type PlacementNextResponseDebug = PlacementNextResponse & { timings?: { nowMs: number; branchesMs: number } };
    let payload: PlacementNextResponseDebug;
    if (PREFETCH_BRANCHES) {
      const t0 = Date.now();
      const stateIfRight = nextState(state, true);
      const stateIfWrong = nextState(state, false);
      const avoidForBranches = state.asked;
      const [rightItem, wrongItem] = await Promise.all([
        makeQuestion(stateIfRight, sb, user.id, ip, ai, model, modelIdentifier, provider, userTier, avoidForBranches),
        makeQuestion(stateIfWrong, sb, user.id, ip, ai, model, modelIdentifier, provider, userTier, avoidForBranches),
      ]);
      const t1 = Date.now();
      if (rightItem) stateIfRight.asked.push(rightItem.prompt);
      if (wrongItem) stateIfWrong.asked.push(wrongItem.prompt);
      payload = {
        state,
        item: nowItem,
        branches: {
          right: { state: stateIfRight, item: rightItem },
          wrong: { state: stateIfWrong, item: wrongItem },
        },
      };
      // Attach optional timings for client-side debugging
      payload.timings = { nowMs: 0, branchesMs: t1 - t0 };
    } else {
      payload = { state, item: nowItem };
    }

    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    // Log error usage if we have user context
    try {
      const sb = await supabaseServer();
      const { data: { user } } = await sb.auth.getUser();
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
      if (user) {
        await logUsage(sb, user.id, ip, modelIdentifier, { input_tokens: null, output_tokens: null }, {
          metadata: {
            route: "placement-test",
            error: msg,
            errorType: e instanceof Error ? e.name : typeof e,
            provider,
            tier: userTier,
          }
        });
      }
    } catch {
      /* ignore logging errors */
    }
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
