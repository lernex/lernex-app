import OpenAI from "openai";
import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import { checkUsageLimit, logUsage } from "./usage";
// In-process lock to dedupe concurrent level-map generations per user+subject.
// Note: Best-effort only (won't coordinate across server instances), but prevents
// most duplicate generations triggered by rapid client retries.
const generationLocks = new Map<string, Promise<LevelMap>>();
type PathGenerationProgress = {
  phase: string;
  detail?: string;
  pct?: number;
  attempts?: number;
  fallback?: boolean;
  startedAt: number;
  updatedAt: number;
};
const generationProgress = new Map<string, PathGenerationProgress>();
const progressKey = (uid: string, subject: string) => `${uid}:${subject}`;
export function isLearningPathGenerating(uid: string, subject: string) {
  return generationLocks.has(progressKey(uid, subject));
}
export function getLearningPathProgress(uid: string, subject: string) {
  const key = progressKey(uid, subject);
  const record = generationProgress.get(key);
  if (!record) return null;
  if (Date.now() - record.updatedAt > 120_000) {
    generationProgress.delete(key);
    return null;
  }
  const { phase, detail, pct, attempts, fallback, startedAt, updatedAt } = record;
  return { phase, detail, pct, attempts, fallback, startedAt, updatedAt };
}
export function updateLearningPathProgress(
  uid: string,
  subject: string,
  patch: Partial<Omit<PathGenerationProgress, "startedAt" | "updatedAt">> & { pct?: number }
) {
  const key = progressKey(uid, subject);
  const now = Date.now();
  const prev = generationProgress.get(key);
  const startedAt = prev?.startedAt ?? now;
  const next: PathGenerationProgress = {
    phase: patch.phase ?? prev?.phase ?? "preparing",
    detail: patch.detail ?? prev?.detail,
    pct: typeof patch.pct === "number" ? Math.max(0, Math.min(1, patch.pct)) : prev?.pct,
    attempts: patch.attempts ?? prev?.attempts,
    fallback: patch.fallback ?? prev?.fallback,
    startedAt,
    updatedAt: now,
  };
  generationProgress.set(key, next);
}
export function clearLearningPathProgress(uid: string, subject: string) {
  generationProgress.delete(progressKey(uid, subject));
}
// New, richer level map schema
export type LevelMap = {
  subject: string;
  course: string;
  topics: {
    name: string;
    completed?: boolean;
    subtopics: { name: string; mini_lessons: number; applications?: string[]; completed?: boolean }[];
  }[];
  cross_subjects?: { subject: string; course?: string; rationale?: string }[];
  persona?: { pace?: "slow" | "normal" | "fast"; difficulty?: "intro" | "easy" | "medium" | "hard"; notes?: string };
  progress?: {
    topicIdx?: number;
    subtopicIdx?: number;
    deliveredMini?: number;
    deliveredIdsByKey?: Record<string, string[]>;
    preferences?: { liked?: string[]; disliked?: string[]; saved?: string[] };
  };
};

const LEVEL_MAP_TABLE = "user_level_maps" as const;
const LEVEL_MAP_PENDING_TIMEOUT_MS = 4 * 60 * 1000;
const LEVEL_MAP_PENDING_RETRY_SECONDS = 5;

type LevelMapStatus = "pending" | "ready" | "failed";

type StoredLevelMap = {
  map: LevelMap | null;
  status: LevelMapStatus;
  course: string | null;
  error_reason: string | null;
  updated_at: string | null;
};

export class LearningPathPendingError extends Error {
  readonly retryAfterSeconds: number;
  readonly detail?: string;

  constructor(message: string, detail?: string, retryAfterSeconds = LEVEL_MAP_PENDING_RETRY_SECONDS) {
    super(message);
    this.name = "LearningPathPendingError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.detail = detail;
  }
}

function normalizeStoredLevelMap(row: Partial<StoredLevelMap> | null | undefined): StoredLevelMap {
  return {
    map: (row?.map as LevelMap | null) ?? null,
    status: (row?.status as LevelMapStatus | undefined) ?? "pending",
    course: (row?.course as string | null) ?? null,
    error_reason: (row?.error_reason as string | null) ?? null,
    updated_at: (row?.updated_at as string | null) ?? null,
  };
}

