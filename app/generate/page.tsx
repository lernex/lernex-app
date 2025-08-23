"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/types";
import LessonCard from "@/components/LessonCard";
import QuizBlock from "@/components/QuizBlock";

export default function Generate() {
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("Algebra 1");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const startProgress = () => {
    setProgress(0);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(1, Math.floor((90 - p) / 8)) : p));
    }, 120);
  };
  const stopProgress = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setProgress(100);
    setTimeout(() => setProgress(0), 400);
  };
  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  const run = async () => {
    setLoading(true);
    setErr(null);
    setLesson(null);
    startProgress();
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, subject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to generate");
      setLesson(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setErr(message);
    } finally {
      setLoading(false);
      stopProgress();
    }
  };

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center text-neutral-900 dark:text-white">
      <div className="w-full max-w-md px-4 py-6 space-y-4">
        <div className="rounded-2xl bg-white border border-neutral-200 p-5 space-y-3 dark:bg-neutral-900 dark:border-neutral-800">
          <h1 className="text-xl font-semibold">Generate a Micro-Lesson</h1>

          {/* progress bar */}
          {loading || progress > 0 ? (
            <div className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-lernex-blue transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (e.g., Algebra 1)"
            className="w-full px-3 py-2 rounded-xl bg-white border border-neutral-300 text-neutral-900 outline-none dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste study text here… (≥ 30 chars)"
            className="w-full px-3 py-2 rounded-xl bg-white border border-neutral-300 text-neutral-900 outline-none dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
          />
          <button
            onClick={run}
            disabled={loading || text.trim().length < 40}
            className="w-full py-3 rounded-2xl bg-lernex-blue hover:bg-blue-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
          {err && <div className="text-red-500 dark:text-red-400 text-sm">{err}</div>}
        </div>

        {lesson && (
          <div className="space-y-3">
            <LessonCard lesson={lesson} />
            <QuizBlock lesson={lesson} onDone={() => {}} />
          </div>
        )}
      </div>
    </main>
  );
}
