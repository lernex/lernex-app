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

type FypResponse = { topic: string; lesson: ApiLesson };

async function fetchFyp(subject?: string): Promise<Lesson | null> {
  try {
    const url = subject ? `/api/fyp?subject=${encodeURIComponent(subject)}` : "/api/fyp";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data: FypResponse = await res.json();
    const l = data?.lesson;
    if (!l || !l.id) return null;
    const mapped: Lesson = {
      id: l.id,
      subject: l.subject,
      title: l.title,
      content: l.content,
      questions: Array.isArray(l.questions) ? l.questions : [],
      difficulty: l.difficulty,
      topic: l.topic || data.topic,
    };
    return mapped;
  } catch {
    return null;
  }
}

async function fetchFypBatch(subject: string | null, n: number): Promise<Lesson[]> {
  const url = subject ? `/api/fyp/batch?subject=${encodeURIComponent(subject)}&n=${n}` : `/api/fyp/batch?n=${n}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json() as { items?: { topic: string; lesson: ApiLesson }[] };
    const arr = Array.isArray(data?.items) ? data.items : [];
    return arr
      .map((it) => it.lesson)
      .filter(Boolean)
      .map((l) => ({
        id: l.id,
        subject: l.subject,
        title: l.title,
        content: l.content,
        questions: Array.isArray(l.questions) ? l.questions : [],
        difficulty: l.difficulty,
        topic: l.topic,
      } as Lesson));
  } catch {
    return [];
  }
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

  const nextSubject = (): string | null => {
    const idx = subjIdxRef.current % rotation.length;
    subjIdxRef.current = idx + 1;
    const s = rotation[idx];
    return s;
  };

  const ensureBuffer = useCallback(async (minAhead = 3) => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      let needed = Math.max(0, minAhead - (items.length - i));
      let guard = 0;
      while (needed > 0 && guard++ < 6) {
        const subject = nextSubject();
        const batch = await fetchFypBatch(subject, Math.min(needed, 5));
        if (batch.length) {
          setItems((arr) => [...arr, ...batch]);
          needed -= batch.length;
        } else {
          // try next subject in rotation
        }
      }
      setInitialized(true);
      if (items.length === 0) {
        setError("Could not load your feed. Try again.");
      }
    } finally {
      fetching.current = false;
    }
  }, [items.length, i, rotation.length]);

  // Bootstrap
  useEffect(() => {
    if (!initialized) {
      void ensureBuffer(4);
    }
  }, [initialized, ensureBuffer]);

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
      {!cur && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-400">Loading your feed…</div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-500">{error}</div>
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
