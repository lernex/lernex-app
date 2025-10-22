"use client";
import { useEffect, useRef, useState } from "react";
import { X, AlertCircle, Send, Sparkles } from "lucide-react";

type ReportIssueModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean>;
  isSubmitting: boolean;
};

export default function ReportIssueModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
}: ReportIssueModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setError("");
      setIsClosing(false);
      // Focus the textarea when modal opens
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();

    if (trimmed.length < 3) {
      setError("Please provide a bit more detail (at least 3 characters)");
      return;
    }

    if (trimmed.length > 300) {
      setError("Please keep your feedback under 300 characters");
      return;
    }

    const success = await onSubmit(trimmed);
    if (success) {
      handleClose();
    } else {
      setError("Failed to submit. Please try again.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !isSubmitting) {
      handleClose();
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e);
    }
  };

  if (!isOpen) return null;

  const characterCount = reason.length;
  const isOverLimit = characterCount > 300;
  const isNearLimit = characterCount > 250;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={!isSubmitting ? handleClose : undefined}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md transform transition-all duration-300 ${
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
          {/* Gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(239,68,68,0.12),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.1),transparent_50%)]" />

          {/* Header */}
          <div className="relative border-b border-neutral-200 px-6 py-5 dark:border-neutral-700">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-orange-500 shadow-lg">
                <AlertCircle className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                  Report an Issue
                </h2>
                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                  Help us improve this lesson
                </p>
              </div>
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="group rounded-full p-2 text-neutral-400 transition-all hover:bg-neutral-100 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                aria-label="Close modal"
              >
                <X className="h-5 w-5 transition-transform group-hover:rotate-90" />
              </button>
            </div>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="relative px-6 py-6">
            <label htmlFor="issue-reason" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
              What&apos;s inaccurate or confusing?
            </label>
            <div className="mt-3 relative">
              <textarea
                ref={textareaRef}
                id="issue-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError("");
                }}
                disabled={isSubmitting}
                placeholder="e.g., The explanation of photosynthesis is missing key steps..."
                className={`w-full rounded-2xl border px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 disabled:opacity-60 ${
                  error
                    ? "border-red-400 bg-red-50 focus:ring-red-400/40 dark:border-red-600 dark:bg-red-950/20"
                    : "border-neutral-300 bg-white focus:border-lernex-blue focus:ring-lernex-blue/40 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                }`}
                rows={4}
                maxLength={350}
              />

              {/* Character count */}
              <div className={`mt-2 text-right text-xs transition-colors ${
                isOverLimit
                  ? "text-red-600 dark:text-red-400 font-semibold"
                  : isNearLimit
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-neutral-400 dark:text-neutral-500"
              }`}>
                {characterCount} / 300
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Help text */}
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700 dark:bg-blue-950/20 dark:text-blue-300">
              <Sparkles className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                Your feedback helps us improve lesson quality. Be specific about what needs correction.
              </span>
            </div>

            {/* Footer buttons */}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-all hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isOverLimit || reason.trim().length < 3}
                className="group flex-1 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    <span>Submit Report</span>
                  </>
                )}
              </button>
            </div>

            {/* Keyboard shortcut hint */}
            <div className="mt-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
              Press <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono dark:bg-neutral-800">Esc</kbd> to close
              {" · "}
              <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono dark:bg-neutral-800">⌘</kbd>
              {" + "}
              <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono dark:bg-neutral-800">Enter</kbd> to submit
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
