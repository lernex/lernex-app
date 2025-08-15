"use client";

import { useState } from "react";
import type { Lesson } from "@/types";
import LessonCard from "@/components/LessonCard";

export default function Generate() {
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("General");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    setLesson(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, subject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to generate");
      setLesson(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setErr(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 space-y-4">
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5 space-y-3">
          <h1 className="text-xl font-semibold">Generate a Micro-Lesson</h1>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (e.g., Algebra)"
            className="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste study text here…"
            className="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-white outline-none"
          />
          <button
            onClick={run}
            disabled={loading || text.length < 40}
            className="w-full py-3 rounded-2xl bg-lernex-blue hover:bg-blue-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
          {err && <div className="text-red-400 text-sm">{err}</div>}
        </div>

        {lesson && (
          <div className="space-y-3">
            <LessonCard lesson={lesson} />
          </div>
        )}
      </div>
    </main>
  );
}
