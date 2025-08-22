"use client";
import { useState } from "react";
import { Lesson } from "@/types";
import { useLernexStore } from "@/lib/store";

export default function QuizBlock({ lesson, onDone }: { lesson: Lesson; onDone: (correctCount: number) => void; }) {
  const addPoints = useLernexStore((s) => s.addPoints);
  const bumpStreak = useLernexStore((s) => s.bumpStreakIfNewDay);
  const recordAnswer = useLernexStore((s) => s.recordAnswer);

  const [qIndex, setQ] = useState(0);
  const [selected, setSel] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const q = lesson.questions[qIndex];

  const choose = (idx: number) => {
    if (selected !== null) return;
    setSel(idx);
    const isCorrect = idx === q.correctIndex;
    recordAnswer(lesson.subject, isCorrect);
    bumpStreak();
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      addPoints(10);
    }
  };

  const next = () => {
    if (qIndex < lesson.questions.length - 1) {
      setQ(qIndex + 1);
      setSel(null);
    } else {
      onDone(correctCount);
    }
  };

  const btnClass = (idx: number) =>
    `text-left px-3 py-2 rounded-xl border transition ${
      selected === null
        ? "bg-neutral-100 border-neutral-200 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:hover:bg-neutral-700"
        : idx === q.correctIndex
        ? "bg-green-600/80 border-green-500"
        : idx === selected
        ? "bg-red-600/80 border-red-500"
        : "bg-neutral-100/60 border-neutral-200/60 dark:bg-neutral-800/60 dark:border-neutral-700/60"
    }`;

  return (
    <div className="rounded-[24px] bg-white/80 border border-neutral-200 p-5 mt-3 dark:bg-neutral-900/80 dark:border-neutral-800">
      <div className="mb-3 text-sm text-neutral-700 dark:text-neutral-300">{q.prompt}</div>
      <div className="grid gap-2">
        {q.choices.map((choice, idx) => (
          <button key={idx} onClick={() => choose(idx)} disabled={selected !== null} className={btnClass(idx)}>
            {choice}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Question {qIndex + 1} / {lesson.questions.length}
        </div>
        <button onClick={next} className="px-4 py-2 rounded-xl bg-lernex-blue hover:bg-blue-500 transition">
          {qIndex < lesson.questions.length - 1 ? "Next" : "Finish"}
        </button>
      </div>
    </div>
  );
}
