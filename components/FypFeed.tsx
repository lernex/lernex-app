"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import LessonCard from "./LessonCard";
import QuizBlock from "./QuizBlock";
import { Lesson } from "@/types";
import { useLernexStore } from "@/lib/store";
import { useProfileBasics } from "@/app/providers/ProfileBasicsProvider";

type ApiLesson = {
  id: string;
  subject: string;
  topic?: string;
  title: string;
  content: string;
  difficulty?: "intro" | "easy" | "medium" | "hard";
  questions: { prompt: string; choices: string[]; correctIndex: number; explanation?: string }[];
};


type ApiProgress = {
  phase?: string;
  detail?: string;
  pct?: number;
  attempts?: number;
  fallback?: boolean;
  startedAt?: number;
  updatedAt?: number;
};

type FetchProgressInfo = {
  subject: string | null;
  status: number;
  attempt: number;
  retryAfter?: number;
  progress: ApiProgress | null;
};

type LoadingState = {
  phase: string;
  detail?: string;
  pct?: number;
  attempts?: number;
  fallback?: boolean;
  subject?: string | null;
  updatedAt: number;
};

const CACHE_MAX_AGE_MS = 15 * 60 * 1000;

function parseRetryAfterSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) {
    return asNumber > 0 ? asNumber : null;
  }
  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    const diffMs = asDate - Date.now();
    return diffMs > 0 ? diffMs / 1000 : null;
  }
  return null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

async function fetchFypOne(subject: string | null, opts: { onProgress?: (info: FetchProgressInfo) => void; signal?: AbortSignal } = {}): Promise<Lesson | null> {
  const base = subject ? `/api/fyp?subject=${encodeURIComponent(subject)}` : `/api/fyp`;
  const maxAttempts = 5;
  let delay = 600;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(base, { cache: "no-store", signal: opts.signal });
      try { console.debug("[fyp] fetch", { subject, attempt: attempt + 1, status: res.status }); } catch {}
      if (res.ok) {
        const data = (await res.json()) as { topic?: string; lesson?: ApiLesson };
        const l = data?.lesson;
        if (!l) return null;
        return {
          id: l.id,
          subject: l.subject,
          title: l.title,
          content: l.content,
          questions: Array.isArray(l.questions) ? l.questions : [],
          difficulty: l.difficulty,
          topic: l.topic ?? data?.topic,
        } as Lesson;
      }
      if (res.status === 202 || res.status === 409) {
        let payload: Record<string, unknown> = {};
        try {
          payload = await res.json().catch(() => ({} as Record<string, unknown>));
          console.debug("[fyp] backoff", { subject, status: res.status, payload });
        } catch {}
        const progress = payload && typeof payload === "object" && 'progress' in payload && typeof (payload as { progress?: unknown }).progress === "object"
          ? (payload as { progress?: ApiProgress | null }).progress ?? null
          : null;
        const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get("retry-after"));
        opts.onProgress?.({
          subject,
          status: res.status,
          attempt: attempt + 1,
          retryAfter: retryAfterSeconds ?? undefined,
          progress,
        });
        const jitter = Math.floor(Math.random() * 250);
        if (retryAfterSeconds != null) {
          const waitMs = Math.max(0, Math.round(retryAfterSeconds * 1000)) + jitter;
          await sleep(waitMs, opts.signal);
          delay = Math.max(600, Math.min(8000, waitMs));
        } else {
          await sleep(delay + jitter, opts.signal);
          delay = Math.min(8000, Math.floor(delay * 1.8));
        }
        continue;
      }
      if (res.status === 401 || res.status === 403 || res.status >= 500) {
        try {
          const j: Record<string, unknown> = await res.json().catch(() => ({} as Record<string, unknown>));
          console.warn("[fyp] hard-fail", { subject, status: res.status, j });
        } catch {}
        return null;
      }
    } catch (err) {
      if (isAbortError(err)) throw err;
      const jitter = Math.floor(Math.random() * 200);
      try { console.warn("[fyp] network error; retry", { subject, delay }); } catch {}
      opts.onProgress?.({ subject, status: 0, attempt: attempt + 1, progress: null });
      await sleep(delay + jitter, opts.signal);
      delay = Math.min(8000, Math.floor(delay * 1.8));
    }
  }
  return null;
}