async function getStoredLevelMap(
  sb: SupabaseClient,
  uid: string,
  subject: string
): Promise<StoredLevelMap | null> {
  const { data, error } = await sb
    .from(LEVEL_MAP_TABLE)
    .select("map, status, course, error_reason, updated_at")
    .eq("user_id", uid)
    .eq("subject", subject)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return normalizeStoredLevelMap({
    map: (data.map as LevelMap | null) ?? null,
    status: (data.status as LevelMapStatus | null) ?? undefined,
    course: (data.course as string | null) ?? null,
    error_reason: (data.error_reason as string | null) ?? null,
    updated_at: (data.updated_at as string | null) ?? null,
  });
}

async function saveLevelMapRow(
  sb: SupabaseClient,
  uid: string,
  subject: string,
  course: string,
  map: LevelMap
) {
  await sb
    .from(LEVEL_MAP_TABLE)
    .upsert(
      {
        user_id: uid,
        subject,
        course,
        status: "ready" as LevelMapStatus,
        map,
        error_reason: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,subject" }
    );
}

async function markLevelMapFailed(
  sb: SupabaseClient,
  uid: string,
  subject: string,
  course: string,
  reason: string
) {
  await sb
    .from(LEVEL_MAP_TABLE)
    .upsert(
      {
        user_id: uid,
        subject,
        course,
        status: "failed" as LevelMapStatus,
        map: null,
        error_reason: reason.slice(0, 512),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,subject" }
    );
}

async function claimLevelMapGeneration(
  sb: SupabaseClient,
  uid: string,
  subject: string,
  course: string
) {
  const nowIso = new Date().toISOString();
  const pendingPayload = {
    user_id: uid,
    subject,
    course,
    status: "pending" as LevelMapStatus,
    map: null,
    error_reason: null,
    updated_at: nowIso,
  };
  const insertAttempt = await sb
    .from(LEVEL_MAP_TABLE)
    .insert(pendingPayload)
    .select("status")
    .maybeSingle();
  if (!insertAttempt.error) {
    return;
  }
  const error = insertAttempt.error as PostgrestError;
  if (error.code != "23505") {
    throw error;
  }
  const updateAttempt = await sb
    .from(LEVEL_MAP_TABLE)
    .update({
      status: "pending" as LevelMapStatus,
      course,
      map: null,
      error_reason: null,
      updated_at: nowIso,
    })
    .eq("user_id", uid)
    .eq("subject", subject)
    .neq("status", "pending")
    .select("status")
    .maybeSingle();
  if (updateAttempt.error) {
    throw updateAttempt.error;
  }
  if (!updateAttempt.data) {
    throw new LearningPathPendingError(
      "We are personalizing your learning path",
      "Another request is already generating this map."
    );
  }
}

async function ensureStoredLevelMap(
  sb: SupabaseClient,
  uid: string,
  subject: string,
  course: string,
  map: LevelMap,
  stored: StoredLevelMap | null
) {
  if (stored && stored.status === "ready" && stored.map && stored.course === course) {
    return;
  }
  await saveLevelMapRow(sb, uid, subject, course, map);
}

function isPendingFresh(row: StoredLevelMap | null) {
  if (!row || row.status !== "pending") return false;
  if (!row.updated_at) return true;
  const ageMs = Date.now() - new Date(row.updated_at).getTime();
  return ageMs < LEVEL_MAP_PENDING_TIMEOUT_MS;
}

async function loadCourseOutline(
  sb: SupabaseClient,
  subject: string,
  course: string
): Promise<LevelMap | null> {
  const { data, error } = await sb
    .from("course_outline_cache")
    .select("outline")
    .eq("subject", subject)
    .eq("course", course)
    .maybeSingle();
  if (error) {
    console.warn("[learning-path] loadCourseOutline failed", error);
    return null;
  }
  const outline = data?.outline as LevelMap | null;
  if (!outline || !Array.isArray(outline.topics) || !outline.topics.length) return null;
  return outline;
}

function sanitizeOutline(map: LevelMap): LevelMap {
  return {
    subject: map.subject,
    course: map.course,
    topics: (map.topics ?? []).map((topic) => ({
      name: topic.name,
      subtopics: (topic.subtopics ?? []).map((sub) => ({
        name: sub.name,
        mini_lessons: sub.mini_lessons,
        applications: sub.applications ?? [],
      })),
    })),
    cross_subjects: map.cross_subjects ?? [],
    persona: map.persona ? { ...map.persona } : undefined,
  };
}

async function saveCourseOutline(
  sb: SupabaseClient,
  subject: string,
  course: string,
  map: LevelMap
) {
  const outline = sanitizeOutline(map);
  try {
    await sb
      .from("course_outline_cache")
      .upsert(
        {
          subject,
          course,
          outline,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "subject,course" },
      );
  } catch (err) {
    console.warn("[learning-path] saveCourseOutline failed", err);
  }
}

function summarizeOutline(map: LevelMap): string {
  const topics = Array.isArray(map.topics) ? map.topics : [];
  if (!topics.length) return "(no cached outline)";
  const maxTopics = Math.min(topics.length, 8);
  const lines: string[] = [];
  for (let idx = 0; idx < maxTopics; idx++) {
    const topic = topics[idx];
    if (!topic) continue;
    const subs = Array.isArray(topic.subtopics) ? topic.subtopics : [];
    const maxSubs = Math.min(subs.length, 5);
    const subLines = [];
    for (let s = 0; s < maxSubs; s++) {
      const sub = subs[s];
      if (!sub?.name) continue;
      const lessons = Math.max(1, Number(sub.mini_lessons || 1));
      subLines.push(`${sub.name} (${lessons})`);
    }
    if (subs.length > maxSubs) subLines.push("...");
    const prefix = `${idx + 1}. ${topic.name ?? "Untitled Topic"}`;
    lines.push(subLines.length ? `${prefix}: ${subLines.join("; ")}` : prefix);
  }
  if (topics.length > maxTopics) {
    lines.push(`... ${topics.length - maxTopics} more topics in cache`);
  }
  return lines.join("\n");
}

function buildDeltaGuidance(
  mastery: number,
  pace: "slow" | "normal" | "fast",
  accSubj: number | null,
  accAll: number | null
): string[] {
  const guidance: string[] = [];
  if (mastery < 45) guidance.push("Reinforce foundations with scaffolded intro units before accelerating.");
  if (mastery > 70) guidance.push("Allow for optional acceleration paths or enrichment challenges.");
  if (pace === "slow") guidance.push("Keep mini_lessons lean and sequential; avoid parallel topic jumps.");
  if (pace === "fast") guidance.push("Bundle related subtopics where possible and add extension tasks.");
  if (accSubj !== null && accSubj < 55) guidance.push("Add diagnostic checkpoints after early topics to address misconceptions.");
  if (accSubj !== null && accSubj > 85) guidance.push("Introduce stretch applications to maintain engagement.");
  if (accAll !== null && accAll > 80 && accSubj !== null && accSubj < accAll - 10) {
    guidance.push("Bridge from stronger subjects to this course with cross-subject applications.");
  }
  return guidance;
}

export async function generateLearningPath(
  sb: SupabaseClient,
  uid: string,
  ip: string,
  subject: string,
  course: string,
  mastery: number,
  notes = ""
): Promise<LevelMap> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error("Missing GROK_API_KEY");
  const client = new OpenAI({
    apiKey,
    baseURL: process.env.GROK_BASE_URL || "https://api.x.ai/v1",
  });
  // Use a stronger default model for level map generation; allow override via env
  const model = process.env.GROK_LEVEL_MODEL || process.env.GROK_MODEL || "grok-4-fast-reasoning";
  const temperature = Number(process.env.GROK_TEMPERATURE ?? process.env.GROQ_TEMPERATURE ?? "0.8");
  const clampTokens = (value: unknown, fallback: number, min: number, max: number) => {
    const num = Number(value);
    const resolved = Number.isFinite(num) && num > 0 ? num : fallback;
    return Math.max(min, Math.min(max, resolved));
  };
  const MAX_TOK_MAIN = clampTokens(process.env.GROK_LEVEL_MAX_TOKENS_MAIN ?? process.env.GROQ_LEVEL_MAX_TOKENS_MAIN ?? "5500", 5500, 3000, 5900);
  const MAX_TOK_RETRY = clampTokens(process.env.GROK_LEVEL_MAX_TOKENS_RETRY ?? process.env.GROQ_LEVEL_MAX_TOKENS_RETRY ?? "4900", 4900, 2600, 5600);
  const MAX_TOK_FALLBACK = clampTokens(process.env.GROK_LEVEL_MAX_TOKENS_FALLBACK ?? process.env.GROQ_LEVEL_MAX_TOKENS_FALLBACK ?? "4100", 4100, 2100, 4700);

  const touchProgress = (patch: Parameters<typeof updateLearningPathProgress>[2]) => {
    updateLearningPathProgress(uid, subject, patch);
  };

  touchProgress({ phase: "Preparing learning path", pct: 0.05 });

  if (uid) {
    const ok = await checkUsageLimit(sb, uid);
    if (!ok) {
      touchProgress({ phase: "Usage limit exceeded", pct: 1 });
      throw new Error("Usage limit exceeded");
    }
  }

  touchProgress({ phase: "Gathering learner profile", pct: 0.1 });

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

  touchProgress({ phase: "Analyzing learner profile", pct: 0.18 });

  const { data: attempts } = await sb
    .from("attempts")
    .select("subject, correct_count, total, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(100);

  let correctAll = 0;
  let totalAll = 0;
  let correctSubj = 0;
  let totalSubj = 0;
  const nowTs = Date.now();
  let recentCount72h = 0;

  (attempts ?? []).forEach((a) => {
    const cc = a.correct_count ?? 0;
    const tt = a.total ?? 0;
    correctAll += cc;
    totalAll += tt;
    if (!a.subject || a.subject === subject) {
      correctSubj += cc;
      totalSubj += tt;
    }
    if (a.created_at && nowTs - +new Date(a.created_at) < 72 * 3_600_000) {
      recentCount72h += 1;
    }
  });

  const accAll = totalAll > 0 ? Math.round((correctAll / totalAll) * 100) : null;
  const accSubj = totalSubj > 0 ? Math.round((correctSubj / totalSubj) * 100) : null;
  const pace: "slow" | "normal" | "fast" = recentCount72h >= 12 ? "fast" : recentCount72h >= 4 ? "normal" : "slow";

  touchProgress({ phase: "Synthesizing performance signals", pct: 0.28 });

  const cachedOutline = await loadCourseOutline(sb, subject, course);
  const hasCachedOutline = !!cachedOutline;
  if (hasCachedOutline) {
    touchProgress({ phase: "Adapting cached outline", pct: 0.32 });
  }

  const deltaGuidance = buildDeltaGuidance(mastery, pace, accSubj, accAll);
  const outlineSummary = hasCachedOutline && cachedOutline ? summarizeOutline(cachedOutline) : null;

  const system = `You are a curriculum planner generating a compact level map.
Return ONLY a VALID JSON object (no markdown fences, no comments) with this structure and constraints:
{
  "subject": string,
  "course": string,
  "topics": [
    {
      "name": string,
      "subtopics": [
        { "name": string, "mini_lessons": number, "applications": string[] }
      ]
    }
  ],
  "cross_subjects": [ { "subject": string, "course": string | null, "rationale": string } ],
  "persona": { "pace": "slow|normal|fast", "difficulty": "intro|easy|medium|hard", "notes": string }
}
Constraints:
- Output must be STRICT JSON using double quotes only (no trailing commas).
- Keep topic count between 6 and 9 (no filler topics) with 2-5 subtopics each.
- mini_lessons: integer 1-4 per subtopic, scaled to difficulty and prerequisites.
- applications: up to 2 concise real-world hooks relevant to the learner.
- Order topics from foundations to advanced concepts without redundancy.
- Use naming aligned with typical "${course}" syllabi when applicable.
- Do NOT include any HTML. Escape braces if LaTeX is used.
- Keep the response concise (under ~4800 tokens).
`.trim();

  const adaptiveSystem = hasCachedOutline
    ? `${system}\n\nWhen provided with an existing outline summary, refine it instead of rebuilding from scratch. Preserve structure unless learner data requires reordering or additions.`
    : system;

  const userPrompt = [
    `Subject: ${subject}`,
    `Course: ${course}`,
    `Estimated mastery: ${mastery}%`,
    `Learner pace (last 72h): ${pace}`,
    accSubj !== null ? `Recent accuracy in ${subject}: ${accSubj}%` : undefined,
    accAll !== null ? `Overall recent accuracy: ${accAll}%` : undefined,
    coSubjects.length ? `Other courses: ${coSubjects.slice(0, 3).map((c) => `${c.subject}${c.course ? ` (${c.course})` : ""}`).join(", ")}` : undefined,
    interests.length ? `Interests (prioritize cross-subject applications relevant to): ${interests.slice(0, 6).join(", ")}` : undefined,
    notes ? `Additional notes: ${notes}` : undefined,
    deltaGuidance.length ? `Targeted adjustments:\n${deltaGuidance.map((line) => `- ${line}`).join("\n")}` : undefined,
    outlineSummary ? `Existing outline summary (edit in place):\n${outlineSummary}` : undefined,
    `Design goals:`,
    `- Tailor topic ordering and mini_lessons to the learner's mastery and pace.`,
    `- Highlight cross_subjects that connect ${subject} concepts to the listed courses/interests.`,
    hasCachedOutline ? `- Prefer editing the cached outline; only introduce or remove topics when necessary.` : `- Keep the map compact but comprehensive (avoid redundant units).`,
    `Task: Create the level map JSON exactly as per the schema.`
  ].filter(Boolean).join("\n");

  const primaryMaxTokens = hasCachedOutline ? Math.min(MAX_TOK_MAIN, 3600) : MAX_TOK_MAIN;
  const retryMaxTokens = hasCachedOutline ? Math.min(MAX_TOK_RETRY, 3200) : MAX_TOK_RETRY;
  const fallbackMaxTokens = hasCachedOutline ? Math.min(MAX_TOK_FALLBACK, 2800) : MAX_TOK_FALLBACK;

  let raw = "";
  let completion: OpenAI.Chat.Completions.ChatCompletion | null = null;
  let attemptsCount = 0;
  let fallbackUsed = false;
  let deterministicFallback = false;

  const syncAttemptProgress = () => {
    const pct = Math.min(0.45 + attemptsCount * 0.08, 0.63);
    touchProgress({ phase: "Requesting personalized map", pct, attempts: attemptsCount, fallback: fallbackUsed || deterministicFallback });
  };

  syncAttemptProgress();

  try {
    attemptsCount += 1;
    syncAttemptProgress();
    completion = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: primaryMaxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: adaptiveSystem },
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
      try {
        attemptsCount += 1;
        syncAttemptProgress();
        completion = await client.chat.completions.create({
          model,
          temperature,
          max_tokens: retryMaxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: adaptiveSystem },
            { role: "user", content: userPrompt },
          ],
        });
        raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "";
      } catch (err2) {
        const e2 = err2 as unknown as { error?: { failed_generation?: string } };
        const failed2 = e2?.error?.failed_generation;
        if (typeof failed2 === "string" && failed2.trim().length > 0) {
          raw = failed2;
        } else {
          attemptsCount += 1;
          fallbackUsed = true;
          syncAttemptProgress();
          completion = await client.chat.completions.create({
            model,
            temperature,
            max_tokens: fallbackMaxTokens,
            messages: [
              { role: "system", content: adaptiveSystem },
              { role: "user", content: userPrompt },
            ],
          });
          raw = (completion.choices?.[0]?.message?.content as string | undefined) ?? "";
        }
      }
    }
  }

  touchProgress({
    phase: fallbackUsed ? "Repairing map output" : "Validating map output",
    pct: fallbackUsed ? 0.7 : 0.66,
    attempts: attemptsCount,
    fallback: fallbackUsed || deterministicFallback,
  });

  const usageMetaBase = {
    feature: "fyp-learning-path",
    subject,
    course,
    mastery,
    pace,
    accuracySubject: accSubj,
    accuracyAll: accAll,
    cachedOutline: hasCachedOutline,
    attempts: attemptsCount,
    fallbackUsed,
    deterministicFallback,
    deltaGuidanceCount: deltaGuidance.length,
  };

  try {
    await logUsage(
      sb,
      uid,
      ip,
      "metric/level-map-attempts",
      { input_tokens: attemptsCount, output_tokens: fallbackUsed || deterministicFallback ? 1 : 0 },
      { metadata: { ...usageMetaBase, stage: "attempts" } },
    );
  } catch {}

  if (uid && completion?.usage) {
    const u = completion.usage as unknown as { prompt_tokens?: unknown; completion_tokens?: unknown };
    const promptTokens = typeof u.prompt_tokens === "number" ? u.prompt_tokens : null;
    const completionTokens = typeof u.completion_tokens === "number" ? u.completion_tokens : null;
    await logUsage(
      sb,
      uid,
      ip,
      model,
      { input_tokens: promptTokens, output_tokens: completionTokens },
      { metadata: { ...usageMetaBase, stage: "completion", promptTokens, completionTokens } },
    );
  }

  if (!raw) raw = "{}";

  function extractBalancedObject(s: string): string | null {
    let i = 0;
    let depth = 0;
    let start = -1;
    let inStr = false;
    let escaped = false;
    const n = s.length;
    for (; i < n; i++) {
      const ch = s[i];
      if (inStr) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start !== -1) return s.slice(start, i + 1);
      }
    }
    return null;
  }

  let parsed: LevelMap | null = null;
  try {
    parsed = JSON.parse(raw) as LevelMap;
  } catch {
    const extracted = extractBalancedObject(raw);
    if (!extracted) {
      try {
        attemptsCount += 1;
        fallbackUsed = true;
        touchProgress({ phase: "Repairing map output", pct: 0.72, attempts: attemptsCount, fallback: true });
        const repairSys = adaptiveSystem + "\nFinal requirement: Respond with ONLY a single strict JSON object (no prose). If previous output was truncated, regenerate compactly (<= 9 topics, <= 4 subtopics each, applications <= 2).";
        const repair = await client.chat.completions.create({
          model,
          temperature,
          max_tokens: primaryMaxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: repairSys },
            { role: "user", content: userPrompt },
          ],
        });
        raw = (repair.choices?.[0]?.message?.content as string | undefined) ?? "";
        parsed = JSON.parse(raw) as LevelMap;
      } catch {
        deterministicFallback = true;
        touchProgress({ phase: "Using safe fallback map", pct: 0.78, attempts: attemptsCount, fallback: true });
        parsed = buildFallbackLevelMap(subject, course, pace, mastery, interests, coSubjects, notes);
      }
    } else {
      parsed = JSON.parse(extracted) as LevelMap;
    }
  }

  if (deterministicFallback) {
    try {
      await logUsage(
        sb,
        uid,
        ip,
        "metric/level-map-fallback",
        { input_tokens: attemptsCount, output_tokens: 0 },
        { metadata: { ...usageMetaBase, stage: "fallback" } },
      );
    } catch {}
  }

  if (!parsed) {
    deterministicFallback = true;
    touchProgress({ phase: "Using safe fallback map", pct: 0.78, attempts: attemptsCount, fallback: true });
    parsed = buildFallbackLevelMap(subject, course, pace, mastery, interests, coSubjects, notes);
  }

  parsed.subject ||= subject;
  parsed.course ||= course;

  if (!Array.isArray(parsed.topics)) parsed.topics = [];

  type RawTopic = { name?: unknown; subtopics?: unknown; completed?: unknown };
  type RawSub = { name?: unknown; mini_lessons?: unknown; applications?: unknown; completed?: unknown };

  parsed.topics = (parsed.topics as unknown as RawTopic[])
    .map((t: RawTopic) => {
      const topicName = typeof t.name === "string" ? t.name.trim() : "";
      const rawSubs = Array.isArray(t.subtopics) ? (t.subtopics as RawSub[]) : [];
      const subtopics = rawSubs
        .map((s: RawSub) => {
          const subName = typeof s.name === "string" ? s.name.trim() : "";
          const ml = Math.max(1, Math.min(4, Number((s.mini_lessons as number | string | undefined) ?? 1)));
          const appsRaw = Array.isArray(s.applications)
            ? (s.applications as unknown[]).map((x) => String(x).trim()).filter((x) => !!x)
            : [];
          const applications = appsRaw.slice(0, 2);
          const completed = typeof s.completed === "boolean" ? s.completed : false;
          return {
            name: subName,
            mini_lessons: ml,
            applications: applications.length ? applications : undefined,
            completed,
          };
        })
        .filter((s) => !!s.name);
      const topicCompleted = typeof t.completed === "boolean" ? t.completed : false;
      return {
        name: topicName,
        subtopics: subtopics.slice(0, 6),
        completed: topicCompleted && subtopics.length > 0 ? subtopics.every((s) => s.completed === true) : false,
      };
    })
    .filter((t) => t.name && t.subtopics.length)
    .slice(0, 10);

  const fallbackFlag = fallbackUsed || deterministicFallback;

  const personaDifficulty: "intro" | "easy" | "medium" | "hard" =
    mastery < 35 ? "intro" : mastery < 55 ? "easy" : mastery < 75 ? "medium" : "hard";

  const personaNotes = [
    typeof parsed.persona?.notes === "string" ? parsed.persona.notes.trim() : "",
    notes?.trim() || "",
    fallbackFlag ? "Includes safe fallback adjustments to avoid delays." : "",
  ].filter(Boolean).join(" ").trim();

  parsed.persona = {
    pace,
    difficulty: personaDifficulty,
    ...(personaNotes ? { notes: personaNotes } : {}),
  };

  const crossSubjects =
    Array.isArray(parsed.cross_subjects) && parsed.cross_subjects.length
      ? parsed.cross_subjects
      : coSubjects.slice(0, 3).map((c) => ({
          subject: c.subject,
          ...(c.course ? { course: c.course } : {}),
          rationale: `Connect ${subject} with ${c.subject}${c.course ? ` (${c.course})` : ""} for richer projects.`,
        }));

  const normalizedCrossSubjects: NonNullable<LevelMap["cross_subjects"]> = [];
  crossSubjects.forEach((entry) => {
    const subj = typeof entry.subject === "string" ? entry.subject.trim() : "";
    if (!subj) return;
    const crs = typeof entry.course === "string" && entry.course.trim().length ? entry.course.trim() : undefined;
    const rationale =
      typeof entry.rationale === "string" && entry.rationale.trim()
        ? entry.rationale.trim()
        : `Relate ${subject} concepts to ${subj || "another field"}.`;
    normalizedCrossSubjects.push(crs ? { subject: subj, course: crs, rationale } : { subject: subj, rationale });
  });
  parsed.cross_subjects = normalizedCrossSubjects.slice(0, 5);

  touchProgress({ phase: "Finalizing personalized map", pct: 0.9, attempts: attemptsCount, fallback: fallbackFlag });
  touchProgress({ phase: "Learning path ready", pct: 1, attempts: attemptsCount, fallback: fallbackFlag });

  if (!deterministicFallback) {
    await saveCourseOutline(sb, subject, course, parsed);
  }

  return parsed;
}

