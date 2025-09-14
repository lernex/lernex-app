"use client";
import { useEffect, useRef, useState } from "react";
import { Lesson } from "@/types";
import FormattedText from "./FormattedText";

export default function LessonCard({ lesson }: { lesson: Lesson }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [disliked, setDisliked] = useState(false);

  // Mount guard: Once the lesson content is in the DOM, run a local
  // MathJax typeset against just this card to ensure stable formatting after
  // the preview → card swap.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.MathJax?.typesetPromise?.([el]).catch(() => {});
      });
    });
  }, [lesson.id, lesson.content]);

  const sendFeedback = async (action: "like"|"dislike"|"save") => {
    try {
      await fetch("/api/fyp/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: lesson.subject, lesson_id: lesson.id, action }),
      });
    } catch {}
  };

  return (
     <div ref={cardRef} className="rounded-[28px] overflow-hidden border border-neutral-200 bg-white/80 backdrop-blur shadow-xl transition-transform hover:scale-[1.02] hover:shadow-2xl dark:border-neutral-800 dark:bg-neutral-900/80">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-lernex-blue/10 via-transparent to-lernex-purple/10" />
      <div className="p-5 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {lesson.subject}
        </div>
        <h2 className="text-xl font-semibold">{lesson.title}</h2>
        <p className="leading-relaxed whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
          <FormattedText text={lesson.content} />
        </p>
        <div className="pt-3 flex items-center gap-2">
          <button
            onClick={() => { setLiked(true); setDisliked(false); void sendFeedback("like"); }}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${liked ? "bg-green-100/70 border-green-300 text-green-800" : "bg-neutral-100/80 border-neutral-200 text-neutral-600 hover:bg-neutral-200"}`}
            aria-label="Like"
          >
            👍 Helpful
          </button>
          <button
            onClick={() => { setSaved((s) => !s); void sendFeedback("save"); }}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${saved ? "bg-amber-100/70 border-amber-300 text-amber-800" : "bg-neutral-100/80 border-neutral-200 text-neutral-600 hover:bg-neutral-200"}`}
            aria-label="Save"
          >
            📌 Save
          </button>
          <button
            onClick={() => { setDisliked(true); setLiked(false); void sendFeedback("dislike"); }}
            className={`px-3 py-1.5 rounded-full text-sm border transition ml-auto ${disliked ? "bg-red-100/70 border-red-300 text-red-800" : "bg-neutral-100/80 border-neutral-200 text-neutral-600 hover:bg-neutral-200"}`}
            aria-label="Not helpful"
          >
            👎 Not helpful
          </button>
        </div>
      </div>
    </div>
  );
}
