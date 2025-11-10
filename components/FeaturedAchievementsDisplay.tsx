"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Sparkles } from "lucide-react";
import { getBadgeById, TIER_THEMES, type BadgeTier } from "@/lib/badges";

type FeaturedAchievementsDisplayProps = {
  achievementIds: string[];
  userStats?: {
    points: number;
    streak: number;
    lessons: number;
    accuracy: number;
    perfect?: number;
    activeDays?: number;
    questions?: number;
  };
};

export default function FeaturedAchievementsDisplay({
  achievementIds,
  userStats,
}: FeaturedAchievementsDisplayProps) {
  if (!achievementIds || achievementIds.length === 0) {
    return null;
  }

  const badges = achievementIds
    .map((id) => getBadgeById(id))
    .filter((badge): badge is NonNullable<typeof badge> => badge !== null)
    .slice(0, 6);

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <h3 className="mb-4 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
        <Sparkles className="h-4 w-4 text-amber-500" />
        Featured Achievements
      </h3>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {badges.map((badge, index) => {
            const tierTheme = TIER_THEMES[badge.tier as BadgeTier];
            const Icon = badge.icon;

            // Get current value for progress if stats provided
            const current = userStats?.[badge.statKey as keyof typeof userStats] ?? badge.target;
            const progress = Math.min(100, Math.round((Number(current) / badge.target) * 100));

            return (
              <motion.div
                key={badge.id}
                initial={{ opacity: 0, scale: 0.8, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -30 }}
                transition={{
                  delay: index * 0.1,
                  type: "spring",
                  stiffness: 200,
                  damping: 20,
                }}
                whileHover={{ scale: 1.05, y: -8 }}
                className="group relative overflow-hidden rounded-2xl border border-white/40 bg-gradient-to-br from-white/90 via-white/80 to-white/70 p-5 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-2xl dark:border-neutral-800 dark:from-neutral-900/90 dark:via-neutral-900/80 dark:to-neutral-900/70"
              >
                {/* Animated gradient background */}
                <motion.div
                  className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${
                      badge.tier === "Mythic"
                        ? "rgba(16, 185, 129, 0.15)"
                        : badge.tier === "Platinum"
                        ? "rgba(99, 102, 241, 0.15)"
                        : badge.tier === "Gold"
                        ? "rgba(234, 179, 8, 0.15)"
                        : badge.tier === "Silver"
                        ? "rgba(148, 163, 184, 0.15)"
                        : "rgba(245, 158, 11, 0.15)"
                    }, transparent 70%)`,
                  }}
                />

                {/* Sparkle particles on hover */}
                <motion.div
                  className="pointer-events-none absolute inset-0"
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                >
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute h-1 w-1 rounded-full bg-amber-400/60"
                      style={{
                        left: `${20 + i * 15}%`,
                        top: `${10 + i * 10}%`,
                      }}
                      animate={{
                        scale: [0, 1, 0],
                        opacity: [0, 1, 0],
                        rotate: [0, 180, 360],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </motion.div>

                <div className="relative z-10">
                  {/* Icon and Tier Badge */}
                  <div className="mb-3 flex items-center gap-3">
                    <motion.div
                      whileHover={{ rotate: [0, -10, 10, -10, 0], scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${tierTheme.icon} shadow-md ${tierTheme.glow}`}
                    >
                      <Icon className="h-6 w-6" />
                    </motion.div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold shadow-sm ${tierTheme.chip}`}
                    >
                      {badge.tier}
                    </span>
                  </div>

                  {/* Badge Info */}
                  <h4 className="mb-1.5 text-base font-bold text-neutral-900 dark:text-white">
                    {badge.title}
                  </h4>
                  <p className="mb-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {badge.description}
                  </p>

                  {/* Progress Bar */}
                  {userStats && progress < 100 && (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-neutral-500 dark:text-neutral-400">Progress</span>
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                          {progress}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-neutral-200/80 dark:bg-neutral-800">
                        <motion.div
                          className={`h-full rounded-full ${
                            badge.tier === "Mythic"
                              ? "bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500"
                              : badge.tier === "Platinum"
                              ? "bg-gradient-to-r from-indigo-400 to-indigo-500"
                              : badge.tier === "Gold"
                              ? "bg-gradient-to-r from-yellow-400 to-yellow-500"
                              : badge.tier === "Silver"
                              ? "bg-gradient-to-r from-slate-400 to-slate-500"
                              : "bg-gradient-to-r from-amber-400 to-amber-500"
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 1, delay: index * 0.1 + 0.3, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Unlocked Badge - if progress is 100% */}
                  {progress >= 100 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 + 0.4, type: "spring", stiffness: 300 }}
                      className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      <Trophy className="h-3.5 w-3.5" />
                      Unlocked!
                    </motion.div>
                  )}
                </div>

                {/* Shine effect on hover */}
                <motion.div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)",
                  }}
                  animate={{
                    x: ["-100%", "200%"],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    repeatDelay: 3,
                  }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
