"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Clock, Trash2, Loader2, ChevronRight } from "lucide-react";
import LessonCard from "./LessonCard";
import QuizBlock from "./QuizBlock";
import DeleteConfirmModal from "./DeleteConfirmModal";
import type { Lesson } from "@/types";

interface HistoryLesson {
  id: string;
  lesson_data: Lesson;
  audio_url: string | null;
  subject: string | null;
  topic: string | null;
  mode: string | null;
  created_at: string;
}

interface LessonHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LessonHistoryModal({ isOpen, onClose }: LessonHistoryModalProps) {
  const [history, setHistory] = useState<HistoryLesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<HistoryLesson | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/lesson-history?limit=50");
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error("[history] Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!lessonToDelete) return;

    setDeleting(lessonToDelete);
    try {
      const response = await fetch(`/api/lesson-history?id=${lessonToDelete}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setHistory((prev) => prev.filter((l) => l.id !== lessonToDelete));
        if (selectedLesson?.id === lessonToDelete) {
          setSelectedLesson(null);
        }
      }
    } catch (error) {
      console.error("[history] Error deleting lesson:", error);
    } finally {
      setDeleting(null);
      setLessonToDelete(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", duration: 0.3 }}
          className="relative z-10 w-full max-w-6xl mx-4 max-h-[90vh] rounded-3xl border border-surface bg-surface-card shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-r from-lernex-blue/10 via-lernex-purple/10 to-pink-500/10 border-b border-surface px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lernex-blue/15 text-lernex-blue">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-foreground">Lesson History</h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Review your generated lessons and replays audio anytime
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40"
                aria-label="Close modal"
              >
                <X className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex h-[calc(90vh-100px)]">
            {/* Sidebar - List of lessons */}
            <div className="w-1/3 border-r border-surface overflow-y-auto bg-surface-muted/30">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-lernex-blue" />
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="rounded-full bg-surface-muted p-4 mb-4">
                    <Clock className="h-8 w-8 text-neutral-400" />
                  </div>
                  <p className="text-neutral-600 dark:text-neutral-400">No lessons in history yet</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">
                    Generate lessons to build your history
                  </p>
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {history.map((item) => (
                    <motion.button
                      key={item.id}
                      onClick={() => setSelectedLesson(item)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full text-left rounded-2xl border transition-all duration-200 ${
                        selectedLesson?.id === item.id
                          ? "border-lernex-blue bg-lernex-blue/10 shadow-sm"
                          : "border-surface bg-surface-card hover:bg-surface-muted/50"
                      }`}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-foreground truncate">
                              {item.lesson_data.title || "Untitled Lesson"}
                            </h3>
                            {item.subject && (
                              <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate mt-0.5">
                                {item.subject}
                                {item.topic && ` • ${item.topic}`}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLessonToDelete(item.id);
                            }}
                            disabled={deleting === item.id}
                            className="flex-shrink-0 rounded-full p-1.5 text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                            aria-label="Delete lesson"
                          >
                            {deleting === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-500 dark:text-neutral-500">
                            {formatDate(item.created_at)}
                          </span>
                          {item.mode && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-muted text-neutral-600 dark:text-neutral-400 capitalize">
                              {item.mode}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {/* Main content - Selected lesson */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedLesson ? (
                <div className="space-y-4 max-w-3xl mx-auto">
                  <LessonCard
                    lesson={selectedLesson.lesson_data}
                    lessonId={selectedLesson.id}
                    audioUrl={selectedLesson.audio_url || undefined}
                    className="max-h-none"
                  />
                  {Array.isArray(selectedLesson.lesson_data.questions) &&
                    selectedLesson.lesson_data.questions.length > 0 && (
                      <QuizBlock
                        lesson={selectedLesson.lesson_data}
                        onDone={() => {}}
                      />
                    )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="rounded-full bg-surface-muted p-6 mb-4">
                    <ChevronRight className="h-12 w-12 text-neutral-400" />
                  </div>
                  <p className="text-lg font-medium text-neutral-700 dark:text-neutral-300">
                    Select a lesson to view
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">
                    Choose a lesson from the sidebar to review it
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Delete Confirmation Modal */}
        <DeleteConfirmModal
          isOpen={lessonToDelete !== null}
          onClose={() => setLessonToDelete(null)}
          onConfirm={confirmDelete}
          title="Delete Lesson"
          message="Are you sure you want to delete this lesson from history? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
        />
      </div>
    </AnimatePresence>
  );
}