export default function FypFeed() {
  const { selectedSubjects, accuracyBySubject, autoAdvanceEnabled, setAutoAdvanceEnabled, setClassPickerOpen, fypSnapshot, setFypSnapshot } = useLernexStore();
  const { data: profileBasics } = useProfileBasics();
  const interests = profileBasics.interests;

  const rotation = useMemo<(string | null)[]>(() => {
    // Prefer explicit selections; otherwise fall back to interests; if empty, use [null] to indicate default subject
    const list = selectedSubjects.length ? selectedSubjects : interests;
    return list.length ? list : [null];
  }, [selectedSubjects, interests]);

  const subjectsKey = useMemo(() => JSON.stringify(selectedSubjects), [selectedSubjects]);

  const [items, setItems] = useState<Lesson[]>([]);
  const [i, setI] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const fetching = useRef(false);
  const subjIdxRef = useRef(0);
  const cooldownRef = useRef(new Map<string | null, { until: number; backoffMs: number }>());
  const [loadingInfo, setLoadingInfo] = useState<LoadingState | null>(null);
  const [indeterminateTick, setIndeterminateTick] = useState(0);
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [showCompleteHint, setShowCompleteHint] = useState(false);
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const autoAdvanceRef = useRef<number | null>(null);
  const hintTimeoutRef = useRef<number | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const indexRef = useRef(0);
  const MAX_LOOKBACK = 3;
  const MAX_BUFFER_SIZE = 8;

  useEffect(() => {
    indexRef.current = i;
  }, [i]);

  useEffect(() => {
    if (!loadingInfo || typeof loadingInfo.pct === "number") {
      setIndeterminateTick(0);
      return;
    }
    const id = window.setInterval(() => {
      setIndeterminateTick((tick) => (tick + 1) % 30);
    }, 500);
    return () => window.clearInterval(id);
  }, [loadingInfo]);

  useEffect(() => () => {
    if (autoAdvanceRef.current) window.clearTimeout(autoAdvanceRef.current);
    if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
    activeAbortRef.current?.abort();
  }, []);

  const appendLesson = useCallback((lesson: Lesson) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex((item) => item.id === lesson.id);
      const base = existingIdx >= 0
        ? [...prev.slice(0, existingIdx), ...prev.slice(existingIdx + 1)]
        : prev;
      const next = [...base, lesson];
      const currentIndex = indexRef.current;
      const desiredStart = Math.max(0, currentIndex - MAX_LOOKBACK);
      const overflowStart = Math.max(0, next.length - MAX_BUFFER_SIZE);
      const keepStart = Math.max(desiredStart, overflowStart);
      if (keepStart <= 0) return next;
      const trimmed = next.slice(keepStart);
      const removed = keepStart;
      if (removed > 0) {
        indexRef.current = Math.max(0, currentIndex - removed);
        setI((prevIdx) => Math.max(0, prevIdx - removed));
        setCompletedMap((prevMap) => {
          const allowed = new Set(trimmed.map((item) => item.id));
          const nextMap: Record<string, boolean> = {};
          let changed = false;
          for (const key of Object.keys(prevMap)) {
            if (allowed.has(key)) {
              nextMap[key] = prevMap[key];
            } else {
              changed = true;
            }
          }
          return changed ? nextMap : prevMap;
        });
      }
      return trimmed;
    });
  }, [MAX_BUFFER_SIZE, MAX_LOOKBACK, setCompletedMap, setI]);

  const ensureBuffer = useCallback(async (minAhead = 1) => {
    if (fetching.current || rotation.length === 0) return;
    fetching.current = true;
    const requestToken = requestSeqRef.current;
    const controller = new AbortController();
    activeAbortRef.current = controller;
    const clampedIndex = items.length > 0
      ? Math.min(i, Math.max(0, items.length - 1))
      : -1;
    let hasCurrent = clampedIndex >= 0;
    let lessonsAhead = hasCurrent ? Math.max(0, items.length - (clampedIndex + 1)) : 0;
    let neededCurrent = hasCurrent ? 0 : 1;
    let neededAhead = Math.max(0, minAhead - lessonsAhead);
    let needed = neededCurrent + neededAhead;
    let guard = 0;
    let fetchedAny = false;
    let sawProgress = false;
    let lastRetryAfterSeconds: number | null = null;
    const maxGuard = rotation.length === 1
      ? Math.max(6, (minAhead + neededCurrent) * 4)
      : rotation.length * 4;
    let consecutiveCooldownSkips = 0;
    let attemptedFetch = false;
    try { console.debug("[fyp] ensureBuffer", { minAhead, hasCurrent, ahead: lessonsAhead, rotation }); } catch {}
    try {
      while (
        needed > 0 &&
        !attemptedFetch &&
        guard++ < maxGuard &&
        requestSeqRef.current === requestToken
      ) {
        const idx = subjIdxRef.current % rotation.length;
        subjIdxRef.current = idx + 1;
        const subject = rotation[idx];
        try { console.debug("[fyp] try-subject", { subject, idx, guard }); } catch {}
        const cooldown = cooldownRef.current.get(subject);
        if (cooldown && cooldown.until > Date.now()) {
          consecutiveCooldownSkips += 1;
          if (consecutiveCooldownSkips >= rotation.length) break;
          continue;
        }
        consecutiveCooldownSkips = 0;
        lastRetryAfterSeconds = null;
        const lesson = await fetchFypOne(subject, {
          signal: controller.signal,
          onProgress: (info) => {
            sawProgress = true;
            lastRetryAfterSeconds = info.retryAfter ?? null;
            const progress = info.progress;
            const normalizedSubject = info.subject ?? subject ?? null;
            const subjectLabel = normalizedSubject ? `${normalizedSubject}` : "this class";
            const fallbackPhase = info.status === 409
              ? "Waiting for course mapping"
              : info.status === 202
              ? "Preparing your learning path"
              : "Retrying";
            const fallbackDetail = info.status === 409
              ? `Select a course for ${subjectLabel} to continue.`
              : info.status === 202
              ? undefined
              : "Retrying after a temporary hiccup.";
            if (!progress && info.status === 0) {
              setLoadingInfo({
                phase: "Reconnecting",
                detail: "Retrying after a network hiccup.",
                pct: undefined,
                attempts: info.attempt,
                fallback: false,
                subject,
                updatedAt: Date.now(),
              });
              return;
            }
            setLoadingInfo({
              phase: progress?.phase ?? fallbackPhase,
              detail: progress?.detail ?? fallbackDetail,
              pct: typeof progress?.pct === "number" ? progress.pct : undefined,
              attempts: progress?.attempts,
              fallback: progress?.fallback,
              subject: normalizedSubject,
              updatedAt: progress?.updatedAt ? Number(progress.updatedAt) : Date.now(),
            });
            setError(null);
          },
        });
        attemptedFetch = true;
        if (requestSeqRef.current !== requestToken) break;
        if (lesson) {
          cooldownRef.current.delete(subject);
          appendLesson(lesson);
          fetchedAny = true;
          if (!hasCurrent) {
            hasCurrent = true;
          } else {
            lessonsAhead += 1;
          }
          neededCurrent = hasCurrent ? 0 : 1;
          neededAhead = Math.max(0, minAhead - lessonsAhead);
          needed = neededCurrent + neededAhead;
          consecutiveCooldownSkips = 0;
          setLoadingInfo(null);
        } else {
          const prevBackoff = cooldown?.backoffMs ?? 1500;
          const fallbackBackoff = Math.min(8000, Math.max(1200, Math.round(prevBackoff * 1.6)));
          const retryMs = lastRetryAfterSeconds != null
            ? Math.max(800, Math.round(lastRetryAfterSeconds * 1000))
            : fallbackBackoff;
          cooldownRef.current.set(subject, { until: Date.now() + retryMs, backoffMs: retryMs });
          consecutiveCooldownSkips += 1;
          if (consecutiveCooldownSkips >= rotation.length) break;
        }
      }
      setInitialized(true);
      if (!fetchedAny && items.length === 0 && !sawProgress) {
        setError("Could not load your feed. Try again.");
        setLoadingInfo(null);
      }
    } catch (err) {
      if (isAbortError(err)) return;
      console.warn("[fyp] ensureBuffer error", err);
      if (items.length === 0) {
        setError("Could not load your feed. Try again.");
      }
    } finally {
      if (activeAbortRef.current === controller) {
        activeAbortRef.current = null;
      }
      if (requestSeqRef.current === requestToken) {
        fetching.current = false;
      }
    }
  }, [appendLesson, i, items.length, rotation]);

  const triggerHint = useCallback(() => {
    setShowCompleteHint(true);
    if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
    hintTimeoutRef.current = window.setTimeout(() => {
      setShowCompleteHint(false);
    }, 2200);
  }, []);

  useEffect(() => {
    if (initialized || items.length > 0) return;
    if (!fypSnapshot) return;
    if (fypSnapshot.subjectsKey !== subjectsKey) return;
    const isFresh = Date.now() - fypSnapshot.updatedAt < CACHE_MAX_AGE_MS;
    if (!isFresh || fypSnapshot.lessons.length === 0) {
      setFypSnapshot(null);
      return;
    }
    setItems(fypSnapshot.lessons);
    setI(Math.min(fypSnapshot.index, Math.max(0, fypSnapshot.lessons.length - 1)));
    setCompletedMap(fypSnapshot.completed ?? {});
    setInitialized(true);
    setShowCompleteHint(false);
    setAutoAdvancing(false);
    setLoadingInfo(null);
    setError(null);
  }, [initialized, items.length, fypSnapshot, subjectsKey, setFypSnapshot]);

  // Bootstrap
  useEffect(() => {
    if (!initialized) {
      void ensureBuffer(0);
    }
  }, [initialized, ensureBuffer]);

  useEffect(() => {
    if (!initialized) return;
    if (items.length === 0) {
      setFypSnapshot(null);
      return;
    }
    const clampedIndex = Math.min(i, Math.max(0, items.length - 1));
    setFypSnapshot({
      subjectsKey,
      lessons: items,
      index: clampedIndex,
      completed: completedMap,
      updatedAt: Date.now(),
    });
  }, [initialized, items, i, completedMap, subjectsKey, setFypSnapshot]);

  // Reset buffer when class selection changes significantly
  useEffect(() => {
    // Reset feed when user changes selected subjects (class switch/merge)
    setFypSnapshot(null);
    setItems([]);
    setI(0);
    setError(null);
    setInitialized(false);
    setLoadingInfo(null);
    setCompletedMap({});
    setShowCompleteHint(false);
    setAutoAdvancing(false);
    requestSeqRef.current += 1;
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
    fetching.current = false;
    indexRef.current = 0;
    if (autoAdvanceRef.current) {
      window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    if (hintTimeoutRef.current) {
      window.clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
    cooldownRef.current.clear();
    subjIdxRef.current = 0;
  }, [subjectsKey, setFypSnapshot]);

  // Keep at least one upcoming lesson ready
  useEffect(() => {
    if (!initialized) return;
    if (items.length === 0) return;
    const clampedIndex = Math.min(i, Math.max(0, items.length - 1));
    const upcoming = Math.max(0, items.length - (clampedIndex + 1));
    if (upcoming <= 0) void ensureBuffer(1);
  }, [initialized, i, items.length, ensureBuffer]);

  const prev = useCallback(() => {
    setI((x) => Math.max(0, x - 1));
    setShowCompleteHint(false);
    if (hintTimeoutRef.current) {
      window.clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
  }, []);
  const next = useCallback((force = false) => {
    let advanced = false;
    setI((x) => {
      const current = items[x];
      if (!current) return x;
      const requiresQuiz = Array.isArray(current.questions) && current.questions.length > 0;
      const completed = !requiresQuiz || !!completedMap[current.id];
      if (!force && !completed) {
        triggerHint();
        return x;
      }
      const nextIdx = Math.min(items.length - 1, x + 1);
      if (nextIdx !== x) {
        advanced = true;
      }
      return nextIdx;
    });
    if (advanced) {
      setShowCompleteHint(false);
      if (hintTimeoutRef.current) {
        window.clearTimeout(hintTimeoutRef.current);
        hintTimeoutRef.current = null;
      }
      if (autoAdvanceRef.current) {
        window.clearTimeout(autoAdvanceRef.current);
        autoAdvanceRef.current = null;
      }
      setAutoAdvancing(false);
    }
    return advanced;
  }, [items, completedMap, triggerHint]);

  const handleLessonComplete = useCallback((lesson: Lesson) => {
    setCompletedMap((prev) => (prev[lesson.id] ? prev : { ...prev, [lesson.id]: true }));
    setShowCompleteHint(false);
    if (hintTimeoutRef.current) {
      window.clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
    if (autoAdvanceRef.current) {
      window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    const remaining = Math.max(0, items.length - (i + 1));
    if (remaining <= 0) {
      void ensureBuffer(1);
    }
    if (!autoAdvanceEnabled) {
      setAutoAdvancing(false);
      return;
    }
    setAutoAdvancing(true);
    autoAdvanceRef.current = window.setTimeout(() => {
      next(true);
      setAutoAdvancing(false);
      autoAdvanceRef.current = null;
    }, 1100);
  }, [autoAdvanceEnabled, ensureBuffer, i, items.length, next]);

  // Keyboard navigation like the static feed
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp") prev();
      if (e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next]);

  const cur = items[i];
  const requiresQuiz = cur ? Array.isArray(cur.questions) && cur.questions.length > 0 : false;
  const currentCompleted = cur ? (!requiresQuiz || !!completedMap[cur.id]) : true;
  const acc = cur ? accuracyBySubject[cur.subject] : undefined;
  const pct = acc?.total ? Math.round((acc.correct / acc.total) * 100) : null;
  const progressPct = useMemo(() => {
    if (!loadingInfo) return null;
    if (typeof loadingInfo.pct === "number" && !Number.isNaN(loadingInfo.pct)) {
      return Math.min(99, Math.max(5, Math.round(loadingInfo.pct * 100)));
    }
    return Math.min(95, 10 + indeterminateTick * 3);
  }, [loadingInfo, indeterminateTick]);
  const progressWidth = `${progressPct ?? 15}%`;
  const progressLabel = loadingInfo?.phase ?? "Preparing your personalized feed";
  const waitingForCourse = Boolean(
    loadingInfo && (
      (loadingInfo.phase && loadingInfo.phase.toLowerCase().includes("course")) ||
      (loadingInfo.detail && loadingInfo.detail.toLowerCase().includes("course"))
    )
  );
  const shouldOfferClassPicker = waitingForCourse || (selectedSubjects.length === 0 && items.length === 0 && !fetching.current);

  return (
    <div
      className="relative mx-auto w-full max-w-[640px] px-3 sm:px-4 lg:max-w-5xl lg:px-6 lg:pt-4 h-[calc(100vh-56px)] overflow-hidden lg:overflow-visible"
      style={{ maxWidth: "min(640px, 94vw)" }}
    >
      <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.26),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(168,85,247,0.28),transparent_55%),radial-gradient(circle_at_50%_100%,rgba(32,211,238,0.18),transparent_70%)]" />
        <div className="absolute -left-32 top-[-22%] h-[420px] w-[420px] rounded-full bg-lernex-blue/20 blur-3xl opacity-70" />
        <div className="absolute -right-28 bottom-[-26%] h-[360px] w-[360px] rounded-full bg-lernex-purple/30 blur-3xl opacity-70" />
        <div className="absolute inset-[-55%] bg-[radial-gradient(circle,rgba(255,255,255,0.1),transparent_65%)] opacity-25 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.08),rgba(255,255,255,0))] opacity-35" />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-[40px] border border-white/10 opacity-20" />
      <AnimatePresence>
        {showCompleteHint && (
          <motion.div
            key="locked-hint"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute top-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-neutral-900/80 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur dark:bg-neutral-800/80"
          >
            Finish the quiz to unlock the next mini-lesson.
          </motion.div>
        )}
      </AnimatePresence>
      {!cur && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-sm font-medium text-neutral-600 dark:text-neutral-200">
            {progressLabel}
          </div>
          <div className="w-full max-w-xs">
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200/70 dark:bg-neutral-800/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-[width] duration-500 ease-out"
                style={{ width: progressWidth }}
              />
            </div>
            {(loadingInfo?.detail || loadingInfo?.subject) && (
              <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                {loadingInfo?.detail ?? "Optimizing your feed..."}
                {loadingInfo?.subject ? ` (${loadingInfo.subject ?? "General"})` : null}
              </div>
            )}
            {shouldOfferClassPicker && (
              <div className="mt-3 flex flex-col items-center gap-2">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {waitingForCourse
                    ? `Select a course for ${loadingInfo?.subject ?? "this class"} to keep new lessons coming.`
                    : "Pick a class to start your personalized feed."}
                </div>
                <button
                  type="button"
                  onClick={() => setClassPickerOpen(true)}
                  className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  Open class picker
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-500">
          <div>{error}</div>
          <button
            onClick={() => { setError(null); setLoadingInfo(null); setInitialized(false); void ensureBuffer(0); }}
            className="px-3 py-1.5 rounded-full text-sm border bg-neutral-50 dark:bg-neutral-800 text-neutral-600 hover:text-neutral-900 dark:text-neutral-200"
          >
            Retry
          </button>
        </div>
      )}

      {cur && (
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={cur.id}
            drag={currentCompleted ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            onDragEnd={(_, info) => {
              if (!currentCompleted) {
                triggerHint();
                return;
              }
              if (info.offset.y < -120) next();
              if (info.offset.y > 120) prev();
            }}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="absolute inset-0 flex flex-col gap-5 overflow-x-hidden overflow-y-auto px-3 py-6 pb-10 sm:px-4 lg:px-6"
          >
            <div className="flex flex-1 flex-col gap-5">
              <div className="flex min-h-0 w-full justify-center">
                <LessonCard
                  lesson={cur}
                  className="w-full max-w-[560px] min-h-[260px] max-h-[60vh] sm:min-h-[280px] lg:max-h-[520px]"
                />
              </div>
              {requiresQuiz && (
                <div className="flex w-full flex-col gap-3">
                  <QuizBlock
                    key={cur.id}
                    lesson={cur}
                    showSummary={false}
                    onDone={() => handleLessonComplete(cur)}
                  />
                  {!currentCompleted && (
                    <div className="rounded-xl border border-dashed border-amber-300/60 bg-amber-50/70 px-4 py-2 text-sm text-amber-700 shadow-sm dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-200">
                      Finish the quiz to unlock the next mini-lesson.
                    </div>
                  )}
                </div>
              )}
            </div>
            {!requiresQuiz && (
              <div className="rounded-xl border border-lime-300/60 bg-lime-50/70 px-4 py-2 text-sm text-lime-700 shadow-sm dark:border-lime-400/50 dark:bg-lime-500/10 dark:text-lime-200">
                No quiz for this one - enjoy the lesson!
              </div>
            )}
            <div className="mt-auto text-xs text-neutral-400 text-center dark:text-neutral-500">
              <div className="flex flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-3">
                <span>Tip: Swipe or drag the card, or use arrow keys.</span>
                <button
                  type="button"
                  onClick={() => setAutoAdvanceEnabled(!autoAdvanceEnabled)}
                  className="rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  aria-pressed={autoAdvanceEnabled}
                >
                  Auto-advance: {autoAdvanceEnabled ? "On" : "Off"}
                </button>
                {autoAdvancing && (
                  <span className="flex items-center gap-1 text-lernex-blue dark:text-lernex-blue/80">
                    <span className="h-1.5 w-1.5 animate-ping rounded-full bg-current" />
                    Preparing your next mini-lesson...
                  </span>
                )}
              </div>
              {pct !== null && (
                <div className="mt-1">
                  So far in <b>{cur.subject}</b>: {pct}% correct
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

    </div>
  );
}
