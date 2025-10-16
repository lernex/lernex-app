"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/types";
import LessonCard from "@/components/LessonCard";
import QuizBlock from "@/components/QuizBlock";
import FormattedText from "@/components/FormattedText";

export default function Generate() {
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("Algebra 1");
  const [mode, setMode] = useState<"quick" | "mini" | "full">("mini");

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
        body: JSON.stringify({ text, subject, mode }),
      });
      const t1 = performance.now();
      console.log("[client] request-sent", (t1 - t0).toFixed(1), "ms");

      // 2) in parallel, request quiz JSON (non-stream)
      const quizReq = fetch("/api/generate/quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, subject, difficulty: "easy", mode }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.text()) || "Quiz failed");
        return r.json();
      });

      // 1) handle streaming
      const res = await streamReq;
      const t1b = performance.now();
      console.log("[client] response-received", {
        dt: (t1b - t0).toFixed(1) + "ms",
        status: res.status,
        ok: res.ok,
        ct: res.headers.get("content-type"),
        xab: res.headers.get("x-accel-buffering"),
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Stream failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      const streamPump = async () => {
        console.log("[client] stream-start");
        let first = true;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (first) {
            console.log("[client] stream-first-chunk", {
              len: chunk.length,
              dt: (performance.now() - t0).toFixed(1) + "ms",
            });
            first = false;
          } else {
            console.log("[client] stream-chunk", { len: chunk.length });
          }
          full += chunk;
          setStreamed((s) => s + chunk);
        }
        console.log("[client] stream-complete-bytes", { len: full.length });
        return full.trim();
      };

      const [content, quizObj] = await Promise.all([streamPump(), quizReq]);
      if (!content) {
        console.warn("[client] empty-content-from-stream, using fallback label");
      }

      // 3) assemble Lesson object for your LessonCard + QuizBlock
      const assembled: Lesson = {
        id: quizObj?.id ?? crypto.randomUUID(),
        subject: quizObj?.subject ?? subject,
        topic: quizObj?.topic ?? "Micro-lesson",
        title: quizObj?.title ?? "Quick Concept",
        content: content || "Generated lesson.",
        difficulty: (quizObj?.difficulty as "intro" | "easy" | "medium" | "hard") ?? "easy",
        questions: Array.isArray(quizObj?.questions) ? quizObj.questions : [],
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

  // After we assemble the final lesson (card + quiz), force a one-time global
  // MathJax typeset to ensure everything on the page is rendered, including
  // prompts/choices that may contain raw TeX without delimiters before our
  // heuristics kick in.
  useEffect(() => {
    if (!lesson) return;
    const kick = () => {
      try {
        // Double-rAF so layout is committed before typeset
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Best-effort: ignore errors in case MathJax isn't loaded yet
            // The FormattedText fallbacks will still handle local elements.
            window.MathJax?.typesetPromise?.().catch(() => {});
            // Second pass a bit later to catch any late layout
            setTimeout(() => {
              window.MathJax?.typesetPromise?.().catch(() => {});
            }, 200);
          });
        });
      } catch {}
    };
    kick();
  }, [lesson]);

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-10 text-foreground">
      <div className="w-full max-w-md space-y-4 py-6">
        <div className="rounded-2xl border border-surface bg-surface-panel p-5 space-y-3 shadow-sm backdrop-blur transition-colors">
          <h1 className="text-xl font-semibold">Generate a Micro-Lesson</h1>

          {(loading || progress > 0) && (
            <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
              <div className="h-full bg-lernex-blue transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          )}

          {/* Response style selection */}
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { key: "quick", label: "Quick Question" },
              { key: "mini", label: "Mini Lesson" },
              { key: "full", label: "Full Lesson" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMode(opt.key as typeof mode)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${mode === opt.key ? "border-blue-600 bg-lernex-blue text-white" : "border-surface bg-surface-muted text-neutral-700 dark:text-neutral-200"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (e.g., Algebra 1)"
            className="w-full rounded-xl border border-surface bg-surface-card px-3 py-2 text-foreground outline-none transition focus:ring-2 focus:ring-lernex-blue/40 placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste study text here... (>= 20 chars)"
            className="w-full rounded-xl border border-surface bg-surface-card px-3 py-2 text-foreground outline-none transition focus:ring-2 focus:ring-lernex-blue/40 placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
          />
          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>Tip: Keep it 2 short paragraphs for best results.</span>
            <span>{text.length} chars</span>
          </div>
          <button
            onClick={run}
            disabled={loading || text.trim().length < 20}
            className="w-full rounded-2xl bg-gradient-to-r from-lernex-blue to-lernex-purple py-3 text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Generating..." : "Generate"}
          </button>
          {err && <div className="text-red-500 dark:text-red-400 text-sm">{err}</div>}
        </div>

        {/* Show streaming text immediately if lesson object not ready yet */}
        {!lesson && streamed && (
          <div className="whitespace-pre-wrap rounded-2xl border border-surface bg-surface-card p-4 text-neutral-700 shadow-sm dark:text-neutral-200">
            {/* Use incremental rendering to avoid flashing while streaming */}
            <FormattedText text={streamed} incremental />
          </div>
        )}

        {/* Empty-state helper */}
        {!lesson && !streamed && (
          <div className="rounded-2xl border border-dashed border-surface bg-surface-muted p-4 text-sm text-neutral-600 shadow-sm dark:text-neutral-300">
            Paste a concept or definition to turn it into a short lesson with a quick quiz. Great inputs:
            <ul className="mt-2 list-disc pl-5">
              <li>Key theorem statements or laws</li>
              <li>Definitions of core terms</li>
              <li>Short excerpts from notes or textbooks</li>
            </ul>
          </div>
        )}

        {lesson && (
          <div className="space-y-3">
            <LessonCard lesson={lesson} className="max-h-[60vh] sm:max-h-[520px] min-h-[260px]" />
            {Array.isArray(lesson.questions) && lesson.questions.length > 0 && (
              <QuizBlock lesson={lesson} onDone={() => {}} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
