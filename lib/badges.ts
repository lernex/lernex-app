import type { LucideIcon } from "lucide-react";
import {
  Award,
  BadgeCheck,
  BookOpen,
  CalendarCheck2,
  Compass,
  Crown,
  Flame,
  Medal,
  Rocket,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
  TrendingUp,
} from "lucide-react";

export type BadgeTier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Mythic";

export type BadgeDefinition = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tier: BadgeTier;
  category: string;
};

export const TIER_THEMES: Record<BadgeTier, { chip: string; icon: string; glow: string }> = {
  Bronze: {
    chip: "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-900 dark:from-amber-500/20 dark:to-amber-600/30 dark:text-amber-100 border border-amber-300/50 dark:border-amber-500/30",
    icon: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/30 dark:text-amber-200",
    glow: "shadow-amber-500/20 dark:shadow-amber-400/30",
  },
  Silver: {
    chip: "bg-gradient-to-br from-slate-200 to-slate-300 text-slate-900 dark:from-slate-500/30 dark:to-slate-600/40 dark:text-slate-100 border border-slate-300/50 dark:border-slate-500/30",
    icon: "bg-slate-300/50 text-slate-700 dark:bg-slate-500/30 dark:text-slate-200",
    glow: "shadow-slate-400/20 dark:shadow-slate-400/30",
  },
  Gold: {
    chip: "bg-gradient-to-br from-yellow-200 to-yellow-300 text-yellow-900 dark:from-yellow-500/30 dark:to-yellow-600/40 dark:text-yellow-100 border border-yellow-300/50 dark:border-yellow-500/30",
    icon: "bg-yellow-300/50 text-yellow-700 dark:bg-yellow-500/30 dark:text-yellow-200",
    glow: "shadow-yellow-500/30 dark:shadow-yellow-400/40",
  },
  Platinum: {
    chip: "bg-gradient-to-br from-indigo-200 to-indigo-300 text-indigo-900 dark:from-indigo-500/25 dark:to-indigo-600/35 dark:text-indigo-100 border border-indigo-300/50 dark:border-indigo-500/30",
    icon: "bg-indigo-300/40 text-indigo-700 dark:bg-indigo-500/30 dark:text-indigo-200",
    glow: "shadow-indigo-500/30 dark:shadow-indigo-400/40",
  },
  Mythic: {
    chip: "bg-gradient-to-br from-emerald-200 to-emerald-300 text-emerald-900 dark:from-emerald-500/25 dark:to-emerald-600/35 dark:text-emerald-100 border border-emerald-300/50 dark:border-emerald-500/30",
    icon: "bg-gradient-to-br from-emerald-400/40 via-teal-400/30 to-emerald-500/40 text-emerald-800 dark:from-emerald-500/30 dark:via-teal-400/30 dark:to-emerald-600/40 dark:text-emerald-100",
    glow: "shadow-emerald-500/40 dark:shadow-emerald-400/50",
  },
};

