"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLernexStore } from "@/lib/store";

type ProgressState = {
  subject: string;
  total: number;
  completed: number;
  percent: number;
  topicIndex: number;
  topicCount: number;
  subtopicIndex: number;
  subtopicCount: number;
  topicName: string | null;
  subtopicName: string | null;
  currentLabel: string | null;
  nextLabel: string | null;
  miniLessonsDelivered: number;
  miniLessonsPlanned: number;
  topicPercent: number;
  topicCompleted: number;
};

const gradientBg =
  "before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top,var(--tw-gradient-stops))] before:from-white/25 before:via-white/10 before:to-transparent before:opacity-80 before:mix-blend-screen";

export default function FypProgress() {
  const { selectedSubjects } = useLernexStore();
  const [state, setState] = useState<ProgressState | null>(null);
  const [loading, setLoading] = useState(false);
  const subject = useMemo(() => (selectedSubjects.length === 1 ? selectedSubjects[0]! : null), [selectedSubjects]);

  useEffect(() => {
    let alive = true;
    if (!subject) {
      setState(null);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/fyp/progress?subject=${encodeURIComponent(subject)}`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (r.ok) setState(j as ProgressState);
        else setState(null);
      } catch {
        if (alive) setState(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [subject]);

  if (!subject) return null;

  const pct = Math.max(0, Math.min(100, Math.round(state?.percent ?? 0)));
  const topicPercent = Math.max(0, Math.min(100, Math.round(state?.topicPercent ?? 0)));
  const miniPct =
    state && state.miniLessonsPlanned > 0
      ? Math.max(0, Math.min(100, Math.round((state.miniLessonsDelivered / state.miniLessonsPlanned) * 100)))
      : 0;
  const topicLabel = state?.topicName ?? "Learning path";
  const subtopicLabel = state?.subtopicName ?? "Keep exploring to unlock your next mini-lesson.";
  const nextLabel = state?.nextLabel ?? null;
  const progressCopy =
    state && state.total > 0 ? `${state.completed}/${state.total} subtopics` : "Progress updates as you learn";
  const topicDetail = state?.topicCount
    ? state.subtopicCount > 0
      ? `${Math.min(state.topicCompleted, state.subtopicCount)}/${state.subtopicCount} subtopics complete`
      : "This unit unlocks soon."
    : "We'll chart this once you start.";
  const miniDetail = state
    ? `${Math.min(state.miniLessonsDelivered, state.miniLessonsPlanned)}/${state.miniLessonsPlanned} mini-lessons`
    : "Jump into a lesson to begin.";

  return (
    <div className="px-4 pb-3">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={`relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-lernex-blue via-lernex-purple to-pink-500 text-white shadow-xl dark:border-white/10 dark:shadow-[0_40px_120px_-80px_rgba(80,144,255,0.9)] ${gradientBg}`}
      >
        <div className="pointer-events-none absolute -left-24 top-[-80px] h-48 w-48 rounded-full bg-white/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-[-60px] h-52 w-52 rounded-full bg-white/10 blur-3xl" />

        <div className="relative p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-[70%] space-y-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/80 backdrop-blur">
                {subject}
              </span>
              <div>
                <h3 className="text-lg font-semibold leading-tight sm:text-xl">{topicLabel}</h3>
                <p className="mt-1 text-sm text-white/80">{subtopicLabel}</p>
              </div>
              {nextLabel && (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  Next up: {nextLabel}
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 text-right">
              <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-white/70 backdrop-blur">
                <div className="font-medium uppercase tracking-[0.3em] text-white/60">Unit</div>
                <div className="mt-1 text-lg font-semibold">
                  {state?.topicCount ? `${state.topicIndex}/${state.topicCount}` : "--"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 backdrop-blur">
                <div className="font-medium uppercase tracking-[0.3em] text-white/60">Lesson</div>
                <div className="mt-1 text-base font-semibold">
                  {state?.subtopicCount ? `${state.subtopicIndex}/${state.subtopicCount}` : "--"}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ProgressMeter
              label="Level map progress"
              percent={pct}
              detail={progressCopy}
              loading={loading}
            />
            <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
              <ProgressMeter
                label="Unit completion"
                percent={topicPercent}
                detail={topicDetail}
                loading={loading}
                subtle
              />
              <ProgressMeter
                label="Mini-lesson streak"
                percent={miniPct}
                detail={miniDetail}
                loading={loading}
                subtle
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

type ProgressMeterProps = {
  label: string;
  percent: number;
  detail: string;
  loading?: boolean;
  subtle?: boolean;
};

function ProgressMeter({ label, percent, detail, loading = false, subtle = false }: ProgressMeterProps) {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const background = subtle ? "bg-white/15" : "bg-white/20";
  const barGradient = subtle
    ? "from-white/70 via-white/80 to-white"
    : "from-[#E8F1FF] via-white/90 to-white";

  return (
    <div className={`flex h-full flex-col justify-between gap-3 rounded-xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur`}>
      <div className="flex items-center justify-between gap-2 text-xs text-white/80">
        <span className="font-medium uppercase tracking-[0.25em]">{label}</span>
        <span className="text-sm font-semibold text-white">{normalized}%</span>
      </div>
      <div className={`h-2 w-full overflow-hidden rounded-full ${background}`}>
        <motion.div
          initial={{ width: "0%" }}
          animate={{ width: `${normalized}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full bg-gradient-to-r ${barGradient}`}
        />
      </div>
      <div className="text-[11px] text-white/70">
        {loading ? "Updating..." : detail}
      </div>
    </div>
  );
}
