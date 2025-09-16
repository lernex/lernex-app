import Groq from "groq-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkUsageLimit, logUsage } from "./usage";

// In-process lock to dedupe concurrent level-map generations per user+subject.
// Note: Best-effort only (won't coordinate across server instances), but prevents
// most duplicate generations triggered by rapid client retries.
const generationLocks = new Map<string, Promise<LevelMap>>();

export function isLearningPathGenerating(uid: string, subject: string) {
  return generationLocks.has(`${uid}:${subject}`);
}

// New, richer level map schema
export type LevelMap = {
  subject: string;
  course: string;
  topics: {
    name: string;
    subtopics: { name: string; mini_lessons: number; applications?: string[] }[];
  }[];
  cross_subjects?: { subject: string; course?: string; rationale?: string }[];
  persona?: { pace?: "slow" | "normal" | "fast"; difficulty?: "intro" | "easy" | "medium" | "hard"; notes?: string };
  // Progress will be embedded here so a single JSON blob captures state
  progress?: {
    topicIdx?: number;
    subtopicIdx?: number;
    deliveredMini?: number;
    deliveredIdsByKey?: Record<string, string[]>; // key = `${topic} > ${subtopic}`
    preferences?: { liked?: string[]; disliked?: string[]; saved?: string[] };
  };
};

