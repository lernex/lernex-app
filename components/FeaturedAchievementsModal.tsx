"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Trophy, Sparkles, Check, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ALL_BADGES,
  TIER_THEMES,
  isBadgeUnlocked,
  type BadgeTier,
} from "@/lib/badges";

type FeaturedAchievementsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  currentFeatured: string[];
  onSave: (selected: string[]) => Promise<void>;
  userStats: {
    points: number;
    streak: number;
    lessons: number;
    accuracy: number;
    perfect?: number;
    activeDays?: number;
    questions?: number;
  };
};

export default function FeaturedAchievementsModal({
  isOpen,
  onClose,
  currentFeatured,
  onSave,
  userStats,
}: FeaturedAchievementsModalProps) {
  const [selected, setSelected] = useState<string[]>(currentFeatured);
  const [saving, setSaving] = useState(false);

  // Update selected when currentFeatured changes
  useEffect(() => {
    setSelected(currentFeatured);
  }, [currentFeatured, isOpen]);

  // Get unlocked badges
  const unlockedBadges = useMemo(() => {
    return Object.values(ALL_BADGES).filter((badge) =>
      isBadgeUnlocked(badge.id, userStats)
    );
  }, [userStats]);

  // Group unlocked badges by category
  const badgesByCategory = useMemo(() => {
    const groups: Record<string, typeof unlockedBadges> = {};
    unlockedBadges.forEach((badge) => {
      if (!groups[badge.category]) {
        groups[badge.category] = [];
      }
      groups[badge.category].push(badge);
    });
    return groups;
  }, [unlockedBadges]);

  const toggleBadge = (badgeId: string) => {
    if (selected.includes(badgeId)) {
      setSelected(selected.filter((id) => id !== badgeId));
    } else if (selected.length < 6) {
      setSelected([...selected, badgeId]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selected);
      onClose();
    } catch (error) {
      console.error("Failed to save featured achievements:", error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-white via-slate-50/90 to-white shadow-2xl dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c] dark:border-neutral-800"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 border-b border-neutral-200/60 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-lernex-blue/20 to-lernex-purple/20">
                  <Trophy className="h-5 w-5 text-lernex-blue dark:text-lernex-blue/80" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                    Featured Achievements
                  </h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Select up to 6 achievements to showcase on your profile ({selected.length}/6)
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto p-6" style={{ maxHeight: "calc(90vh - 180px)" }}>
            {unlockedBadges.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <Lock className="h-8 w-8 text-neutral-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
                  No Achievements Yet
                </h3>
                <p className="max-w-md text-sm text-neutral-600 dark:text-neutral-400">
                  Complete lessons and maintain your streak to unlock achievements that you can
                  showcase on your profile!
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(badgesByCategory).map(([category, badges]) => (
                  <div key={category}>
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                      <Sparkles className="h-4 w-4 text-lernex-blue" />
                      {category}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {badges.map((badge) => {
                        const isSelected = selected.includes(badge.id);
                        const tierTheme = TIER_THEMES[badge.tier as BadgeTier];
                        const Icon = badge.icon;

                        return (
                          <motion.button
                            key={badge.id}
                            onClick={() => toggleBadge(badge.id)}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            className={`group relative overflow-hidden rounded-2xl border-2 p-4 text-left transition-all ${
                              isSelected
                                ? "border-lernex-blue bg-lernex-blue/10 shadow-lg dark:border-lernex-blue/60 dark:bg-lernex-blue/20"
                                : "border-neutral-200/70 bg-white/80 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-neutral-600"
                            }`}
                          >
                            {/* Selection indicator */}
                            <AnimatePresence>
                              {isSelected && (
                                <motion.div
                                  initial={{ scale: 0, rotate: -180 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  exit={{ scale: 0, rotate: 180 }}
                                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                  className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-lernex-blue text-white shadow-lg"
                                >
                                  <Check className="h-4 w-4" />
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Tier badge */}
                            <div className="mb-3 flex items-center gap-2">
                              <div
                                className={`flex h-10 w-10 items-center justify-center rounded-xl ${tierTheme.icon} shadow-sm`}
                              >
                                <Icon className="h-5 w-5" />
                              </div>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tierTheme.chip}`}
                              >
                                {badge.tier}
                              </span>
                            </div>

                            {/* Badge info */}
                            <h4 className="mb-1 font-bold text-neutral-900 dark:text-white">
                              {badge.title}
                            </h4>
                            <p className="text-xs text-neutral-600 dark:text-neutral-400">
                              {badge.description}
                            </p>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 border-t border-neutral-200/60 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/95">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {selected.length === 0
                  ? "Select achievements to feature"
                  : selected.length === 6
                  ? "Maximum selected"
                  : `${6 - selected.length} more slot${6 - selected.length === 1 ? "" : "s"} available`}
              </p>
              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="rounded-xl border-2 border-neutral-200 bg-white px-6 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-xl bg-gradient-to-r from-lernex-blue to-lernex-purple px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-shadow hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? "Saving..." : "Save Selection"}
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
