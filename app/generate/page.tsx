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
import { useUsageLimitCheck } from "@/lib/hooks/useUsageLimitCheck";
import UsageLimitModal from "@/components/UsageLimitModal";

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

  // Usage limit check hook
  const { checkLimit, isModalOpen, closeModal, limitData } = useUsageLimitCheck();

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

  // Helper function to consume streaming quiz responses
  const consumeQuizStream = async (response: Response): Promise<Array<{ prompt: string; choices: string[]; correctIndex: number; explanation: string }>> => {
    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const questions: Array<{ prompt: string; choices: string[]; correctIndex: number; explanation: string }> = [];
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines (newline-delimited JSON)
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const question = JSON.parse(line);
            // Add question to lesson immediately for progressive display
            if (question.prompt && question.choices) {
              questions.push(question);
              setLesson((prev) => prev ? {
                ...prev,
                questions: [...(prev.questions || []), question],
              } : prev);
            }
          } catch (e) {
            console.warn("[client] Failed to parse quiz question line:", line, e);
          }
        }
      }
    }

    return questions;
  };

  const handleFollowUp = async () => {
    if (!followUpQuestion.trim() || !lesson) return;

    // Check usage limit before follow-up generation
    const canGenerate = await checkLimit();
    if (!canGenerate) {
      return; // Modal will be shown by the hook
    }

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

        // Consume streaming quiz response
        const questions = await consumeQuizStream(quizRes);

        // Confirm completion to user
        if (questions.length > 0) {
          const answerText = `I've generated ${questions.length} additional quiz questions for you! Check them out below.`;
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
    // Check usage limit before starting generation
    const canGenerate = await checkLimit();
    if (!canGenerate) {
      return; // Modal will be shown by the hook
    }

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
        // Quiz-only mode: skip lesson generation, only create quiz with streaming
        const quizRes = await fetch("/api/generate/quiz", {
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

        if (!quizRes.ok) {
          throw new Error((await quizRes.text()) || "Quiz generation failed");
        }

        // Create initial Lesson object with empty questions
        const assembled: Lesson = {
          id: crypto.randomUUID(),
          subject: subject,
          topic: "Quiz",
          title: "Practice Quiz",
          content: "", // No lesson content in quiz-only mode
          difficulty: "easy",
          questions: [],
        };

        setLesson(assembled);
        console.log("[client] quiz-stream-start", (performance.now() - t0).toFixed(1), "ms");

        // Consume streaming quiz response (questions added progressively via consumeQuizStream)
        const questions = await consumeQuizStream(quizRes);

        console.log("[client] quiz-only-complete", (performance.now() - t0).toFixed(1), "ms", `${questions.length} questions`);

        // Save to history with final question count
        const finalLesson = {
          ...assembled,
          questions,
        };
        saveToHistory(finalLesson).catch((err) =>
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

        // 2) Now generate quiz based on the actual lesson content with streaming
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

        // Create initial Lesson object
        const assembled: Lesson = {
          id: crypto.randomUUID(),
          subject: subject,
          topic: "Micro-lesson",
          title: "Quick Concept",
          content: lessonContent,
          difficulty: "easy",
          questions: [],
        };

        setLesson(assembled);
        console.log("[client] quiz-stream-start", (t2 - t0).toFixed(1), "ms");

        // Consume streaming quiz response (questions added progressively)
        const questions = await consumeQuizStream(quizRes);

        const t3 = performance.now();
        console.log("[client] quiz-complete", (t3 - t0).toFixed(1), "ms", `${questions.length} questions`);
        console.log("[client] total-complete", (t3 - t0).toFixed(1), "ms");

        // Save lesson to history with final questions (fire and forget)
        const finalLesson = {
          ...assembled,
          questions,
        };
        saveToHistory(finalLesson).catch((err) =>
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

  // KaTeX renders synchronously during component render, so no manual typesetting needed

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
      {limitData && (
        <UsageLimitModal
          isOpen={isModalOpen}
          onClose={closeModal}
          timeUntilResetMs={limitData.timeUntilResetMs}
          tier={limitData.tier}
          currentCost={limitData.currentCost}
          limitAmount={limitData.limitAmount}
          percentUsed={limitData.percentUsed}
        />
      )}
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
          <div className="overflow-visible">
            <div
              className={`transition-all duration-500 ease-in-out ${
                contentType === "lesson" ? "opacity-100 max-h-28" : "opacity-0 max-h-0 pointer-events-none"
              }`}
            >
              {contentType === "lesson" && (
                <div className="grid grid-cols-3 gap-2 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                  {[
                    { key: "quick", label: "Quick Question" },
                    { key: "mini", label: "Mini Lesson" },
                    { key: "full", label: "Full Lesson" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setMode(opt.key as typeof mode)}
                      className={`group relative rounded-xl border px-3 py-2.5 text-xs sm:text-sm font-medium transition-all duration-300 ${
                        mode === opt.key
                          ? "border-lernex-blue bg-lernex-blue text-white shadow-lg shadow-lernex-blue/30"
                          : "border-surface bg-surface-card text-neutral-700 dark:text-neutral-200 hover:border-lernex-blue/50 hover:shadow-md"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div
              className={`transition-all duration-500 ease-in-out ${
                contentType === "quiz" ? "opacity-100 max-h-48" : "opacity-0 max-h-0 pointer-events-none"
              }`}
            >
              {contentType === "quiz" && (
                <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                  {[
                    { key: "short", label: "Quick Quiz", desc: "3-4 questions" },
                    { key: "standard", label: "Standard Quiz", desc: "5-7 questions" },
                    { key: "comprehensive", label: "Full Quiz", desc: "8-12 questions" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setQuizMode(opt.key as typeof quizMode)}
                      className={`w-full group relative rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-300 ${
                        quizMode === opt.key
                          ? "border-lernex-purple bg-gradient-to-r from-lernex-purple to-pink-500 text-white shadow-lg shadow-lernex-purple/30"
                          : "border-surface bg-surface-card text-neutral-700 dark:text-neutral-200 hover:border-lernex-purple/50 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{opt.label}</span>
                        <span className={`text-xs ${quizMode === opt.key ? "text-white/80" : "text-neutral-500 dark:text-neutral-400"}`}>
                          {opt.desc}
                        </span>
                      </div>
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
            <FormattedText text={streamed} />
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

            {/* Follow-up Questions Section - Enhanced Modern Design */}
            {lesson && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-3 duration-500">
                {/* Chat History - Clean conversational design */}
                {followUpHistory.length > 0 && (
                  <div className="rounded-2xl border border-surface bg-surface-panel/50 backdrop-blur p-4 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Conversation</h3>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">{followUpHistory.length} {followUpHistory.length === 1 ? 'exchange' : 'exchanges'}</span>
                    </div>
                    {followUpHistory.map((item, idx) => (
                      <div key={idx} className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${idx * 100}ms` }}>
                        {/* User Question */}
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-gradient-to-br from-lernex-blue to-lernex-purple p-3 shadow-sm">
                            <p className="text-sm text-white leading-relaxed">{item.question}</p>
                          </div>
                        </div>
                        {/* AI Response */}
                        <div className="flex justify-start">
                          <div className="max-w-[90%] rounded-2xl rounded-tl-md border border-surface bg-surface-card p-4 shadow-sm">
                            <FormattedText text={item.answer} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Streaming Answer */}
                {followUpStreaming && (
                  <div className="flex justify-start animate-in fade-in slide-in-from-left-3 duration-300">
                    <div className="max-w-[90%] rounded-2xl rounded-tl-md border border-surface bg-surface-card p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-lernex-purple rounded-full animate-pulse" />
                        <span className="text-xs font-medium text-lernex-purple">Generating response...</span>
                      </div>
                      <FormattedText text={followUpStreaming} />
                    </div>
                  </div>
                )}

                {/* Input Section - Modern & Clean */}
                <div className="rounded-2xl border border-surface bg-surface-panel p-4 shadow-sm backdrop-blur transition-all duration-300 hover:shadow-md">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-lernex-blue to-lernex-purple flex items-center justify-center shadow-md">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">Ask Follow-Up Questions</h3>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">Get clarification or explore deeper</p>
                      </div>
                    </div>

                    {/* Quick Action Chips */}
                    {followUpHistory.length === 0 && !followUpStreaming && (
                      <div className="flex flex-wrap gap-2">
                        {[
                          { text: "Give another example", icon: "💡" },
                          { text: "Common mistakes?", icon: "⚠️" },
                          { text: "Practice quiz", icon: "📝", special: true },
                        ].map((prompt) => (
                          <button
                            key={prompt.text}
                            onClick={() => setFollowUpQuestion(prompt.text)}
                            disabled={followUpLoading}
                            className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${
                              prompt.special
                                ? "bg-gradient-to-r from-lernex-purple/15 to-pink-500/15 border border-lernex-purple/30 text-lernex-purple dark:text-pink-400 hover:from-lernex-purple/25 hover:to-pink-500/25 hover:scale-105 hover:shadow-md"
                                : "bg-surface-muted border border-surface text-neutral-700 dark:text-neutral-300 hover:bg-surface-card hover:border-lernex-blue/40 hover:text-lernex-blue hover:scale-105"
                            }`}
                          >
                            <span className="text-sm">{prompt.icon}</span>
                            <span>{prompt.text}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Input Field */}
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
                          placeholder="Type your question..."
                          disabled={followUpLoading}
                          className="w-full rounded-xl border border-surface bg-surface-card pl-4 pr-12 py-3 text-sm text-foreground outline-none transition-all focus:ring-2 focus:ring-lernex-blue/40 focus:border-lernex-blue placeholder:text-neutral-500 dark:placeholder:text-neutral-400 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
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
                        className="flex-shrink-0 rounded-xl bg-gradient-to-r from-lernex-blue to-lernex-purple px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-md"
                      >
                        {followUpLoading ? (
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        )}
                      </button>
                    </div>
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