function buildFallbackLevelMap(
  subject: string,
  course: string,
  pace: "slow" | "normal" | "fast",
  mastery: number,
  interests: string[],
  coSubjects: { subject: string; course?: string }[],
  notes: string
): LevelMap {
  const canonicalSubject = subject || "Learning";
  const canonicalCourse = course || `${canonicalSubject} Foundations`;
  const clampMini = (value: number) => Math.max(1, Math.min(4, Math.round(value)));
  const practiceWeight = pace === "slow" ? 3 : pace === "fast" ? 1 : 2;
  const depthWeight = mastery < 50 ? 3 : mastery < 75 ? 2 : 1;
  const interestSnippet = interests.slice(0, 2).filter(Boolean).join(" & ");

  const blueprint: {
    name: string;
    subs: { name: string; mini: number; apps?: (string | undefined)[] }[];
  }[] = [
    {
      name: "Orientation & Goals",
      subs: [
        {
          name: `Why ${canonicalCourse} matters`,
          mini: 1,
          apps: [
            `Spot ${canonicalSubject} in everyday life`,
            interestSnippet ? `Connect with ${interestSnippet}` : undefined,
          ],
        },
        {
          name: "Setting learning objectives",
          mini: practiceWeight,
          apps: [`Define your ${canonicalSubject} goals`],
        },
      ],
    },
    {
      name: `Core Concepts of ${canonicalSubject}`,
      subs: [
        {
          name: "Essential vocabulary",
          mini: depthWeight + 1,
          apps: [`Explain ${canonicalSubject} basics to a peer`],
        },
        {
          name: "Big ideas and frameworks",
          mini: depthWeight + 1,
          apps: [`Map ${canonicalSubject} concepts to real scenarios`],
        },
      ],
    },
    {
      name: "Tools & Techniques",
      subs: [
        {
          name: `Key tools for ${canonicalSubject}`,
          mini: practiceWeight,
          apps: [`Set up your ${canonicalSubject} toolkit`],
        },
        {
          name: "Step-by-step workflows",
          mini: practiceWeight + 1,
          apps: [`Apply workflows to a mini task`],
        },
        {
          name: "Frequent pitfalls to avoid",
          mini: 1,
          apps: [`Build resilient habits`],
        },
      ],
    },
    {
      name: `Applied ${canonicalSubject} Practice`,
      subs: [
        {
          name: "Guided exercises",
          mini: practiceWeight + 1,
          apps: [`Practice ${canonicalSubject} fundamentals`],
        },
        {
          name: "Mini projects",
          mini: practiceWeight + 1,
          apps: [`Create a small ${canonicalSubject} portfolio piece`],
        },
      ],
    },
    {
      name: "Interdisciplinary Connections",
      subs: [
        {
          name: "Cross-subject links",
          mini: 1,
          apps: coSubjects.slice(0, 2).map((c) => `Bridge with ${c.subject}`),
        },
        {
          name: "Real-world scenarios",
          mini: practiceWeight,
          apps: [`Apply ${canonicalSubject} to local problems`],
        },
      ],
    },
    {
      name: "Reflection & Next Steps",
      subs: [
        {
          name: "Progress checkpoint",
          mini: 1,
          apps: [`Assess ${canonicalSubject} mastery`],
        },
        {
          name: "Extension plan",
          mini: practiceWeight,
          apps: [`Plan advanced ${canonicalSubject} routes`],
        },
      ],
    },
  ];

  const topics = blueprint
    .map(({ name, subs }) => {
      const subtopics = subs
        .map((sub) => {
          const apps = (sub.apps ?? []).filter((a): a is string => !!a && a.trim().length > 0).slice(0, 2);
          return {
            name: sub.name,
            mini_lessons: clampMini(sub.mini),
            applications: apps.length ? apps : undefined,
            completed: false,
          };
        })
        .filter((s) => s.name.trim().length > 0);
      return {
        name,
        completed: false,
        subtopics,
      };
    })
    .filter((topic) => topic.subtopics.length)
    .slice(0, 6);

  const cross_subjects = coSubjects.slice(0, 3).map((c) => ({
    subject: c.subject,
    ...(c.course ? { course: c.course } : {}),
    rationale: `Connect ${canonicalSubject} with ${c.subject}${c.course ? ` (${c.course})` : ""} for richer projects.`,
  }));

  const personaNotes = [
    notes?.trim() || "",
    `Fallback plan tailored for a ${pace} pace.`,
    pace === "slow"
      ? "Includes extra guided practice to build confidence."
      : pace === "fast"
      ? "Includes stretch goals for rapid learners."
      : "Balances practice and challenge.",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    subject: canonicalSubject,
    course: canonicalCourse,
    topics,
    cross_subjects,
    persona: {
      pace,
      difficulty: mastery < 35 ? "intro" : mastery < 55 ? "easy" : mastery < 75 ? "medium" : "hard",
      ...(personaNotes ? { notes: personaNotes } : {}),
    },
    progress: {
      topicIdx: 0,
      subtopicIdx: 0,
      deliveredMini: 0,
    },
  };
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
  const { data: existing } = await sb
    .from("user_subject_state")
    .select("path, course, next_topic, difficulty")
    .eq("user_id", uid)
    .eq("subject", subject)
    .maybeSingle();

  const currentPath = existing?.path as LevelMap | null;
  const valid = currentPath && Array.isArray(currentPath.topics) && currentPath.topics.length > 0;
  let stored = await getStoredLevelMap(sb, uid, subject);

  if (valid && existing?.course === course) {
    await ensureStoredLevelMap(sb, uid, subject, course, currentPath as LevelMap, stored);
    return currentPath as LevelMap;
  }

  if (stored && stored.status === "ready" && stored.map && (stored.course ?? course) === course) {
    const map = stored.map;
    const firstTopic = map.topics?.[0];
    const firstSub = firstTopic?.subtopics?.[0];
    const nextTopic = firstTopic && firstSub ? `${firstTopic.name} > ${firstSub.name}` : null;
    const difficultyValue: "intro" | "easy" | "medium" | "hard" =
      mastery < 35 ? "intro" : mastery < 55 ? "easy" : mastery < 75 ? "medium" : "hard";
    await sb
      .from("user_subject_state")
      .upsert({
        user_id: uid,
        subject,
        course,
        mastery,
        difficulty: difficultyValue,
        next_topic: nextTopic,
        path: map,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,subject" });
    return map;
  }

  if (stored && stored.status === "pending" && (stored.course ?? course) === course && isPendingFresh(stored)) {
    throw new LearningPathPendingError(
      "We are personalizing your learning path",
      "Another request is already generating this map."
    );
  }

  const key = progressKey(uid, subject);
  const existingLock = generationLocks.get(key);
  if (existingLock) {
    await existingLock.catch(() => {});
    const { data: after } = await sb
      .from("user_subject_state")
      .select("path, course")
      .eq("user_id", uid)
      .eq("subject", subject)
      .maybeSingle();
    const p = after?.path as LevelMap | null;
    if (p && Array.isArray(p.topics) && p.topics.length > 0 && after?.course === course) {
      stored = stored ?? await getStoredLevelMap(sb, uid, subject);
      await ensureStoredLevelMap(sb, uid, subject, course, p, stored);
      return p;
    }
  }

  const lock = (async () => {
    await claimLevelMapGeneration(sb, uid, subject, course);

    let map: LevelMap;
    try {
      map = await generateLearningPath(sb, uid, ip, subject, course, mastery, notes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      try { await markLevelMapFailed(sb, uid, subject, course, message); } catch {}
      throw err;
    }

    updateLearningPathProgress(uid, subject, { phase: "Persisting learning path", pct: 0.95 });
    const firstTopic = map.topics?.[0];
    const firstSub = firstTopic?.subtopics?.[0];
    const nextTopic = firstTopic && firstSub ? `${firstTopic.name} > ${firstSub.name}` : null;
    const difficultyValue: "intro" | "easy" | "medium" | "hard" =
      mastery < 35 ? "intro" : mastery < 55 ? "easy" : mastery < 75 ? "medium" : "hard";

    await saveLevelMapRow(sb, uid, subject, course, map);
    await sb
      .from("user_subject_state")
      .upsert({
        user_id: uid,
        subject,
        course,
        mastery,
        difficulty: difficultyValue,
        next_topic: nextTopic,
        path: map,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,subject" });

    updateLearningPathProgress(uid, subject, { phase: "Learning path saved", pct: 1 });
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

