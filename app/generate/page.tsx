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
  const [contentType, setContentType] = useState<"lesson" | "quiz">("lesson");
  const [quizMode, setQuizMode] = useState<"short" | "standard" | "comprehensive">("standard");

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
      // Check if user wants a quiz (detect quiz-related keywords)
      const isQuizRequest = /\b(quiz|test|practice|questions|assessment)\b/i.test(followUpQuestion);

      if (isQuizRequest) {
        // Generate a quiz based on the lesson
        const context = lesson.content || text;

        const quizRes = await fetch("/api/generate/quiz", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: context,
            subject: lesson.subject,
            difficulty: "easy",
            mode: "standard", // Default to standard quiz for follow-ups
            quizOnly: true,
          }),
        });

        if (!quizRes.ok) {
          throw new Error("Quiz generation failed");
        }

        const quizObj = await quizRes.json();

        // Update the lesson with new quiz questions
        if (Array.isArray(quizObj?.questions) && quizObj.questions.length > 0) {
          setLesson((prev) => prev ? {
            ...prev,
            questions: [...(prev.questions || []), ...quizObj.questions],
          } : prev);

          const answerText = `I've generated ${quizObj.questions.length} additional quiz questions for you! Check them out below.`;
          setFollowUpHistory((prev) => [...prev, { question: followUpQuestion, answer: answerText }]);
          setFollowUpQuestion("");
        }
      } else {
        // Regular text-based follow-up
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
      }
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
      if (contentType === "quiz") {
        // Quiz-only mode: skip lesson generation, only create quiz
        const quizReq = fetch("/api/generate/quiz", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text,
            subject,
            difficulty: "easy",
            mode: quizMode,
            quizOnly: true
          }),
        });

        const quizObj = await quizReq.then(async (r) => {
          if (!r.ok) throw new Error((await r.text()) || "Quiz generation failed");
          return r.json();
        });

        // Assemble Lesson object with empty content for quiz-only mode
        const assembled: Lesson = {
          id: quizObj?.id ?? crypto.randomUUID(),
          subject: quizObj?.subject ?? subject,
          topic: quizObj?.topic ?? "Quiz",
          title: quizObj?.title ?? "Practice Quiz",
          content: "", // No lesson content in quiz-only mode
          difficulty: (quizObj?.difficulty as "intro" | "easy" | "medium" | "hard") ?? "easy",
          questions: Array.isArray(quizObj?.questions) ? quizObj.questions : [],
        };

        setLesson(assembled);
        console.log("[client] quiz-only-complete", (performance.now() - t0).toFixed(1), "ms");

        // Save to history
        saveToHistory(assembled).catch((err) =>
          console.warn("[generate] Failed to save to history:", err)
        );
      } else {
        // Lesson + Quiz mode: Generate lesson first, then quiz based on lesson content
        // 1) Generate the lesson text first
        const res = await fetch("/api/generate/stream", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, subject, mode }),
        });
        const t1 = performance.now();
        console.log("[client] lesson-request-sent", (t1 - t0).toFixed(1), "ms");

        if (!res.ok || !res.body) {
          const msg = await res.text().catch(() => "");
          throw new Error(msg || "Stream failed");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let lessonContent = "";

        // Stream the lesson content
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
          }
          lessonContent += chunk;
          setStreamed((s) => s + chunk);
        }
        lessonContent = lessonContent.trim();
        const t2 = performance.now();
        console.log("[client] lesson-complete", (t2 - t0).toFixed(1), "ms");

        if (!lessonContent) {
          console.warn("[client] empty-lesson-content");
          lessonContent = "Generated lesson.";
        }

        // 2) Now generate quiz based on the actual lesson content
        const quizRes = await fetch("/api/generate/quiz", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: lessonContent, // Use generated lesson content, not source text
            subject,
            difficulty: "easy",
            mode,
            quizOnly: false,
          }),
        });

        if (!quizRes.ok) {
          throw new Error((await quizRes.text()) || "Quiz generation failed");
        }

        const quizObj = await quizRes.json();
        const t3 = performance.now();
        console.log("[client] quiz-complete", (t3 - t0).toFixed(1), "ms");

        // 3) Assemble Lesson object for LessonCard + QuizBlock
        const assembled: Lesson = {
          id: quizObj?.id ?? crypto.randomUUID(),
          subject: quizObj?.subject ?? subject,
          topic: quizObj?.topic ?? "Micro-lesson",
          title: quizObj?.title ?? "Quick Concept",
          content: lessonContent,
          difficulty: (quizObj?.difficulty as "intro" | "easy" | "medium" | "hard") ?? "easy",
          questions: Array.isArray(quizObj?.questions) ? quizObj.questions : [],
        };

        setLesson(assembled);
        console.log("[client] total-complete", (t3 - t0).toFixed(1), "ms");

        // Save lesson to history (fire and forget)
        saveToHistory(assembled).catch((err) =>
          console.warn("[generate] Failed to save to history:", err)
        );
      }
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
        <div className="rounded-2xl border border-surface bg-surface-panel p-5 space-y-3 shadow-sm backdrop-blur transition-all duration-300">
          <h1 className="text-xl font-semibold transition-all duration-300">
            {contentType === "lesson" ? "Generate a Micro-Lesson" : "Generate a Practice Quiz"}
          </h1>

          {(loading || progress > 0) && (
            <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
              <div className="h-full bg-lernex-blue transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          )}

          {/* Content Type Toggle */}
          <div className="flex items-center gap-3 p-1 rounded-2xl bg-surface-muted border border-surface">
            <button
              onClick={() => setContentType("lesson")}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-300 ${
                contentType === "lesson"
                  ? "bg-gradient-to-r from-lernex-blue to-lernex-purple text-white shadow-lg shadow-lernex-blue/30 scale-[1.02]"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span>Lesson + Quiz</span>
              </div>
            </button>
            <button
              onClick={() => setContentType("quiz")}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-300 ${
                contentType === "quiz"
                  ? "bg-gradient-to-r from-lernex-purple to-pink-500 text-white shadow-lg shadow-lernex-purple/30 scale-[1.02]"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <span>Quiz Only</span>
              </div>
            </button>
          </div>

          {/* Length selection - changes based on content type */}
          <div className="overflow-hidden">
            <div
              className={`transition-all duration-500 ease-in-out ${
                contentType === "lesson" ? "opacity-100 max-h-20" : "opacity-0 max-h-0"
              }`}
            >
              {contentType === "lesson" && (
                <div className="flex flex-wrap gap-2 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                  {[
                    { key: "quick", label: "Quick Question", icon: "⚡" },
                    { key: "mini", label: "Mini Lesson", icon: "📝" },
                    { key: "full", label: "Full Lesson", icon: "📚" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setMode(opt.key as typeof mode)}
                      className={`group relative overflow-hidden rounded-full border px-4 py-2 text-sm font-medium transition-all duration-300 ${
                        mode === opt.key
                          ? "border-lernex-blue bg-lernex-blue text-white shadow-lg shadow-lernex-blue/30 scale-105"
                          : "border-surface bg-surface-card text-neutral-700 dark:text-neutral-200 hover:border-lernex-blue/50 hover:shadow-md"
                      }`}
                    >
                      <span className="mr-1.5">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div
              className={`transition-all duration-500 ease-in-out ${
                contentType === "quiz" ? "opacity-100 max-h-20" : "opacity-0 max-h-0"
              }`}
            >
              {contentType === "quiz" && (
                <div className="flex flex-wrap gap-2 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                  {[
                    { key: "short", label: "Quick Quiz", desc: "3-4 questions", icon: "🎯" },
                    { key: "standard", label: "Standard Quiz", desc: "5-7 questions", icon: "📋" },
                    { key: "comprehensive", label: "Full Quiz", desc: "8-12 questions", icon: "🎓" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setQuizMode(opt.key as typeof quizMode)}
                      className={`group relative overflow-hidden rounded-full border px-4 py-2 text-sm font-medium transition-all duration-300 ${
                        quizMode === opt.key
                          ? "border-lernex-purple bg-gradient-to-r from-lernex-purple to-pink-500 text-white shadow-lg shadow-lernex-purple/30 scale-105"
                          : "border-surface bg-surface-card text-neutral-700 dark:text-neutral-200 hover:border-lernex-purple/50 hover:shadow-md"
                      }`}
                    >
                      <span className="mr-1.5">{opt.icon}</span>
                      {opt.label}
                      <span className={`ml-1.5 text-xs ${quizMode === opt.key ? "text-white/80" : "text-neutral-500 dark:text-neutral-400"}`}>
                        ({opt.desc})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              placeholder={
                contentType === "lesson"
                  ? "Paste study text here... (>= 20 chars)"
                  : "Paste the topic or material you want to be quizzed on... (>= 20 chars)"
              }
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
            <span>
              {contentType === "lesson"
                ? "Tip: Keep it 2 short paragraphs for best results."
                : "Tip: Provide clear topic description for focused questions."}
            </span>
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
          <div className="rounded-2xl border border-dashed border-surface bg-surface-muted p-4 text-sm text-neutral-600 shadow-sm dark:text-neutral-300 transition-all duration-300">
            {contentType === "lesson" ? (
              <>
                Paste a concept or definition to turn it into a short lesson with a quick quiz. Great inputs:
                <ul className="mt-2 list-disc pl-5">
                  <li>Key theorem statements or laws</li>
                  <li>Definitions of core terms</li>
                  <li>Short excerpts from notes or textbooks</li>
                </ul>
              </>
            ) : (
              <>
                Generate a focused practice quiz on any topic. Perfect for:
                <ul className="mt-2 list-disc pl-5">
                  <li>Testing your understanding of recent lessons</li>
                  <li>Quick review before exams</li>
                  <li>Reinforcing key concepts and formulas</li>
                </ul>
              </>
            )}
          </div>
        )}

        {lesson && (
          <div className="space-y-3">
            {/* Only show LessonCard if not in quiz-only mode */}
            {contentType === "lesson" && (
              <LessonCard
                lesson={lesson}
                lessonId={savedLessonId || undefined}
                autoPlay={ttsAutoPlay}
                className="max-h-[60vh] sm:max-h-[520px] min-h-[260px]"
              />
            )}
            {/* Show QuizBlock if there are questions */}
            {Array.isArray(lesson.questions) && lesson.questions.length > 0 && (
              <div className={contentType === "quiz" ? "animate-in fade-in slide-in-from-bottom-4 duration-500" : ""}>
                <QuizBlock lesson={lesson} onDone={() => {}} />
              </div>
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
                          "Generate a practice quiz on this",
                        ].map((prompt, idx) => (
                          <button
                            key={prompt}
                            onClick={() => setFollowUpQuestion(prompt)}
                            disabled={followUpLoading}
                            className={`text-xs rounded-full border border-surface px-3 py-1 transition-all disabled:opacity-60 ${
                              idx === 2
                                ? "bg-gradient-to-r from-lernex-purple/10 to-pink-500/10 border-lernex-purple/30 text-lernex-purple dark:text-pink-400 hover:bg-lernex-purple/20 hover:border-lernex-purple hover:shadow-md"
                                : "bg-surface-muted text-neutral-700 dark:text-neutral-300 hover:bg-lernex-blue/10 hover:border-lernex-blue hover:text-lernex-blue"
                            }`}
                          >
                            {idx === 2 && <span className="mr-1">🎯</span>}
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
