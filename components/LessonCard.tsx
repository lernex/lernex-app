"use client";
import { useEffect, useRef } from "react";
import { Lesson } from "@/types";
import FormattedText from "./FormattedText";

export default function LessonCard({ lesson }: { lesson: Lesson }) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Mount guard: Once the lesson content is in the DOM, run a local
  // MathJax typeset against just this card to ensure stable formatting after
  // the preview → card swap.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // @ts-expect-error - MathJax is injected at runtime
        window.MathJax?.typesetPromise?.([el]).catch(() => {});
      });
    });
  }, [lesson.id, lesson.content]);

  return (
     <div ref={cardRef} className="rounded-[28px] overflow-hidden border border-neutral-200 bg-white/70 backdrop-blur shadow-xl transition-transform hover:scale-[1.02] hover:shadow-2xl dark:border-neutral-800 dark:bg-neutral-900/70">
      <div className="p-5 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {lesson.subject}
        </div>
        <h2 className="text-xl font-semibold">{lesson.title}</h2>
        <p className="leading-relaxed whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
          <FormattedText text={lesson.content} />
        </p>
      </div>
    </div>
  );
}
