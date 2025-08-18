"use client";
import { Lesson } from "@/types";

export default function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
    <div className="rounded-[28px] overflow-hidden border border-neutral-800 bg-neutral-900/70 backdrop-blur shadow-xl">
      {/* Media */}
      {lesson.mediaUrl && (
        <div className="aspect-[9/12] w-full bg-neutral-900">
          {lesson.mediaType === "video" ? (
            <video className="w-full h-full object-cover" src={lesson.mediaUrl} autoPlay loop muted playsInline />
          ) : (
            <img className="w-full h-full object-cover" src={lesson.mediaUrl} alt={lesson.title} />
          )}
        </div>
      )}

      {/* Text */}
      <div className="p-5 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-neutral-400">{lesson.subject}</div>
        <h2 className="text-xl font-semibold">{lesson.title}</h2>
        <p className="text-neutral-300 leading-relaxed">{lesson.content}</p>
      </div>
    </div>
  );
}