// Comprehensive badge registry - all badges in the system
export const ALL_BADGES: Record<string, BadgeDefinition & { target: number; statKey: string }> = {
  // Progress Ladder
  "points-100": {
    id: "points-100",
    title: "Spark Starter",
    description: "Earn 100 total points",
    icon: Sparkles,
    tier: "Bronze",
    category: "Progress Ladder",
    target: 100,
    statKey: "points",
  },
  "points-500": {
    id: "points-500",
    title: "Point Collector",
    description: "Reach 500 points",
    icon: Trophy,
    tier: "Silver",
    category: "Progress Ladder",
    target: 500,
    statKey: "points",
  },
  "points-1000": {
    id: "points-1000",
    title: "Power Earner",
    description: "Collect 1,000 lifetime points",
    icon: Award,
    tier: "Gold",
    category: "Progress Ladder",
    target: 1000,
    statKey: "points",
  },
  "points-2500": {
    id: "points-2500",
    title: "Point Tycoon",
    description: "Stack up 2,500 lifetime points",
    icon: Crown,
    tier: "Platinum",
    category: "Progress Ladder",
    target: 2500,
    statKey: "points",
  },
  "points-5000": {
    id: "points-5000",
    title: "Point Powerhouse",
    description: "Accumulate 5,000 lifetime points",
    icon: Medal,
    tier: "Platinum",
    category: "Progress Ladder",
    target: 5000,
    statKey: "points",
  },
  "points-10000": {
    id: "points-10000",
    title: "Point Phenomenon",
    description: "Surpass 10,000 lifetime points",
    icon: Trophy,
    tier: "Mythic",
    category: "Progress Ladder",
    target: 10000,
    statKey: "points",
  },
  "lessons-1": {
    id: "lessons-1",
    title: "First Steps",
    description: "Complete your first lesson",
    icon: BadgeCheck,
    tier: "Bronze",
    category: "Progress Ladder",
    target: 1,
    statKey: "lessons",
  },
  "lessons-10": {
    id: "lessons-10",
    title: "Lesson Grinder",
    description: "Complete 10 lessons",
    icon: BookOpen,
    tier: "Silver",
    category: "Progress Ladder",
    target: 10,
    statKey: "lessons",
  },
  "lessons-25": {
    id: "lessons-25",
    title: "Course Climber",
    description: "Finish 25 lessons",
    icon: Rocket,
    tier: "Gold",
    category: "Progress Ladder",
    target: 25,
    statKey: "lessons",
  },
  "lessons-50": {
    id: "lessons-50",
    title: "Curriculum Conqueror",
    description: "Complete 50 lessons",
    icon: Medal,
    tier: "Platinum",
    category: "Progress Ladder",
    target: 50,
    statKey: "lessons",
  },
  "lessons-100": {
    id: "lessons-100",
    title: "Centurion Learner",
    description: "Celebrate 100 completed lessons",
    icon: Trophy,
    tier: "Mythic",
    category: "Progress Ladder",
    target: 100,
    statKey: "lessons",
  },

  // Momentum Makers
  "streak-3": {
    id: "streak-3",
    title: "Sparked Streak",
    description: "Keep a 3-day streak alive",
    icon: Flame,
    tier: "Bronze",
    category: "Momentum Makers",
    target: 3,
    statKey: "streak",
  },
  "streak-7": {
    id: "streak-7",
    title: "Streak Keeper",
    description: "Maintain a 7-day streak",
    icon: Flame,
    tier: "Silver",
    category: "Momentum Makers",
    target: 7,
    statKey: "streak",
  },
  "streak-14": {
    id: "streak-14",
    title: "Momentum Train",
    description: "Stay on track for 14 days",
    icon: Timer,
    tier: "Gold",
    category: "Momentum Makers",
    target: 14,
    statKey: "streak",
  },
  "streak-30": {
    id: "streak-30",
    title: "Relentless Rhythm",
    description: "Hit a 30-day streak",
    icon: Flame,
    tier: "Platinum",
    category: "Momentum Makers",
    target: 30,
    statKey: "streak",
  },
  "streak-60": {
    id: "streak-60",
    title: "Daily Dynamo",
    description: "Push your streak to 60 days",
    icon: Flame,
    tier: "Mythic",
    category: "Momentum Makers",
    target: 60,
    statKey: "streak",
  },

  // Precision Plays
  "accuracy-75": {
    id: "accuracy-75",
    title: "Sharpening Aim",
    description: "Reach 75% accuracy",
    icon: Target,
    tier: "Bronze",
    category: "Precision Plays",
    target: 75,
    statKey: "accuracy",
  },
  "accuracy-80": {
    id: "accuracy-80",
    title: "True North",
    description: "Hold steady at 80% accuracy",
    icon: Compass,
    tier: "Silver",
    category: "Precision Plays",
    target: 80,
    statKey: "accuracy",
  },
  "accuracy-85": {
    id: "accuracy-85",
    title: "Bullseye Build",
    description: "Climb to 85% accuracy",
    icon: Target,
    tier: "Gold",
    category: "Precision Plays",
    target: 85,
    statKey: "accuracy",
  },
  "accuracy-90": {
    id: "accuracy-90",
    title: "Sharpshooter",
    description: "Reach 90% accuracy",
    icon: Target,
    tier: "Platinum",
    category: "Precision Plays",
    target: 90,
    statKey: "accuracy",
  },
  "accuracy-95": {
    id: "accuracy-95",
    title: "Pinpoint Pro",
    description: "Maintain 95% accuracy",
    icon: Star,
    tier: "Platinum",
    category: "Precision Plays",
    target: 95,
    statKey: "accuracy",
  },
  "perfect-10": {
    id: "perfect-10",
    title: "Perfect Run",
    description: "Complete 10 perfect lessons",
    icon: Sparkles,
    tier: "Gold",
    category: "Precision Plays",
    target: 10,
    statKey: "perfect",
  },
  "perfect-50": {
    id: "perfect-50",
    title: "Perfect Master",
    description: "Achieve 50 perfect lessons",
    icon: Crown,
    tier: "Mythic",
    category: "Precision Plays",
    target: 50,
    statKey: "perfect",
  },

  // Weekly Rhythm
  "active-days-4": {
    id: "active-days-4",
    title: "Weekday Warrior",
    description: "Study on 4 days in one week",
    icon: CalendarCheck2,
    tier: "Silver",
    category: "Weekly Rhythm",
    target: 4,
    statKey: "activeDays",
  },
  "active-days-7": {
    id: "active-days-7",
    title: "Full Week Finisher",
    description: "Study every day of the week",
    icon: CalendarCheck2,
    tier: "Platinum",
    category: "Weekly Rhythm",
    target: 7,
    statKey: "activeDays",
  },

  // Legendary
  "questions-10000": {
    id: "questions-10000",
    title: "Knowledge Titan",
    description: "Answer 10,000 questions",
    icon: Crown,
    tier: "Mythic",
    category: "Legend Status",
    target: 10000,
    statKey: "questions",
  },
};

/**
 * Get badge information by ID
 */
export function getBadgeById(badgeId: string): (BadgeDefinition & { target: number; statKey: string }) | null {
  return ALL_BADGES[badgeId] || null;
}

/**
 * Check if a badge is unlocked based on user stats
 */
export function isBadgeUnlocked(
  badgeId: string,
  stats: {
    points?: number;
    streak?: number;
    lessons?: number;
    accuracy?: number;
    perfect?: number;
    activeDays?: number;
    questions?: number;
  }
): boolean {
  const badge = ALL_BADGES[badgeId];
  if (!badge) return false;

  const currentValue = stats[badge.statKey as keyof typeof stats] ?? 0;
  return currentValue >= badge.target;
}

/**
 * Get progress toward a badge (0-100)
 */
export function getBadgeProgress(
  badgeId: string,
  stats: {
    points?: number;
    streak?: number;
    lessons?: number;
    accuracy?: number;
    perfect?: number;
    activeDays?: number;
    questions?: number;
  }
): number {
  const badge = ALL_BADGES[badgeId];
  if (!badge) return 0;

  const currentValue = stats[badge.statKey as keyof typeof stats] ?? 0;
  const progress = Math.min(100, Math.round((currentValue / badge.target) * 100));
  return progress;
}
