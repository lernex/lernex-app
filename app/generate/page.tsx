"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import type { Lesson } from "@/types";
import LessonCard from "@/components/LessonCard";
import QuizBlock from "@/components/QuizBlock";
import FormattedText from "@/components/FormattedText";
import LessonHistoryModal from "@/components/LessonHistoryModal";
import VoiceInput from "@/components/VoiceInput";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function GenerateContent() {
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

  // follow-up questions state
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpHistory, setFollowUpHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [followUpStreaming, setFollowUpStreaming] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // history modal state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // TTS settings
  const [ttsAutoPlay, setTtsAutoPlay] = useState(false);
  const [savedLessonId, setSavedLessonId] = useState<string | null>(null);

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

  // Fetch TTS settings on mount
  useEffect(() => {
    const fetchTTSSettings = async () => {
      try {
        const res = await fetch("/api/tts/settings");
        if (res.ok) {
          const data = await res.json();
          setTtsAutoPlay(data.tts_auto_play || false);
        }
      } catch (error) {
        console.error("[generate] Failed to load TTS settings:", error);
      }
    };

    fetchTTSSettings();
  }, []);

  const handleFollowUp = async () => {
    if (!followUpQuestion.trim() || !lesson) return;

    setFollowUpLoading(true);
    setFollowUpStreaming("");

    try {
      // Build context from lesson and previous follow-ups
      const context = `
Original Lesson:
Subject: ${lesson.subject}
Topic: ${lesson.topic}
Content: ${lesson.content}

${followUpHistory.length > 0 ? `Previous Q&A:\n${followUpHistory.map((item, i) => `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.answer}`).join('\n\n')}` : ''}

Current Question: ${followUpQuestion}
`;

      const res = await fetch("/api/generate/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: context,
          subject: lesson.subject,
          mode: "mini", // Use mini mode for follow-ups
        }),
      });

      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Follow-up failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullAnswer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullAnswer += chunk;
        setFollowUpStreaming((s) => s + chunk);
      }

      // Add to history
      setFollowUpHistory((prev) => [...prev, { question: followUpQuestion, answer: fullAnswer.trim() }]);
      setFollowUpQuestion("");
      setFollowUpStreaming("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setErr(message);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const run = async () => {
    const t0 = performance.now();
    setLoading(true);
    setErr(null);
    setLesson(null);
    setSavedLessonId(null); // Reset saved lesson ID for new generation
    setStreamed("");
    setFollowUpHistory([]);
    setFollowUpQuestion("");
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

      // Save lesson to history (fire and forget)
      saveToHistory(assembled).catch((err) =>
        console.warn("[generate] Failed to save to history:", err)
      );
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

  // Typeset MathJax when follow-up history changes
  useEffect(() => {
    if (followUpHistory.length === 0) return;
    try {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.MathJax?.typesetPromise?.().catch(() => {});
        });
      });
    } catch {}
  }, [followUpHistory]);

  const saveToHistory = async (lessonToSave: Lesson) => {
    try {
      const res = await fetch("/api/lesson-history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lesson: lessonToSave,
          subject,
          topic: lessonToSave.topic,
          mode,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.id) {
          setSavedLessonId(data.id);
          console.log("[generate] Lesson saved to history with ID:", data.id);
        }
      }
    } catch (error) {
      console.error("[generate] Error saving to history:", error);
    }
  };

  return (
    <>
      <LessonHistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
    <main className="relative min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-10 text-foreground">
      {/* History Button - Top Right */}
      <button
        onClick={() => setIsHistoryOpen(true)}
        className="fixed top-20 right-6 flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-surface bg-surface-card hover:bg-surface-muted shadow-lg hover:shadow-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40 z-10 group"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-lernex-purple/15 text-lernex-purple group-hover:bg-lernex-purple/25 transition-colors">
          <Clock className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium text-foreground">History</span>
      </button>

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
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Paste study text here... (>= 20 chars)"
              className="w-full rounded-xl border border-surface bg-surface-card px-3 py-2 pr-14 text-foreground outline-none transition focus:ring-2 focus:ring-lernex-blue/40 placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
            />
            <div className="absolute bottom-2 right-2">
              <VoiceInput
                onTranscription={(transcribedText) => {
                  setText((prev) => (prev ? prev + " " + transcribedText : transcribedText));
                }}
                size="md"
              />
            </div>
          </div>
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
            <LessonCard
              lesson={lesson}
              lessonId={savedLessonId || undefined}
              autoPlay={ttsAutoPlay}
              className="max-h-[60vh] sm:max-h-[520px] min-h-[260px]"
            />
            {Array.isArray(lesson.questions) && lesson.questions.length > 0 && (
              <QuizBlock lesson={lesson} onDone={() => {}} />
            )}

            {/* Follow-up Questions Section - Show immediately after lesson is generated */}
            {lesson && (
              <div className="space-y-4">
                {/* Follow-up History */}
                {followUpHistory.map((item, idx) => (
                  <div key={idx} className="space-y-3">
                    <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 shadow-sm">
                      <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1.5">Your Question</div>
                      <div className="text-foreground">{item.question}</div>
                    </div>
                    <div className="relative overflow-hidden rounded-[28px] border border-surface bg-surface-card shadow-xl ring-1 ring-black/5 backdrop-blur-xl">
                      <div className="pointer-events-none absolute inset-0 opacity-80 dark:opacity-40 bg-[radial-gradient(circle_at_12%_18%,rgba(59,130,246,0.2),transparent_55%),radial-gradient(circle_at_82%_78%,rgba(168,85,247,0.18),transparent_48%),radial-gradient(circle_at_50%_-5%,rgba(236,72,153,0.08),transparent_60%)]" />
                      <div className="relative px-5 py-4 sm:px-6">
                        <div className="text-xs font-semibold text-lernex-purple mb-2">Follow-up Answer</div>
                        <FormattedText text={item.answer} />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Streaming Answer */}
                {followUpStreaming && (
                  <div className="relative overflow-hidden rounded-[28px] border border-surface bg-surface-card shadow-xl ring-1 ring-black/5 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="pointer-events-none absolute inset-0 opacity-80 dark:opacity-40 bg-[radial-gradient(circle_at_12%_18%,rgba(59,130,246,0.2),transparent_55%),radial-gradient(circle_at_82%_78%,rgba(168,85,247,0.18),transparent_48%),radial-gradient(circle_at_50%_-5%,rgba(236,72,153,0.08),transparent_60%)]" />
                    <div className="relative px-5 py-4 sm:px-6">
                      <div className="text-xs font-semibold text-lernex-purple mb-2">Follow-up Answer</div>
                      <FormattedText text={followUpStreaming} incremental />
                    </div>
                  </div>
                )}

                {/* Follow-up Input */}
                <div className="relative overflow-hidden rounded-[28px] border border-surface bg-surface-card shadow-xl ring-1 ring-black/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl">
                  <div className="pointer-events-none absolute inset-0 opacity-80 dark:opacity-40 bg-[radial-gradient(circle_at_12%_18%,rgba(59,130,246,0.2),transparent_55%),radial-gradient(circle_at_82%_78%,rgba(168,85,247,0.18),transparent_48%),radial-gradient(circle_at_50%_-5%,rgba(236,72,153,0.08),transparent_60%)]" />
                  <div className="relative px-5 py-5 sm:px-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple flex items-center justify-center shadow-sm">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">Have a follow-up question?</h3>
                    </div>

                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                      Ask for clarification or dive deeper into any part of the lesson.
                    </p>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={followUpQuestion}
                          onChange={(e) => setFollowUpQuestion(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !followUpLoading) {
                              e.preventDefault();
                              handleFollowUp();
                            }
                          }}
                          placeholder="e.g., Can you explain that example in more detail?"
                          disabled={followUpLoading}
                          className="w-full rounded-xl border border-surface bg-surface-muted pl-4 pr-12 py-2.5 text-foreground outline-none transition-all focus:ring-2 focus:ring-lernex-blue/40 focus:border-lernex-blue placeholder:text-neutral-500 dark:placeholder:text-neutral-400 disabled:opacity-60"
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                          <VoiceInput
                            onTranscription={(transcribedText) => {
                              setFollowUpQuestion((prev) => (prev ? prev + " " + transcribedText : transcribedText));
                            }}
                            size="sm"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleFollowUp}
                        disabled={followUpLoading || !followUpQuestion.trim()}
                        className="rounded-xl bg-gradient-to-r from-lernex-blue to-lernex-purple px-6 py-2.5 text-white font-medium shadow-sm transition-all hover:opacity-90 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-sm"
                      >
                        {followUpLoading ? (
                          <div className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span>Thinking...</span>
                          </div>
                        ) : (
                          "Ask"
                        )}
                      </button>
                    </div>

                    {followUpHistory.length === 0 && !followUpStreaming && (
                      <div className="mt-4 flex flex-wrap gap-2 items-center">
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">Quick prompts:</div>
                        {[
                          "Can you give another example?",
                          "What are common mistakes?",
                          "How does this connect to other topics?",
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => setFollowUpQuestion(prompt)}
                            disabled={followUpLoading}
                            className="text-xs rounded-full border border-surface bg-surface-muted px-3 py-1 text-neutral-700 dark:text-neutral-300 transition-all hover:bg-lernex-blue/10 hover:border-lernex-blue hover:text-lernex-blue disabled:opacity-60"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
    </>
  );
}

export default function Generate() {
  return (
    <ErrorBoundary>
      <GenerateContent />
    </ErrorBoundary>
  );
}
