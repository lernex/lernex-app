"use client";
import { Lesson } from "@/types";
import Link from "next/link";

export default function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
    <div className="rounded-2xl bg-neutral-900 border border-neutral-800 shadow-lg p-5 space-y-3">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{lesson.subject}</div>
      <h2 className="text-xl font-semibold">{lesson.title}</h2>
      <p className="text-neutral-300">{lesson.content}</p>
      <div className="pt-2 flex gap-3">
        <Link href={`/lesson/${lesson.id}`} className="px-4 py-2 rounded-xl bg-lernex-blue hover:bg-blue-500 transition text-white">
          Quick Quiz
        </Link>
        <Link href={`/lesson/${lesson.id}`} className="px-4 py-2 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition text-white">
          Open
        </Link>
      </div>
    </div>
  );
}
