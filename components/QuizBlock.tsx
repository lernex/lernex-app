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
    `text-left px-3 py-2 rounded-xl border transition
     ${selected === null ? "bg-neutral-800 border-neutral-700 hover:bg-neutral-700"
      : idx === q.correctIndex ? "bg-green-600/80 border-green-500"
      : idx === selected ? "bg-red-600/80 border-red-500"
      : "bg-neutral-800/60 border-neutral-700/60"}`;

  return (
    <div className="rounded-[24px] bg-neutral-900/80 border border-neutral-800 p-5 mt-3">
      <div className="text-sm text-neutral-300 mb-3">{q.prompt}</div>
      <div className="grid gap-2">
        {q.choices.map((choice, idx) => (
          <button key={idx} onClick={() => choose(idx)} disabled={selected !== null} className={btnClass(idx)}>
            {choice}
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-between items-center">
        <div className="text-xs text-neutral-400">
          Question {qIndex + 1} / {lesson.questions.length}
        </div>
        <button onClick={next} className="px-4 py-2 rounded-xl bg-lernex-blue hover:bg-blue-500 transition">
          {qIndex < lesson.questions.length - 1 ? "Next" : "Finish"}
        </button>
      </div>
    </div>
  );
}
