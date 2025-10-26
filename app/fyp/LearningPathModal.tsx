"use client";

import { motion } from "framer-motion";
import { X, CheckCircle2, Circle, Loader2, MapPin, Target, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

type SubtopicData = {
  name: string;
  completed?: boolean;
  mini_lessons?: number;
};

type TopicData = {
  name: string;
  subtopics: SubtopicData[];
};

type PathData = {
  topics: TopicData[];
};

type StateData = {
  subject: string;
  path: PathData;
  next_topic: string | null;
};

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

type LearningPathModalProps = {
  subject: string;
  onClose: () => void;
};

export default function LearningPathModal({ subject, onClose }: LearningPathModalProps) {
  const [stateData, setStateData] = useState<StateData | null>(null);
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch both state and progress data
    Promise.all([
      fetch(`/api/user/state?subject=${encodeURIComponent(subject)}`).then((r) => r.json()),
      fetch(`/api/fyp/progress?subject=${encodeURIComponent(subject)}`).then((r) => r.json()),
    ])
      .then(([state, progress]) => {
        setStateData(state);
        setProgressData(progress);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });

    // Prevent body scroll when modal is open
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [subject]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getCurrentKey = () => {
    if (progressData?.topicName && progressData?.subtopicName) {
      return `${progressData.topicName} > ${progressData.subtopicName}`;
    }
    return null;
  };

  const isCompleted = (topicName: string, subtopicName: string) => {
    const key = `${topicName} > ${subtopicName}`;
    // Check if it's before the current position
    if (!stateData || !progressData) return false;

    const topics = stateData.path?.topics || [];
    const currentTopicIdx = progressData.topicIndex - 1;
    const currentSubtopicIdx = progressData.subtopicIndex - 1;

    for (let i = 0; i < topics.length; i++) {
      const topic = topics[i];
      if (!topic) continue;

      for (let j = 0; j < topic.subtopics.length; j++) {
        const subtopic = topic.subtopics[j];
        if (!subtopic) continue;

        const itemKey = `${topic.name} > ${subtopic.name}`;
        if (itemKey === key) {
          // Found the item, check if it's before current position
          if (i < currentTopicIdx) return true;
          if (i === currentTopicIdx && j < currentSubtopicIdx) return true;
          return subtopic.completed || false;
        }
      }
    }
    return false;
  };

  const isCurrent = (topicName: string, subtopicName: string) => {
    const key = `${topicName} > ${subtopicName}`;
    return key === getCurrentKey();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-[32px] border border-white/20 bg-white/95 shadow-[0_60px_180px_-80px_rgba(0,0,0,0.5)] backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-900/95"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-neutral-200/50 bg-white/80 backdrop-blur-xl dark:border-neutral-700/50 dark:bg-neutral-900/80 px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
                Learning Path Map
              </h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                {subject}
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              <X className="h-5 w-5" />
            </motion.button>
          </div>

          {/* Progress Summary */}
          {progressData && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6 grid grid-cols-3 gap-4"
            >
              <div className="rounded-2xl border border-lernex-blue/30 bg-lernex-blue/10 p-4 dark:border-lernex-blue/20 dark:bg-lernex-blue/5">
                <div className="flex items-center gap-2 text-lernex-blue dark:text-lernex-blue/80">
                  <Target className="h-4 w-4" />
                  <span className="text-xs font-medium">Total Progress</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-lernex-blue dark:text-lernex-blue/90">
                  {progressData.percent}%
                </div>
                <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  {progressData.completed} / {progressData.total} lessons
                </div>
              </div>

              <div className="rounded-2xl border border-lernex-green/30 bg-lernex-green/10 p-4 dark:border-lernex-green/20 dark:bg-lernex-green/5">
                <div className="flex items-center gap-2 text-lernex-green dark:text-lernex-green/80">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium">Current Unit</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-lernex-green dark:text-lernex-green/90">
                  {progressData.topicPercent}%
                </div>
                <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  Unit {progressData.topicIndex} / {progressData.topicCount}
                </div>
              </div>

              <div className="rounded-2xl border border-lernex-purple/30 bg-lernex-purple/10 p-4 dark:border-lernex-purple/20 dark:bg-lernex-purple/5">
                <div className="flex items-center gap-2 text-lernex-purple dark:text-lernex-purple/80">
                  <MapPin className="h-4 w-4" />
                  <span className="text-xs font-medium">Position</span>
                </div>
                <div className="mt-2 text-sm font-bold text-lernex-purple dark:text-lernex-purple/90">
                  {progressData.topicName}
                </div>
                <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  {progressData.subtopicName}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-8" style={{ maxHeight: "calc(85vh - 220px)" }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-lernex-blue" />
            </div>
          ) : stateData?.path?.topics && stateData.path.topics.length > 0 ? (
            <div className="space-y-6">
              {stateData.path.topics.map((topic, topicIdx) => {
                const isCurrentTopic = progressData && topicIdx === progressData.topicIndex - 1;
                const isCompletedTopic = progressData && topicIdx < progressData.topicIndex - 1;
                const topicCompletedCount = topic.subtopics.filter(
                  (sub) => isCompleted(topic.name, sub.name)
                ).length;
                const topicProgress = topic.subtopics.length > 0
                  ? Math.round((topicCompletedCount / topic.subtopics.length) * 100)
                  : 0;

                return (
                  <motion.div
                    key={topicIdx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: topicIdx * 0.05 }}
                    className="relative"
                  >
                    {/* Topic Header */}
                    <div
                      className={`rounded-2xl border p-5 transition-all ${
                        isCurrentTopic
                          ? "border-lernex-green/50 bg-gradient-to-r from-lernex-green/10 to-emerald-400/10 shadow-lg shadow-lernex-green/10 dark:border-lernex-green/40 dark:from-lernex-green/15 dark:to-emerald-400/15"
                          : isCompletedTopic
                          ? "border-lernex-blue/40 bg-lernex-blue/5 dark:border-lernex-blue/30 dark:bg-lernex-blue/10"
                          : "border-neutral-200/60 bg-white/60 dark:border-neutral-700/60 dark:bg-neutral-800/60"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-lg">
                            <span className="text-lg font-bold">{topicIdx + 1}</span>
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                              {topic.name}
                            </h3>
                            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                              {topic.subtopics.length} lesson{topic.subtopics.length !== 1 ? "s" : ""}
                              {" • "}
                              {topicCompletedCount} completed
                            </p>
                            {/* Topic Progress Bar */}
                            <div className="mt-3 w-48">
                              <div className="h-2 overflow-hidden rounded-full bg-neutral-200/70 dark:bg-neutral-700/50">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${topicProgress}%` }}
                                  transition={{ duration: 0.6, delay: topicIdx * 0.05 + 0.2 }}
                                  className={`h-full rounded-full ${
                                    isCurrentTopic
                                      ? "bg-gradient-to-r from-lernex-green to-emerald-400"
                                      : "bg-gradient-to-r from-lernex-blue to-indigo-400"
                                  }`}
                                />
                              </div>
                              <span className="mt-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                                {topicProgress}%
                              </span>
                            </div>
                          </div>
                        </div>
                        {isCurrentTopic && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", delay: 0.3 }}
                            className="rounded-full bg-lernex-green px-3 py-1 text-xs font-bold text-white shadow-lg"
                          >
                            Current
                          </motion.div>
                        )}
                        {isCompletedTopic && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", delay: 0.2 }}
                          >
                            <CheckCircle2 className="h-6 w-6 text-lernex-blue dark:text-lernex-blue/80" />
                          </motion.div>
                        )}
                      </div>

                      {/* Subtopics - Tree View */}
                      <div className="mt-6 ml-16 space-y-3">
                        {topic.subtopics.map((subtopic, subIdx) => {
                          const completed = isCompleted(topic.name, subtopic.name);
                          const current = isCurrent(topic.name, subtopic.name);

                          return (
                            <motion.div
                              key={subIdx}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: topicIdx * 0.05 + subIdx * 0.03 + 0.1 }}
                              className="relative flex items-center gap-3"
                            >
                              {/* Branch Line */}
                              <div className="absolute left-[-24px] top-1/2 h-[2px] w-6 bg-gradient-to-r from-neutral-300 to-transparent dark:from-neutral-600" />

                              {/* Status Icon */}
                              <div className="shrink-0">
                                {completed ? (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring" }}
                                  >
                                    <CheckCircle2 className="h-5 w-5 text-lernex-green dark:text-lernex-green/80" />
                                  </motion.div>
                                ) : current ? (
                                  <motion.div
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                  >
                                    <Circle className="h-5 w-5 fill-lernex-green text-lernex-green dark:fill-lernex-green/80 dark:text-lernex-green/80" />
                                  </motion.div>
                                ) : (
                                  <Circle className="h-5 w-5 text-neutral-300 dark:text-neutral-600" />
                                )}
                              </div>

                              {/* Subtopic Card */}
                              <div
                                className={`flex-1 rounded-xl border px-4 py-2.5 transition-all ${
                                  current
                                    ? "border-lernex-green/50 bg-lernex-green/10 shadow-md shadow-lernex-green/10 dark:border-lernex-green/40 dark:bg-lernex-green/20"
                                    : completed
                                    ? "border-lernex-blue/30 bg-lernex-blue/5 dark:border-lernex-blue/25 dark:bg-lernex-blue/10"
                                    : "border-neutral-200/50 bg-white/50 dark:border-neutral-700/50 dark:bg-neutral-800/50"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`text-sm font-medium ${
                                      current
                                        ? "text-lernex-green dark:text-lernex-green/90"
                                        : completed
                                        ? "text-neutral-700 dark:text-neutral-300"
                                        : "text-neutral-600 dark:text-neutral-400"
                                    }`}
                                  >
                                    {subtopic.name}
                                  </span>
                                  {current && (
                                    <span className="rounded-full bg-lernex-green/20 px-2 py-0.5 text-[10px] font-bold text-lernex-green dark:bg-lernex-green/30 dark:text-lernex-green/90">
                                      YOU ARE HERE
                                    </span>
                                  )}
                                  {subtopic.mini_lessons && (
                                    <span className="text-xs text-neutral-400 dark:text-neutral-500">
                                      {subtopic.mini_lessons} mini-lesson{subtopic.mini_lessons !== 1 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Vertical Connecting Line to Next Topic */}
                    {topicIdx < stateData.path.topics.length - 1 && (
                      <div className="absolute left-[30px] top-[calc(100%+0px)] h-6 w-[3px] bg-gradient-to-b from-neutral-300 via-neutral-200 to-transparent dark:from-neutral-600 dark:via-neutral-700" />
                    )}
                  </motion.div>
                );
              })}

              {/* Next Topic Hint */}
              {progressData?.nextLabel && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-8 rounded-2xl border border-dashed border-lernex-purple/40 bg-gradient-to-r from-lernex-purple/5 to-indigo-500/5 p-6 dark:border-lernex-purple/30 dark:from-lernex-purple/10 dark:to-indigo-500/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lernex-purple/20 text-lernex-purple dark:bg-lernex-purple/30">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Coming Up Next
                      </p>
                      <p className="mt-1 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                        {progressData.nextLabel}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full bg-neutral-100 p-6 dark:bg-neutral-800">
                <MapPin className="h-12 w-12 text-neutral-400" />
              </div>
              <p className="mt-6 text-lg font-semibold text-neutral-700 dark:text-neutral-300">
                No learning path data available
              </p>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                Start learning to build your path
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
