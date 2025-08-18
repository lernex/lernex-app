"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import LessonCard from "./LessonCard";
import QuizBlock from "./QuizBlock";
import { Lesson } from "@/types";
import { useLernexStore } from "@/lib/store";

function useKeyNav(onPrev: () => void, onNext: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp") onPrev();
      if (e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext]);
}

export default function Feed({ lessons }: { lessons: Lesson[] }) {
  const { selectedSubjects, accuracyBySubject } = useLernexStore();
  const filtered = selectedSubjects.length
    ? lessons.filter((l) => selectedSubjects.includes(l.subject))
    : lessons;

  const [i, setI] = useState(0);
  const cur = filtered[i];
  const containerRef = useRef<HTMLDivElement>(null);

  const prev = useCallback(
    () => setI((x) => (x - 1 + filtered.length) % filtered.length),
    [filtered.length]
  );
  const next = useCallback(
    () => setI((x) => (x + 1) % filtered.length),
    [filtered.length]
  );

  useKeyNav(prev, next);

  // Mouse wheel: step when user scrolls a chunk
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

  if (!cur) {
    return (
      <div className="text-center text-neutral-400">
        No lessons for your selected subjects. <a href="/onboarding" className="underline">Pick subjects</a>.
      </div>
    );
  }

  const acc = accuracyBySubject[cur.subject];
  const pct = acc?.total ? Math.round((acc.correct / acc.total) * 100) : null;

  return (
    <div ref={containerRef} className="relative h-[calc(100vh-56px)] w-full max-w-md mx-auto overflow-hidden">
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
          <QuizBlock
            lesson={cur}
            onDone={() => {
              setTimeout(next, 250);
            }}
          />
          <div className="mt-3 text-xs text-neutral-400 text-center">
            Tip: Swipe up/down, use mouse wheel, or arrow keys.
            {pct !== null && <div>So far in <b>{cur.subject}</b>: {pct}% correct</div>}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
