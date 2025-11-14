"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lesson } from "@/types";
import { useLernexStore } from "@/lib/store";
import { useProfileStats } from "@/app/providers/ProfileStatsProvider";
import { normalizeProfileStats } from "@/lib/profile-stats";
import FormattedText from "./FormattedText";
import { MATH_TRIGGER_RE } from "@/lib/latex";

// Lightweight SFX helpers (WebAudio)
let audioCtx: AudioContext | null = null;
function getAudio() {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctor = ((window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) ?? window.AudioContext;
      audioCtx = Ctor ? new Ctor() : null;
    }
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}
function playDing() {
  const ctx = getAudio();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  const now = ctx.currentTime;
  o.frequency.setValueAtTime(880, now);
  o.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  o.connect(g).connect(ctx.destination);
  o.start(now);
  o.stop(now + 0.2);
}
function playFanfare() {
  const ctx = getAudio();
  if (!ctx) return;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  const now = ctx.currentTime;
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(f, now + i * 0.12);
    const t0 = now + i * 0.12;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + 0.2);
  });
}

// Tiny confetti burst using Web Animations API
function confettiBurst(x: number, y: number, opts?: { count?: number; spread?: number; power?: number; colors?: string[] }) {
  if (typeof document === "undefined") return;
  if (typeof window !== "undefined") {
    const prefersReduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (prefersReduce?.matches) return;
  }
  const count = Math.max(6, Math.min(40, opts?.count ?? 18));
  const spread = opts?.spread ?? 60; // degrees
  const power = opts?.power ?? 9; // px multiplier
  const colors = opts?.colors ?? ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa"];
  const root = document.body ?? document.documentElement;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    const size = 4 + Math.random() * 6;
    const angle = (-spread / 2) + Math.random() * spread;
    const velocity = power * (0.6 + Math.random() * 0.8);
    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad) * velocity * (10 + Math.random() * 20);
    const dy = Math.sin(rad) * velocity * (10 + Math.random() * 20) + 200 + Math.random() * 200;
    const rot = (Math.random() * 720 - 360) + "deg";
    el.style.position = "fixed";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${size}px`;
    el.style.height = `${size * (0.6 + Math.random()*0.8)}px`;
    el.style.background = colors[i % colors.length];
    el.style.borderRadius = Math.random() < 0.3 ? "50%" : "2px";
    el.style.pointerEvents = "none";
    el.style.zIndex = "9999";
    el.style.opacity = "1";
    el.style.transform = "translate(0, 0) rotate(0deg)";
    root.appendChild(el);
    const duration = 900 + Math.random() * 500;
    const supportsWAAPI = typeof (el as HTMLElement).animate === "function";
    const finish = () => { try { el.remove(); } catch {} };
    if (supportsWAAPI) {
      const anim = el.animate(
        [
          { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${rot})`, opacity: 0 }
        ],
        { duration, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }
      );
      anim.onfinish = finish;
      anim.oncancel = finish;
    } else {
      el.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1), opacity ${duration}ms ease-out`;
      requestAnimationFrame(() => {
        el.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot})`;
        el.style.opacity = "0";
      });
      window.setTimeout(finish, duration + 100);
    }
  }
}

type QuizBlockProps = {
  lesson: Lesson;
  onDone: (correctCount: number) => void;
  showSummary?: boolean;
};

