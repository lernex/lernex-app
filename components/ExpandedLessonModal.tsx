"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import FormattedText from "./FormattedText";

type ExpandedLessonModalProps = {
  isOpen: boolean;
  onClose: () => void;
  lesson: {
    subject: string;
    title: string;
    content: string;
    topic?: string;
    difficulty?: "intro" | "easy" | "medium" | "hard";
  };
};

const MATH_TRIGGER_RE = /(\$|\\\(|\\\[|\\begin|√|⟨|_\{|\\\^)/;

function cn(...classes: Array<string | null | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export default function ExpandedLessonModal({
  isOpen,
  onClose,
  lesson,
}: ExpandedLessonModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Typeset math when content changes or modal opens
  useEffect(() => {
    if (!isOpen) return;
    const shouldTypeset =
      typeof lesson.content === "string" && MATH_TRIGGER_RE.test(lesson.content);
    if (!shouldTypeset) return;

    const el = contentRef.current;
    if (!el) return;

    // Double requestAnimationFrame to ensure layout is committed
    const handle1 = window.requestAnimationFrame(() => {
      const handle2 = window.requestAnimationFrame(() => {
        window.MathJax?.typesetPromise?.([el]).catch(() => {});
      });
      return () => window.cancelAnimationFrame(handle2);
    });

    return () => window.cancelAnimationFrame(handle1);
  }, [isOpen, lesson.content]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-black/70 backdrop-blur-xl p-4",
        "animate-in fade-in duration-300"
      )}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className={cn(
          "relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl",
          "border border-slate-200/90 dark:border-neutral-700/80",
          "bg-gradient-to-br from-white via-slate-50/30 to-white",
          "dark:from-slate-900 dark:via-slate-800/20 dark:to-slate-900",
          "shadow-3xl ring-1 ring-slate-900/5 dark:ring-black/10",
          "shadow-slate-900/20 dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.5)]",
          "transition-all duration-500",
          "animate-in slide-in-from-bottom-8 zoom-in-95 duration-400"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient overlay for visual appeal */}
        <div className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-40 bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.2),transparent_48%),radial-gradient(circle_at_80%_85%,rgba(168,85,247,0.16),transparent_42%),radial-gradient(circle_at_50%_50%,rgba(236,72,153,0.08),transparent_60%)]" />

        {/* Header */}
        <div className="relative z-10 flex items-start justify-between border-b border-slate-200/80 dark:border-neutral-700/80 bg-gradient-to-r from-white/90 via-slate-50/60 to-white/90 dark:from-slate-900/90 dark:via-slate-800/60 dark:to-slate-900/90 backdrop-blur-xl shadow-sm px-6 py-5">
          <div className="flex-1 pr-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400 mb-2">
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                {lesson.subject}
              </span>
              {lesson.topic && (
                <span className="text-neutral-400 dark:text-neutral-500">
                  / {lesson.topic}
                </span>
              )}
              {lesson.difficulty && (
                <span className="ml-auto rounded-full border border-slate-300/80 bg-gradient-to-r from-slate-100 to-slate-200/60 dark:border-neutral-600 dark:from-neutral-700/50 dark:to-neutral-800/40 px-2 py-0.5 text-[10px] font-semibold capitalize text-neutral-600 dark:text-neutral-300 shadow-sm shadow-slate-900/10 dark:shadow-none">
                  {lesson.difficulty}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-semibold leading-snug text-neutral-900 dark:text-white">
              {lesson.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              "border border-slate-300/80 dark:border-neutral-600",
              "bg-gradient-to-br from-white to-slate-100/50 dark:from-neutral-800/80 dark:to-neutral-900/60",
              "text-neutral-600 dark:text-neutral-300",
              "transition-all duration-300",
              "hover:bg-gradient-to-br hover:from-red-50 hover:to-red-100/50 dark:hover:from-red-900/20 dark:hover:to-red-800/10",
              "hover:border-red-400/60 dark:hover:border-red-500/40",
              "hover:text-red-600 dark:hover:text-red-400",
              "hover:scale-105 hover:shadow-md hover:shadow-red-500/20",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40"
            )}
            aria-label="Close expanded view"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          className={cn(
            "formatted-lesson-content relative z-10 overflow-y-auto px-6 py-6 md:px-8 md:py-8",
            "text-base leading-relaxed text-neutral-700 dark:text-neutral-300",
            "max-h-[calc(90vh-140px)]",
            "scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600",
            "scrollbar-track-transparent"
          )}
        >
          <FormattedText text={lesson.content} />
        </div>

        {/* Footer gradient to indicate end of content */}
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white via-white/70 to-transparent dark:from-slate-900 dark:via-slate-900/70" />
      </div>
    </div>
  );
}
