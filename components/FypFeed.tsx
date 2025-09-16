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

async function fetchFypOne(subject: string | null): Promise<Lesson | null> {
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
        try {
          const j: Record<string, unknown> = await res.json().catch(() => ({} as Record<string, unknown>));
          console.debug("[fyp] backoff", { subject, status: res.status, j });
        } catch {}
        // Backoff and retry
        const jitter = Math.floor(Math.random() * 250);
        await new Promise((r) => setTimeout(r, delay + jitter));
        delay = Math.min(8000, Math.floor(delay * 1.8));
        continue;
      }
      // Hard failures or auth
      if (res.status === 401 || res.status === 403 || res.status >= 500) {
        try {
          const j: Record<string, unknown> = await res.json().catch(() => ({} as Record<string, unknown>));
          console.warn("[fyp] hard-fail", { subject, status: res.status, j });
        } catch {}
        return null;
      }
    } catch {
      // Network error; back off slightly then retry
      const jitter = Math.floor(Math.random() * 200);
      try { console.warn("[fyp] network error; retry", { subject, delay }); } catch {}
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

  const ensureBuffer = useCallback(async (minAhead = 3) => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      let needed = Math.max(0, minAhead - (items.length - i));
      let guard = 0;
      const attempted = new Set<string | null>();
      const now = Date.now();
      let fetchedAny = false;
      try { console.debug("[fyp] ensureBuffer", { minAhead, have: items.length - i, rotation }); } catch {}
      while (needed > 0 && guard++ < 12) {
        const idx = subjIdxRef.current % rotation.length;
        subjIdxRef.current = idx + 1;
        const subject = rotation[idx];
        try { console.debug("[fyp] try-subject", { subject, idx, guard }); } catch {}
        if (attempted.has(subject)) {
          // Already tried this subject during this pass; break to avoid tight loops
          break;
        }
        attempted.add(subject);
        const until = cooldownRef.current.get(subject) ?? 0;
        if (until > now) {
          // Still cooling down; skip this subject this pass
          continue;
        }
        const one = await fetchFypOne(subject);
        if (one) {
          setItems((arr) => [...arr, one]);
          fetchedAny = true;
          needed -= 1;
        } else {
          // Back off this subject for a few seconds to prevent hammering
          cooldownRef.current.set(subject, Date.now() + 8000);
          // Break out to avoid repeatedly calling the same failing subject in this pass
          break;
        }
      }
      setInitialized(true);
      if (!fetchedAny && items.length === 0) {
        setError("Could not load your feed. Try again.");
      }
    } finally {
      fetching.current = false;
    }
  }, [items.length, i, rotation]);

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
    cooldownRef.current.clear();
    subjIdxRef.current = 0;
  }, [subjectsKey]);

  // Keep prefetching ahead
  useEffect(() => {
    if (items.length - i <= 2) void ensureBuffer(4);
  }, [i, items.length, ensureBuffer]);

  const prev = useCallback(() => {
    setI((x) => Math.max(0, x - 1));
  }, []);
  const next = useCallback(() => {
    setI((x) => Math.min(items.length - 1, x + 1));
  }, [items.length]);

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
  const acc = cur ? accuracyBySubject[cur.subject] : undefined;
  const pct = acc?.total ? Math.round((acc.correct / acc.total) * 100) : null;

  return (
    <div ref={containerRef} className="relative h-[calc(100vh-56px)] w-full max-w-md mx-auto overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.18),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(168,85,247,0.18),transparent_40%)]" />
      {!cur && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-400">Loading your feed…</div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-500">
          <div>{error}</div>
          <button
            onClick={() => { setError(null); setInitialized(false); void ensureBuffer(1); }}
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
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -120) next();
              if (info.offset.y > 120) prev();
            }}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="absolute inset-0 px-4 py-5"
          >
            <LessonCard lesson={cur} />
            {Array.isArray(cur.questions) && cur.questions.length > 0 && (
              <QuizBlock
                lesson={cur}
                onDone={() => {
                  setTimeout(next, 250);
                }}
              />
            )}
            <div className="mt-3 text-xs text-neutral-400 text-center">
              Tip: Swipe up/down, use mouse wheel, or arrow keys.
              {pct !== null && <div>So far in <b>{cur.subject}</b>: {pct}% correct</div>}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
