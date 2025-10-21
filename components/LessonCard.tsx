﻿"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Lesson } from "@/types";
import FormattedText from "./FormattedText";
import ExpandedLessonModal from "./ExpandedLessonModal";

type LessonCardProps = {
  lesson: Lesson;
  className?: string;
};

const MATH_TRIGGER_RE = /(\$|\\\(|\\\[|\\begin|âˆš|âŸ¨|_\{|\\\^)/;

export default function LessonCard({ lesson, className }: LessonCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [showFade, setShowFade] = useState(false);
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const contextEntries = useMemo(() => {
    const ctx = lesson.context;
    if (!ctx || typeof ctx !== "object") return [];
    const ctxObj = ctx as Record<string, unknown>;
    const entries: { label: string; value: string }[] = [];
    const pushString = (label: string, value: unknown) => {
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed) return;
      entries.push({ label, value: trimmed });
    };

    pushString("Focus", ctxObj.focus);
    pushString("Pace", ctxObj.pace);
    pushString("Mini-lesson", ctxObj.miniLesson);
    if (typeof ctxObj.completionPct === "number" && Number.isFinite(ctxObj.completionPct)) {
      entries.push({ label: "Course progress", value: `${Math.round(ctxObj.completionPct)}% complete` });
    }
    pushString("Accuracy", ctxObj.accuracyBand);
    pushString("Recent miss", ctxObj.recentMiss);
    pushString("Last lesson", ctxObj.previousLesson);
    const likedHighlights = Array.isArray(ctxObj.likedHighlights)
      ? (ctxObj.likedHighlights as unknown[])
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .slice(0, 2)
          .join(", ")
      : "";
    if (likedHighlights) entries.push({ label: "You liked", value: likedHighlights });
    const savedHighlights = Array.isArray(ctxObj.savedHighlights)
      ? (ctxObj.savedHighlights as unknown[])
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .slice(0, 2)
          .join(", ")
      : "";
    if (savedHighlights) entries.push({ label: "You saved", value: savedHighlights });
    const toneHints = Array.isArray(ctxObj.toneHints)
      ? (ctxObj.toneHints as unknown[])
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .slice(0, 2)
          .join(", ")
      : "";
    if (toneHints) entries.push({ label: "Tone match", value: toneHints });

    return entries.slice(0, 5);
  }, [lesson.context]);

  const knowledgeDetails = useMemo(() => {
    const knowledge = lesson.knowledge;
    if (!knowledge || typeof knowledge !== "object") return null;
    const definition =
      typeof knowledge.definition === "string" && knowledge.definition.trim()
        ? knowledge.definition.trim()
        : null;
    const applications = Array.isArray(knowledge.applications)
      ? knowledge.applications
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .slice(0, 3)
      : [];
    const prerequisites = Array.isArray(knowledge.prerequisites)
      ? knowledge.prerequisites
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .slice(0, 4)
      : [];
    const reminders = Array.isArray(knowledge.reminders)
      ? knowledge.reminders
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .slice(0, 3)
      : [];
    if (!definition && applications.length === 0 && prerequisites.length === 0 && reminders.length === 0) {
      return null;
    }
    return { definition, applications, prerequisites, reminders };
  }, [lesson.knowledge]);
  const shouldTypesetLesson = useMemo(() => {
    const contentHasMath = typeof lesson.content === "string" && MATH_TRIGGER_RE.test(lesson.content);
    const titleHasMath = typeof lesson.title === "string" && MATH_TRIGGER_RE.test(lesson.title);
    return contentHasMath || titleHasMath;
  }, [lesson.content, lesson.title]);

  // Mount guard: Once the lesson content is in the DOM, run a local
  // MathJax typeset against just this card to ensure stable formatting after
  // the preview -> card swap.
  useEffect(() => {
    if (!shouldTypesetLesson) return;
    const el = cardRef.current;
    if (!el) return;
    const handle = window.requestAnimationFrame(() => {
      window.MathJax?.typesetPromise?.([el]).catch(() => {});
    });
    return () => window.cancelAnimationFrame(handle);
  }, [lesson.id, lesson.content, shouldTypesetLesson]);

  const computeFade = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const { scrollTop, scrollHeight, clientHeight } = node;
    const overflow = scrollHeight - clientHeight;
    const shouldFade = overflow > 4;
    if (!shouldFade) {
      setShowFade(false);
      return;
    }
    const atBottom = scrollTop + clientHeight >= scrollHeight - 6;
    setShowFade(!atBottom);
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = 0;

    let rafId = window.requestAnimationFrame(computeFade);
    const schedule = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(computeFade);
    };

    node.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(() => schedule());
      ro.observe(node);
    } else {
      schedule();
    }

    return () => {
      node.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (ro) ro.disconnect();
      window.cancelAnimationFrame(rafId);
    };
  }, [lesson.id, lesson.content, computeFade]);

  const sendFeedback = async (
    action: "like" | "dislike" | "save" | "report",
    extras: { reason?: string } = {},
  ) => {
    try {
      const payload: Record<string, unknown> = {
        subject: lesson.subject,
        lesson_id: lesson.id,
        action,
      };
      if (extras.reason) payload.reason = extras.reason;
      const res = await fetch("/api/fyp/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn("[lesson-card] feedback failed", { action, status: res.status });
        return false;
      }
      return true;
    } catch (error) {
      console.warn("[lesson-card] feedback request error", error);
      return false;
    }
  };

  const baseClass =
    "relative flex flex-col overflow-hidden rounded-[28px] border border-surface bg-surface-card shadow-xl ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-2xl backdrop-blur-xl";
  const rootClass = className ? baseClass + " " + className : baseClass;

  const actionBase =
    "px-3 py-1.5 rounded-full border transition-colors transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40";

  const helpfulClass = [
    actionBase,
    liked
      ? "border-green-500/70 bg-green-500/15 text-green-700 shadow-sm dark:text-green-200"
      : "border-surface bg-surface-muted text-neutral-600 hover:bg-surface-card dark:text-neutral-300",
  ].join(" ");

  const saveClass = [
    actionBase,
    saved
      ? "border-amber-400/70 bg-amber-400/15 text-amber-700 shadow-sm dark:text-amber-200"
      : "border-surface bg-surface-muted text-neutral-600 hover:bg-surface-card dark:text-neutral-300",
  ].join(" ");

  const dislikeClass = [
    "ml-auto",
    actionBase,
    disliked
      ? "border-red-500/70 bg-red-500/15 text-red-700 shadow-sm dark:text-red-200"
      : "border-surface bg-surface-muted text-neutral-600 hover:bg-surface-card dark:text-neutral-300",
  ].join(" ");

  const reportClass = [
    actionBase,
    reported
      ? "border-amber-500/70 bg-amber-400/15 text-amber-700 shadow-sm dark:text-amber-200"
      : "border-surface bg-surface-muted text-neutral-600 hover:bg-surface-card dark:text-neutral-300",
  ].join(" ");

  return (
    <>
      <ExpandedLessonModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        lesson={{
          subject: lesson.subject,
          title: lesson.title,
          content: lesson.content,
          topic: lesson.topic,
          difficulty: lesson.difficulty,
        }}
      />
      <div ref={cardRef} className={rootClass}>
      <div className="pointer-events-none absolute inset-0 opacity-80 dark:opacity-40 bg-[radial-gradient(circle_at_12%_18%,rgba(59,130,246,0.2),transparent_55%),radial-gradient(circle_at_82%_78%,rgba(168,85,247,0.18),transparent_48%),radial-gradient(circle_at_50%_-5%,rgba(236,72,153,0.08),transparent_60%)]" />
      <div className="relative flex min-h-0 flex-1 flex-col gap-4 px-5 py-6 sm:px-6 md:py-7">
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
          <span className="font-medium text-neutral-600 dark:text-neutral-200">{lesson.subject}</span>
          {lesson.topic && (
            <span className="text-neutral-400 dark:text-neutral-500">/ {lesson.topic}</span>
          )}
          {lesson.difficulty && (
            <span className="ml-auto rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] font-semibold capitalize text-neutral-600 dark:border-neutral-600 dark:text-neutral-200">
              {lesson.difficulty}
            </span>
          )}
        </div>
        <h2 className="mt-2 text-xl font-semibold leading-snug text-neutral-900 dark:text-white">{lesson.title}</h2>
        {lesson.nextTopicHint && (
          <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{lesson.nextTopicHint}</div>
        )}
        {contextEntries.length > 0 && (
          <div className="mt-3 rounded-2xl border border-neutral-200 bg-white/70 px-4 py-3 text-[12px] leading-relaxed text-neutral-600 shadow-sm dark:border-neutral-700 dark:bg-white/5 dark:text-neutral-300">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
              Why you&apos;re seeing this
            </div>
            <ul className="mt-2 space-y-1">
              {contextEntries.map((entry) => (
                <li key={`${entry.label}-${entry.value}`} className="flex gap-1">
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">{entry.label}:</span>
                  <span>{entry.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {knowledgeDetails && (
          <div className="mt-3 rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 text-sm text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-white/10 dark:text-neutral-200">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
              Anchors
            </div>
            {knowledgeDetails.definition && (
              <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-200">{knowledgeDetails.definition}</p>
            )}
            {knowledgeDetails.applications.length > 0 && (
              <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="font-semibold text-neutral-600 dark:text-neutral-200">Applications:</span>{" "}
                {knowledgeDetails.applications.join(" | ")}
              </div>
            )}
            {knowledgeDetails.prerequisites.length > 0 && (
              <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="font-semibold text-neutral-600 dark:text-neutral-200">Prerequisites:</span>{" "}
                {knowledgeDetails.prerequisites.join(" | ")}
              </div>
            )}
            {knowledgeDetails.reminders.length > 0 && (
              <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="font-semibold text-neutral-600 dark:text-neutral-200">Watch for:</span>{" "}
                {knowledgeDetails.reminders.join(" | ")}
              </div>
            )}
          </div>
        )}
        <div className="relative mt-3 flex min-h-0 flex-1 flex-col pb-2 sm:pb-3">
          <div
            ref={scrollRef}
            className="lesson-scroll scrollbar-thin flex-1 overflow-y-auto pr-3 pb-8 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 md:pr-4"
          >
            <FormattedText text={lesson.content} />
          </div>
          {showFade && (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white via-white/75 to-transparent dark:from-neutral-900 dark:via-neutral-900/70" />
              <div className="absolute bottom-3 right-4 flex items-center gap-2">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 rounded-full bg-lernex-blue/90 hover:bg-lernex-blue px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40"
                  aria-label="Expand lesson to full screen"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Expand</span>
                </button>
                <div className="pointer-events-none flex items-center gap-2 rounded-full bg-neutral-900/75 px-3 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm dark:bg-neutral-800/85">
                  <span>Scroll to read</span>
                  <span aria-hidden="true" className="text-base leading-none">
                    ↓
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => {
              const prevLiked = liked;
              const prevDisliked = disliked;
              setLiked(true);
              setDisliked(false);
              void sendFeedback("like").then((ok) => {
                if (!ok) {
                  setLiked(prevLiked);
                  setDisliked(prevDisliked);
                }
              });
            }}
            className={helpfulClass}
            aria-label="Mark lesson as helpful"
          >
            Helpful
          </button>
          <button
            onClick={() => {
              const prevSaved = saved;
              const nextSaved = !prevSaved;
              setSaved(nextSaved);
              void sendFeedback("save").then((ok) => {
                if (!ok) setSaved(prevSaved);
              });
            }}
            className={saveClass}
            aria-label="Save lesson"
          >
            {saved ? "Saved" : "Save"}
          </button>
          <button
            onClick={() => {
              const prevLiked = liked;
              const prevDisliked = disliked;
              setDisliked(true);
              setLiked(false);
              void sendFeedback("dislike").then((ok) => {
                if (!ok) {
                  setDisliked(prevDisliked);
                  setLiked(prevLiked);
                }
              });
            }}
            className={dislikeClass}
            aria-label="Not helpful"
          >
            Not helpful
          </button>
          <button
            onClick={() => {
              if (reporting || reported) return;
              const note = window.prompt("Let us know what's inaccurate or confusing:", "");
              if (note === null) return;
              const trimmed = note.trim();
              setReporting(true);
              void sendFeedback("report", { reason: trimmed ? trimmed : undefined }).then((ok) => {
                if (!ok) {
                  setReporting(false);
                  return;
                }
                setReported(true);
                setReporting(false);
              });
            }}
            className={reportClass}
            aria-label="Report inaccuracy"
            disabled={reporting || reported}
          >
            {reporting ? "Reporting..." : reported ? "Reported" : "Report issue"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}


