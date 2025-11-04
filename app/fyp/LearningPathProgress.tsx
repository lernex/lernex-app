"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Map, TrendingUp, ChevronRight, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useLernexStore } from "@/lib/store";
import { useProfileBasics } from "@/app/providers/ProfileBasicsProvider";
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

type MultiSubjectProgress = Record<string, ProgressData>;

export default function LearningPathProgress() {
  const { selectedSubjects, accuracyBySubject } = useLernexStore();
  const { data: profileBasics } = useProfileBasics();
  const interests = profileBasics.interests;

  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [multiProgressData, setMultiProgressData] = useState<MultiSubjectProgress>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const subject = selectedSubjects.length === 1 ? selectedSubjects[0] : null;
  const isAllMode = selectedSubjects.length === 0 && interests.length > 0;
  const isMultiSubject = selectedSubjects.length > 1 || isAllMode;

  // Determine which subjects to fetch progress for
  const subjectsToFetch = isAllMode ? interests : selectedSubjects;

  useEffect(() => {
    if (!interests.length) {
      setProgressData(null);
      setMultiProgressData({});
      setIsLoading(false);
      return;
    }

    if (subject) {
      // Single subject mode
      setIsLoading(true);
      fetch(`/api/fyp/progress?subject=${encodeURIComponent(subject)}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          setProgressData(data);
          setIsLoading(false);
        })
        .catch(() => {
          setProgressData(null);
          setIsLoading(false);
        });
    } else if (isMultiSubject) {
      // Multi-subject or All mode: fetch progress for relevant subjects
      setIsLoading(true);
      Promise.all(
        subjectsToFetch.map(sub =>
          fetch(`/api/fyp/progress?subject=${encodeURIComponent(sub)}`)
            .then(res => {
              if (!res.ok) {
                throw new Error(`API error: ${res.status}`);
              }
              return res.json();
            })
            .then(data => ({ subject: sub, data }))
            .catch(() => ({ subject: sub, data: null }))
        )
      ).then(results => {
        const multiData: MultiSubjectProgress = {};
        results.forEach(({ subject, data }) => {
          if (data) multiData[subject] = data;
        });
        setMultiProgressData(multiData);
        setIsLoading(false);
      });
    }
  }, [subject, selectedSubjects, isMultiSubject, interests, subjectsToFetch, isAllMode]);

  // Multi-subject view
  if (isMultiSubject) {
    if (isLoading) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-3xl border border-white/40 bg-gradient-to-br from-white/90 to-white/70 p-6 shadow-xl backdrop-blur-xl dark:border-white/10 dark:from-white/10 dark:to-white/5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-lernex-green to-emerald-400 text-white shadow-lg">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Learning Path</h2>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">Loading progress...</p>
            </div>
          </div>
        </motion.div>
      );
    }

    const subjects = Object.keys(multiProgressData);
    const totalCompleted = subjects.reduce((sum, sub) => sum + (multiProgressData[sub]?.completed || 0), 0);
    const totalLessons = subjects.reduce((sum, sub) => sum + (multiProgressData[sub]?.total || 0), 0);
    const overallPercent = totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0;

    // In Mix mode, sort by accuracy (lowest first) to show which need most work
    // In All mode, keep alphabetical order
    const sortedSubjects = isAllMode
      ? subjects.sort((a, b) => a.localeCompare(b))
      : subjects.sort((a, b) => {
          const accA = accuracyBySubject[a];
          const accB = accuracyBySubject[b];
          const percentA = accA && accA.total > 0 ? accA.correct / accA.total : 0.5;
          const percentB = accB && accB.total > 0 ? accB.correct / accB.total : 0.5;
          return percentA - percentB; // Lower accuracy first
        });

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -6, scale: 1.01 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="group rounded-3xl border border-white/40 bg-gradient-to-br from-white/90 to-white/70 p-6 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:from-white/10 dark:to-white/5"
      >
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: 360, scale: 1.1 }}
            transition={{ duration: 0.6 }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-lernex-green to-emerald-400 text-white shadow-lg dark:from-lernex-green/80 dark:to-emerald-400/80"
          >
            <Map className="h-6 w-6" />
          </motion.div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">Learning Path</h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {subjects.length} subjects • {isAllMode ? 'All mode' : 'Mix mode'}
            </p>
          </div>
        </div>

        {/* Overall Progress */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mt-6 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Overall Progress
            </span>
            <motion.span
              initial={{ scale: 1.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, type: "spring" }}
              className="text-sm font-bold text-lernex-blue dark:text-lernex-blue/90"
            >
              {overallPercent}%
            </motion.span>
          </div>
          <div className="relative h-3.5 overflow-hidden rounded-full bg-neutral-200/80 shadow-inner dark:bg-neutral-700/50">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${overallPercent}%` }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              className="relative h-full rounded-full bg-gradient-to-r from-lernex-blue via-indigo-400 to-lernex-purple shadow-[0_0_16px_rgba(47,128,237,0.5)]"
            >
              <motion.div
                animate={{ x: ["0%", "100%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              />
            </motion.div>
          </div>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            {totalCompleted} of {totalLessons} total lessons completed
          </p>
        </motion.div>

        {/* Per-Subject Progress */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-6 space-y-3"
        >
          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Progress by Subject
          </span>
          <div className="space-y-3">
            {sortedSubjects.map((sub, idx) => {
              const data = multiProgressData[sub];
              if (!data) return null;

              const accuracy = accuracyBySubject[sub];
              const accuracyPercent = accuracy && accuracy.total > 0
                ? Math.round((accuracy.correct / accuracy.total) * 100)
                : null;

              return (
                <motion.div
                  key={sub}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + idx * 0.1, duration: 0.4 }}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {sub}
                    </span>
                    <div className="flex items-center gap-2">
                      {accuracyPercent !== null && (
                        <span className={`text-[10px] font-medium ${
                          accuracyPercent < 60 ? 'text-rose-600 dark:text-rose-400' :
                          accuracyPercent < 80 ? 'text-amber-600 dark:text-amber-400' :
                          'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {accuracyPercent}% accuracy
                        </span>
                      )}
                      <span className="font-bold text-neutral-700 dark:text-neutral-300">
                        {data.percent}%
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-neutral-200/60 dark:bg-neutral-700/40">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${data.percent}%` }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 + idx * 0.1 }}
                      className={`h-full rounded-full ${
                        accuracyPercent !== null && accuracyPercent < 60
                          ? 'bg-gradient-to-r from-rose-500 to-rose-400'
                          : accuracyPercent !== null && accuracyPercent < 80
                          ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                          : 'bg-gradient-to-r from-lernex-green to-emerald-400'
                      }`}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Priority Indicator - Only show in Mix mode */}
        {!isAllMode && sortedSubjects.length > 0 && (() => {
          const topPriority = sortedSubjects[0];
          const acc = accuracyBySubject[topPriority];
          const needsWork = acc && acc.total > 0 && (acc.correct / acc.total) < 0.7;

          if (needsWork) {
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mt-5 rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/90 to-orange-50/70 px-4 py-3.5 shadow-sm dark:border-amber-400/20 dark:from-amber-950/30 dark:to-orange-950/20"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-400 text-white shadow-md">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Focus Area
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                      {topPriority} needs more practice
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          }
        })()}
      </motion.div>
    );
  }

  if (!subject) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -6, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="group rounded-3xl border border-white/40 bg-gradient-to-br from-white/90 to-white/70 p-6 shadow-xl backdrop-blur-xl dark:border-white/10 dark:from-white/10 dark:to-white/5"
      >
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: 360 }}
            transition={{ duration: 0.6 }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-lernex-green to-emerald-400 text-white shadow-lg dark:from-lernex-green/80 dark:to-emerald-400/80"
          >
            <Map className="h-6 w-6" />
          </motion.div>
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">Learning Path</h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">Track your journey</p>
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-5 rounded-2xl border border-dashed border-neutral-300/60 bg-neutral-50/60 px-4 py-6 text-center text-sm text-neutral-600 dark:border-white/15 dark:bg-white/5 dark:text-neutral-400"
        >
          Select a class above to view your progress
        </motion.div>
      </motion.div>
    );
  }

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-3xl border border-white/40 bg-gradient-to-br from-white/90 to-white/70 p-6 shadow-xl backdrop-blur-xl dark:border-white/10 dark:from-white/10 dark:to-white/5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-lernex-green to-emerald-400 text-white shadow-lg">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">Learning Path</h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">Loading progress...</p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (!progressData || progressData.topicCount === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -6, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="rounded-3xl border border-white/40 bg-gradient-to-br from-white/90 to-white/70 p-6 shadow-xl backdrop-blur-xl dark:border-white/10 dark:from-white/10 dark:to-white/5"
      >
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: 360 }}
            transition={{ duration: 0.6 }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-lernex-green to-emerald-400 text-white shadow-lg"
          >
            <Map className="h-6 w-6" />
          </motion.div>
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">Learning Path</h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">Track your journey</p>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-dashed border-neutral-300/60 bg-neutral-50/60 px-4 py-6 text-center text-sm text-neutral-600 dark:border-white/15 dark:bg-white/5 dark:text-neutral-400">
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -6, scale: 1.01 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="group rounded-3xl border border-white/40 bg-gradient-to-br from-white/90 to-white/70 p-6 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:from-white/10 dark:to-white/5"
      >
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: 360, scale: 1.1 }}
            transition={{ duration: 0.6 }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-lernex-green to-emerald-400 text-white shadow-lg dark:from-lernex-green/80 dark:to-emerald-400/80"
          >
            <Map className="h-6 w-6" />
          </motion.div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">Learning Path</h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">{subject}</p>
          </div>
        </div>

        {/* Current Unit Progress */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mt-6 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Current Unit
            </span>
            <motion.span
              key={unitProgress}
              initial={{ scale: 1.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, type: "spring" }}
              className="text-sm font-bold text-lernex-green dark:text-lernex-green/90"
            >
              {unitProgress}%
            </motion.span>
          </div>
          <div className="relative h-3.5 overflow-hidden rounded-full bg-neutral-200/80 shadow-inner dark:bg-neutral-700/50">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${unitProgress}%` }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              className="relative h-full rounded-full bg-gradient-to-r from-lernex-green via-emerald-400 to-emerald-500 shadow-[0_0_16px_rgba(39,174,96,0.5)]"
            >
              <motion.div
                animate={{ x: ["0%", "100%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              />
            </motion.div>
          </div>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            Unit {progressData.topicIndex} of {progressData.topicCount}
            {progressData.topicName && (
              <span className="ml-1.5 font-semibold text-neutral-700 dark:text-neutral-300">
                • {progressData.topicName}
              </span>
            )}
          </p>
        </motion.div>

        {/* Total Class Progress */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-6 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Overall Progress
            </span>
            <motion.span
              key={totalProgress}
              initial={{ scale: 1.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, type: "spring", delay: 0.1 }}
              className="text-sm font-bold text-lernex-blue dark:text-lernex-blue/90"
            >
              {totalProgress}%
            </motion.span>
          </div>
          <div className="relative h-3.5 overflow-hidden rounded-full bg-neutral-200/80 shadow-inner dark:bg-neutral-700/50">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${totalProgress}%` }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
              className="relative h-full rounded-full bg-gradient-to-r from-lernex-blue via-indigo-400 to-lernex-purple shadow-[0_0_16px_rgba(47,128,237,0.5)]"
            >
              <motion.div
                animate={{ x: ["0%", "100%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              />
            </motion.div>
          </div>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            {progressData.completed} of {progressData.total} lessons completed
          </p>
        </motion.div>

        {/* Current Position Indicator */}
        {progressData.currentLabel && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-6 rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/90 to-green-50/70 px-4 py-3.5 shadow-sm dark:border-emerald-400/20 dark:from-emerald-950/30 dark:to-green-950/20"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-lernex-green to-emerald-400 text-white shadow-md">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Current Position
                </p>
                <p className="mt-0.5 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  {progressData.currentLabel}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* More Details Button */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsModalOpen(true)}
          className="group mt-6 flex w-full items-center justify-between rounded-2xl border border-lernex-green/50 bg-gradient-to-r from-lernex-green/15 to-emerald-400/15 px-5 py-3.5 font-semibold text-lernex-green shadow-lg transition-all hover:border-lernex-green/70 hover:from-lernex-green/20 hover:to-emerald-400/20 hover:shadow-xl dark:border-lernex-green/40 dark:from-lernex-green/20 dark:to-emerald-400/20 dark:text-lernex-green/95 dark:hover:border-lernex-green/60"
        >
          <span className="text-sm">View Full Learning Path</span>
          <motion.div
            whileHover={{ x: 4 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <ChevronRight className="h-5 w-5" />
          </motion.div>
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
