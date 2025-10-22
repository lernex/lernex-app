"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  X,
  Flame,
  Star,
  Trophy,
  BookOpen,
  Calendar,
  TrendingUp,
  Award,
  Target,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type UserProfileData = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  streak: number | null;
  points: number | null;
  lastStudyDate: string | null;
  interests: string[];
  createdAt: string | null;
  stats: {
    totalQuizzes: number | null;
    totalLessons: number | null;
    averageAccuracy: number | null;
    longestStreak: number | null;
    totalFriends: number;
    joinedDaysAgo: number;
  };
  recentActivity: Array<{
    subject: string;
    level: string;
    accuracy: number;
    createdAt: string;
  }>;
};

const avatarPalette = [
  "bg-gradient-to-br from-lernex-blue/80 to-lernex-purple/70",
  "bg-gradient-to-br from-emerald-500/80 to-teal-500/70",
  "bg-gradient-to-br from-amber-400/80 to-orange-500/70",
  "bg-gradient-to-br from-rose-400/80 to-pink-500/70",
  "bg-gradient-to-br from-sky-400/80 to-cyan-500/70",
  "bg-gradient-to-br from-indigo-400/80 to-blue-600/70",
];

function cn(...classes: Array<string | null | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

function displayName(
  username: string | null,
  fullName: string | null,
  fallback: string
) {
  const trimmedFullName = fullName?.trim();
  const trimmedUsername = username?.trim();
  if (trimmedFullName && trimmedFullName.length > 0) return trimmedFullName;
  if (trimmedUsername && trimmedUsername.length > 0) return trimmedUsername;
  return fallback;
}

function Avatar(props: { name: string; src: string | null; size?: number }) {
  const { name, src, size = 96 } = props;
  const label = name && name.trim().length > 0 ? name.trim() : "Learner";
  const initial = label.charAt(0).toUpperCase();
  const paletteIndex = label.charCodeAt(0) % avatarPalette.length;
  if (src) {
    return (
      <div
        className="relative overflow-hidden rounded-full ring-4 ring-white/50 dark:ring-neutral-800/50"
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt={label}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full text-2xl font-semibold text-white shadow-lg ring-4 ring-white/50 dark:ring-neutral-800/50",
        avatarPalette[paletteIndex]
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

type UserProfileModalProps = {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
};

export default function UserProfileModal({
  userId,
  isOpen,
  onClose,
}: UserProfileModalProps) {
  const [data, setData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) {
      setData(null);
      setError(null);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/users/${userId}/profile`, {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to load profile");
        }
        const json = (await response.json()) as UserProfileData;
        setData(json);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Failed to load profile"
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userId, isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-neutral-200/70 bg-gradient-to-br from-white via-slate-50 to-white shadow-2xl dark:border-neutral-800 dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200/70 bg-white/80 text-neutral-600 shadow-lg backdrop-blur-sm transition hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              {loading && (
                <div className="flex min-h-[400px] items-center justify-center p-8">
                  <div className="flex items-center gap-3 text-neutral-600 dark:text-neutral-300">
                    <Loader2 className="h-5 w-5 animate-spin text-lernex-blue" />
                    <span>Loading profile...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex min-h-[400px] items-center justify-center p-8">
                  <div className="text-center">
                    <Sparkles className="mx-auto mb-3 h-10 w-10 text-rose-500" />
                    <p className="text-sm text-neutral-600 dark:text-neutral-300">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              {!loading && !error && data && (
                <div className="p-8">
                  {/* Header with avatar and basic info */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.4 }}
                    className="relative mb-8 text-center"
                  >
                    {/* Background decoration */}
                    <div className="pointer-events-none absolute inset-x-0 -top-8 h-48 bg-gradient-to-b from-lernex-blue/10 via-lernex-purple/5 to-transparent blur-3xl dark:from-lernex-blue/20 dark:via-lernex-purple/10" />

                    <div className="relative">
                      <Avatar
                        name={displayName(
                          data.username,
                          data.fullName,
                          "Learner"
                        )}
                        src={data.avatarUrl}
                        size={96}
                      />
                      <h2 className="mt-4 text-2xl font-bold text-neutral-900 dark:text-white">
                        {displayName(data.username, data.fullName, "Learner")}
                      </h2>
                      {data.username && (
                        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                          @{data.username}
                        </p>
                      )}
                      {data.bio && (
                        <p className="mt-3 mx-auto max-w-md text-sm text-neutral-600 dark:text-neutral-300">
                          {data.bio}
                        </p>
                      )}
                    </div>
                  </motion.div>

                  {/* Stats grid */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                    className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4"
                  >
                    {data.streak !== null && (
                      <div className="group rounded-2xl border border-neutral-200/70 bg-gradient-to-br from-white to-orange-50/30 p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-neutral-800 dark:from-[#101a2c] dark:to-orange-900/10">
                        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg">
                          <Flame className="h-5 w-5" />
                        </div>
                        <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                          {data.streak}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          Day Streak
                        </div>
                      </div>
                    )}

                    {data.points !== null && (
                      <div className="group rounded-2xl border border-neutral-200/70 bg-gradient-to-br from-white to-amber-50/30 p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-neutral-800 dark:from-[#101a2c] dark:to-amber-900/10">
                        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg">
                          <Star className="h-5 w-5" />
                        </div>
                        <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                          {data.points}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          Total Points
                        </div>
                      </div>
                    )}

                    {data.stats.totalQuizzes !== null && (
                      <div className="group rounded-2xl border border-neutral-200/70 bg-gradient-to-br from-white to-purple-50/30 p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-neutral-800 dark:from-[#101a2c] dark:to-purple-900/10">
                        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-lg">
                          <BookOpen className="h-5 w-5" />
                        </div>
                        <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                          {data.stats.totalQuizzes}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          Quizzes
                        </div>
                      </div>
                    )}

                    <div className="group rounded-2xl border border-neutral-200/70 bg-gradient-to-br from-white to-emerald-50/30 p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-neutral-800 dark:from-[#101a2c] dark:to-emerald-900/10">
                      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg">
                        <Users className="h-5 w-5" />
                      </div>
                      <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                        {data.stats.totalFriends}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        Friends
                      </div>
                    </div>
                  </motion.div>

                  {/* Additional stats */}
                  {(data.stats.averageAccuracy !== null || data.stats.longestStreak !== null) && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.4 }}
                      className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3"
                    >
                      {data.stats.averageAccuracy !== null && (
                        <div className="flex items-center gap-3 rounded-xl border border-neutral-200/60 bg-white/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/30">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 text-white">
                            <Target className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                              {data.stats.averageAccuracy}%
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">
                              Avg Accuracy
                            </div>
                          </div>
                        </div>
                      )}

                      {data.stats.longestStreak !== null && (
                        <div className="flex items-center gap-3 rounded-xl border border-neutral-200/60 bg-white/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/30">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-rose-400 to-rose-600 text-white">
                            <Trophy className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                              {data.stats.longestStreak}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">
                              Longest Streak
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3 rounded-xl border border-neutral-200/60 bg-white/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/30">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 text-white">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                            {data.stats.joinedDaysAgo}d
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            Member Since
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Interests */}
                  {data.interests.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.4 }}
                      className="mb-6"
                    >
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
                        <Sparkles className="h-4 w-4 text-lernex-blue" />
                        Study Interests
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {data.interests.map((interest) => (
                          <span
                            key={interest}
                            className="inline-flex items-center gap-1.5 rounded-full border border-lernex-blue/30 bg-gradient-to-r from-lernex-blue/10 to-lernex-purple/10 px-3 py-1.5 text-xs font-medium text-lernex-blue transition hover:from-lernex-blue/20 hover:to-lernex-purple/20 dark:text-lernex-blue/90"
                          >
                            {interest}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Recent activity */}
                  {data.recentActivity.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                    >
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        Recent Activity
                      </h3>
                      <div className="space-y-2">
                        {data.recentActivity.slice(0, 5).map((activity, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between rounded-xl border border-neutral-200/60 bg-white/50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/30"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-lernex-blue/20 to-lernex-purple/20 text-lernex-blue dark:from-lernex-blue/30 dark:to-lernex-purple/30">
                                <Award className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="font-medium text-neutral-900 dark:text-white">
                                  {activity.subject}
                                </div>
                                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                                  Level {activity.level} • {activity.accuracy}% accuracy
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
