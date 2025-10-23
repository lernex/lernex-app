"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, Play, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import LessonCard from "@/components/LessonCard";
import QuizBlock from "@/components/QuizBlock";
import PageTransition from "@/components/PageTransition";
import type { Lesson } from "@/types";

type SavedLesson = {
  lesson_id: string;
  subject: string;
  topic: string | null;
  title: string;
  content: string;
  difficulty: string | null;
  questions: unknown;
};

export default function PlaylistLearnMode() {
  const { id } = useParams<{ id: string }>();
  const [mode, setMode] = useState<"learn" | "reinforce">("learn");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quizMode, setQuizMode] = useState(false);
  const [playlistName, setPlaylistName] = useState<string>("");

  const supabase = useMemo(() => supabaseBrowser(), []);

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

      // Convert to Lesson format
      const formattedLessons: Lesson[] = savedLessons.map((sl: SavedLesson) => ({
        id: sl.lesson_id,
        subject: sl.subject,
        topic: sl.topic || "",
        title: sl.title,
        content: sl.content,
        difficulty: (sl.difficulty as "intro" | "easy" | "medium" | "hard") || "medium",
        questions: Array.isArray(sl.questions) ? sl.questions as Lesson["questions"] : [],
      }));

      setLessons(formattedLessons);
    } catch (err) {
      console.error("Failed to load playlist lessons", err);
      setError("Failed to load lessons. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id, supabase]);

  const generateSimilarLessons = useCallback(async () => {
    if (!id) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/playlists/${id}/generate-similar?count=5`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate lessons");
      }

      const data = await res.json();
      setLessons(data.lessons || []);
      setCurrentIndex(0);
    } catch (err) {
      console.error("Failed to generate similar lessons", err);
      setError(err instanceof Error ? err.message : "Failed to generate lessons");
    } finally {
      setGenerating(false);
    }
  }, [id]);

  useEffect(() => {
    void loadPlaylistLessons();
  }, [loadPlaylistLessons]);

  const currentLesson = lessons[currentIndex];

  const handleNext = () => {
    if (currentIndex < lessons.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setQuizMode(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setQuizMode(false);
    }
  };

  const handleModeSwitch = async (newMode: "learn" | "reinforce") => {
    if (newMode === mode) return;
    setMode(newMode);
    setCurrentIndex(0);
    setQuizMode(false);

    if (newMode === "reinforce") {
      await generateSimilarLessons();
    } else {
      await loadPlaylistLessons();
    }
  };

  if (loading) {
    return (
      <PageTransition>
        <main className="relative min-h-screen bg-gradient-to-b from-white via-white to-lernex-gray/50 dark:from-lernex-charcoal dark:via-lernex-charcoal/98 dark:to-lernex-charcoal/92">
          <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-4">
            <Loader2 className="h-12 w-12 animate-spin text-lernex-blue" />
            <p className="mt-4 text-neutral-600 dark:text-neutral-400">Loading lessons...</p>
          </div>
        </main>
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <main className="relative min-h-screen bg-gradient-to-b from-white via-white to-lernex-gray/50 dark:from-lernex-charcoal dark:via-lernex-charcoal/98 dark:to-lernex-charcoal/92">
          <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-4">
            <div className="rounded-3xl border border-red-200/70 bg-red-50/70 p-8 text-center shadow-lg dark:border-red-500/20 dark:bg-red-500/10">
              <h2 className="text-xl font-semibold text-red-800 dark:text-red-200">
                Oops!
              </h2>
              <p className="mt-2 text-red-700 dark:text-red-300">{error}</p>
              <Link
                href={`/playlists/${id}`}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-lernex-blue px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-lernex-blue/90"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to playlist
              </Link>
            </div>
          </div>
        </main>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <main className="relative min-h-screen bg-gradient-to-b from-white via-white to-lernex-gray/50 text-neutral-900 dark:from-lernex-charcoal dark:via-lernex-charcoal/98 dark:to-lernex-charcoal/92 dark:text-white">
        {/* Header */}
        <div className="sticky top-0 z-40 border-b border-neutral-200/50 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-lernex-charcoal/80">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
            <Link
              href={`/playlists/${id}`}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white/70 px-3 py-1.5 text-sm font-medium text-neutral-600 shadow-sm transition hover:border-lernex-blue/50 hover:text-lernex-blue dark:border-white/10 dark:bg-white/5 dark:text-white/80"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>

            <div className="flex items-center gap-2">
              <span className="hidden text-sm font-medium text-neutral-600 dark:text-neutral-400 sm:inline">
                {currentIndex + 1} / {lessons.length}
              </span>
            </div>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              {playlistName}
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {mode === "learn"
                ? "Review your saved lessons"
                : "Practice with AI-generated similar lessons"}
            </p>
          </div>

          <div className="mb-8 flex gap-3">
            <button
              onClick={() => void handleModeSwitch("learn")}
              disabled={loading || generating}
              className={`flex-1 rounded-2xl px-6 py-4 text-sm font-semibold shadow-sm transition ${
                mode === "learn"
                  ? "border-2 border-lernex-blue bg-gradient-to-br from-lernex-blue via-lernex-blue to-lernex-blue/90 text-white shadow-lg shadow-lernex-blue/20"
                  : "border border-neutral-200 bg-white text-neutral-700 hover:border-lernex-blue/50 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
              }`}
            >
              <Play className="mx-auto mb-1 h-5 w-5" />
              Learn Mode
              <p className="mt-1 text-xs font-normal opacity-80">
                Scroll through saved lessons
              </p>
            </button>

            <button
              onClick={() => void handleModeSwitch("reinforce")}
              disabled={loading || generating}
              className={`flex-1 rounded-2xl px-6 py-4 text-sm font-semibold shadow-sm transition ${
                mode === "reinforce"
                  ? "border-2 border-lernex-purple bg-gradient-to-br from-lernex-purple via-lernex-purple to-lernex-purple/90 text-white shadow-lg shadow-lernex-purple/20"
                  : "border border-neutral-200 bg-white text-neutral-700 hover:border-lernex-purple/50 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
              }`}
            >
              <Zap className="mx-auto mb-1 h-5 w-5" />
              Reinforce Mode
              <p className="mt-1 text-xs font-normal opacity-80">
                Generate similar lessons
              </p>
            </button>
          </div>

          {generating && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 flex items-center gap-3 rounded-2xl border border-lernex-purple/30 bg-lernex-purple/10 px-6 py-4 dark:bg-lernex-purple/20"
            >
              <Loader2 className="h-5 w-5 animate-spin text-lernex-purple" />
              <span className="text-sm font-medium text-lernex-purple dark:text-lernex-purple/90">
                Generating similar lessons based on your playlist...
              </span>
            </motion.div>
          )}
        </div>

        {/* Lesson Content */}
        <div className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
          <AnimatePresence mode="wait">
            {currentLesson && !quizMode ? (
              <motion.div
                key={`lesson-${currentLesson.id}`}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <LessonCard lesson={currentLesson} />

                {currentLesson.questions && currentLesson.questions.length > 0 && (
                  <button
                    onClick={() => setQuizMode(true)}
                    className="mx-auto flex items-center gap-2 rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-8 py-4 text-base font-semibold text-white shadow-lg transition hover:scale-105 hover:shadow-xl"
                  >
                    <Sparkles className="h-5 w-5" />
                    Take the Quiz
                  </button>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between gap-4 pt-4">
                  <button
                    onClick={handlePrevious}
                    disabled={currentIndex === 0}
                    className="rounded-full border border-neutral-200 bg-white px-6 py-3 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-lernex-blue hover:text-lernex-blue disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
                  >
                    Previous
                  </button>

                  <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 sm:hidden">
                    {currentIndex + 1} / {lessons.length}
                  </span>

                  <button
                    onClick={handleNext}
                    disabled={currentIndex === lessons.length - 1}
                    className="rounded-full bg-lernex-blue px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-lernex-blue/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </motion.div>
            ) : currentLesson && quizMode ? (
              <motion.div
                key={`quiz-${currentLesson.id}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
              >
                <QuizBlock
                  lesson={currentLesson}
                  onDone={() => {
                    setQuizMode(false);
                    if (currentIndex < lessons.length - 1) {
                      setTimeout(() => handleNext(), 1000);
                    }
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </main>
    </PageTransition>
  );
}
