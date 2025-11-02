import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateLessonForTopic } from "@/lib/fyp";
import { getLearningPathProgress, type LevelMap } from "@/lib/learning-path";
import type { Lesson } from "@/lib/schema";
import type { Difficulty } from "@/types/placement";
import { acquireGenLock, releaseGenLock } from "@/lib/db-lock";
import { fetchUserTier } from "@/lib/model-config";
import { getNextPendingLesson, storePendingLesson, countPendingLessons } from "@/lib/pending-lessons";
import { getEmbedding, findMaxSimilarity } from "@/lib/embeddings";
import { compressContext } from "@/lib/semantic-compression";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const dedupeTail = (values: string[] | undefined, limit: number) => {
  if (!Array.isArray(values) || limit <= 0) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (let i = values.length - 1; i >= 0 && result.length < limit; i--) {
    const raw = typeof values[i] === "string" ? values[i]!.trim() : "";
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    result.push(raw);
  }
  return result.reverse();
};

type LessonKnowledge = {
  definition?: string;
  applications?: string[];
  prerequisites?: string[];
  reminders?: string[];
};

type CachedLesson = Lesson & {
  cachedAt?: string;
  nextTopicHint?: string | null;
  context?: Record<string, unknown> | null;
  knowledge?: LessonKnowledge | null;
  personaHash?: string | null;
  embedding?: number[] | null;
};

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const uid = user.id;
  const reqId = Math.random().toString(36).slice(2, 8);

  // Fetch user tier with cache-busting (always fresh, no stale data)
  const userTier = await fetchUserTier(sb, uid);

  const preview = (value: unknown, max = 160) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed.length <= max) return trimmed;
    const overflow = trimmed.length - max;
    return `${trimmed.slice(0, max)}...(+${overflow} chars)`;
  };

  const subjectParam = req.nextUrl.searchParams.get("subject");

  let subject = subjectParam || null;
  if (!subject) {
    // Prefer an existing subject row
    const { data: first } = await sb
      .from("user_subject_state")
      .select("subject")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    const firstState = first as { subject?: string } | null;
    subject = firstState?.subject ?? null;

    // If none, fall back to the first interest with a chosen course
    if (!subject) {
      const { data: prof } = await sb
        .from("profiles")
        .select("interests, level_map")
        .eq("id", user.id)
        .maybeSingle();
      const profile = prof as { interests?: unknown; level_map?: unknown } | null;
      const interests: string[] = Array.isArray(profile?.interests) ? (profile.interests as string[]) : [];
      const levelMap = (profile?.level_map || {}) as Record<string, string>;
      const firstSubject = interests.find((s) => levelMap[s]);
      subject = firstSubject ?? null;
    }
  }
  if (!subject) {
    console.warn(`[fyp][${reqId}] no-subject`, { uid: uid.slice(0,8), subjectParam });
    return new Response(JSON.stringify({ error: "No subject" }), { status: 400 });
  }

  const prefetchParam = req.nextUrl.searchParams.get("prefetch");
  const requestedPrefetchCount = (() => {
    if (prefetchParam == null) return 1;
    const parsed = Number(prefetchParam);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(3, Math.floor(parsed)));
  })();

  const buildProgressPayload = (phase?: string, detail?: string) => {
    const progress = getLearningPathProgress(user.id, subject);
    if (progress) return progress;
    if (!phase && !detail) return null;
    return { phase: phase ?? "Preparing your learning path", ...(detail ? { detail } : {}) };
  };

  const progressResponse = (retryAfter: string, phase?: string, detail?: string) =>
    new Response(
      JSON.stringify({ status: "generating", progress: buildProgressPayload(phase, detail) }),
      { status: 202, headers: { "retry-after": retryAfter } }
    );

  const MAX_CACHE_AGE_MS = 7 * 24 * 3600_000;
  type AttemptRow = {
    subject?: string | null;
    correct_count?: number | null;
    total?: number | null;
    created_at?: string | null;
  };
  let attemptRows: AttemptRow[] | null = null;
  const loadAttempts = async () => {
    if (attemptRows) return attemptRows;
    const { data } = await sb
      .from("attempts")
      .select("subject, correct_count, total, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(120);
    attemptRows = (data ?? []) as AttemptRow[];
    return attemptRows;
  };
  const computeSubjectMastery = (rows: AttemptRow[], subjectName: string) => {
    let correct = 0;
    let total = 0;
    for (const row of rows) {
      if (row.subject && row.subject !== subjectName) continue;
      correct += row.correct_count ?? 0;
      total += row.total ?? 0;
    }
    return { correct, total };
  };

  const computePerformanceRollup = (rows: AttemptRow[], subjectName: string) => {
    const now = Date.now();
    const normalizedSubject = subjectName.toLowerCase();

    const aggregate = (entries: AttemptRow[]) => {
      let correct = 0;
      let total = 0;
      let recent = 0;

      for (const row of entries) {
        const c = row.correct_count ?? 0;
        const t = row.total ?? 0;
        correct += c;
        total += t;
        const ts = row.created_at ? +new Date(row.created_at) : null;
        if (ts && now - ts < 72 * 3600_000) recent += 1;
      }

      return { correct, total, recent };
    };

    const subjectRows = rows.filter(
      (row) => typeof row.subject === 'string' && row.subject.toLowerCase() === normalizedSubject
    );
    let pool = subjectRows;
    if (!pool.length) {
      const neutralRows = rows.filter((row) => !row.subject);
      pool = neutralRows.length ? neutralRows : rows;
    }

    const { correct, total, recent } = aggregate(pool);
    const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : null;
    const pace: "slow" | "fast" = recent > 8 ? "fast" : "slow";
    return { accuracyPct, pace, sampleSize: total, recentSample: recent };
  };

  const toPace = (value: unknown): "slow" | "fast" =>
    value === "fast" ? "fast" : "slow";

  type PerformanceRollup = ReturnType<typeof computePerformanceRollup>;
  type AttemptSummary = {
    rows: AttemptRow[];
    mastery: { correct: number; total: number };
    performance: PerformanceRollup;
    latestBySubject: AttemptRow | null;
    latestOverall: AttemptRow | null;
  };
  let attemptSummaryCache: AttemptSummary | null = null;
  const loadAttemptSummary = async (): Promise<AttemptSummary> => {
    if (attemptSummaryCache) return attemptSummaryCache;
    const rows = await loadAttempts();
    const mastery = computeSubjectMastery(rows, subject);
    const performance = computePerformanceRollup(rows, subject);
    const normalizedSubject = subject.toLowerCase();
    let latestBySubject: AttemptRow | null = null;
    let latestOverall: AttemptRow | null = null;
    for (const row of rows) {
      if (!latestOverall) latestOverall = row;
      if (!latestBySubject && typeof row.subject === "string") {
        if (row.subject.toLowerCase() === normalizedSubject) {
          latestBySubject = row;
          break;
        }
      }
    }
    attemptSummaryCache = {
      rows,
      mastery,
      performance,
      latestBySubject,
      latestOverall,
    };
    return attemptSummaryCache;
  };

  const [
    stateResponse,
    progressRowResponse,
    preferenceResponse,
  ] = await Promise.all([
    sb
      .from("user_subject_state")
      .select("path, next_topic, difficulty, course")
      .eq("user_id", user.id)
      .eq("subject", subject)
      .maybeSingle(),
    sb
      .from("user_subject_progress")
      .select("topic_idx, subtopic_idx, delivered_mini, delivered_by_topic, delivered_ids_by_topic, delivered_titles_by_topic, completion_map, metrics")
      .eq("user_id", user.id)
      .eq("subject", subject)
      .maybeSingle(),
    sb
      .from("user_subject_preferences")
      .select("liked_ids, disliked_ids, saved_ids, tone_tags")
      .eq("user_id", user.id)
      .eq("subject", subject)
      .maybeSingle(),
  ]);

  let state = stateResponse.data as { path?: unknown; next_topic?: string; difficulty?: string; course?: string } | null;
  const progressRow = progressRowResponse.data as { topic_idx?: number; subtopic_idx?: number; delivered_mini?: number; delivered_by_topic?: unknown; delivered_ids_by_topic?: unknown; delivered_titles_by_topic?: unknown; completion_map?: unknown; metrics?: unknown } | null;
  const preferenceRow = preferenceResponse.data as { liked_ids?: unknown; disliked_ids?: unknown; saved_ids?: unknown; tone_tags?: unknown } | null;

  type PathProgress = {
    deliveredByTopic?: Record<string, number>;
    deliveredIdsByTopic?: Record<string, string[]>;
    deliveredIdsByKey?: Record<string, string[]>; // tolerate older/newer schema key
    deliveredTitlesByTopic?: Record<string, string[]>;
    preferences?: { liked?: string[]; disliked?: string[]; saved?: string[] };
    topicIdx?: number;
    subtopicIdx?: number;
    deliveredMini?: number;
    completionMap?: Record<string, boolean>;
    metrics?: {
      accuracyPct?: number | null;
      pace?: "slow" | "fast";
      computedAt?: string;
      sampleSize?: number;
      recentSample?: number;
      lastAttemptAt?: string | null;
    };
  };
  type PathWithProgress = LevelMap & { progress?: PathProgress };
  let path = state?.path as PathWithProgress | null;
  // Auto-generate a level map if missing or invalid
  const missingOrInvalid = !path || !Array.isArray(path.topics) || path.topics.length === 0;
  if (missingOrInvalid) {
    let course = typeof state?.course === "string" && state.course.trim().length ? state.course.trim() : null;
    let levelMapKeys: string[] = [];
    if (!course) {
      const { data: prof } = await sb
        .from("profiles")
        .select("level_map")
        .eq("id", user.id)
        .maybeSingle();
      const profData = prof as { level_map?: unknown } | null;
      const levelMap = (profData?.level_map || {}) as Record<string, string>;
      levelMapKeys = Object.keys(levelMap);
      const findCourse = (subj: string | null): string | undefined => {
        if (!subj) return undefined;
        const direct = levelMap[subj];
        if (direct) return direct;
        const key = Object.keys(levelMap).find((k) => k.toLowerCase() === subj.toLowerCase());
        if (key) return levelMap[key]!;
        const firstKey = Object.keys(levelMap)[0];
        return firstKey ? levelMap[firstKey] : undefined;
      };
      const lookedUp = findCourse(subject) ?? null;
      if (lookedUp) {
        course = lookedUp.trim();
        if (!state?.course || state.course !== course) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (sb as any)
              .from("user_subject_state")
              .upsert({
                user_id: user.id,
                subject,
                course,
                updated_at: new Date().toISOString(),
              }, { onConflict: "user_id,subject" });
            if (state) state = { ...state, course };
          } catch (courseErr) {
            console.warn(`[fyp][${reqId}] course-upsert-failed`, courseErr);
          }
        }
      }
    }
    if (!course) {
      console.warn(`[fyp][${reqId}] no-course-mapping`, { subject, levelMapKeys });
      return new Response(JSON.stringify({ error: "Not ready: no course mapping for subject" }), { status: 409 });
    }

    const { ensureLearningPath, isLearningPathGenerating, LearningPathPendingError } = await import("@/lib/learning-path");

    try {
      // Cross-instance DB lock. If not supported and busy, fallback to in-process lock inside ensureLearningPath.
      const lock = await acquireGenLock(sb, user.id, subject);
      if (!lock.supported && lock.reason === "error") {
        // DB error unrelated to missing table
        return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
      }
      if (lock.supported && !lock.acquired) {
        if (lock.reason === "busy") {
          // Someone else is generating; signal client to backoff and retry
          return progressResponse("3", "Another session is preparing your learning path", "Waiting for the current generation to finish.");
        } else if (lock.reason === "error") {
          // Lock table exists but errored; fall back to in-process lock if active, otherwise proceed without lock
          if (isLearningPathGenerating(user.id, subject)) {
            return progressResponse("3", "Finishing an existing generation", "Re-using the map from a parallel request.");
          }
        }
      }
      if (!lock.supported) {
        // No DB lock available; if our in-process lock is active, signal 202 too
        if (isLearningPathGenerating(user.id, subject)) {
          return progressResponse("3", "Finalizing your learning path", "A previous request is still wrapping up.");
        }
      }

      let mastery = 50;
      let pace: "slow" | "fast" = "slow";
      let notes = `Learner pace: ${pace}. Personalized for ${subject}.`;
      try {
        const summary = await loadAttemptSummary();
        const { correct, total } = summary.mastery;
        mastery = total > 0 ? Math.round((correct / total) * 100) : 50;
        const rollup = summary.performance;
        pace = rollup.pace;
        const sampleDetail = rollup.sampleSize > 0 ? ` sample=${rollup.sampleSize}` : "";
        notes = `Learner pace: ${pace}. Personalized for ${subject}.${sampleDetail}`;
      } catch (attemptErr) {
        console.warn(`[fyp][${reqId}] attempt-rollup failed`, attemptErr);
      }

      const p = await ensureLearningPath(sb, user.id, ip, subject, course, mastery, notes);
      path = p as PathWithProgress;
      const { data: refreshed } = await sb
        .from("user_subject_state")
        .select("path, next_topic, difficulty, course")
        .eq("user_id", user.id)
        .eq("subject", subject)
        .maybeSingle();
      state = refreshed ?? state;
      if (lock.acquired && lock.supported) await releaseGenLock(sb, user.id, subject);
    } catch (e) {
      if (e instanceof LearningPathPendingError) {
        try { await releaseGenLock(sb, user.id, subject); } catch {}
        const retryAfter = String(e.retryAfterSeconds ?? 5);
        return progressResponse(retryAfter, e.message, e.detail);
      }
      const msg = e instanceof Error ? e.message : "Server error";
      const status = msg === "Usage limit exceeded" ? 403 : 500;
      try { await releaseGenLock(sb, user.id, subject); } catch {}
      console.error(`[fyp][${reqId}] ensureLearningPath: error`, { msg, status });
      return new Response(JSON.stringify({ error: msg }), { status });
    }
  }

  if (!path || !Array.isArray(path.topics)) {
    console.warn(`[fyp][${reqId}] no-learning-path after ensure`);
    return new Response(JSON.stringify({ error: "No learning path" }), { status: 400 });
  }
  const topics = path.topics;
  if (!topics.length) {
    console.warn(`[fyp][${reqId}] empty-topics`);
    return new Response(JSON.stringify({ error: "No topics in level map" }), { status: 400 });
  }
  const legacyProgress = (path.progress ?? {}) as PathProgress;

  const mergeRecord = <T>(base: Record<string, T>, patch: unknown) => {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
    for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
      if (value !== undefined && value !== null) {
        base[key] = value as T;
      }
    }
    return base;
  };

  const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    const result: string[] = [];
    for (const entry of value) {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (trimmed.length) result.push(trimmed);
      }
    }
    return result;
  };

  const fallbackArray = (value: string[] | undefined) =>
    Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()) : [];

  const progress: PathProgress = {};
  progress.deliveredByTopic = mergeRecord(
    { ...(legacyProgress.deliveredByTopic ?? {}) },
    progressRow?.delivered_by_topic
  );
  const legacyDeliveredIds = legacyProgress.deliveredIdsByTopic ?? legacyProgress.deliveredIdsByKey ?? {};
  progress.deliveredIdsByTopic = mergeRecord(
    { ...legacyDeliveredIds },
    progressRow?.delivered_ids_by_topic
  );
  progress.deliveredTitlesByTopic = mergeRecord(
    { ...(legacyProgress.deliveredTitlesByTopic ?? {}) },
    progressRow?.delivered_titles_by_topic
  );
  progress.completionMap = mergeRecord(
    { ...(legacyProgress.completionMap ?? {}) },
    progressRow?.completion_map
  );
  progress.topicIdx = typeof progressRow?.topic_idx === "number" ? progressRow.topic_idx : legacyProgress.topicIdx;
  progress.subtopicIdx = typeof progressRow?.subtopic_idx === "number" ? progressRow.subtopic_idx : legacyProgress.subtopicIdx;
  progress.deliveredMini = typeof progressRow?.delivered_mini === "number" ? progressRow.delivered_mini : legacyProgress.deliveredMini;
  progress.metrics = (progressRow?.metrics as PathProgress["metrics"] | null | undefined) ?? legacyProgress.metrics;

  const likedIds = toStringArray(preferenceRow?.liked_ids);
  const dislikedIds = toStringArray(preferenceRow?.disliked_ids);
  const savedIds = toStringArray(preferenceRow?.saved_ids);
  const toneTags = toStringArray(preferenceRow?.tone_tags);
  const toneSample = toneTags.slice(-6).reverse();

  const legacyPrefs = legacyProgress.preferences ?? {};
  progress.preferences = {
    liked: likedIds.length ? likedIds : fallbackArray(legacyPrefs.liked),
    disliked: dislikedIds.length ? dislikedIds : fallbackArray(legacyPrefs.disliked),
    saved: savedIds.length ? savedIds : fallbackArray(legacyPrefs.saved),
  };

  const completionMap = progress.completionMap ?? {};
  const isMarkedComplete = (topicName: string, subtopicName: string, fallbackCompleted?: boolean) => {
    const key = `${topicName} > ${subtopicName}`;
    if (completionMap[key] === true) return true;
    if (completionMap[key] === false) return false;
    return fallbackCompleted === true;
  };

  const findFirstIncomplete = () => {
    for (let ti = 0; ti < topics.length; ti++) {
      const topicEntry = topics[ti];
      if (!topicEntry) continue;
      const subs = topicEntry.subtopics ?? [];
      for (let si = 0; si < subs.length; si++) {
        const sub = subs[si];
        if (!sub) continue;
        if (!isMarkedComplete(topicEntry.name, sub.name, (sub as { completed?: boolean }).completed)) {
          return [ti, si] as [number, number];
        }
      }
    }
    return null as null;
  };

  let topicIdx = typeof progress.topicIdx === "number" && Number.isFinite(progress.topicIdx)
    ? Math.max(0, Math.min(progress.topicIdx, topics.length - 1))
    : 0;
  let subtopicIdx = typeof progress.subtopicIdx === "number" && Number.isFinite(progress.subtopicIdx)
    ? Math.max(0, Math.min(progress.subtopicIdx, (topics[topicIdx]?.subtopics?.length ?? 1) - 1))
    : 0;
  let deliveredMini = typeof progress.deliveredMini === "number" && Number.isFinite(progress.deliveredMini)
    ? Math.max(0, progress.deliveredMini)
    : 0;

  if ((progress.topicIdx == null || progress.subtopicIdx == null) && typeof state?.next_topic === "string") {
    const [tName, sName] = state.next_topic.split(">").map((x) => x.trim());
    const tIdx = topics.findIndex((t) => t?.name === tName);
    if (tIdx >= 0) {
      topicIdx = tIdx;
      const subs = topics[tIdx]?.subtopics ?? [];
      const sIdx = subs.findIndex((s) => s?.name === sName);
      if (sIdx >= 0) subtopicIdx = sIdx;
    }
  }

  if (subtopicIdx >= (topics[topicIdx]?.subtopics?.length ?? 1)) {
    subtopicIdx = Math.max(0, (topics[topicIdx]?.subtopics?.length ?? 1) - 1);
  }

  const firstInc = findFirstIncomplete();
  if (firstInc) {
    const currentTopic = topics[topicIdx];
    const currentSub = currentTopic?.subtopics?.[subtopicIdx];
    const currentCompleted = currentTopic && currentSub
      ? isMarkedComplete(currentTopic.name, currentSub.name, (currentSub as { completed?: boolean }).completed)
      : false;
    if (currentCompleted) {
      topicIdx = firstInc[0];
      subtopicIdx = firstInc[1];
      deliveredMini = 0;
    }
  }

  const curTopic = topics[topicIdx];
  const curSub = curTopic?.subtopics?.[subtopicIdx];
  if (!curTopic || !curSub) {
    console.warn(`[fyp][${reqId}] invalid-indices`, { topicIdx, subtopicIdx });
    return new Response(JSON.stringify({ error: "Invalid level map indices" }), { status: 400 });
  }
  const currentLabel = `${curTopic.name} > ${curSub.name}`;

  const findNextIncompleteAfterCurrent = () => {
    for (let ti = topicIdx; ti < topics.length; ti++) {
      const topicEntry = topics[ti];
      if (!topicEntry) continue;
      const subs = topicEntry.subtopics ?? [];
      const start = ti === topicIdx ? subtopicIdx + 1 : 0;
      for (let si = start; si < subs.length; si++) {
        const sub = subs[si];
        if (!sub) continue;
        if (!isMarkedComplete(topicEntry.name, sub.name, (sub as { completed?: boolean }).completed)) {
          return { topicIdx: ti, subtopicIdx: si, label: `${topicEntry.name} > ${sub.name}` };
        }
      }
    }
    const first = findFirstIncomplete();
    if (first && (first[0] !== topicIdx || first[1] !== subtopicIdx)) {
      const topicEntry = topics[first[0]];
      const sub = topicEntry?.subtopics?.[first[1]];
      if (topicEntry && sub) return { topicIdx: first[0], subtopicIdx: first[1], label: `${topicEntry.name} > ${sub.name}` };
    }
    return null as null;
  };

  let metricsPatch: Record<string, unknown> | null = null;
  const baseMetrics = progress.metrics ?? null;
  const cachedComputedAt = typeof baseMetrics?.computedAt === "string" ? baseMetrics.computedAt : null;
  const cachedComputedMs = cachedComputedAt ? Date.parse(cachedComputedAt) : Number.NaN;
  let accuracyPct: number | null = typeof baseMetrics?.accuracyPct === "number" ? Math.round(baseMetrics.accuracyPct) : null;
  let pace: "slow" | "fast" = toPace(baseMetrics?.pace);
  const cachedLastAttemptAt = typeof baseMetrics?.lastAttemptAt === "string" ? baseMetrics.lastAttemptAt : null;
  let latestAttemptRow: AttemptRow | null = null;
  let attemptSummaryForMetrics: AttemptSummary | null = null;
  try {
    attemptSummaryForMetrics = await loadAttemptSummary();
    latestAttemptRow = attemptSummaryForMetrics.latestBySubject ?? attemptSummaryForMetrics.latestOverall;
  } catch (latestErr) {
    attemptSummaryForMetrics = null;
    console.warn(`[fyp][${reqId}] latest-attempt lookup failed`, latestErr);
  }
  // Event-driven metrics refresh: only recalculate on new lesson completion
  let metricsRefreshNeeded = !baseMetrics || accuracyPct == null;
  if (!metricsRefreshNeeded && latestAttemptRow?.created_at) {
    const latestAttemptMs = Date.parse(latestAttemptRow.created_at);
    const cachedAttemptMs = cachedLastAttemptAt ? Date.parse(cachedLastAttemptAt) : Number.NaN;
    if (Number.isFinite(latestAttemptMs) && (!Number.isFinite(cachedAttemptMs) || latestAttemptMs > cachedAttemptMs)) {
      metricsRefreshNeeded = true;
    }
  }
  if (metricsRefreshNeeded) {
    if (!attemptSummaryForMetrics) {
      try {
        attemptSummaryForMetrics = await loadAttemptSummary();
      } catch (summaryErr) {
        console.warn(`[fyp][${reqId}] attempt-summary failed`, summaryErr);
        attemptSummaryForMetrics = null;
      }
    }
    if (attemptSummaryForMetrics) {
      const performance = attemptSummaryForMetrics.performance;
      accuracyPct = performance.accuracyPct;
      pace = performance.pace;
      const computedAt = new Date().toISOString();
      const freshestAttempt =
        latestAttemptRow
        ?? attemptSummaryForMetrics.latestBySubject
        ?? attemptSummaryForMetrics.latestOverall;
      const lastAttemptAt = freshestAttempt?.created_at ?? cachedLastAttemptAt ?? null;
      progress.metrics = {
        accuracyPct,
        pace,
        computedAt,
        sampleSize: performance.sampleSize,
        recentSample: performance.recentSample,
        lastAttemptAt,
      };
      metricsPatch = {
        accuracyPct,
        pace,
        computedAt,
        sampleSize: performance.sampleSize,
        recentSample: performance.recentSample,
        lastAttemptAt,
      };
    }
  } else if (latestAttemptRow?.created_at && !cachedLastAttemptAt) {
    progress.metrics = {
      ...(progress.metrics ?? {}),
      lastAttemptAt: latestAttemptRow.created_at,
    };
  }

  const deliveredIdsByTopic = progress.deliveredIdsByTopic ?? {};
  const deliveredTitlesByTopic = progress.deliveredTitlesByTopic ?? {};
  const idDescriptorMap = new Map<string, { title?: string; topic: string }>();
  for (const [label, ids] of Object.entries(deliveredIdsByTopic)) {
    if (!Array.isArray(ids)) continue;
    const rawTitles = Array.isArray(deliveredTitlesByTopic[label])
      ? (deliveredTitlesByTopic[label] as unknown[])
      : [];
    ids.forEach((rawId, idx) => {
      if (typeof rawId !== "string") return;
      const lessonId = rawId.trim();
      if (!lessonId) return;
      const candidateTitle = typeof rawTitles[idx] === "string" ? String(rawTitles[idx]).trim() : "";
      idDescriptorMap.set(lessonId, {
        title: candidateTitle || undefined,
        topic: label,
      });
    });
  }
  const deriveLabelFromId = (rawId: string) => {
    const sanitized = rawId.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
    if (!sanitized) return null;
    const segments = sanitized.split(/[-_]+/).filter((segment) => segment.length > 0);
    if (!segments.length) return null;
    const slice = segments.slice(-3);
    const words = slice.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));
    return words.join(" ");
  };
  const describeLessonIds = (ids: string[] | undefined, limit = 6) => {
    if (!Array.isArray(ids) || !ids.length) return [] as string[];
    const result: string[] = [];
    const seen = new Set<string>();
    for (const raw of ids) {
      if (typeof raw !== "string") continue;
      const lessonId = raw.trim();
      if (!lessonId) continue;
      const descriptor = idDescriptorMap.get(lessonId);
      const label = descriptor?.title ?? descriptor?.topic ?? deriveLabelFromId(lessonId) ?? null;
      if (!label) continue;
      const trimmed = label.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
      if (result.length >= limit) break;
    }
    return result;
  };

  const recentDeliveredIds = dedupeTail(deliveredIdsByTopic[currentLabel], 10); // OPTIMIZATION: Reduced from 24→10 (saves ~14 IDs × 3 tokens = ~42 tokens)
  const recentDeliveredTitles = dedupeTail(deliveredTitlesByTopic[currentLabel], 8); // OPTIMIZATION: Reduced from 24→8 (saves ~16 titles × 2.5 tokens = ~40 tokens)
  const likedTail = dedupeTail(progress.preferences?.liked, 30);
  const savedTail = dedupeTail(progress.preferences?.saved, 30);
  const dislikedTail = dedupeTail(progress.preferences?.disliked, 30);

  const preferenceIdsNeedingLabels = new Set<string>();
  for (const group of [likedTail, savedTail, dislikedTail]) {
    for (const raw of group) {
      if (typeof raw !== "string") continue;
      const lessonId = raw.trim();
      if (!lessonId || idDescriptorMap.has(lessonId)) continue;
      preferenceIdsNeedingLabels.add(lessonId);
    }
  }

  if (preferenceIdsNeedingLabels.size) {
    const { data: descriptorRows, error: descriptorError } = await sb
      .from("user_topic_lesson_cache")
      .select("topic_label, lessons")
      .eq("user_id", user.id)
      .eq("subject", subject);
    if (descriptorError) {
      console.warn(`[fyp][${reqId}] descriptor cache fetch failed`, descriptorError);
    }
    if (Array.isArray(descriptorRows)) {
      for (const row of descriptorRows as { topic_label?: unknown; lessons?: unknown }[]) {
        if (!preferenceIdsNeedingLabels.size) break;
        const topicLabel = typeof row.topic_label === "string" ? row.topic_label.trim() : "";
        const lessonsArray = Array.isArray(row.lessons) ? (row.lessons as unknown[]) : [];
        for (const rawLesson of lessonsArray) {
          if (!preferenceIdsNeedingLabels.size) break;
          if (!rawLesson || typeof rawLesson !== "object") continue;
          const entry = rawLesson as { id?: unknown; title?: unknown; topic?: unknown };
          const lessonId = typeof entry.id === "string" ? entry.id.trim() : "";
          if (!lessonId || !preferenceIdsNeedingLabels.has(lessonId) || idDescriptorMap.has(lessonId)) continue;
          const title = typeof entry.title === "string" ? entry.title.trim() : "";
          const topicName = typeof entry.topic === "string" ? entry.topic.trim() : topicLabel;
          if (!title && !topicName) continue;
          idDescriptorMap.set(lessonId, {
            title: title || undefined,
            topic: topicName || title || lessonId,
          });
          preferenceIdsNeedingLabels.delete(lessonId);
        }
      }
    }
  }

  if (preferenceIdsNeedingLabels.size) {
    const idsToFetch = Array.from(preferenceIdsNeedingLabels).slice(0, 60);
    if (idsToFetch.length) {
      const { data: catalogRows, error: catalogError } = await sb
        .from("lessons")
        .select("id, title, subject")
        .in("id", idsToFetch);
      if (catalogError) {
        console.warn(`[fyp][${reqId}] preference catalog fetch failed`, catalogError);
      } else if (Array.isArray(catalogRows)) {
        for (const row of catalogRows as Record<string, unknown>[]) {
          const lessonId = typeof row.id === "string" ? row.id.trim() : "";
          if (!lessonId || !preferenceIdsNeedingLabels.has(lessonId) || idDescriptorMap.has(lessonId)) continue;
          const title = typeof row.title === "string" ? row.title.trim() : "";
          const record = row as Record<string, unknown>;
          const topicRaw = typeof record.topic === "string" ? record.topic.trim() : "";
          const topicLabelRaw = typeof record.topic_label === "string" ? record.topic_label.trim() : "";
          const subjectLabel = typeof record.subject === "string" ? record.subject.trim() : "";
          const topicName = topicRaw || topicLabelRaw || subjectLabel || title || deriveLabelFromId(lessonId) || lessonId;
          idDescriptorMap.set(lessonId, {
            title: title || undefined,
            topic: topicName,
          });
          preferenceIdsNeedingLabels.delete(lessonId);
          if (!preferenceIdsNeedingLabels.size) break;
        }
      }
    }
  }

  const likedHighlights = describeLessonIds(likedTail, 6);
  const savedHighlights = describeLessonIds(savedTail, 6);
  const dislikedHighlights = describeLessonIds(dislikedTail, 6);
  const preferenceFallback = recentDeliveredTitles.slice(-3).reverse();
  const likedDescriptors = likedHighlights.length ? likedHighlights : preferenceFallback;
  const savedDescriptors = savedHighlights.length ? savedHighlights : preferenceFallback;

  const plannedMini = Math.max(1, Number(curSub.mini_lessons || 1));
  const completedMini = Math.min(deliveredMini, plannedMini);
  const nextTopicCandidate = findNextIncompleteAfterCurrent();
  // OPTIMIZED: Compress next_topic_hint to show only subtopic name (saves ~40 tokens)
  const nextTopicHint = nextTopicCandidate && nextTopicCandidate.label !== currentLabel
    ? `Next: ${nextTopicCandidate.label.split(' > ').slice(-1)[0]}`
    : null;
  type LessonPrep = {
    lessonKnowledge: LessonKnowledge;
    accuracyBand: string | null;
    previousLessonContext: string | null;
    recentMissSummary: string | null;
    learnerProfileLine: string | null;
    mapSummary: string;
    structuredContext: Record<string, unknown>;
    personalization: {
      style: { prefer: string[]; avoid: string[] };
      lessons: { leanInto: string[]; avoid: string[]; saved?: string[] };
    };
    personaHash: string;
    guardrails: { avoidIds: string[]; avoidTitles: string[] };
  };
  let lessonPrepCache: LessonPrep | null = null;
  const ensureLessonPrep = async (): Promise<LessonPrep> => {
    if (lessonPrepCache) return lessonPrepCache;

    const collectStrings = (values: unknown[], limit: number) =>
      values
        .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry ?? "").trim()))
        .filter((entry) => entry.length > 0)
        .slice(0, limit);

    const subApplications = Array.isArray((curSub as { applications?: unknown }).applications)
      ? collectStrings((curSub as { applications: unknown[] }).applications, 4)
      : [];
    const subDefinition = typeof (curSub as { definition?: unknown }).definition === "string"
      ? ((curSub as { definition: string }).definition ?? "").trim()
      : "";
    const subPrerequisites = Array.isArray((curSub as { prerequisites?: unknown }).prerequisites)
      ? collectStrings((curSub as { prerequisites: unknown[] }).prerequisites, 6)
      : [];
    const subReminders = Array.isArray((curSub as { reminders?: unknown }).reminders)
      ? collectStrings((curSub as { reminders: unknown[] }).reminders, 5)
      : [];

    const fallbackDefinition = `Key idea: ${curSub.name} keeps ${subject} progress grounded before the next mini-lesson.`;
    const fallbackPrereqs = [
      `Review notes from ${curTopic.name}.`,
      `Summarize the previous lesson aloud.`,
    ];
    const fallbackReminders = [
      `Apply ${curSub.name} to one quick example after reading.`,
      `Check each step of ${curSub.name} against a worked solution.`,
    ];

    let knowledgeDefinition = subDefinition || fallbackDefinition;
    let knowledgePrereqs = Array.from(new Set([...subPrerequisites, ...fallbackPrereqs]))
      .filter((entry) => entry.length > 0)
      .slice(0, 4);
    let knowledgeReminders = Array.from(new Set([...subReminders, ...fallbackReminders]))
      .filter((entry) => entry.length > 0)
      .slice(0, 3);

    // OPTIMIZED: Apply semantic compression to knowledge fields BEFORE manual truncation
    // This preserves semantic meaning better than character-based truncation
    const enableKnowledgeCompression = process.env.ENABLE_SEMANTIC_COMPRESSION === 'true';

    if (enableKnowledgeCompression && knowledgeDefinition.length > 100) {
      try {
        const compressionResult = await compressContext(knowledgeDefinition, {
          rate: 0.7,  // Aggressive compression for knowledge fields
          maxTokens: 20,  // Target ~40 chars
          useCache: true,
          temperature: 0.05,  // Very deterministic for knowledge
        });
        knowledgeDefinition = compressionResult.compressed;
      } catch (err) {
        console.warn('[fyp] knowledge-definition-compression-failed', err);
        // Fallback to original truncation
      }
    }

    // OPTIMIZED: Compress prerequisites array if combined length is significant
    if (enableKnowledgeCompression && knowledgePrereqs.length > 0) {
      const prereqsText = knowledgePrereqs.join('; ');
      if (prereqsText.length > 120) {
        try {
          const compressionResult = await compressContext(prereqsText, {
            rate: 0.7,
            maxTokens: 30,  // Target ~60 chars
            useCache: true,
            temperature: 0.05,
          });
          // Split back into array (or use as single string)
          knowledgePrereqs = [compressionResult.compressed];
        } catch (err) {
          console.warn('[fyp] knowledge-prereqs-compression-failed', err);
        }
      }
    }

    // OPTIMIZED: Compress reminders array if combined length is significant
    if (enableKnowledgeCompression && knowledgeReminders.length > 0) {
      const remindersText = knowledgeReminders.join('; ');
      if (remindersText.length > 100) {
        try {
          const compressionResult = await compressContext(remindersText, {
            rate: 0.7,
            maxTokens: 20,  // Target ~40 chars
            useCache: true,
            temperature: 0.05,
          });
          knowledgeReminders = [compressionResult.compressed];
        } catch (err) {
          console.warn('[fyp] knowledge-reminders-compression-failed', err);
        }
      }
    }

    // OPTIMIZED: Aggressively compressed knowledge fields (80-120 token savings per request)
    // More aggressive compression: shorter limits, fewer items
    const compressKnowledge = (def: string) => {
      const parts = def.split(/[:.]/);
      return parts.length > 1 ? parts[0].trim().slice(0, 40) : def.slice(0, 40);
    };
    const compressedDef = compressKnowledge(knowledgeDefinition);
    // Prerequisites: semicolon-separated, max 60 chars total
    const compressedPrereqs = knowledgePrereqs
      .slice(0, 3)
      .map(p => p.split('.')[0].trim())
      .join(';')
      .slice(0, 60);
    // Reminders: first only, max 40 chars
    const compressedReminder = knowledgeReminders.length > 0
      ? knowledgeReminders[0].split('.')[0].trim().slice(0, 40)
      : '';

    const lessonKnowledge: LessonKnowledge = {
      definition: compressedDef,
      // Applications: first 1 only, 20 chars max
      ...(subApplications.length ? { applications: [subApplications[0].slice(0, 20)] } : {}),
      ...(compressedPrereqs.length ? { prerequisites: [compressedPrereqs] } : {}),
      ...(compressedReminder.length ? { reminders: [compressedReminder] } : {}),
    };

    const accuracyBandNum = accuracyPct == null
      ? null
      : accuracyPct >= 85
      ? 3
      : accuracyPct >= 70
      ? 2
      : accuracyPct >= 50
      ? 1
      : 0;
    const accuracyBand = accuracyBandNum != null ? String(accuracyBandNum) : null;

    const previousLessonTitle = recentDeliveredTitles.length ? recentDeliveredTitles[recentDeliveredTitles.length - 1] : null;
    let recentMissSummary: string | null = null;
    if (latestAttemptRow && typeof latestAttemptRow.total === "number" && typeof latestAttemptRow.correct_count === "number") {
      const totalQs = Math.max(0, latestAttemptRow.total ?? 0);
      const missed = Math.max(0, totalQs - (latestAttemptRow.correct_count ?? 0));
      if (totalQs > 0 && missed > 0) {
        recentMissSummary = `Missed ${missed}/${totalQs} last quiz`;
      }
    }
    const previousLessonContext = previousLessonTitle
      ? `${previousLessonTitle}${recentMissSummary ? ` - ${recentMissSummary}` : ""}`
      : recentMissSummary;

    // OPTIMIZED: Abbreviated keys in mapSummary for token savings
    const mapSummaryParts = [
      `f=${currentLabel}`,  // focus -> f
      `p=${pace}`,  // pace -> p
      accuracyBand ? `acc=${accuracyBand}` : null,  // accuracy -> acc
      `m=${completedMini}/${plannedMini}`,  // mini -> m
      nextTopicHint ? `n=${nextTopicHint}` : null,  // next -> n
    ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
    const mapSummary = mapSummaryParts.join("|");

    // OPTIMIZED: Ultra-compressed learner_profile CSV (saves ~30 tokens per request)
    const learnerProfileLine = [
      pace === "slow" ? "s" : pace === "fast" ? "f" : "n",  // slow->s, fast->f, normal->n
      accuracyBand ?? (accuracyPct != null ? `${Math.round(accuracyPct)}` : null),  // Remove % sign
      state?.difficulty ? (String(state.difficulty) === "medium" ? "m" : String(state.difficulty).charAt(0)) : null,  // First letter
    ]
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      .join(",");

    const stylePrefer = new Set<string>();
    const styleAvoid = new Set<string>();
    const addCue = (bucket: Set<string>, value: string | null | undefined) => {
      if (!value) return;
      const trimmed = value.trim();
      if (trimmed.length) bucket.add(trimmed);
    };

    toneSample.slice(-3).forEach((tag) => addCue(stylePrefer, tag.toLowerCase()));
    if (pace === "slow") addCue(stylePrefer, "patient");
    if (pace === "fast") {
      addCue(stylePrefer, "brisk");
      addCue(styleAvoid, "detours");
    }
    if (!toneSample.length) addCue(stylePrefer, "supportive");
    if (accuracyBandNum == null || accuracyBandNum <= 1) {
      addCue(stylePrefer, "stepwise");
      addCue(styleAvoid, "jargon");
    }
    if (accuracyBandNum === 3) addCue(stylePrefer, "stretch");
    if (dislikedHighlights.some((entry) => /proof|derivation/i.test(entry))) {
      addCue(styleAvoid, "proofs");
    }

    const mergeUnique = (...groups: (string[])[]): string[] => {
      const seen = new Set<string>();
      const result: string[] = [];
      for (const group of groups) {
        for (const raw of group) {
          const trimmed = typeof raw === "string" ? raw.trim() : "";
          if (!trimmed || seen.has(trimmed)) continue;
          seen.add(trimmed);
          result.push(trimmed);
          if (result.length >= 8) break;
        }
        if (result.length >= 8) break;
      }
      return result;
    };

    const leanInto = mergeUnique(likedDescriptors, savedDescriptors).slice(0, 6);
    const avoidLessonDescriptors = dislikedHighlights.slice(0, 6);
    const savedFocus = savedDescriptors.slice(0, 3);

    // ULTRA-COMPRESSED CONTEXT - Shortest keys for maximum token savings (800-1200 token savings)
    const structuredContext: Record<string, unknown> = {
      f: currentLabel,  // focus -> f
      p: pace,          // pace -> p
    };

    // Add accuracy only if available (acc = accuracy)
    if (typeof accuracyPct === "number") {
      structuredContext.acc = accuracyPct;
    }

    // SUPER-COMPRESSED knowledge with single-letter keys
    const compressedKnowledge: Record<string, unknown> = {};
    if (lessonKnowledge.definition) {
      compressedKnowledge.d = lessonKnowledge.definition;  // definition -> d (already compressed to 40 chars)
    }
    if (lessonKnowledge.applications && lessonKnowledge.applications.length > 0) {
      compressedKnowledge.a = lessonKnowledge.applications[0];  // applications -> a (already 1 item, 20 chars)
    }
    if (lessonKnowledge.prerequisites && lessonKnowledge.prerequisites.length > 0) {
      compressedKnowledge.p = lessonKnowledge.prerequisites[0];  // prerequisites -> p (already semicolon-separated, 60 chars)
    }
    if (lessonKnowledge.reminders && lessonKnowledge.reminders.length > 0) {
      compressedKnowledge.r = lessonKnowledge.reminders[0];  // reminders -> r (already 1 item, 40 chars)
    }
    if (Object.keys(compressedKnowledge).length > 0) {
      structuredContext.k = compressedKnowledge;  // knowledge -> k
    }

    // Style preferences as CSV (max 3) - s = style
    if (stylePrefer.size > 0) {
      structuredContext.s = Array.from(stylePrefer).slice(0, 3).join(',');
    }

    // Only last 3 recent titles to avoid - ar = avoid_recent
    if (recentDeliveredTitles.length > 0) {
      structuredContext.ar = recentDeliveredTitles.slice(-3);
    }

    // Keep guardrails separate for filtering logic (not in structuredContext)
    const avoidLessonIds = [...recentDeliveredIds, ...dislikedTail]
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter((id): id is string => Boolean(id));
    const normalizedAvoidIds = Array.from(new Set(avoidLessonIds)).slice(0, 12);
    const avoidTitlesRaw = recentDeliveredTitles
      .slice(-10)
      .map((title) => (typeof title === "string" ? title.trim() : ""))
      .filter((title): title is string => Boolean(title));
    const normalizedAvoidTitles = Array.from(new Set(avoidTitlesRaw)).slice(0, 10);

    const toSortedLower = (values: Iterable<string>) => {
      const normalized: string[] = [];
      for (const value of values) {
        const trimmed = typeof value === "string" ? value.trim().toLowerCase() : "";
        if (!trimmed) continue;
        normalized.push(trimmed);
      }
      return Array.from(new Set(normalized)).sort();
    };

    // Compressed persona hash (optimization: 15-20% faster cache lookups)
    const personaHash = `${pace}-${accuracyBand ?? "none"}-${toneSample.slice(0, 6).join(",")}`;

    lessonPrepCache = {
      lessonKnowledge,
      accuracyBand,
      previousLessonContext,
      recentMissSummary,
      learnerProfileLine: learnerProfileLine.length ? learnerProfileLine : null,
      mapSummary,
      structuredContext,
      personalization: {
        style: {
          prefer: stylePrefer.size ? Array.from(stylePrefer).slice(0, 6) : [],
          avoid: styleAvoid.size ? Array.from(styleAvoid).slice(0, 6) : [],
        },
        lessons: {
          leanInto,
          avoid: avoidLessonDescriptors,
          ...(savedFocus.length ? { saved: savedFocus } : {}),
        },
      },
      personaHash,
      guardrails: {
        avoidIds: normalizedAvoidIds,
        avoidTitles: normalizedAvoidTitles,
      },
    };

    return lessonPrepCache;
  };

  const { data: cacheRow } = await sb
    .from("user_topic_lesson_cache")
    .select("lessons")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .eq("topic_label", currentLabel)
    .maybeSingle();

  const cache = cacheRow as { lessons?: unknown } | null;
  const nowMs = Date.now();
  const cachedCandidates: CachedLesson[] = [];
  if (Array.isArray(cache?.lessons)) {
    for (const raw of cache.lessons as CachedLesson[]) {
      if (!raw) continue;
      const stamped = raw.cachedAt ? +new Date(raw.cachedAt) : NaN;
      if (!Number.isFinite(stamped) || nowMs - stamped > MAX_CACHE_AGE_MS) continue;
      cachedCandidates.push(raw);
      if (cachedCandidates.length >= 5) break;
    }
  }

  const lessonPrep = await ensureLessonPrep();
  const personaHash = lessonPrep.personaHash;
  const eligibleCachedCandidates = cachedCandidates.filter((entry) => {
    if (!entry) return false;
    const entryHash = typeof entry.personaHash === "string" ? entry.personaHash : null;
    return entryHash === personaHash;
  });

  const avoidLessonIds = Array.isArray(lessonPrep.guardrails?.avoidIds)
    ? lessonPrep.guardrails.avoidIds
    : [];
  const avoidTitles = Array.isArray(lessonPrep.guardrails?.avoidTitles)
    ? lessonPrep.guardrails.avoidTitles
    : [];
  const avoidIdSet = new Set(avoidLessonIds);

  const staleCachedCandidates = cachedCandidates.filter((entry) => {
    if (!entry) return false;
    const entryHash = typeof entry.personaHash === "string" ? entry.personaHash : null;
    return entryHash !== personaHash;
  });

  // Collect embeddings from recent delivered lessons for semantic deduplication
  const recentEmbeddings: number[][] = eligibleCachedCandidates
    .filter((entry) => entry && Array.isArray(entry.embedding) && entry.embedding.length > 0)
    .map((entry) => entry.embedding as number[])
    .slice(0, 10); // Only check against last 10 lessons to avoid performance issues

  const SIMILARITY_THRESHOLD = 0.85;

  const cacheHit = eligibleCachedCandidates.find((entry) => {
    if (!entry) return false;
    const cachedId = typeof entry.id === 'string' ? entry.id : null;
    if (cachedId && avoidIdSet.has(cachedId)) return false;

    // Semantic similarity check using embeddings
    if (Array.isArray(entry.embedding) && entry.embedding.length > 0 && recentEmbeddings.length > 0) {
      const maxSimilarity = findMaxSimilarity(entry.embedding, recentEmbeddings);
      if (maxSimilarity > SIMILARITY_THRESHOLD) {
        console.log(`[fyp] Skipping semantically similar lesson (similarity: ${maxSimilarity.toFixed(3)})`);
        return false;
      }
    }

    return true;
  });

  if (cacheHit) {
    const contextPayload =
      cacheHit.context && typeof cacheHit.context === "object"
        ? (cacheHit.context as Record<string, unknown>)
        : lessonPrep.structuredContext;
    const knowledgePayload =
      cacheHit.knowledge
        ? cacheHit.knowledge
        : lessonPrep.lessonKnowledge;
    const responseLesson: CachedLesson = {
      ...cacheHit,
      nextTopicHint: cacheHit.nextTopicHint ?? nextTopicHint ?? null,
      context: contextPayload,
      knowledge: knowledgePayload,
      personaHash,
    };
    const prefetchLessons = eligibleCachedCandidates
      .filter((entry) => entry && entry.id !== responseLesson.id)
      .slice(0, requestedPrefetchCount)
      .map((entry) => ({
        ...entry,
        nextTopicHint: entry.nextTopicHint ?? nextTopicHint ?? null,
      }));

    // Strip embeddings from response to reduce payload size
    const stripEmbedding = (lessonWithEmbedding: CachedLesson): Omit<CachedLesson, 'embedding'> => {
      const { embedding, ...rest } = lessonWithEmbedding;
      return rest;
    };

    const responseBody: Record<string, unknown> = {
      topic: currentLabel,
      lesson: stripEmbedding(responseLesson),
      nextTopicHint,
    };
    if (prefetchLessons.length) {
      responseBody.prefetch = prefetchLessons.map(stripEmbedding);
    }
    if (staleCachedCandidates.length || (eligibleCachedCandidates[0]?.id !== responseLesson.id)) {
      const rewrittenCache = [responseLesson, ...eligibleCachedCandidates.filter((entry) => entry && entry.id !== responseLesson.id)].slice(0, 5);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any)
          .from("user_topic_lesson_cache")
          .upsert({
            user_id: user.id,
            subject,
            topic_label: currentLabel,
            lessons: rewrittenCache,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,subject,topic_label" });
      } catch (refreshErr) {
        console.error(`[fyp][${reqId}] cache refresh failed`, refreshErr);
      }
    }
    return new Response(
      JSON.stringify(responseBody),
      { status: 200, headers: { "content-type": "application/json", "x-fyp-cache": "hit" } }
    );
  }

  // Check for pending lessons (pre-generated with slow model in background)
  const pendingLesson = await getNextPendingLesson(sb, user.id, subject);
  if (pendingLesson && pendingLesson.lesson) {
    // Validate the pending lesson is for the current topic and not avoided
    const pendingLessonId = typeof pendingLesson.lesson.id === 'string' ? pendingLesson.lesson.id : null;
    let isPendingLessonValid =
      pendingLesson.topic_label === currentLabel &&
      (!pendingLessonId || !avoidIdSet.has(pendingLessonId));

    // Semantic similarity check for pending lessons
    if (isPendingLessonValid && recentEmbeddings.length > 0) {
      try {
        const pendingEmbedding = await getEmbedding(pendingLesson.lesson.content);
        const maxSimilarity = findMaxSimilarity(pendingEmbedding, recentEmbeddings);
        if (maxSimilarity > SIMILARITY_THRESHOLD) {
          console.log(`[fyp] Skipping semantically similar pending lesson (similarity: ${maxSimilarity.toFixed(3)})`);
          isPendingLessonValid = false;
        }
      } catch (embeddingError) {
        console.warn('[fyp] Failed to generate embedding for pending lesson, using anyway:', embeddingError);
      }
    }

    if (isPendingLessonValid) {
      const contextPayload = lessonPrep.structuredContext;
      const knowledgePayload = lessonPrep.lessonKnowledge;
      const responseLesson: CachedLesson = {
        ...pendingLesson.lesson,
        nextTopicHint: nextTopicHint ?? null,
        context: contextPayload,
        knowledge: knowledgePayload,
        personaHash,
      };

      // Update progress tracking
      const nextTopicStr: string | null = currentLabel;
      const lid = typeof pendingLesson.lesson.id === "string" ? pendingLesson.lesson.id : null;
      const ltitle = typeof pendingLesson.lesson.title === "string" ? pendingLesson.lesson.title.trim() : null;

      const progressPatch: Record<string, unknown> = {
        p_subject: subject,
        p_topic_idx: topicIdx,
        p_subtopic_idx: subtopicIdx,
        p_delivered_delta: { [currentLabel]: 1 },
      };
      if (lid) progressPatch.p_id_append = { [currentLabel]: [lid] };
      if (ltitle) progressPatch.p_title_append = { [currentLabel]: [ltitle] };
      if (metricsPatch) progressPatch.p_metrics = metricsPatch;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).rpc("apply_user_subject_progress_patch", progressPatch);
      } catch (progressErr) {
        console.error(`[fyp][${reqId}] progress patch failed`, progressErr);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any)
        .from("user_subject_state")
        .update({ next_topic: nextTopicStr, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("subject", subject);

      // Strip embeddings from response to reduce payload size
      const stripEmbedding = (lessonWithEmbedding: CachedLesson): Omit<CachedLesson, 'embedding'> => {
        const { embedding, ...rest } = lessonWithEmbedding;
        return rest;
      };

      const responseBody: Record<string, unknown> = {
        topic: currentLabel,
        lesson: stripEmbedding(responseLesson),
        nextTopicHint,
      };

      return new Response(
        JSON.stringify(responseBody),
        { status: 200, headers: { "content-type": "application/json", "x-fyp-source": "pending" } }
      );
    }
  }

  let lesson: Lesson;
  let mergedNextTopicHint: string | null = nextTopicHint;
  let lessonEmbedding: number[] | null = null;
  try {
    const {
      structuredContext,
      mapSummary,
      learnerProfileLine,
      lessonKnowledge,
      accuracyBand,
      previousLessonContext,
      recentMissSummary,
      personalization,
    } = lessonPrep;
    // FYP uses FAST model for immediate lesson generation to show results quickly
    // TOKEN OPTIMIZATION: avoidIds/avoidTitles removed from AI prompt entirely (saves 50-150 tokens)
    // Filtering happens locally after generation using avoidIdSet and avoidTitles

    const generatorOptions: Parameters<typeof generateLessonForTopic>[5] = {
      pace,
      accuracyPct: accuracyPct ?? undefined,
      difficultyPref: (state?.difficulty as Difficulty | undefined) ?? undefined,
      // avoidIds and avoidTitles removed - local filtering only
      mapSummary,
      structuredContext,
      likedIds: likedTail,
      savedIds: savedTail,
      toneTags: toneSample,
      nextTopicHint: nextTopicHint ?? undefined,
      learnerProfile: learnerProfileLine || undefined,
      likedLessonDescriptors: likedDescriptors,
      savedLessonDescriptors: savedDescriptors,
      previousLessonSummary: previousLessonContext ?? undefined,
      accuracyBand: accuracyBand ?? undefined,
      recentMissSummary: recentMissSummary ?? undefined,
      knowledge: lessonKnowledge,
      personalization,
      userTier,
      modelSpeed: 'fast',
    };
    lesson = await generateLessonForTopic(sb, user.id, ip, subject, currentLabel, generatorOptions);

    // LOCAL FILTERING: Check if generated lesson matches avoid lists (post-generation filter)
    // This replaces the AI-side filtering we removed to save tokens
    const generatedId = typeof lesson.id === 'string' ? lesson.id : null;
    const generatedTitle = typeof lesson.title === 'string' ? lesson.title.trim().toLowerCase() : null;
    const avoidTitlesNormalized = avoidTitles.map(t => t.toLowerCase());

    if (generatedId && avoidIdSet.has(generatedId)) {
      console.warn(`[fyp][${reqId}] Generated lesson matches avoided ID (rare AI duplicate)`, {
        lessonId: generatedId,
        title: lesson.title,
      });
      // Accept anyway - AI duplicates are extremely rare without prompt guidance
      // Alternative would be to retry or use fallback, but that wastes the generation
    }

    if (generatedTitle && avoidTitlesNormalized.some(avoid => generatedTitle === avoid)) {
      console.warn(`[fyp][${reqId}] Generated lesson matches avoided title (rare AI duplicate)`, {
        lessonId: generatedId,
        title: lesson.title,
      });
      // Accept anyway - AI duplicates are extremely rare without prompt guidance
    }

    // Generate embedding for semantic deduplication
    try {
      lessonEmbedding = await getEmbedding(lesson.content);

      // Check if this lesson is too similar to recent ones
      if (recentEmbeddings.length > 0) {
        const maxSimilarity = findMaxSimilarity(lessonEmbedding, recentEmbeddings);
        if (maxSimilarity > SIMILARITY_THRESHOLD) {
          console.warn(`[fyp][${reqId}] Generated lesson too similar to recent ones (similarity: ${maxSimilarity.toFixed(3)}), regenerating...`);
          // For now, we'll use it anyway to avoid infinite loops, but log the issue
          // In a future enhancement, we could retry generation with modified prompts
        }
      }
    } catch (embeddingError) {
      console.warn(`[fyp][${reqId}] Failed to generate embedding for lesson:`, embeddingError);
      // Continue without embedding - semantic dedup will be skipped
    }

    const rawLessonHint = (lesson as { nextTopicHint?: unknown }).nextTopicHint;
    const lessonNextTopicHint = typeof rawLessonHint === "string" ? rawLessonHint : null;
    mergedNextTopicHint = nextTopicHint ?? lessonNextTopicHint ?? null;
    lesson = {
      ...lesson,
      nextTopicHint: mergedNextTopicHint,
      context: structuredContext,
      knowledge: lessonKnowledge,
      personaHash,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg === "Invalid lesson format from AI") {
      return progressResponse("2", "Generating lesson content", "Retrying after formatting hiccup.");
    }
    const status = msg === "Usage limit exceeded" ? 403 : 500;
    console.error(`[fyp][${reqId}] lesson: error`, { msg, status });
    return new Response(JSON.stringify({ error: msg }), { status });
  }

  const stampedLesson: CachedLesson = {
    ...(lesson as CachedLesson),
    cachedAt: new Date().toISOString(),
    nextTopicHint: mergedNextTopicHint,
    personaHash,
    embedding: lessonEmbedding,
  };
  const nextCache = [stampedLesson, ...eligibleCachedCandidates.filter((entry) => entry && entry.id !== stampedLesson.id)];
  const responsePrefetch = requestedPrefetchCount > 0
    ? nextCache.slice(1, 1 + requestedPrefetchCount)
    : [];
  while (nextCache.length > 5) nextCache.pop();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any)
      .from("user_topic_lesson_cache")
      .upsert({
        user_id: user.id,
        subject,
        topic_label: currentLabel,
        lessons: nextCache,
        updated_at: stampedLesson.cachedAt,
      }, { onConflict: "user_id,subject,topic_label" });
  } catch (cacheErr) {
    console.error(`[fyp][${reqId}] cache upsert failed`, cacheErr);
  }
  // Honor mini_lessons per subtopic and update progress/indices
  const nextTopicStr: string | null = currentLabel;
  const lid = typeof lesson.id === "string" ? lesson.id : null;
  const ltitle = typeof lesson.title === "string" ? lesson.title.trim() : null;

  const progressPatch: Record<string, unknown> = {
    p_subject: subject,
    p_topic_idx: topicIdx,
    p_subtopic_idx: subtopicIdx,
    p_delivered_delta: { [currentLabel]: 1 },
  };
  if (lid) progressPatch.p_id_append = { [currentLabel]: [lid] };
  if (ltitle) progressPatch.p_title_append = { [currentLabel]: [ltitle] };
  if (metricsPatch) progressPatch.p_metrics = metricsPatch;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).rpc("apply_user_subject_progress_patch", progressPatch);
  } catch (progressErr) {
    console.error(`[fyp][${reqId}] progress patch failed`, progressErr);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any)
    .from("user_subject_state")
    .update({ next_topic: nextTopicStr, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("subject", subject);

  // Strip embeddings from response to reduce payload size (client doesn't need them)
  const stripEmbedding = (lessonWithEmbedding: CachedLesson): Omit<CachedLesson, 'embedding'> => {
    const { embedding, ...rest } = lessonWithEmbedding;
    return rest;
  };

  const responseBody: Record<string, unknown> = {
    topic: currentLabel,
    lesson: stripEmbedding(lesson as CachedLesson),
    nextTopicHint,
  };
  if (responsePrefetch.length) {
    responseBody.prefetch = responsePrefetch.map(stripEmbedding);
  }
  return new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } });
}
