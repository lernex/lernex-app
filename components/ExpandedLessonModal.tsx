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
        "bg-black/60 backdrop-blur-md p-4",
        "animate-in fade-in duration-300"
      )}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className={cn(
          "relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl",
          "border border-neutral-200/70 dark:border-neutral-700/70",
          "bg-gradient-to-br from-white via-neutral-50/95 to-white",
          "dark:from-neutral-900 dark:via-neutral-900/95 dark:to-neutral-900",
          "shadow-[0_24px_60px_-12px_rgba(0,0,0,0.4)]",
          "transition-all duration-500",
          "animate-in slide-in-from-bottom-8 zoom-in-95 duration-400"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient overlay for visual appeal */}
        <div className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-30 bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.15),transparent_50%),radial-gradient(circle_at_80%_85%,rgba(168,85,247,0.12),transparent_45%)]" />

        {/* Header */}
        <div className="relative z-10 flex items-start justify-between border-b border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm px-6 py-5">
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
                <span className="ml-auto rounded-full border border-neutral-300 dark:border-neutral-600 px-2 py-0.5 text-[10px] font-semibold capitalize text-neutral-600 dark:text-neutral-300">
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
              "border border-neutral-300 dark:border-neutral-600",
              "bg-white/80 dark:bg-neutral-800/80",
              "text-neutral-600 dark:text-neutral-300",
              "transition-all duration-200",
              "hover:bg-neutral-100 dark:hover:bg-neutral-700",
              "hover:border-neutral-400 dark:hover:border-neutral-500",
              "hover:scale-105 hover:shadow-md",
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
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white via-white/60 to-transparent dark:from-neutral-900 dark:via-neutral-900/60" />
      </div>
    </div>
  );
}