export default function QuizBlock({ lesson, onDone, showSummary = true }: QuizBlockProps) {
  const { stats, setStats, refresh } = useProfileStats();
  const recordAnswer = useLernexStore((s) => s.recordAnswer);
  // Normalize questions while keeping hooks unconditional
  const questions = Array.isArray(lesson.questions) ? lesson.questions : [];
  const hasQuestions = questions.length > 0;

  const [qIndex, setQ] = useState(0);
  const [selected, setSel] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [showSummaryOverlay, setShowSummaryOverlay] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(() => Array(questions.length).fill(null));
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);
  const q = hasQuestions ? questions[qIndex] : undefined;
  const needsMathTypeset = useMemo(() => {
    if (!q) return false;
    if (MATH_TRIGGER_RE.test(q.prompt)) return true;
    if (q.choices.some((choice) => MATH_TRIGGER_RE.test(choice))) return true;
    return typeof q.explanation === "string" && MATH_TRIGGER_RE.test(q.explanation);
  }, [q]);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setQ(0);
    setSel(null);
    setCorrectCount(0);
    setShowSummaryOverlay(false);
    setShowWarningModal(false);
    setAnswers(Array(questions.length).fill(null));
    setHasSubmitted(false);
    setShowBreakdown(false);
    setAnimatedScore(0);
  }, [lesson.id, questions.length]);

  // Animate score counter when modal appears
  useEffect(() => {
    if (!showSummaryOverlay) return;
    setAnimatedScore(0);
    const duration = 1500; // 1.5 seconds
    const steps = 60;
    const increment = correctCount / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= correctCount) {
        setAnimatedScore(correctCount);
        clearInterval(timer);
      } else {
        setAnimatedScore(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [showSummaryOverlay, correctCount]);


  const syncStatsFromPayload = useCallback((payload?: Record<string, unknown>) => {
    if (!payload || typeof payload !== "object") return;
    if ("profile" in payload) {
      const profileData = (payload as { profile: unknown }).profile;
      if (profileData && typeof profileData === "object") {
        setStats(normalizeProfileStats(profileData as Record<string, unknown>));
        return;
      }
    }
    const addPtsValue = typeof (payload as { addPts?: unknown }).addPts === "number"
      ? Number((payload as { addPts: number }).addPts)
      : null;
    if (addPtsValue === null) return;
    const newStreakValue = typeof (payload as { newStreak?: unknown }).newStreak === "number"
      ? Number((payload as { newStreak: number }).newStreak)
      : null;
    const fallback = {
      points: (stats?.points ?? 0) + addPtsValue,
      streak: newStreakValue ?? stats?.streak ?? 0,
      last_study_date: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    };
    setStats(normalizeProfileStats(fallback));
  }, [setStats, stats]);

  // KaTeX renders synchronously during component render, so no manual typesetting needed

  const choose = (idx: number, ev?: React.MouseEvent<HTMLButtonElement>) => {
    if (selected !== null) return;
    if (!hasQuestions || !q) return;
    setSel(idx);

    // Save answer in answers array
    const newAnswers = [...answers];
    newAnswers[qIndex] = idx;
    setAnswers(newAnswers);

    const isCorrect = idx === q.correctIndex;
    recordAnswer(lesson.subject, isCorrect);

    // Update correct count - recalculate from all answers to handle answer changes
    const newCorrectCount = newAnswers.reduce<number>((count, answerIdx, i) => {
      if (answerIdx === null) return count;
      return count + (answerIdx === questions[i].correctIndex ? 1 : 0);
    }, 0);
    setCorrectCount(newCorrectCount);

    if (isCorrect) {
      // SFX + confetti near the clicked button
      try {
        const btn = ev?.currentTarget as HTMLElement | undefined;
        const rect = btn?.getBoundingClientRect();
        const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
        confettiBurst(x, y, { count: 18, spread: 80, power: 7 });
      } catch {}
      try { playDing(); } catch {}
    }
    // Ensure formatting stays intact after the immediate UI update when
    // button classes change (avoids transient unformatted state in some
    // browsers during reflow).
    // KaTeX renders synchronously, no manual typesetting needed
  };

  const back = () => {
    if (qIndex > 0) {
      const prevIndex = qIndex - 1;
      setQ(prevIndex);
      setSel(answers[prevIndex]);
    }
  };

  const next = () => {
    if (!hasQuestions) return;
    if (qIndex < questions.length - 1) {
      const nextIndex = qIndex + 1;
      setQ(nextIndex);
      setSel(answers[nextIndex]);
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    // Check for unanswered questions
    const unansweredCount = answers.filter(a => a === null).length;
    if (unansweredCount > 0) {
      setShowWarningModal(true);
      return;
    }
    finishQuiz();
  };

  const finishQuiz = () => {
    // Prevent multiple submissions (point stacking exploit fix)
    if (hasSubmitted) return;
    setHasSubmitted(true);

    // Calculate points based on difficulty
    const difficultyPoints: Record<string, number> = {
      "intro": 10,
      "easy": 10,
      "medium": 20,
      "hard": 30,
    };
    const pointsPerCorrect = lesson.difficulty ? (difficultyPoints[lesson.difficulty] || 10) : 10;

    const attemptPayload = {
      lesson_id: lesson.id,
      subject: lesson.subject,
      topic: lesson.topic ?? undefined,
      correct_count: correctCount,
      total: questions.length,
      event: "lesson-finish",
      points_per_correct: pointsPerCorrect,
      difficulty: lesson.difficulty,
    };
    void (async () => {
      try {
        const res = await fetch("/api/attempt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(attemptPayload),
        });
        const payload = (await res.json().catch(() => ({}))) as Record<string, unknown> | undefined;
        if (!res.ok) {
          console.warn("[quiz-block] attempt failed", { status: res.status, payload });
          return;
        }
        syncStatsFromPayload(payload);
        await refresh().catch(() => {});
      } catch (err) {
        console.warn("[quiz-block] attempt request error", err);
      }
    })();
    // Completion effects + summary
    try { playFanfare(); } catch {}
    try { confettiBurst(window.innerWidth / 2, window.innerHeight * 0.25, { count: 80, spread: 120, power: 12 }); } catch {}
    if (showSummary) setShowSummaryOverlay(true);
    onDone(correctCount);
  };

  // Keyboard shortcuts for quiz navigation
  useEffect(() => {
    if (!q) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Answer selection with number keys (1-4)
      if (e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key) - 1;
        if (q && idx < q.choices.length && selected === null) {
          e.preventDefault();
          choose(idx);
        }
      }

      // Next question with Enter or 'n' key
      if ((e.key === 'Enter' || e.key === 'n') && selected !== null) {
        e.preventDefault();
        next();
      }

      // Previous question with 'b' key
      if (e.key === 'b' && qIndex > 0) {
        e.preventDefault();
        back();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [qIndex, selected, q, choose, next, back]);

  const btnClass = (idx: number) => {
    const base = "text-left px-3 py-2 rounded-xl border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40";
    if (selected === null) {
      return `${base} border-slate-300/70 bg-gradient-to-br from-slate-50 to-slate-100/50 hover:from-white hover:to-slate-50 hover:border-lernex-blue/40 hover:shadow-md hover:shadow-lernex-blue/10 hover:-translate-y-0.5 active:translate-y-0 dark:from-slate-800/40 dark:to-slate-900/30 dark:border-surface dark:hover:from-slate-700/40 dark:hover:to-slate-800/30 dark:hover:border-lernex-blue/40`;
    }
    const correctIdx = q?.correctIndex ?? -1;
    if (idx === correctIdx) {
      return `${base} border-green-500/70 bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md shadow-green-500/25 hover:shadow-lg hover:shadow-green-500/35 dark:from-green-600 dark:to-green-700 dark:shadow-green-500/30 dark:hover:shadow-green-500/40`;
    }
    if (idx === selected) {
      return `${base} border-red-500/70 bg-gradient-to-r from-red-500 to-red-600 text-white shadow-md shadow-red-500/25 hover:shadow-lg hover:shadow-red-500/35 dark:from-red-600 dark:to-red-700 dark:shadow-red-500/30 dark:hover:shadow-red-500/40`;
    }
    return `${base} border-slate-200/60 bg-gradient-to-br from-slate-50/60 to-slate-100/30 dark:from-slate-800/30 dark:to-slate-900/20 dark:border-surface`;
  };

  return hasQuestions && q ? (
    <>
      <div ref={rootRef} className="rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/30 to-white px-5 py-6 shadow-elevated shadow-slate-900/5 backdrop-blur ring-1 ring-slate-900/5 transition-all duration-300 hover:shadow-3xl hover:shadow-lernex-blue/10 hover:border-lernex-blue/30 dark:from-slate-900/50 dark:via-slate-800/20 dark:to-slate-900/50 dark:border-surface dark:shadow-lg dark:shadow-black/20 dark:ring-black/10 dark:hover:shadow-2xl dark:hover:shadow-lernex-purple/15">
        <div className="mb-3 text-sm text-neutral-700 dark:text-neutral-300 transition-colors">
          <FormattedText text={q.prompt} />
        </div>
        <div className="grid gap-2">
          {q.choices.map((choice, idx) => (
            <button key={idx} onClick={(e) => choose(idx, e)} disabled={selected !== null} className={btnClass(idx)}>
              <FormattedText text={choice} />
            </button>
          ))}
        </div>

        {/* Explanation */}
        {selected !== null && q.explanation && (
          <div className="mt-4 text-sm text-neutral-600 dark:text-neutral-300 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 animate-slide-up">
            <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1">Explanation:</div>
            <FormattedText text={q.explanation} />
          </div>
        )}

        {/* Question progress indicators */}
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {questions.map((_, idx) => {
            const isAnswered = answers[idx] !== null;
            const isCorrect = isAnswered && answers[idx] === questions[idx].correctIndex;
            const isIncorrect = isAnswered && answers[idx] !== questions[idx].correctIndex;

            return (
              <div
                key={idx}
                className={`h-2 w-2 rounded-full transition-all ${
                  idx === qIndex
                    ? "bg-lernex-blue scale-125 shadow-sm"
                    : isCorrect
                    ? "bg-green-500 shadow-sm"
                    : isIncorrect
                    ? "bg-red-500 shadow-sm"
                    : "bg-slate-300 shadow-sm dark:bg-neutral-600"
                }`}
                title={`Question ${idx + 1}${isCorrect ? " (correct)" : isIncorrect ? " (incorrect)" : isAnswered ? " (answered)" : ""}`}
              />
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            onClick={back}
            disabled={qIndex === 0}
            className="rounded-xl border border-slate-300/70 bg-gradient-to-br from-slate-50 to-slate-100/50 px-4 py-2 transition-all duration-200 hover:from-white hover:to-slate-50 hover:border-slate-400/80 hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed dark:from-slate-800/40 dark:to-slate-900/30 dark:border-surface dark:hover:from-slate-700/40 dark:hover:to-slate-800/30"
          >
            Back
          </button>
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 transition-colors">
            {qIndex + 1} / {questions.length}
          </div>
          <button onClick={next} className="rounded-xl bg-gradient-to-r from-lernex-blue via-blue-600 to-lernex-purple px-4 py-2 font-medium text-white shadow-md shadow-lernex-blue/25 transition-all duration-300 hover:shadow-lg hover:shadow-lernex-blue/35 hover:-translate-y-0.5 active:translate-y-0 dark:shadow-lernex-blue/30 dark:hover:shadow-lernex-blue/40">
            {qIndex < questions.length - 1 ? "Next" : "Finish"}
          </button>
        </div>
      </div>

      {showSummary && showSummaryOverlay && (() => {
        const percentage = Math.round((correctCount / Math.max(1, questions.length)) * 100);
        const incorrectCount = questions.length - correctCount;
        const isPerfect = percentage === 100;
        const isExcellent = percentage >= 80;
        const isGood = percentage >= 60;
        const isOkay = percentage >= 40;

        // Score-based messaging and styling
        const getMessage = () => {
          if (isPerfect) return "Perfect Score!";
          if (isExcellent) return "Excellent Work!";
          if (isGood) return "Good Job!";
          if (isOkay) return "Nice Try!";
          return "Keep Practicing!";
        };

        const getGradient = () => {
          if (isPerfect) return "from-green-500/20 via-emerald-500/20 to-teal-500/20";
          if (isExcellent) return "from-teal-500/20 via-cyan-500/20 to-sky-500/20";
          if (isGood) return "from-yellow-500/20 via-amber-500/20 to-orange-400/20";
          if (isOkay) return "from-orange-500/20 via-orange-600/20 to-amber-600/20";
          return "from-red-500/20 via-red-600/20 to-rose-600/20";
        };

        const getAccentColor = () => {
          if (isPerfect) return "text-green-500";
          if (isExcellent) return "text-teal-500";
          if (isGood) return "text-yellow-500";
          if (isOkay) return "text-orange-500";
          return "text-red-500";
        };

        const getProgressColor = () => {
          if (isPerfect) return "#10b981"; // green-500
          if (isExcellent) return "#14b8a6"; // teal-500
          if (isGood) return "#eab308"; // yellow-500
          if (isOkay) return "#f97316"; // orange-500
          return "#ef4444"; // red-500
        };

        // Circular progress SVG
        const radius = 70;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percentage / 100) * circumference;

        return (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-xl animate-in fade-in duration-300">
            <div className={`w-full max-w-lg mx-4 rounded-3xl border border-slate-200/90 bg-gradient-to-br ${getGradient()} from-white via-slate-50/30 to-white p-6 text-foreground shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 transition-all animate-in zoom-in-95 duration-500 dark:from-slate-900 dark:via-slate-800/20 dark:to-slate-900 dark:border-neutral-700/80 dark:shadow-black/40 dark:ring-black/10`}>
              {/* Header */}
              <div className="text-center">
                <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-semibold">
                  Lesson Complete
                </div>
                <h3 className={`mt-2 text-3xl font-bold ${getAccentColor()} transition-colors`}>
                  {getMessage()}
                </h3>
              </div>

              {/* Circular Progress Indicator */}
              <div className="relative mt-6 flex items-center justify-center">
                <svg className="transform -rotate-90" width="180" height="180">
                  {/* Background circle */}
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    className="text-neutral-200 dark:text-neutral-700"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    stroke={getProgressColor()}
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                {/* Score in center */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className={`text-5xl font-bold ${getAccentColor()}`}>
                    {animatedScore}
                  </div>
                  <div className="text-sm text-neutral-600 dark:text-neutral-400">
                    out of {questions.length}
                  </div>
                  <div className={`mt-1 text-2xl font-semibold ${getAccentColor()}`}>
                    {percentage}%
                  </div>
                </div>
              </div>

              {/* Stats Summary */}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gradient-to-br from-green-500/12 to-green-600/8 border border-green-500/25 px-4 py-3 text-center shadow-sm shadow-green-500/10 dark:from-green-500/20 dark:to-green-600/15 dark:border-green-500/30 dark:shadow-green-500/15">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{correctCount}</div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">Correct</div>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-red-500/12 to-red-600/8 border border-red-500/25 px-4 py-3 text-center shadow-sm shadow-red-500/10 dark:from-red-500/20 dark:to-red-600/15 dark:border-red-500/30 dark:shadow-red-500/15">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">{incorrectCount}</div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">Incorrect</div>
                </div>
              </div>

              {/* Question Breakdown Toggle */}
              {incorrectCount > 0 && (
                <button
                  onClick={() => setShowBreakdown(!showBreakdown)}
                  className="mt-4 w-full flex items-center justify-between rounded-xl bg-surface-muted hover:bg-surface-card border border-surface px-4 py-3 transition-all"
                >
                  <span className="text-sm font-medium">Question Breakdown</span>
                  <svg
                    className={`h-5 w-5 transition-transform ${showBreakdown ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {/* Question Breakdown List */}
              {showBreakdown && (
                <div className="mt-3 max-h-48 overflow-y-auto rounded-xl bg-surface-muted border border-surface p-3 space-y-2">
                  {questions.map((question, idx) => {
                    const isCorrect = answers[idx] === question.correctIndex;
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                          isCorrect ? "bg-green-500/10" : "bg-red-500/10"
                        }`}
                      >
                        <div className={`flex-shrink-0 ${isCorrect ? "text-green-500" : "text-red-500"}`}>
                          {isCorrect ? (
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 text-sm">
                          <span className="font-medium">Question {idx + 1}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col gap-2">
                {/* Primary: Continue */}
                <button
                  onClick={() => {
                    setShowSummaryOverlay(false);
                    setShowBreakdown(false);
                  }}
                  className="w-full rounded-xl bg-gradient-to-r from-lernex-blue via-blue-600 to-lernex-purple px-4 py-3 text-white font-semibold shadow-lg shadow-lernex-blue/30 transition-all duration-300 hover:shadow-xl hover:shadow-lernex-blue/40 hover:scale-[1.02] active:scale-[0.98] dark:shadow-lernex-blue/40 dark:hover:shadow-lernex-blue/50"
                >
                  Continue
                </button>

                <div className="flex gap-2">
                  {/* Review Mistakes - only show if there are mistakes */}
                  {incorrectCount > 0 && (
                    <button
                      onClick={() => {
                        setShowSummaryOverlay(false);
                        setShowBreakdown(false);
                        // Find first incorrect answer
                        const firstIncorrect = answers.findIndex((ans, idx) => ans !== questions[idx].correctIndex);
                        if (firstIncorrect !== -1) {
                          setQ(firstIncorrect);
                          setSel(answers[firstIncorrect]);
                        }
                      }}
                      className="flex-1 rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-500/12 to-orange-600/8 px-4 py-2.5 text-sm font-medium text-orange-600 shadow-sm shadow-orange-500/10 transition-all duration-200 hover:from-orange-500/20 hover:to-orange-600/15 hover:shadow-md hover:shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] dark:from-orange-500/20 dark:to-orange-600/15 dark:text-orange-400 dark:shadow-orange-500/15 dark:hover:shadow-orange-500/25"
                    >
                      Review Mistakes
                    </button>
                  )}

                  {/* Retry Quiz */}
                  <button
                    onClick={() => {
                      setShowSummaryOverlay(false);
                      setShowBreakdown(false);
                      setQ(0);
                      setSel(null);
                      setCorrectCount(0);
                      setAnswers(Array(questions.length).fill(null));
                      setHasSubmitted(false);
                    }}
                    className="flex-1 rounded-xl border border-slate-300/70 bg-gradient-to-br from-slate-50 to-slate-100/50 px-4 py-2.5 text-sm font-medium shadow-sm transition-all duration-200 hover:from-white hover:to-slate-50 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] dark:from-slate-800/40 dark:to-slate-900/30 dark:border-surface dark:hover:from-slate-700/40 dark:hover:to-slate-800/30"
                  >
                    Retry Quiz
                  </button>
                </div>
              </div>

              {/* Perfect score confetti indicator */}
              {isPerfect && (
                <div className="mt-4 text-center">
                  <div className="inline-flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <span>🎉</span>
                    <span className="font-medium">You&apos;re on fire!</span>
                    <span>🎉</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Warning modal for unanswered questions */}
      {showWarningModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-xl">
          <div className="w-full max-w-md rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/30 to-white p-6 text-foreground shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 transition-all dark:from-slate-900 dark:via-slate-800/20 dark:to-slate-900 dark:border-neutral-700/80 dark:shadow-black/40 dark:ring-black/10">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 rounded-full bg-yellow-500/20 p-2">
                <svg className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">Unanswered Questions</h3>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  You have {answers.filter(a => a === null).length} unanswered question{answers.filter(a => a === null).length > 1 ? 's' : ''}.
                  Would you like to go back and answer them, or finish anyway?
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => setShowWarningModal(false)}
                    className="flex-1 rounded-xl border border-slate-300/70 bg-gradient-to-br from-slate-50 to-slate-100/50 px-4 py-2.5 text-sm font-medium shadow-sm transition-all duration-200 hover:from-white hover:to-slate-50 hover:shadow-md dark:from-slate-800/40 dark:to-slate-900/30 dark:border-surface dark:hover:from-slate-700/40 dark:hover:to-slate-800/30"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={() => {
                      setShowWarningModal(false);
                      finishQuiz();
                    }}
                    className="flex-1 rounded-xl bg-gradient-to-r from-lernex-blue via-blue-600 to-lernex-purple px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-lernex-blue/25 transition-all duration-300 hover:shadow-lg hover:shadow-lernex-blue/35 dark:shadow-lernex-blue/30 dark:hover:shadow-lernex-blue/40"
                  >
                    Finish Anyway
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  ) : null;
}
