import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateLessonForTopic } from "@/lib/fyp";
import { getLearningPathProgress, type LevelMap } from "@/lib/learning-path";
import type { Lesson } from "@/lib/schema";
import type { Difficulty } from "@/types/placement";
import { acquireGenLock, releaseGenLock } from "@/lib/db-lock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const shortHash = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length <= 10) return trimmed;
  return createHash("sha1").update(trimmed).digest("base64url").slice(0, 10);
};

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

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const uid = user.id;
  const reqId = Math.random().toString(36).slice(2, 8);
  try { console.debug(`[fyp][${reqId}] begin`, { uid: uid.slice(0,8), ip }); } catch {}

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
    subject = first?.subject ?? null;

    // If none, fall back to the first interest with a chosen course
    if (!subject) {
      const { data: prof } = await sb
        .from("profiles")
        .select("interests, level_map")
        .eq("id", user.id)
        .maybeSingle();
      const interests: string[] = Array.isArray(prof?.interests) ? (prof!.interests as string[]) : [];
      const levelMap = (prof?.level_map || {}) as Record<string, string>;
      const firstSubject = interests.find((s) => levelMap[s]);
      subject = firstSubject ?? null;
    }
  }
  if (!subject) {
    try { console.warn(`[fyp][${reqId}] no-subject`, { uid: uid.slice(0,8), subjectParam }); } catch {}
    return new Response(JSON.stringify({ error: "No subject" }), { status: 400 });
  }
  try { console.debug(`[fyp][${reqId}] subject`, { subject }); } catch {}

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
  const METRICS_REFRESH_MS = 10 * 60 * 1000;
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
    const pace: "slow" | "normal" | "fast" = recent >= 12 ? "fast" : recent >= 4 ? "normal" : "slow";
    return { accuracyPct, pace, sampleSize: total, recentSample: recent };
  };

  const toPace = (value: unknown): "slow" | "normal" | "fast" =>
    value === "fast" ? "fast" : value === "normal" ? "normal" : "slow";

  let { data: state } = await sb
    .from("user_subject_state")
    .select("path, next_topic, difficulty, course")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .maybeSingle();

  const { data: progressRow } = await sb
    .from("user_subject_progress")
    .select("topic_idx, subtopic_idx, delivered_mini, delivered_by_topic, delivered_ids_by_topic, delivered_titles_by_topic, completion_map, metrics")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .maybeSingle();

  const { data: preferenceRow } = await sb
    .from("user_subject_preferences")
    .select("liked_ids, disliked_ids, saved_ids, tone_tags")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .maybeSingle();

  type CachedLesson = Lesson & { cachedAt?: string };
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
      pace?: "slow" | "normal" | "fast";
      computedAt?: string;
      sampleSize?: number;
      recentSample?: number;
    };
  };
  type PathWithProgress = LevelMap & { progress?: PathProgress };
  let path = state?.path as PathWithProgress | null;
  // Auto-generate a level map if missing or invalid
  const missingOrInvalid = !path || !Array.isArray(path.topics) || path.topics.length === 0;
  if (missingOrInvalid) {
    try { console.debug(`[fyp][${reqId}] path missing/invalid, attempting ensureLearningPath`); } catch {}
    const { data: prof } = await sb
      .from("profiles")
      .select("level_map")
      .eq("id", user.id)
      .maybeSingle();
    const levelMap = (prof?.level_map || {}) as Record<string, string>;
    const findCourse = (subj: string | null): string | undefined => {
      if (!subj) return undefined;
      const direct = levelMap[subj];
      if (direct) return direct;
      const key = Object.keys(levelMap).find((k) => k.toLowerCase() === subj.toLowerCase());
      if (key) return levelMap[key]!;
      const firstKey = Object.keys(levelMap)[0];
      return firstKey ? levelMap[firstKey] : undefined;
    };
    const course = state?.course || findCourse(subject);
    if (!course) {
      try { console.warn(`[fyp][${reqId}] no-course-mapping`, { subject, levelMapKeys: Object.keys(levelMap) }); } catch {}
      return new Response(JSON.stringify({ error: "Not ready: no course mapping for subject" }), { status: 409 });
    }

    // Estimate mastery from recent attempts (subject-specific if available)
    const attemptsData = await loadAttempts();
    const { correct, total } = computeSubjectMastery(attemptsData, subject);
    const mastery = total > 0 ? Math.round((correct / total) * 100) : 50;

    const rollup = computePerformanceRollup(attemptsData, subject);
    const pace = rollup.pace;
    const notes = `Learner pace: ${pace}. Personalized for ${subject}.`;
    const { ensureLearningPath, isLearningPathGenerating, LearningPathPendingError } = await import("@/lib/learning-path");

    try {
      // Cross-instance DB lock. If not supported and busy, fallback to in-process lock inside ensureLearningPath.
      const lock = await acquireGenLock(sb, user.id, subject);
      try { console.debug(`[fyp][${reqId}] acquire-lock`, lock); } catch {}
      if (!lock.supported && lock.reason === "error") {
        // DB error unrelated to missing table
        return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
      }
      if (lock.supported && !lock.acquired) {
        if (lock.reason === "busy") {
          // Someone else is generating; signal client to backoff and retry
          try { console.debug(`[fyp][${reqId}] lock-busy -> 202`); } catch {}
          return progressResponse("3", "Another session is preparing your learning path", "Waiting for the current generation to finish.");
        } else if (lock.reason === "error") {
          // Lock table exists but errored; fall back to in-process lock if active, otherwise proceed without lock
          if (isLearningPathGenerating(user.id, subject)) {
            try { console.debug(`[fyp][${reqId}] lock-error but in-process active -> 202`); } catch {}
            return progressResponse("3", "Finishing an existing generation", "Re-using the map from a parallel request.");
          }
        }
      }
      if (!lock.supported) {
        // No DB lock available; if our in-process lock is active, signal 202 too
        if (isLearningPathGenerating(user.id, subject)) {
          try { console.debug(`[fyp][${reqId}] in-process-lock -> 202`); } catch {}
          return progressResponse("3", "Finalizing your learning path", "A previous request is still wrapping up.");
        }
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
      try { console.debug(`[fyp][${reqId}] ensureLearningPath: ok`); } catch {}
    } catch (e) {
      if (e instanceof LearningPathPendingError) {
        try { await releaseGenLock(sb, user.id, subject); } catch {}
        try { console.debug(`[fyp][${reqId}] ensureLearningPath: pending`, { retryAfter: e.retryAfterSeconds }); } catch {}
        const retryAfter = String(e.retryAfterSeconds ?? 5);
        return progressResponse(retryAfter, e.message, e.detail);
      }
      const msg = e instanceof Error ? e.message : "Server error";
      const status = msg === "Usage limit exceeded" ? 403 : 500;
      try { await releaseGenLock(sb, user.id, subject); } catch {}
      try { console.error(`[fyp][${reqId}] ensureLearningPath: error`, { msg, status }); } catch {}
      return new Response(JSON.stringify({ error: msg }), { status });
    }
  }

  if (!path || !Array.isArray(path.topics)) {
    try { console.warn(`[fyp][${reqId}] no-learning-path after ensure`); } catch {}
    return new Response(JSON.stringify({ error: "No learning path" }), { status: 400 });
  }
  const topics = path.topics;
  if (!topics.length) {
    try { console.warn(`[fyp][${reqId}] empty-topics`); } catch {}
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
    try { console.warn(`[fyp][${reqId}] invalid-indices`, { topicIdx, subtopicIdx }); } catch {}
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
  const metricsAgeMs = baseMetrics?.computedAt ? Date.now() - +new Date(baseMetrics.computedAt) : Number.POSITIVE_INFINITY;
  const metricsFresh = Number.isFinite(metricsAgeMs) && metricsAgeMs < METRICS_REFRESH_MS;
  let accuracyPct: number | null = typeof baseMetrics?.accuracyPct === "number" ? Math.round(baseMetrics.accuracyPct) : null;
  let pace: "slow" | "normal" | "fast" = toPace(baseMetrics?.pace);
  let performanceSampleSize: number | null = baseMetrics?.sampleSize ?? null;
  let performanceRecentSample: number | null = baseMetrics?.recentSample ?? null;
  if (!metricsFresh) {
    const attemptsData = await loadAttempts();
    const performance = computePerformanceRollup(attemptsData, subject);
    accuracyPct = performance.accuracyPct;
    pace = performance.pace;
    performanceSampleSize = performance.sampleSize;
    performanceRecentSample = performance.recentSample;
    const computedAt = new Date().toISOString();
    progress.metrics = {
      accuracyPct,
      pace,
      computedAt,
      sampleSize: performance.sampleSize,
      recentSample: performance.recentSample,
    };
    metricsPatch = {
      accuracyPct,
      pace,
      computedAt,
      sampleSize: performance.sampleSize,
      recentSample: performance.recentSample,
    };
  }

  const recentDeliveredIds = dedupeTail(progress.deliveredIdsByTopic?.[currentLabel], 24);
  const recentDeliveredTitles = dedupeTail(progress.deliveredTitlesByTopic?.[currentLabel], 24);
  const likedTail = dedupeTail(progress.preferences?.liked, 30);
  const savedTail = dedupeTail(progress.preferences?.saved, 30);
  const dislikedTail = dedupeTail(progress.preferences?.disliked, 30);

  const recentIdSignatures = recentDeliveredIds.slice(-6).map(shortHash);
  const dislikedSignatures = dislikedTail.slice(-8).map(shortHash);
  const likedSignatures = likedTail.slice(-8).map(shortHash);
  const savedSignatures = savedTail.slice(-6).map(shortHash);

  const totalSubs = topics.reduce((sum, topic) => sum + ((topic?.subtopics?.length ?? 0)), 0);
  const doneSubs = topics.reduce((sum, topic) => {
    if (!topic?.subtopics) return sum;
    return sum + topic.subtopics.reduce((inner, sub) => {
      if (!sub) return inner;
      return inner + (isMarkedComplete(topic.name, sub.name, (sub as { completed?: boolean }).completed) ? 1 : 0);
    }, 0);
  }, 0);
  const compPct = totalSubs > 0 ? Math.round((doneSubs / totalSubs) * 100) : 0;
  const plannedMini = Math.max(1, Number(curSub.mini_lessons || 1));
  const nextTopicCandidate = findNextIncompleteAfterCurrent();
  const nextTopicHint = nextTopicCandidate && nextTopicCandidate.label !== currentLabel
    ? `Next up: ${nextTopicCandidate.label}`
    : null;
  const mapSummary = [
    `course=${state?.course ?? "n/a"}`,
    `topic=${topicIdx + 1}/${topics.length}`,
    `subtopic=${subtopicIdx + 1}/${curTopic?.subtopics?.length ?? 1}`,
    `curriculum=${compPct}%`,
    `mini=${deliveredMini}/${plannedMini}`,
  ].join("|");

  const structuredContext = {
    subject,
    course: state?.course ?? null,
    topic: {
      name: curTopic.name,
      index: topicIdx + 1,
      total: topics.length,
    },
    subtopic: {
      name: curSub.name,
      index: subtopicIdx + 1,
      total: curTopic.subtopics?.length ?? 1,
      plannedMini,
      deliveredMini,
      applications: Array.isArray(curSub.applications) ? curSub.applications.slice(0, 2) : undefined,
    },
    completion: { curriculumPercent: compPct, done: doneSubs, total: totalSubs },
    performance: {
      accuracyPct,
      pace,
      sampleSize: performanceSampleSize,
      recentSample: performanceRecentSample,
      computedAt: progress.metrics?.computedAt ?? baseMetrics?.computedAt ?? null,
    },
    recentLessonSignatures: {
      deliveredIds: recentIdSignatures,
      deliveredTitles: recentDeliveredTitles.slice(-6),
      disliked: dislikedSignatures,
      liked: likedSignatures,
      saved: savedSignatures,
    },
    preferenceTones: toneTags.slice(0, 6),
    nextUp: nextTopicCandidate?.label ?? null,
  };

  const { data: cacheRow } = await sb
    .from("user_topic_lesson_cache")
    .select("lessons")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .eq("topic_label", currentLabel)
    .maybeSingle();

  const nowMs = Date.now();
  const cachedCandidates: CachedLesson[] = [];
  if (Array.isArray(cacheRow?.lessons)) {
    for (const raw of cacheRow!.lessons as CachedLesson[]) {
      if (!raw) continue;
      const stamped = raw.cachedAt ? +new Date(raw.cachedAt) : NaN;
      if (!Number.isFinite(stamped) || nowMs - stamped > MAX_CACHE_AGE_MS) continue;
      cachedCandidates.push(raw);
      if (cachedCandidates.length >= 5) break;
    }
  }

  const avoidLessonIds = [...recentDeliveredIds, ...dislikedTail].filter((id): id is string => typeof id === "string" && id.length > 0);
  const avoidTitles = recentDeliveredTitles.slice(-10);
  const avoidIdSet = new Set(avoidLessonIds);

  let lesson: Lesson;
  const cacheHit = cachedCandidates.find((entry) => {
    if (!entry) return false;
    const cachedId = typeof entry.id === 'string' ? entry.id : null;
    if (cachedId && avoidIdSet.has(cachedId)) return false;
    const cachedTitle = typeof entry.title === 'string' ? entry.title.trim() : '';
    if (cachedTitle && recentDeliveredTitles.includes(cachedTitle)) return false;
    return true;
  });

  let usedCache = false;
  if (cacheHit) {
    lesson = cacheHit;
    usedCache = true;
  } else {
    try {
      lesson = await generateLessonForTopic(sb, user.id, ip, subject, currentLabel, {
        pace,
        accuracyPct: accuracyPct ?? undefined,
        difficultyPref: (state?.difficulty as Difficulty | undefined) ?? undefined,
        avoidIds: Array.from(avoidIdSet),
        avoidTitles,
        mapSummary,
        structuredContext,
        likedIds: likedTail,
        savedIds: savedTail,
        toneTags: toneTags.slice(0, 6),
        nextTopicHint: nextTopicHint ?? undefined,
      });
      try { console.debug(`[fyp][${reqId}] lesson: ok`, { subject, currentLabel }); } catch {}
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Server error";
      if (msg === "Invalid lesson format from AI") {
        try { console.warn(`[fyp][${reqId}] lesson: transient-format-error -> 202`); } catch {}
        return progressResponse("2", "Generating lesson content", "Retrying after formatting hiccup.");
      }
      const status = msg === "Usage limit exceeded" ? 403 : 500;
      try { console.error(`[fyp][${reqId}] lesson: error`, { msg, status }); } catch {}
      return new Response(JSON.stringify({ error: msg }), { status });
    }
  }

  if (usedCache) {
    try { console.debug(`[fyp][${reqId}] lesson: cache-hit`, { subject, currentLabel, lessonId: lesson.id }); } catch {}
  }

  const stampedLesson: CachedLesson = { ...lesson, cachedAt: new Date().toISOString() };
  const nextCache = [stampedLesson, ...cachedCandidates.filter((entry) => entry && entry.id !== stampedLesson.id)];
  while (nextCache.length > 5) nextCache.pop();

  try {
    await sb
      .from("user_topic_lesson_cache")
      .upsert({
        user_id: user.id,
        subject,
        topic_label: currentLabel,
        lessons: nextCache,
        updated_at: stampedLesson.cachedAt,
      }, { onConflict: "user_id,subject,topic_label" });
  } catch (cacheErr) {
    try { console.error(`[fyp][${reqId}] cache upsert failed`, cacheErr); } catch {}
  }

  // Honor mini_lessons per subtopic and update progress/indices
  const nextTopicStr: string | null = currentLabel;
  const deliveredByTopic = { ...(progress.deliveredByTopic ?? {}) };
  const deliveredIdsByTopic = { ...(progress.deliveredIdsByTopic ?? {}) };
  const deliveredTitlesByTopic = { ...(progress.deliveredTitlesByTopic ?? {}) };
  deliveredByTopic[currentLabel] = (deliveredByTopic[currentLabel] ?? 0) + 1;

  const lid = typeof lesson.id === "string" ? lesson.id : null;
  let idPatch: Record<string, string[]> | undefined;
  if (lid) {
    const list = Array.isArray(deliveredIdsByTopic[currentLabel]) ? [...deliveredIdsByTopic[currentLabel]!] : [];
    if (!list.includes(lid)) list.push(lid);
    while (list.length > 50) list.shift();
    deliveredIdsByTopic[currentLabel] = list;
    idPatch = { [currentLabel]: list };
  }

  const ltitle = typeof lesson.title === 'string' ? lesson.title.trim() : null;
  let titlePatch: Record<string, string[]> | undefined;
  if (ltitle) {
    const ttl = Array.isArray(deliveredTitlesByTopic[currentLabel]) ? [...deliveredTitlesByTopic[currentLabel]!] : [];
    if (!ttl.includes(ltitle)) ttl.push(ltitle);
    while (ttl.length > 50) ttl.shift();
    deliveredTitlesByTopic[currentLabel] = ttl;
    titlePatch = { [currentLabel]: ttl };
  }

  const progressPatch: Record<string, unknown> = {
    p_subject: subject,
    p_topic_idx: topicIdx,
    p_subtopic_idx: subtopicIdx,
    p_delivered_mini: deliveredMini,
    p_delivered_patch: { [currentLabel]: deliveredByTopic[currentLabel] },
  };
  if (idPatch) progressPatch.p_id_patch = idPatch;
  if (titlePatch) progressPatch.p_title_patch = titlePatch;
  if (metricsPatch) progressPatch.p_metrics = metricsPatch;

  try {
    await sb.rpc("apply_user_subject_progress_patch", progressPatch);
  } catch (progressErr) {
    try { console.error(`[fyp][${reqId}] progress patch failed`, progressErr); } catch {}
  }

  await sb
    .from("user_subject_state")
    .update({ next_topic: nextTopicStr, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("subject", subject);

  try { console.debug(`[fyp][${reqId}] success`, { topic: currentLabel, lessonId: lesson.id }); } catch {}
  return new Response(
    JSON.stringify({ topic: currentLabel, lesson }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

