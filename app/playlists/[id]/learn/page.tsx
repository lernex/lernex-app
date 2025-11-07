"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, Play, Shuffle, Sparkles } from "lucide-react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import LessonCard from "@/components/LessonCard";
import QuizBlock from "@/components/QuizBlock";
import PageTransition from "@/components/PageTransition";
import type { Lesson } from "@/types";
import { useUsageLimitCheck } from "@/lib/hooks/useUsageLimitCheck";
import UsageLimitModal from "@/components/UsageLimitModal";

type SavedLesson = {
  lesson_id: string;
  subject: string;
  topic: string | null;
  title: string;
  content: string;
  difficulty: string | null;
  questions: unknown;
  knowledge: unknown;
  context: unknown;
};

export default function PlaylistLearnMode() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const mode = (searchParams.get("mode") as "play" | "remix") || "play";

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState<string>("");
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [showCompleteHint, setShowCompleteHint] = useState(false);
  const [autoAdvancing, setAutoAdvancing] = useState(false);

  const hintTimeoutRef = useRef<number | null>(null);
  const autoAdvanceRef = useRef<number | null>(null);

  const supabase = useMemo(() => supabaseBrowser(), []);

  // Usage limit check hook
  const { checkLimit, isModalOpen, closeModal, limitData } = useUsageLimitCheck();

  const loadPlaylistLessons = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      // Get playlist info
      const { data: playlist, error: playlistError } = await supabase
        .from("playlists")
        .select("name")
        .eq("id", id)
        .maybeSingle();

      if (playlistError) throw playlistError;
      if (!playlist) {
        setError("Playlist not found");
        return;
      }

      const playlistData = playlist as { name: string };
      setPlaylistName(playlistData.name);

      // Get playlist items
      const { data: items, error: itemsError } = await supabase
        .from("playlist_items")
        .select("lesson_id")
        .eq("playlist_id", id)
        .order("position", { ascending: true });

      if (itemsError) throw itemsError;

      if (!items || items.length === 0) {
        setError("This playlist has no lessons yet.");
        return;
      }

      const playlistItems = items as Array<{ lesson_id: string }>;

      // Get lesson data from saved_lessons
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated");
        return;
      }

      const lessonIds = playlistItems.map(item => item.lesson_id);
      const { data: savedLessons, error: lessonsError } = await supabase
        .from("saved_lessons")
        .select("*")
        .eq("user_id", user.id)
        .in("lesson_id", lessonIds);

      if (lessonsError) throw lessonsError;

      if (!savedLessons || savedLessons.length === 0) {
        setError("No saved lesson data found. Save lessons from the FYP first.");
        return;
      }

      // Convert to Lesson format and maintain playlist order
      const lessonMap = new Map<string, Lesson>();
      savedLessons.forEach((sl: SavedLesson) => {
        lessonMap.set(sl.lesson_id, {
          id: sl.lesson_id,
          subject: sl.subject,
          topic: sl.topic || "",
          title: sl.title,
          content: sl.content,
          difficulty: (sl.difficulty as "intro" | "easy" | "medium" | "hard") || "medium",
          questions: Array.isArray(sl.questions) ? sl.questions as Lesson["questions"] : [],
          context: (sl.context as Record<string, unknown>) || null,
          knowledge: (sl.knowledge as Lesson["knowledge"]) || null,
          nextTopicHint: null,
          personaHash: null,
        });
      });

      // Maintain original playlist order
      const orderedLessons: Lesson[] = [];
      lessonIds.forEach(lessonId => {
        const lesson = lessonMap.get(lessonId);
        if (lesson) orderedLessons.push(lesson);
      });

      setLessons(orderedLessons);
    } catch (err) {
      console.error("Failed to load playlist lessons", err);
      setError("Failed to load lessons. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id, supabase]);

  const generateRemixLessons = useCallback(async () => {
    if (!id) return;

    // Check usage limit before starting remix generation
    const canGenerate = await checkLimit();
    if (!canGenerate) {
      return; // Modal will be shown by the hook
    }

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/playlists/${id}/remix?count=10`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate remix lessons");
      }

      const data = await res.json();
      if (!data.lessons || data.lessons.length === 0) {
        throw new Error("No remix lessons generated");
      }

      setLessons(data.lessons);
      setCurrentIndex(0);
      setCompletedMap({});
    } catch (err) {
      console.error("Failed to generate remix lessons", err);
      setError(err instanceof Error ? err.message : "Failed to generate remix lessons");
    } finally {
      setGenerating(false);
    }
  }, [id, checkLimit]);

  useEffect(() => {
    if (mode === "play") {
      void loadPlaylistLessons();
    } else if (mode === "remix") {
      void generateRemixLessons();
    }
  }, [mode, loadPlaylistLessons, generateRemixLessons]);

  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current) window.clearTimeout(autoAdvanceRef.current);
      if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
    };
  }, []);

  const currentLesson = lessons[currentIndex];
  const requiresQuiz = currentLesson ? Array.isArray(currentLesson.questions) && currentLesson.questions.length > 0 : false;
  const currentCompleted = currentLesson ? (!requiresQuiz || !!completedMap[currentLesson.id]) : true;

  const triggerHint = useCallback(() => {
    setShowCompleteHint(true);
    if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
    hintTimeoutRef.current = window.setTimeout(() => {
      setShowCompleteHint(false);
    }, 2200);
  }, []);

  const handleNext = useCallback((force = false) => {
    if (!force && !currentCompleted) {
      triggerHint();
      return false;
    }

    if (currentIndex < lessons.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setShowCompleteHint(false);
      if (hintTimeoutRef.current) {
        window.clearTimeout(hintTimeoutRef.current);
        hintTimeoutRef.current = null;
      }
      if (autoAdvanceRef.current) {
        window.clearTimeout(autoAdvanceRef.current);
        autoAdvanceRef.current = null;
      }
      setAutoAdvancing(false);
      return true;
    }
    return false;
  }, [currentIndex, lessons.length, currentCompleted, triggerHint]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setShowCompleteHint(false);
      if (hintTimeoutRef.current) {
        window.clearTimeout(hintTimeoutRef.current);
        hintTimeoutRef.current = null;
      }
    }
  }, [currentIndex]);

  const handleLessonComplete = useCallback((lesson: Lesson) => {
    setCompletedMap((prev) => (prev[lesson.id] ? prev : { ...prev, [lesson.id]: true }));
    setShowCompleteHint(false);
    if (hintTimeoutRef.current) {
      window.clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
    if (autoAdvanceRef.current) {
      window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }

    // Auto-advance after completion
    setAutoAdvancing(true);
    autoAdvanceRef.current = window.setTimeout(() => {
      handleNext(true);
      setAutoAdvancing(false);
      autoAdvanceRef.current = null;
    }, 1100);
  }, [handleNext]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp") handlePrevious();
      if (e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") handleNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePrevious, handleNext]);

  const progressPct = lessons.length > 0 ? Math.round(((currentIndex + 1) / lessons.length) * 100) : 0;

  if (loading || generating) {
    return (
      <PageTransition>
        <main className="relative min-h-screen bg-gradient-to-b from-white via-white to-lernex-gray/50 dark:from-lernex-charcoal dark:via-lernex-charcoal/98 dark:to-lernex-charcoal/92">
          {/* Floating background effects */}
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.26),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(168,85,247,0.28),transparent_55%)] dark:bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.22),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(168,85,247,0.22),transparent_55%)]" />
          </div>

          <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-6 px-4 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full bg-gradient-to-r from-lernex-blue via-purple-500 to-lernex-purple opacity-20 blur-xl"
              />
              <Loader2 className="relative h-16 w-16 animate-spin text-lernex-blue" />
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="space-y-2"
            >
              <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-100">
                {generating ? "Generating AI Remix..." : "Loading Playlist..."}
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {generating
                  ? "Creating personalized variations based on your playlist"
                  : "Preparing your lessons"}
              </p>
            </motion.div>

            {generating && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="w-full max-w-md space-y-4"
              >
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-neutral-200/70 dark:bg-neutral-800/60">
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-50" style={{ width: "65%" }} />
                </div>
                <div className="flex flex-col gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <div className="flex items-center justify-between">
                    <span>Analyzing playlist patterns...</span>
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                      className="text-emerald-600 dark:text-emerald-400"
                    >
                      ✓
                    </motion.span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Optimizing AI prompt...</span>
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 2 }}
                      className="text-emerald-600 dark:text-emerald-400"
                    >
                      ✓
                    </motion.span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Generating fresh lessons...</span>
                    <Loader2 className="h-3 w-3 animate-spin text-lernex-purple" />
                  </div>
                </div>
              </motion.div>
            )}

            {!generating && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-2"
              >
                {Array.from({ length: 3 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i }}
                    className="h-16 w-64 animate-pulse rounded-2xl bg-neutral-200/70 dark:bg-neutral-800/60"
                  />
                ))}
              </motion.div>
            )}
          </div>
        </main>
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <main className="relative min-h-screen bg-gradient-to-b from-white via-white to-lernex-gray/50 dark:from-lernex-charcoal dark:via-lernex-charcoal/98 dark:to-lernex-charcoal/92">
          {/* Floating background effects */}
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.15),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(251,113,133,0.15),transparent_55%)]" />
          </div>

          <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative max-w-lg"
            >
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-red-200/40 to-pink-200/40 blur-xl dark:from-red-500/20 dark:to-pink-500/20" />
              <div className="relative rounded-3xl border border-red-200/70 bg-red-50/90 p-8 text-center shadow-2xl backdrop-blur dark:border-red-500/30 dark:bg-red-500/10">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
                  className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20"
                >
                  <span className="text-3xl">😕</span>
                </motion.div>
                <h2 className="text-2xl font-bold text-red-800 dark:text-red-200">
                  Oops! Something went wrong
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-red-700 dark:text-red-300">
                  {error}
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Link
                    href={`/playlists/${id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-300 bg-white px-6 py-3 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to playlist
                  </Link>
                  <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-lernex-blue px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-lernex-blue/90"
                  >
                    <Sparkles className="h-4 w-4" />
                    Try again
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </main>
      </PageTransition>
    );
  }

  return (
    <>
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
      <PageTransition>
        <main className="relative min-h-screen bg-gradient-to-b from-white via-white to-lernex-gray/50 text-neutral-900 dark:from-lernex-charcoal dark:via-lernex-charcoal/98 dark:to-lernex-charcoal/92 dark:text-white">
        {/* Floating background effects */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.26),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(168,85,247,0.28),transparent_55%)] dark:bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.22),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(168,85,247,0.22),transparent_55%)]" />
        </div>

        {/* Header */}
        <div className="sticky top-0 z-40 border-b border-neutral-200/50 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-lernex-charcoal/80">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
            <Link
              href={`/playlists/${id}`}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white/70 px-3 py-1.5 text-sm font-medium text-neutral-600 shadow-sm transition hover:border-lernex-blue/50 hover:text-lernex-blue dark:border-white/10 dark:bg-white/5 dark:text-white/80"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white/70 px-3 py-1.5 dark:border-white/10 dark:bg-white/5">
                {mode === "play" ? (
                  <Play className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Shuffle className="h-4 w-4 text-lernex-purple dark:text-lernex-purple/80" />
                )}
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {mode === "play" ? "Play" : "Remix"}
                </span>
              </div>
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                {currentIndex + 1} / {lessons.length}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 w-full bg-neutral-200/50 dark:bg-white/5">
            <motion.div
              className={`h-full ${mode === "play" ? "bg-gradient-to-r from-emerald-500 to-teal-500" : "bg-gradient-to-r from-lernex-blue to-lernex-purple"}`}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Complete hint */}
        <AnimatePresence>
          {showCompleteHint && (
            <motion.div
              key="locked-hint"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none fixed top-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900/80 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur dark:bg-neutral-800/80"
            >
              Finish the quiz to unlock the next lesson
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lesson Content */}
        <div className="relative mx-auto w-full max-w-3xl px-3 pb-20 pt-10 sm:px-4 lg:px-6">
          {currentLesson && (
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={currentLesson.id}
                drag={currentCompleted ? "y" : false}
                dragConstraints={{ top: 0, bottom: 0 }}
                onDragEnd={(_, info) => {
                  if (!currentCompleted) {
                    triggerHint();
                    return;
                  }
                  if (info.offset.y < -120) handleNext();
                  if (info.offset.y > 120) handlePrevious();
                }}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -40, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                className="relative flex flex-col gap-5 px-3 py-6 sm:px-4 lg:px-6"
              >
                <div className="flex flex-col gap-5">
                  <div className="flex w-full justify-center">
                    <LessonCard
                      lesson={currentLesson}
                      className="w-full max-w-[560px] min-h-[320px] sm:min-h-[340px] lg:min-h-[360px]"
                    />
                  </div>
                  {requiresQuiz && (
                    <div className="flex w-full flex-col gap-3">
                      <QuizBlock
                        key={currentLesson.id}
                        lesson={currentLesson}
                        showSummary={false}
                        onDone={() => handleLessonComplete(currentLesson)}
                      />
                      {!currentCompleted && (
                        <div className="rounded-xl border border-dashed border-amber-300/60 bg-amber-50/70 px-4 py-2 text-sm text-amber-700 shadow-sm dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-200">
                          Finish the quiz to unlock the next lesson
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {!requiresQuiz && (
                  <div className="rounded-xl border border-lime-300/60 bg-lime-50/70 px-4 py-2 text-sm text-lime-700 shadow-sm dark:border-lime-400/50 dark:bg-lime-500/10 dark:text-lime-200">
                    No quiz for this one - enjoy the lesson!
                  </div>
                )}
                <div className="mt-auto text-xs text-neutral-400 text-center dark:text-neutral-500">
                  <div className="flex flex-col items-center gap-2">
                    <span>Tip: Swipe or drag the card, or use arrow keys</span>
                    {autoAdvancing && (
                      <span className="flex items-center gap-1 text-lernex-blue dark:text-lernex-blue/80">
                        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-current" />
                        Preparing your next lesson...
                      </span>
                    )}
                    {mode === "remix" && (
                      <span className="flex items-center gap-1 text-lernex-purple dark:text-lernex-purple/80">
                        <Sparkles className="h-3 w-3" />
                        AI-generated remix based on your playlist
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          {!currentLesson && lessons.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-neutral-200/70 bg-white/80 p-12 text-center shadow-lg dark:border-white/10 dark:bg-white/5">
              <Sparkles className="h-12 w-12 text-neutral-400 dark:text-neutral-500" />
              <p className="mt-4 text-lg font-medium text-neutral-700 dark:text-neutral-300">
                No lessons available
              </p>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                Add some lessons to your playlist to get started
              </p>
              <Link
                href={`/playlists/${id}`}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-lernex-blue px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-lernex-blue/90"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to playlist
              </Link>
            </div>
          )}
        </div>
      </main>
    </PageTransition>
    </>
  );
}
