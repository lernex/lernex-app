"use client";
import { useEffect, useRef, useState } from "react";
import { Lesson } from "@/types";
import { useLernexStore } from "@/lib/store";
import FormattedText from "./FormattedText";

// Lightweight SFX helpers (WebAudio)
let audioCtx: AudioContext | null = null;
function getAudio() {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctor = ((window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) ?? window.AudioContext;
      audioCtx = Ctor ? new Ctor() : null;
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
  const count = opts?.count ?? 24;
  const spread = opts?.spread ?? 60; // degrees
  const power = opts?.power ?? 9; // px multiplier
  const colors = opts?.colors ?? ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa"];

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
    document.body.appendChild(el);
    const anim = el.animate([
      { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot})`, opacity: 0 }
    ], { duration: 900 + Math.random() * 500, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    anim.onfinish = () => { try { el.remove(); } catch {} };
  }
}

type QuizBlockProps = {
  lesson: Lesson;
  onDone: (correctCount: number) => void;
  showSummary?: boolean;
};

export default function QuizBlock({ lesson, onDone, showSummary = true }: QuizBlockProps) {
  const addPoints = useLernexStore((s) => s.addPoints);
  const bumpStreak = useLernexStore((s) => s.bumpStreakIfNewDay);
  const recordAnswer = useLernexStore((s) => s.recordAnswer);
  // Normalize questions while keeping hooks unconditional
  const questions = Array.isArray(lesson.questions) ? lesson.questions : [];
  const hasQuestions = questions.length > 0;

  const [qIndex, setQ] = useState(0);
  const [selected, setSel] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [showSummaryOverlay, setShowSummaryOverlay] = useState(false);
  const q = hasQuestions ? questions[qIndex] : undefined;
  const rootRef = useRef<HTMLDivElement>(null);

  // Ensure MathJax formats newly shown questions immediately after index
  // changes. This complements the per-element fallback in FormattedText and
  // helps when the entire question block swaps at once.
  useEffect(() => {
    const el = rootRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.MathJax?.typesetPromise?.(el ? [el] : undefined).catch(() => {});
      });
    });
  }, [qIndex]);

  const choose = (idx: number, ev?: React.MouseEvent<HTMLButtonElement>) => {
    if (selected !== null) return;
    if (!hasQuestions || !q) return;
    setSel(idx);
    const isCorrect = idx === q.correctIndex;
    recordAnswer(lesson.subject, isCorrect);
    bumpStreak();
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      addPoints(10);
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = rootRef.current;
        window.MathJax?.typesetPromise?.(el ? [el] : undefined).catch(() => {});
      });
    });
  };

  const next = () => {
    if (!hasQuestions) return;
    if (qIndex < questions.length - 1) {
      setQ(qIndex + 1);
      setSel(null);
    } else {
      try {
        fetch("/api/attempt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lesson_id: lesson.id,
            subject: lesson.subject,
            topic: lesson.topic ?? undefined,
            correct_count: correctCount,
            total: questions.length,
          }),
        }).catch(() => {});
      } catch {}
      // Completion effects + summary
      try { playFanfare(); } catch {}
      try { confettiBurst(window.innerWidth / 2, window.innerHeight * 0.25, { count: 80, spread: 120, power: 12 }); } catch {}
      if (showSummary) setShowSummaryOverlay(true);
      onDone(correctCount);
    }
  };

  const btnClass = (idx: number) =>
    `text-left px-3 py-2 rounded-xl border transition ${
      selected === null
        ? "bg-neutral-100 border-neutral-200 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:hover:bg-neutral-700"
        : idx === (q?.correctIndex ?? -1)
        ? "bg-green-600/80 border-green-500"
        : idx === selected
        ? "bg-red-600/80 border-red-500"
        : "bg-neutral-100/60 border-neutral-200/60 dark:bg-neutral-800/60 dark:border-neutral-700/60"
    }`;

  return hasQuestions && q ? (
    <>
      <div ref={rootRef} className="rounded-[24px] border border-neutral-200/70 bg-white/85 px-5 py-6 shadow-lg backdrop-blur transition-shadow duration-200 dark:border-neutral-800/70 dark:bg-neutral-900/80">
        <div className="mb-3 text-sm text-neutral-700 dark:text-neutral-300">
          <FormattedText text={q.prompt} />
        </div>
        <div className="grid gap-2">
          {q.choices.map((choice, idx) => (
            <button key={idx} onClick={(e) => choose(idx, e)} disabled={selected !== null} className={btnClass(idx)}>
              <FormattedText text={choice} />
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Question {qIndex + 1} / {questions.length}
          </div>
          <button onClick={next} className="px-4 py-2 rounded-xl bg-lernex-blue hover:bg-blue-500 transition">
            {qIndex < questions.length - 1 ? "Next" : "Finish"}
          </button>
        </div>
      </div>

      {showSummary && showSummaryOverlay && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 dark:text-white">
            <div className="text-sm uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Lesson Complete</div>
            <h3 className="mt-1 text-xl font-semibold">Great job!</h3>
            <div className="mt-3 text-sm">
              You answered <span className="font-semibold">{correctCount}</span> out of <span className="font-semibold">{questions.length}</span> correctly
              ({Math.round((correctCount / Math.max(1, questions.length)) * 100)}%).
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => { setShowSummaryOverlay(false); }}
                className="px-4 py-2 rounded-xl border border-neutral-300 bg-neutral-100 hover:bg-neutral-200 transition dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              >
                Close
              </button>
              <button
                onClick={() => { setShowSummaryOverlay(false); setQ(0); setSel(null); setCorrectCount(0); }}
                className="ml-auto px-4 py-2 rounded-xl bg-lernex-blue hover:bg-blue-500 transition"
              >
                Retry Quiz
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  ) : null;
}
