"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/types";
import LessonCard from "@/components/LessonCard";
import QuizBlock from "@/components/QuizBlock";
import FormattedText from "@/components/FormattedText";
import { buildLessonTex, TEX_PREAMBLE, TEX_POSTAMBLE } from "@/lib/latex";

export default function Generate() {
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("Algebra 1");

  // streaming text + assembled lesson
  const [streamed, setStreamed] = useState("");
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
    const t0 = performance.now();
    setLoading(true);
    setErr(null);
    setLesson(null);
    setStreamed("");
    startProgress();

    try {
      // 1) kick off streaming lesson text
      const streamReq = fetch("/api/generate/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, subject }),
      });
      const t1 = performance.now();
      console.log("[client] headers-received", (t1 - t0).toFixed(1), "ms");

      // 2) in parallel, request quiz JSON (non-stream)
      const quizReq = fetch("/api/generate/quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, subject, difficulty: "easy" }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.text()) || "Quiz failed");
        return r.json();
      });

      // 1) handle streaming
      const res = await streamReq;
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Stream failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      const streamPump = async () => {
        let started = false;
        let headerDone = false;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          full += chunk;
          let display = chunk;
          if (!started) {
            const idx = full.indexOf(TEX_PREAMBLE);
            if (idx !== -1) {
              started = true;
              display = full.slice(idx + TEX_PREAMBLE.length);
            } else {
              continue;
            }
          }
          if (display) {
            const endIdx = display.indexOf(TEX_POSTAMBLE);
            let toAdd = endIdx !== -1 ? display.slice(0, endIdx) : display;
            if (!headerDone) {
              const metaEnd = toAdd.indexOf("\n\n");
              if (metaEnd !== -1) {
                headerDone = true;
                toAdd = toAdd.slice(metaEnd + 2);
              } else {
                continue;
              }
            }
            if (toAdd) setStreamed((s) => s + toAdd);
          }
        }
        const withoutWrap = full.replace(TEX_PREAMBLE, "").replace(TEX_POSTAMBLE, "");
        return withoutWrap.replace(/^%.*\n/gm, "").trim();
      };

      const [content, quizObj] = await Promise.all([streamPump(), quizReq]);

      const texDoc = buildLessonTex(content, quizObj.tex);

      // 3) assemble Lesson object for your LessonCard + QuizBlock
      const assembled: Lesson = {
        id: quizObj?.id ?? crypto.randomUUID(),
        subject: quizObj?.subject ?? subject,
        topic: quizObj?.topic ?? "Micro-lesson",
        title: quizObj?.title ?? "Quick Concept",
        content: content || "Generated lesson.",
        difficulty: (quizObj?.difficulty as "intro" | "easy" | "medium" | "hard") ?? "easy",
        questions: Array.isArray(quizObj?.questions) ? quizObj.questions : [],
        tex: texDoc,
      };

      setLesson(assembled);
      const t3 = performance.now();
      console.log("[client] stream-complete", (t3 - t0).toFixed(1), "ms");
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

          {(loading || progress > 0) && (
            <div className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
              <div className="h-full bg-lernex-blue transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          )}

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
            placeholder="Paste study text here… (≥ 40 chars)"
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

        {/* Show streaming text immediately if lesson object not ready yet */}
        {!lesson && streamed && (
          <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 whitespace-pre-wrap">
            <FormattedText text={streamed} />
          </div>
        )}

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
