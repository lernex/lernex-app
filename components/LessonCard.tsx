"use client";
import { Lesson } from "@/types";
import FormattedText from "./FormattedText";

export default function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
     <div className="rounded-[28px] overflow-hidden border border-neutral-200 bg-white/70 backdrop-blur shadow-xl transition-transform hover:scale-[1.02] hover:shadow-2xl dark:border-neutral-800 dark:bg-neutral-900/70">
      <div className="p-5 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {lesson.subject}
        </div>
        <h2 className="text-xl font-semibold">{lesson.title}</h2>
        <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
          <FormattedText text={lesson.content} />
        </p>
      </div>
    </div>
  );
}
