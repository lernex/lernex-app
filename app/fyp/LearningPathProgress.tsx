"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Map, TrendingUp, ChevronRight, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useLernexStore } from "@/lib/store";
import LearningPathModal from "./LearningPathModal";

type ProgressData = {
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

export default function LearningPathProgress() {
  const { selectedSubjects } = useLernexStore();
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const subject = selectedSubjects.length === 1 ? selectedSubjects[0] : null;

  useEffect(() => {
    if (!subject) {
      setProgressData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch(`/api/fyp/progress?subject=${encodeURIComponent(subject)}`)
      .then((res) => res.json())
      .then((data) => {
        setProgressData(data);
        setIsLoading(false);
      })
      .catch(() => {
        setProgressData(null);
        setIsLoading(false);
      });
  }, [subject]);

  if (!subject) {
    return (
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-[0_32px_90px_-64px_rgba(47,128,237,0.45)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lernex-green/15 text-lernex-green dark:bg-lernex-green/20 dark:text-lernex-green/70">
            <Map className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Learning Path</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Track your journey</p>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-dashed border-white/60 bg-white/40 px-4 py-6 text-center text-sm text-neutral-500 dark:border-white/15 dark:bg-white/5 dark:text-neutral-400">
          Select a single class to view your learning path progress.
        </div>
      </motion.div>
    );
  }

  if (isLoading) {
    return (
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-[0_32px_90px_-64px_rgba(47,128,237,0.45)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lernex-green/15 text-lernex-green dark:bg-lernex-green/20 dark:text-lernex-green/70">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Learning Path</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Loading progress...</p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (!progressData || progressData.topicCount === 0) {
    return (
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-[0_32px_90px_-64px_rgba(47,128,237,0.45)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lernex-green/15 text-lernex-green dark:bg-lernex-green/20 dark:text-lernex-green/70">
            <Map className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Learning Path</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Track your journey</p>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-dashed border-white/60 bg-white/40 px-4 py-6 text-center text-sm text-neutral-500 dark:border-white/15 dark:bg-white/5 dark:text-neutral-400">
          No learning path available yet for {subject}.
        </div>
      </motion.div>
    );
  }

  const unitProgress = progressData.topicPercent;
  const totalProgress = progressData.percent;

  return (
    <>
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-[0_32px_90px_-64px_rgba(39,174,96,0.55)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lernex-green/15 text-lernex-green dark:bg-lernex-green/20 dark:text-lernex-green/70">
            <Map className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Learning Path</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{subject}</p>
          </div>
        </div>

        {/* Current Unit Progress */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-600 dark:text-neutral-300">
              Current Unit Progress
            </span>
            <motion.span
              key={unitProgress}
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="font-bold text-lernex-green dark:text-lernex-green/80"
            >
              {unitProgress}%
            </motion.span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full bg-neutral-200/70 dark:bg-neutral-700/50">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${unitProgress}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
              className="h-full rounded-full bg-gradient-to-r from-lernex-green via-emerald-400 to-lernex-green shadow-[0_0_12px_rgba(39,174,96,0.4)]"
            >
              <div className="h-full w-full animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            </motion.div>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Unit {progressData.topicIndex} of {progressData.topicCount}
            {progressData.topicName && (
              <span className="ml-1 font-medium text-neutral-600 dark:text-neutral-300">
                • {progressData.topicName}
              </span>
            )}
          </p>
        </div>

        {/* Total Class Progress */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-600 dark:text-neutral-300">
              Total Class Progress
            </span>
            <motion.span
              key={totalProgress}
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="font-bold text-lernex-blue dark:text-lernex-blue/80"
            >
              {totalProgress}%
            </motion.span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full bg-neutral-200/70 dark:bg-neutral-700/50">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${totalProgress}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="h-full rounded-full bg-gradient-to-r from-lernex-blue via-indigo-400 to-lernex-purple shadow-[0_0_12px_rgba(47,128,237,0.4)]"
            >
              <div className="h-full w-full animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            </motion.div>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {progressData.completed} of {progressData.total} lessons completed
          </p>
        </div>

        {/* Current Position Indicator */}
        {progressData.currentLabel && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-5 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/10"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-lernex-green/70 dark:text-lernex-green/60" />
              <div className="flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Current Position
                </p>
                <p className="mt-0.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                  {progressData.currentLabel}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* More Details Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsModalOpen(true)}
          className="mt-5 group flex w-full items-center justify-between rounded-2xl border border-lernex-green/40 bg-gradient-to-r from-lernex-green/10 to-emerald-400/10 px-4 py-3 font-medium text-lernex-green transition-all hover:border-lernex-green/60 hover:from-lernex-green/15 hover:to-emerald-400/15 hover:shadow-lg dark:border-lernex-green/30 dark:from-lernex-green/15 dark:to-emerald-400/15 dark:text-lernex-green/90 dark:hover:border-lernex-green/50"
        >
          <span className="text-sm">View Full Learning Path</span>
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {isModalOpen && (
          <LearningPathModal
            subject={subject}
            onClose={() => setIsModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