export async function generateLearningPath(
  sb: SupabaseClient,
  uid: string,
  ip: string,
  subject: string,
  course: string,
  mastery: number,
  notes = ""
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");
  const client = new Groq({ apiKey });
  // Use a stronger default model for level map generation; allow override via env
  const model = process.env.GROQ_LEVEL_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const temperature = Number(process.env.GROQ_TEMPERATURE ?? "0.8");

  if (uid) {
    const ok = await checkUsageLimit(sb, uid);
    if (!ok) throw new Error("Usage limit exceeded");
  }

  // Pull co-subjects for cross-context links
  const { data: prof } = await sb
    .from("profiles")
    .select("interests, level_map")
    .eq("id", uid)
    .maybeSingle();
  const interests: string[] = Array.isArray(prof?.interests) ? (prof!.interests as string[]) : [];
  const levelMap = (prof?.level_map || {}) as Record<string, string>;
  const coSubjects = interests
    .filter((s) => s && s !== subject)
    .map((s) => ({ subject: s, course: levelMap[s] }))
    .filter((x) => !!x.subject);

  // Recent performance and pace to guide personalization
  const { data: attempts } = await sb
    .from("attempts")
    .select("subject, correct_count, total, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(100);
  let correctAll = 0, totalAll = 0;
  let correctSubj = 0, totalSubj = 0;
  const nowTs = Date.now();
  let recentCount72h = 0;
  (attempts ?? []).forEach((a) => {
    const cc = a.correct_count ?? 0; const tt = a.total ?? 0;
    correctAll += cc; totalAll += tt;
    if (!a.subject || a.subject === subject) { correctSubj += cc; totalSubj += tt; }
    if (a.created_at && (nowTs - +new Date(a.created_at)) < 72 * 3600_000) recentCount72h += 1;
  });
  const accAll = totalAll > 0 ? Math.round((correctAll / totalAll) * 100) : null;
  const accSubj = totalSubj > 0 ? Math.round((correctSubj / totalSubj) * 100) : null;
  const pace: "slow" | "normal" | "fast" = recentCount72h >= 12 ? "fast" : recentCount72h >= 4 ? "normal" : "slow";

  const system = `You are a curriculum planner generating a compact level map.
Return ONLY a VALID JSON object (no markdown fences, no comments) with this structure and constraints:
{
  "subject": string,            // overall subject e.g., "Math"
  "course": string,             // specific class e.g., "Calculus II"
  "topics": [                   // 6–12 coherent topics/units max
    {
      "name": string,
      "subtopics": [            // 2–6 per topic
        { "name": string, "mini_lessons": number, "applications": string[] }
      ]
    }
  ],
  "cross_subjects": [ { "subject": string, "course": string | null, "rationale": string } ],
  "persona": { "pace": "slow|normal|fast", "difficulty": "intro|easy|medium|hard", "notes": string }
}
Constraints:
- Output must be STRICT JSON using double quotes only (no trailing commas).
- Keep names concise (<= 48 chars); no numbering prefixes.
- mini_lessons: integer 1–4 each. Distribute based on difficulty and prerequisites.
- applications: short real-world or cross-course hooks relevant to learner.
- Progress logically from foundations to advanced concepts. Avoid redundancy.
- Use naming that fits typical "${course}" syllabi when applicable.
- Do NOT include any HTML. If using LaTeX in names, escape braces properly.`.trim();

  const userPrompt = [
    `Subject: ${subject}`,
    `Course: ${course}`,
    `Estimated mastery: ${mastery}%`,
    `Learner pace (last 72h): ${pace}`,
    accSubj !== null ? `Recent accuracy in ${subject}: ${accSubj}%` : undefined,
    accAll !== null ? `Overall recent accuracy: ${accAll}%` : undefined,
    coSubjects.length ? `Other courses: ${coSubjects.map((c) => `${c.subject}${c.course ? ` (${c.course})` : ""}`).join(", ")}` : undefined,
    interests.length ? `Interests (prioritize cross-subject applications relevant to): ${interests.join(", ")}` : undefined,
    notes ? `Additional notes: ${notes}` : undefined,
    `Design goals:`,
    `- Tailor topic/subtopic ordering and mini_lessons to the learner's mastery and pace.`,
    `- Embed cross_subjects that link ${subject} ideas to the listed courses/interests.`,
    `- Keep the map compact but comprehensive (8–10 topics typical).`,
    `Task: Create the level map JSON exactly as per the schema. Keep it under ~9000 tokens.`,
  ].filter(Boolean).join("\n");

  let raw = "";
  let completion: import("groq-sdk/resources/chat/completions").ChatCompletion | null = null;
  let attemptsCount = 0;
  let fallbackUsed = false;
  try {
    attemptsCount += 1;
    completion = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: 9000,
      reasoning_effort: "high",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });
    raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "";
  } catch (err) {
    const e = err as unknown as { error?: { failed_generation?: string } };
    const failed = e?.error?.failed_generation;
    if (typeof failed === "string" && failed.trim().length > 0) {
      raw = failed;
    } else {
      // Retry without explicit JSON mode
      attemptsCount += 1;
      fallbackUsed = true;
      completion = await client.chat.completions.create({
        model,
        temperature,
        max_tokens: 3000,
        reasoning_effort: "medium",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      });
      raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "";
    }
  }

  // Log attempts metric for admin visibility (cost-free model id)
  try { await logUsage(sb, uid, ip, "metric/level-map-attempts", { input_tokens: attemptsCount, output_tokens: fallbackUsed ? 1 : 0 }); } catch {}

  if (uid && completion?.usage) {
    const u = completion.usage as unknown as { prompt_tokens?: unknown; completion_tokens?: unknown };
    const prompt = typeof u.prompt_tokens === "number" ? u.prompt_tokens : null;
    const completionTokens = typeof u.completion_tokens === "number" ? u.completion_tokens : null;
    await logUsage(sb, uid, ip, model, { input_tokens: prompt, output_tokens: completionTokens });
  }

  if (!raw) raw = "{}";
  function extractBalancedObject(s: string): string | null {
    let i = 0, depth = 0, start = -1, inStr = false, escaped = false;
    const n = s.length;
    for (; i < n; i++) {
      const ch = s[i];
      if (inStr) {
        if (escaped) { escaped = false; }
        else if (ch === "\\") { escaped = true; }
        else if (ch === '"') { inStr = false; }
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') { if (depth === 0) start = i; depth++; }
      else if (ch === '}') { depth--; if (depth === 0 && start !== -1) return s.slice(start, i + 1); }
    }
    return null;
  }
  let parsed: LevelMap;
  try {
    parsed = JSON.parse(raw) as LevelMap;
  } catch {
    const extracted = extractBalancedObject(raw);
    if (!extracted) throw new Error("Invalid level map JSON");
    parsed = JSON.parse(extracted) as LevelMap;
  }

  // Ensure required fields and sanitize unknowns
  parsed.subject ||= subject;
  parsed.course ||= course;
  if (!Array.isArray(parsed.topics)) parsed.topics = [];
  type RawTopic = { name?: unknown; subtopics?: unknown };
  type RawSub = { name?: unknown; mini_lessons?: unknown; applications?: unknown };
  parsed.topics = (parsed.topics as unknown as RawTopic[])
    .map((t: RawTopic) => {
      const tName = typeof t.name === "string" ? t.name.trim() : "";
      const rawSubs = Array.isArray(t.subtopics) ? (t.subtopics as RawSub[]) : [];
      const subtopics = rawSubs
        .map((s: RawSub) => {
          const sName = typeof s.name === "string" ? s.name.trim() : "";
          const ml = Math.max(1, Math.min(4, Number((s.mini_lessons as number | string | undefined) ?? 1)));
          const apps = Array.isArray(s.applications)
            ? (s.applications as unknown[]).map((x) => String(x)).slice(0, 6)
            : undefined;
          return { name: sName, mini_lessons: ml, applications: apps };
        })
        .filter((s) => !!s.name);
      return { name: tName, subtopics };
    })
    .filter((t) => t.name && t.subtopics.length);

  return parsed;
}

