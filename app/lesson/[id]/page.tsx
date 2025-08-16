"use client";
import { useParams, useRouter } from "next/navigation";
import { lessons } from "@/data/lessons";
import { useMemo, useState } from "react";
import { useLernexStore } from "@/lib/store";
import { bumpStreakAndPoints } from "@/lib/user";

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lesson = useMemo(() => lessons.find((l) => l.id === id), [id]);
  const [selected, setSelected] = useState<number | null>(null);
  const addPoints = useLernexStore((s) => s.addPoints);
  const bumpStreak = useLernexStore((s) => s.bumpStreakIfNewDay);

  if (!lesson) return <div className="p-6">Not found.</div>;

  const submit = (idx: number) => {
    setSelected(idx);
    bumpStreak();
    if (idx === lesson.question.correctIndex) {
      addPoints(10);       // local
      bumpStreakAndPoints(10).catch(() => {});
    } else {
      bumpStreakAndPoints(0).catch(() => {});
    }
  };

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 space-y-4">
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5 space-y-3">
          <div className="text-xs uppercase tracking-wide text-neutral-400">{lesson.subject}</div>
          <h1 className="text-xl font-semibold">{lesson.title}</h1>
          <p className="text-neutral-300">{lesson.content}</p>
        </div>

        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <div className="text-sm text-neutral-300 mb-3">{lesson.question.prompt}</div>
          <div className="grid gap-2">
            {lesson.question.choices.map((c, idx) => {
              const isCorrect = idx === lesson.question.correctIndex;
              const isSelected = selected === idx;
              return (
                <button
                  key={idx}
                  onClick={() => submit(idx)}
                  className={`text-left px-3 py-2 rounded-xl border transition
                    ${isSelected ? (isCorrect ? "bg-green-600 border-green-500" : "bg-red-600 border-red-500")
                                 : "bg-neutral-800 border-neutral-700 hover:bg-neutral-700"}`}
                  disabled={selected !== null}
                >
                  {c}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={() => router.push("/")} className="px-4 py-2 rounded-xl bg-lernex-blue hover:bg-blue-500 transition">
              Back to Feed
            </button>
            <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition">
              Try Again
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
