"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import LessonCard from "./LessonCard";
import QuizBlock from "./QuizBlock";
import { Lesson } from "@/types";
import { useLernexStore } from "@/lib/store";

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

async function fetchFypOne(subject: string | null, onProgress?: (info: FetchProgressInfo) => void): Promise<Lesson | null> {
  const base = subject ? `/api/fyp?subject=${encodeURIComponent(subject)}` : `/api/fyp`;
  const maxAttempts = 5;
  let delay = 600;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(base, { cache: "no-store" });
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
        const retryAfter = Number(res.headers.get("retry-after") ?? "");
        onProgress?.({
          subject,
          status: res.status,
          attempt: attempt + 1,
          retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
          progress,
        });
        const jitter = Math.floor(Math.random() * 250);
        await new Promise((r) => setTimeout(r, delay + jitter));
        delay = Math.min(8000, Math.floor(delay * 1.8));
        continue;
      }
      if (res.status === 401 || res.status === 403 || res.status >= 500) {
        try {
          const j: Record<string, unknown> = await res.json().catch(() => ({} as Record<string, unknown>));
          console.warn("[fyp] hard-fail", { subject, status: res.status, j });
        } catch {}
        return null;
      }
    } catch {
      const jitter = Math.floor(Math.random() * 200);
      try { console.warn("[fyp] network error; retry", { subject, delay }); } catch {}
      onProgress?.({ subject, status: 0, attempt: attempt + 1, progress: null });
      await new Promise((r) => setTimeout(r, delay + jitter));
      delay = Math.min(8000, Math.floor(delay * 1.8));
    }
  }
  return null;
}

