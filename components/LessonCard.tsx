"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lesson } from "@/types";
import FormattedText from "./FormattedText";

type LessonCardProps = {
  lesson: Lesson;
  className?: string;
};

const MATH_TRIGGER_RE = /(\$|\\\(|\\\[|\\begin|√|⟨|_\{|\\\^)/;

export default function LessonCard({ lesson, className }: LessonCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [showFade, setShowFade] = useState(false);
  const shouldTypesetLesson = useMemo(() => {
    const contentHasMath = typeof lesson.content === "string" && MATH_TRIGGER_RE.test(lesson.content);
    const titleHasMath = typeof lesson.title === "string" && MATH_TRIGGER_RE.test(lesson.title);
    return contentHasMath || titleHasMath;
  }, [lesson.content, lesson.title]);

  // Mount guard: Once the lesson content is in the DOM, run a local
  // MathJax typeset against just this card to ensure stable formatting after
  // the preview -> card swap.
  useEffect(() => {
    if (!shouldTypesetLesson) return;
    const el = cardRef.current;
    if (!el) return;
    const handle = window.requestAnimationFrame(() => {
      window.MathJax?.typesetPromise?.([el]).catch(() => {});
    });
    return () => window.cancelAnimationFrame(handle);
  }, [lesson.id, lesson.content, shouldTypesetLesson]);

  const computeFade = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const { scrollTop, scrollHeight, clientHeight } = node;
    const overflow = scrollHeight - clientHeight;
    if (overflow <= 4) {
      setShowFade(false);
      return;
    }
    const atBottom = scrollTop + clientHeight >= scrollHeight - 6;
    setShowFade(!atBottom);
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = 0;

    let rafId = window.requestAnimationFrame(computeFade);
    const schedule = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(computeFade);
    };

    node.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(() => schedule());
      ro.observe(node);
    } else {
      schedule();
    }

    return () => {
      node.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (ro) ro.disconnect();
      window.cancelAnimationFrame(rafId);
    };
  }, [lesson.id, lesson.content, computeFade]);

  const sendFeedback = async (action: "like" | "dislike" | "save") => {
    try {
      const res = await fetch("/api/fyp/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: lesson.subject, lesson_id: lesson.id, action }),
      });
      if (!res.ok) {
        console.warn("[lesson-card] feedback failed", { action, status: res.status });
        return false;
      }
      return true;
    } catch (error) {
      console.warn("[lesson-card] feedback request error", error);
      return false;
    }
  };

  const baseClass =
    "relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/20 bg-gradient-to-br from-white/95 via-white/80 to-white/65 shadow-xl ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-2xl backdrop-blur-xl dark:border-white/10 dark:from-white/10 dark:via-white/5 dark:to-white/0";
  const rootClass = className ? baseClass + " " + className : baseClass;

  const helpfulClass = [
    "px-3 py-1.5 rounded-full border transition-shadow",
    liked
      ? "border-green-400/70 bg-green-50/80 text-green-700 shadow-sm dark:border-green-500/50 dark:bg-green-500/10 dark:text-green-300"
      : "border-neutral-200/80 bg-neutral-100/80 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700/70 dark:bg-neutral-800/60 dark:text-neutral-300 dark:hover:bg-neutral-800",
  ].join(" ");

  const saveClass = [
    "px-3 py-1.5 rounded-full border transition-shadow",
    saved
      ? "border-amber-400/70 bg-amber-50/80 text-amber-700 shadow-sm dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200"
      : "border-neutral-200/80 bg-neutral-100/80 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700/70 dark:bg-neutral-800/60 dark:text-neutral-300 dark:hover:bg-neutral-800",
  ].join(" ");

  const dislikeClass = [
    "ml-auto px-3 py-1.5 rounded-full border transition-shadow",
    disliked
      ? "border-red-400/70 bg-red-50/80 text-red-700 shadow-sm dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-200"
      : "border-neutral-200/80 bg-neutral-100/80 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700/70 dark:bg-neutral-800/60 dark:text-neutral-300 dark:hover:bg-neutral-800",
  ].join(" ");

  return (
    <div ref={cardRef} className={rootClass}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(59,130,246,0.2),transparent_55%),radial-gradient(circle_at_82%_78%,rgba(168,85,247,0.18),transparent_48%),radial-gradient(circle_at_50%_-5%,rgba(236,72,153,0.08),transparent_60%)]" />
      <div className="relative flex min-h-0 flex-1 flex-col gap-4 px-5 py-6 sm:px-6 md:py-7">
        <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
          {lesson.subject}
        </div>
        <h2 className="text-xl font-semibold leading-snug text-neutral-900 dark:text-white">{lesson.title}</h2>
        <div className="relative flex-1 min-h-0 pb-2 sm:pb-3">
          <div
            ref={scrollRef}
            className="lesson-scroll scrollbar-thin h-full overflow-y-auto pr-2 pb-12 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
          >
            <FormattedText text={lesson.content} as="div" className="break-words whitespace-pre-wrap" />
          </div>
          {showFade && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white via-white/75 to-transparent dark:from-neutral-900 dark:via-neutral-900/70" />
          )}
        </div>
        <div className="pt-2 flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => {
              const prevLiked = liked;
              const prevDisliked = disliked;
              setLiked(true);
              setDisliked(false);
              void sendFeedback("like").then((ok) => {
                if (!ok) {
                  setLiked(prevLiked);
                  setDisliked(prevDisliked);
                }
              });
            }}
            className={helpfulClass}
            aria-label="Mark lesson as helpful"
          >
            Helpful
          </button>
          <button
            onClick={() => {
              const prevSaved = saved;
              const nextSaved = !prevSaved;
              setSaved(nextSaved);
              void sendFeedback("save").then((ok) => {
                if (!ok) setSaved(prevSaved);
              });
            }}
            className={saveClass}
            aria-label="Save lesson"
          >
            {saved ? "Saved" : "Save"}
          </button>
          <button
            onClick={() => {
              const prevLiked = liked;
              const prevDisliked = disliked;
              setDisliked(true);
              setLiked(false);
              void sendFeedback("dislike").then((ok) => {
                if (!ok) {
                  setDisliked(prevDisliked);
                  setLiked(prevLiked);
                }
              });
            }}
            className={dislikeClass}
            aria-label="Not helpful"
          >
            Not helpful
          </button>
        </div>
      </div>
    </div>
  );
}