/**
 * Ensure a level map exists for a user + subject + course, generating and persisting it if absent or mismatched.
 * Returns the map.
 */
export async function ensureLearningPath(
  sb: SupabaseClient,
  uid: string,
  ip: string,
  subject: string,
  course: string,
  mastery: number,
  notes = ""
) {
  // Check for existing path
  const { data: existing } = await sb
    .from("user_subject_state")
    .select("path, course, next_topic, difficulty")
    .eq("user_id", uid)
    .eq("subject", subject)
    .maybeSingle();

  const currentPath = existing?.path as LevelMap | null;
  const valid = currentPath && Array.isArray(currentPath.topics) && currentPath.topics.length > 0;
  if (valid && existing?.course === course) {
    return currentPath as LevelMap;
  }

  const key = `${uid}:${subject}`;
  const existingLock = generationLocks.get(key);
  if (existingLock) {
    // Another request is already generating; wait for it, then read fresh state.
    await existingLock.catch(() => {});
    const { data: after } = await sb
      .from("user_subject_state")
      .select("path, course")
      .eq("user_id", uid)
      .eq("subject", subject)
      .maybeSingle();
    const p = after?.path as LevelMap | null;
    if (p && Array.isArray(p.topics) && p.topics.length > 0 && after?.course === course) return p;
    // Fall through to try again if previous generation failed.
  }

  // Generate fresh map if missing/invalid or course changed, with lock
  const lock = (async () => {
    const map = await generateLearningPath(sb, uid, ip, subject, course, mastery, notes);
    const firstTopic = map.topics?.[0];
    const firstSub = firstTopic?.subtopics?.[0];
    const next_topic = firstTopic && firstSub ? `${firstTopic.name} > ${firstSub.name}` : null;
    const difficulty: "intro" | "easy" | "medium" | "hard" =
      mastery < 35 ? "intro" : mastery < 55 ? "easy" : mastery < 75 ? "medium" : "hard";

    await sb
      .from("user_subject_state")
      .upsert({
        user_id: uid,
        subject,
        course,
        mastery,
        difficulty,
        next_topic,
        path: map,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,subject" });

    return map;
  })();

  generationLocks.set(key, lock);
  try {
    const result = await lock;
    return result;
  } finally {
    generationLocks.delete(key);
  }
}