export default function FypFeed() {
  const { selectedSubjects, accuracyBySubject } = useLernexStore();

  const [interests, setInterests] = useState<string[]>([]);
  const loadingInterests = useRef(false);
  useEffect(() => {
    if (loadingInterests.current) return;
    loadingInterests.current = true;
    (async () => {
      try {
        const r = await fetch("/api/profile/me", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const arr = Array.isArray(j?.interests) ? j.interests as string[] : [];
        setInterests(arr);
      } catch {}
    })();
  }, []);

  const rotation = useMemo<(string | null)[]>(() => {
    // Prefer explicit selections; otherwise fall back to interests; if empty, use [null] to indicate default subject
    const list = selectedSubjects.length ? selectedSubjects : interests;
    return list.length ? list : [null];
  }, [selectedSubjects, interests]);

  const [items, setItems] = useState<Lesson[]>([]);
  const [i, setI] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const fetching = useRef(false);
  const subjIdxRef = useRef(0);
  const cooldownRef = useRef(new Map<string | null, number>());
  const [loadingInfo, setLoadingInfo] = useState<LoadingState | null>(null);
  const [indeterminateTick, setIndeterminateTick] = useState(0);
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [showCompleteHint, setShowCompleteHint] = useState(false);
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const autoAdvanceRef = useRef<number | null>(null);
  const hintTimeoutRef = useRef<number | null>(null);

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
  }, []);

  const ensureBuffer = useCallback(async (minAhead = 3) => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      let needed = Math.max(0, minAhead - (items.length - i));
      let guard = 0;
      const attempted = new Set<string | null>();
      const now = Date.now();
      let fetchedAny = false;
      let sawProgress = false;
      try { console.debug("[fyp] ensureBuffer", { minAhead, have: items.length - i, rotation }); } catch {}
      while (needed > 0 && guard++ < 12) {
        const idx = subjIdxRef.current % rotation.length;
        subjIdxRef.current = idx + 1;
        const subject = rotation[idx];
        try { console.debug("[fyp] try-subject", { subject, idx, guard }); } catch {}
        if (attempted.has(subject)) {
          break;
        }
        attempted.add(subject);
        const until = cooldownRef.current.get(subject) ?? 0;
        if (until > now) {
          continue;
        }
        const lesson = await fetchFypOne(subject, (info) => {
          sawProgress = true;
          const progress = info.progress;
          const fallbackPhase = info.status === 409
            ? "Waiting for course mapping"
            : info.status === 202
            ? "Preparing your learning path"
            : "Retrying";
          const fallbackDetail = info.status === 409
            ? "Pick a course for this subject to continue."
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
            subject: info.subject,
            updatedAt: progress?.updatedAt ? Number(progress.updatedAt) : Date.now(),
          });
          setError(null);
        });
        if (lesson) {
          setItems((arr) => [...arr, lesson]);
          fetchedAny = true;
          needed -= 1;
          setLoadingInfo(null);
        } else {
          cooldownRef.current.set(subject, Date.now() + 8000);
          break;
        }
      }
      setInitialized(true);
      if (!fetchedAny && items.length === 0) {
        if (!sawProgress) {
          setError("Could not load your feed. Try again.");
          setLoadingInfo(null);
        }
      }
    } finally {
      fetching.current = false;
    }
  }, [items.length, i, rotation]);

  const triggerHint = useCallback(() => {
    setShowCompleteHint(true);
    if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
    hintTimeoutRef.current = window.setTimeout(() => {
      setShowCompleteHint(false);
    }, 2200);
  }, []);

  // Bootstrap
  useEffect(() => {
    if (!initialized) {
      void ensureBuffer(1);
    }
  }, [initialized, ensureBuffer]);

  // Reset buffer when class selection changes significantly
  const subjectsKey = useMemo(() => JSON.stringify(selectedSubjects), [selectedSubjects]);
  useEffect(() => {
    // Reset feed when user changes selected subjects (class switch/merge)
    setItems([]);
    setI(0);
    setError(null);
    setInitialized(false);
    setLoadingInfo(null);
    setCompletedMap({});
    setShowCompleteHint(false);
    setAutoAdvancing(false);
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
  }, [subjectsKey]);

  // Keep prefetching ahead
  useEffect(() => {
    if (items.length - i <= 2) void ensureBuffer(4);
  }, [i, items.length, ensureBuffer]);

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
    if (items.length - (i + 1) <= 2) {
      void ensureBuffer(4);
    }
    setAutoAdvancing(true);
    autoAdvanceRef.current = window.setTimeout(() => {
      next(true);
      setAutoAdvancing(false);
      autoAdvanceRef.current = null;
    }, 360);
  }, [ensureBuffer, i, items.length, next]);

  // Keyboard navigation like the static feed
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp") prev();
      if (e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next]);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let t: number | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (t) return; // throttle
      t = window.setTimeout(() => (t = null), 300);
      if (e.deltaY > 0) next();
      else prev();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [next, prev]);

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

  return (
    <div
      ref={containerRef}
      className="relative mx-auto h-[calc(100vh-56px)] w-full max-w-[420px] overflow-hidden px-3 sm:px-4"
      style={{ maxWidth: "min(420px, 92vw)" }}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.18),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(168,85,247,0.18),transparent_40%)]" />
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
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-500">
          <div>{error}</div>
          <button
            onClick={() => { setError(null); setLoadingInfo(null); setInitialized(false); void ensureBuffer(1); }}
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
            className="absolute inset-0 flex flex-col gap-5 px-3 py-6 sm:px-4"
          >
            <div className="flex-1 min-h-0">
              <div className="mx-auto flex h-full max-h-full w-full max-w-[380px] justify-center" style={{ maxWidth: "min(380px, 90vw)" }}>
                <div className="relative h-full w-full" style={{ aspectRatio: "9 / 16" }}>
                  <div className="absolute inset-0">
                    <LessonCard lesson={cur} className="h-full" />
                  </div>
                </div>
              </div>
            </div>
            {requiresQuiz && (
              <div className="flex flex-col gap-3">
                <QuizBlock
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
            {!requiresQuiz && (
              <div className="rounded-xl border border-lime-300/60 bg-lime-50/70 px-4 py-2 text-sm text-lime-700 shadow-sm dark:border-lime-400/50 dark:bg-lime-500/10 dark:text-lime-200">
                No quiz for this one - enjoy the lesson!
              </div>
            )}
            <div className="mt-auto text-xs text-neutral-400 text-center dark:text-neutral-500">
              <div className="flex flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-3">
                <span>Tip: Swipe up/down, use mouse wheel, or arrow keys.</span>
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
