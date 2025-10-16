"use client";

import Link from "next/link";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  fetchUserSubjectStates,
  readCourseValue,
} from "@/lib/user-subject-state";
import { useProfileStats } from "@/app/providers/ProfileStatsProvider";

type AttemptRow = {
  subject: string | null;
  correctCount: number;
  total: number;
  createdAt: string | null;
};

type SubjectStateRow = {
  subject: string;
  course: string | null;
  mastery: number | null;
  nextTopic: string | null;
  updatedAt: string | null;
  difficulty: string | null;
};

type SubjectSummary = {
  subject: string;
  lessons: number;
  correct: number;
  total: number;
  accuracy: number | null;
};

type Badge = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  unlocked: boolean;
  progress: number;
  current: number;
  target: number;
};

type BadgeTier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Mythic";

type GroupedBadge = Badge & {
  category: string;
  tier: BadgeTier;
  order: number;
};

type BadgeGroup = {
  id: string;
  title: string;
  description: string;
  order: number;
  accentClass: string;
  headerAccentClass: string;
  badges: GroupedBadge[];
};

type BadgeCategoryKey =
  | "progress"
  | "momentum"
  | "precision"
  | "explorer"
  | "weekly";

const TIER_THEMES: Record<BadgeTier, { chip: string; icon: string }> = {
  Bronze: {
    chip:
      "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
    icon:
      "bg-amber-500/15 text-amber-600 dark:bg-amber-500/30 dark:text-amber-100",
  },
  Silver: {
    chip:
      "bg-slate-200 text-slate-900 dark:bg-slate-500/30 dark:text-slate-100",
    icon:
      "bg-slate-300/50 text-slate-700 dark:bg-slate-500/30 dark:text-slate-100",
  },
  Gold: {
    chip:
      "bg-yellow-200 text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-100",
    icon:
      "bg-yellow-300/50 text-yellow-700 dark:bg-yellow-500/30 dark:text-yellow-50",
  },
  Platinum: {
    chip:
      "bg-indigo-200 text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-100",
    icon:
      "bg-indigo-300/40 text-indigo-600 dark:bg-indigo-500/30 dark:text-indigo-100",
  },
  Mythic: {
    chip:
      "bg-emerald-200 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100",
    icon:
      "bg-emerald-300/40 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-100",
  },
};

const BADGE_CATEGORY_META: Record<
  BadgeCategoryKey,
  {
    title: string;
    description: string;
    order: number;
    accentClass: string;
    headerAccentClass: string;
  }
> = {
  progress: {
    title: "Progress Ladder",
    description: "Points and lesson milestones you’ve climbed so far.",
    order: 1,
    accentClass:
      "bg-gradient-to-br from-lernex-blue/10 via-indigo-400/10 to-sky-400/10 dark:from-lernex-blue/15 dark:via-indigo-600/10 dark:to-sky-500/10",
    headerAccentClass:
      "bg-lernex-blue/15 text-lernex-blue-900 dark:bg-lernex-blue/25 dark:text-lernex-blue-100",
  },
  momentum: {
    title: "Momentum Makers",
    description: "Habits, streaks, and weekly cadence that keep you moving.",
    order: 2,
    accentClass:
      "bg-gradient-to-br from-orange-200/15 via-amber-200/10 to-amber-300/10 dark:from-orange-400/15 dark:via-amber-500/10 dark:to-amber-400/10",
    headerAccentClass:
      "bg-amber-200/60 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100",
  },
  precision: {
    title: "Precision Plays",
    description: "Accuracy and perfect runs that show off your focus.",
    order: 3,
    accentClass:
      "bg-gradient-to-br from-emerald-200/15 via-teal-200/10 to-emerald-300/10 dark:from-emerald-500/20 dark:via-teal-500/15 dark:to-emerald-400/10",
    headerAccentClass:
      "bg-emerald-200/60 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100",
  },
  explorer: {
    title: "Explorer Kudos",
    description: "Badges for branching out across subjects and mastery.",
    order: 4,
    accentClass:
      "bg-gradient-to-br from-purple-200/15 via-fuchsia-200/10 to-indigo-300/10 dark:from-purple-500/20 dark:via-fuchsia-500/15 dark:to-indigo-500/10",
    headerAccentClass:
      "bg-purple-200/60 text-purple-900 dark:bg-purple-500/25 dark:text-purple-100",
  },
  weekly: {
    title: "Weekly Rhythm",
    description: "Keep the drumbeat steady with consistent recent sessions.",
    order: 5,
    accentClass:
      "bg-gradient-to-br from-rose-200/15 via-pink-200/10 to-rose-300/10 dark:from-rose-500/20 dark:via-pink-500/15 dark:to-rose-500/10",
    headerAccentClass:
      "bg-rose-200/60 text-rose-900 dark:bg-rose-500/25 dark:text-rose-100",
  },
};

type ActivityDay = {
  key: string;
  label: string;
  count: number;
  perfect: number;
  isToday: boolean;
};

type TimelineEvent = {
  id: string;
  title: string;
  detail: string;
  date: string;
  icon: LucideIcon;
  highlight?: boolean;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function normalizeAttempt(row: Record<string, unknown>): AttemptRow {
  return {
    subject: toStringOrNull(row["subject"]) ?? null,
    correctCount: Math.max(0, Math.round(toNumber(row["correct_count"]))),
    total: Math.max(0, Math.round(toNumber(row["total"]))),
    createdAt: toStringOrNull(row["created_at"]),
  };
}

function normalizeSubjectState(row: Record<string, unknown>): SubjectStateRow {
  const course = readCourseValue(row);
  return {
    subject: toStringOrNull(row["subject"]) ?? "General",
    course,
    mastery: row["mastery"] == null ? null : toNumber(row["mastery"]),
    nextTopic: toStringOrNull(row["next_topic"]),
    updatedAt: toStringOrNull(row["updated_at"]),
    difficulty: toStringOrNull(row["difficulty"]),
  };
}

function pickDisplayName(
  fullName: unknown,
  username: unknown,
  email: string | null
): string | null {
  const candidateFull = toStringOrNull(fullName);
  const candidateUser = toStringOrNull(username);
  if (candidateFull && candidateFull.length > 0) return candidateFull;
  if (candidateUser && candidateUser.length > 0) return candidateUser;
  if (email && email.length > 0) {
    const [prefix] = email.split("@");
    return prefix && prefix.length > 0 ? prefix : email;
  }
  return null;
}

function parseDateValue(input: string | null): number {
  if (!input) return 0;
  const date = new Date(input);
  const value = date.getTime();
  return Number.isFinite(value) ? value : 0;
}

const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function formatDate(input: string | null): string {
  if (!input) return "Unknown";
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return dateFormatter.format(date);
}

function describeRelativeDays(days: number | null): string {
  if (days == null) return "No recent activity yet";
  if (days === 0) return "Studied today";
  if (days === 1) return "Studied yesterday";
  return `Last study session ${days} days ago`;
}

export default function AchievementsPage(): JSX.Element {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { stats, user, loading: statsLoading, refresh } = useProfileStats();

  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [subjectStates, setSubjectStates] = useState<SubjectStateRow[]>([]);
  const [totalLessons, setTotalLessons] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const userId = user?.id ?? null;
  const userEmail = typeof user?.email === "string" ? user.email : null;

  const fallbackName = useMemo(() => {
    if (!user) return null;
    const meta =
      user.user_metadata && typeof user.user_metadata === "object"
        ? (user.user_metadata as Record<string, unknown>)
        : undefined;
    const metaName = meta ? toStringOrNull(meta["full_name"]) : null;
    const metaUsername = meta
      ? toStringOrNull(meta["username"]) ??
        toStringOrNull(meta["preferred_username"]) ??
        toStringOrNull(meta["user_name"]) ??
        toStringOrNull(meta["handle"])
      : null;
    return pickDisplayName(metaName, metaUsername, userEmail);
  }, [user, userEmail]);

  useEffect(() => {
    if (user === undefined) return;
    let cancelled = false;

    async function load() {
      if (!userId) {
        if (!cancelled) {
          setAttempts([]);
          setSubjectStates([]);
          setTotalLessons(null);
          setDisplayName(null);
          setLoading(false);
          setError(null);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [attemptRes, countRes, stateRes, profileRes] = await Promise.all([
          supabase
            .from("attempts")
            .select("subject, correct_count, total, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(400),
          supabase
            .from("attempts")
            .select("user_id", { count: "exact", head: true })
            .eq("user_id", userId),
          fetchUserSubjectStates(supabase, {
            userId,
            limit: 20,
            order: { column: "updated_at", ascending: false, nullsLast: true },
          }),
          supabase
            .from("profiles")
            .select("full_name, username")
            .eq("id", userId)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        if (attemptRes.error) throw attemptRes.error;
        if (countRes.error) throw countRes.error;
        if (stateRes.error) throw stateRes.error;

        const attemptsData = (attemptRes.data ?? []).map((row) =>
          normalizeAttempt(row as Record<string, unknown>)
        );
        setAttempts(attemptsData);
        setTotalLessons(
          typeof countRes.count === "number"
            ? countRes.count
            : attemptsData.length
        );

        const statesData = (stateRes.data ?? []).map((row) =>
          normalizeSubjectState(row as Record<string, unknown>)
        );
        setSubjectStates(statesData);

        if (profileRes.error) {
          console.warn("[achievements] profile fetch", profileRes.error);
        }
        const profileRow =
          (profileRes.data as Record<string, unknown> | null | undefined) ??
          null;
        const name = pickDisplayName(
          profileRow?.["full_name"],
          profileRow?.["username"],
          userEmail
        );
        setDisplayName(name);
      } catch (err) {
        console.error("[achievements] load failed", err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load achievements"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase, user, userId, userEmail, reloadKey]);

  const handleRefresh = useCallback(() => {
    setReloadKey((value) => value + 1);
    refresh().catch(() => {});
  }, [refresh]);

  const points = stats?.points ?? 0;
  const streak = stats?.streak ?? 0;
  const lastStudyDate = stats?.lastStudyDate ?? null;

  const totalCorrect = useMemo(
    () => attempts.reduce((sum, item) => sum + item.correctCount, 0),
    [attempts]
  );
  const totalQuestions = useMemo(
    () => attempts.reduce((sum, item) => sum + item.total, 0),
    [attempts]
  );

  const overallAccuracy =
    totalQuestions > 0 ? totalCorrect / totalQuestions : null;
  const accuracyPercent =
    overallAccuracy != null
      ? Math.round((overallAccuracy + Number.EPSILON) * 1000) / 10
      : null;

  const lessonsCompleted = totalLessons ?? attempts.length;
  const perfectCount = useMemo(
    () =>
      attempts.filter(
        (item) => item.total > 0 && item.correctCount === item.total
      ).length,
    [attempts]
  );

  const uniqueSubjects = useMemo(() => {
    const set = new Set<string>();
    attempts.forEach((item) => {
      if (item.subject) set.add(item.subject);
    });
    return set.size;
  }, [attempts]);

  const subjectSummaries = useMemo<SubjectSummary[]>(() => {
    const map = new Map<string, SubjectSummary>();
    attempts.forEach((attempt) => {
      const key = attempt.subject ?? "General";
      if (!map.has(key)) {
        map.set(key, {
          subject: key,
          lessons: 0,
          correct: 0,
          total: 0,
          accuracy: null,
        });
      }
      const entry = map.get(key)!;
      entry.lessons += 1;
      entry.correct += attempt.correctCount;
      entry.total += attempt.total;
    });
    return Array.from(map.values()).map((entry) => ({
      ...entry,
      accuracy: entry.total > 0 ? entry.correct / entry.total : null,
    }));
  }, [attempts]);

  const bestSubjects = useMemo(
    () =>
      subjectSummaries
        .filter((item) => item.accuracy != null)
        .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))
        .slice(0, 3),
    [subjectSummaries]
  );

  const needsAttention = useMemo(() => {
    const pool = subjectSummaries
      .filter((item) => item.accuracy != null && item.lessons >= 2)
      .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1));
    return pool[0] ?? null;
  }, [subjectSummaries]);

  const masteredCount = useMemo(
    () =>
      subjectSummaries.filter(
        (item) => (item.accuracy ?? 0) >= 0.9 && item.lessons >= 3
      ).length,
    [subjectSummaries]
  );

  const activityByDay = useMemo<ActivityDay[]>(() => {
    const map = new Map<string, { count: number; perfect: number }>();
    attempts.forEach((attempt) => {
      if (!attempt.createdAt) return;
      const key = attempt.createdAt.slice(0, 10);
      const entry = map.get(key) ?? { count: 0, perfect: 0 };
      entry.count += 1;
      if (attempt.total > 0 && attempt.correctCount === attempt.total) {
        entry.perfect += 1;
      }
      map.set(key, entry);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: ActivityDay[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const key = day.toISOString().slice(0, 10);
      const entry = map.get(key) ?? { count: 0, perfect: 0 };
      days.push({
        key,
        label: dayFormatter.format(day),
        count: entry.count,
        perfect: entry.perfect,
        isToday: i === 0,
      });
    }
    return days;
  }, [attempts]);

  const weeklyTotal = useMemo(
    () => activityByDay.reduce((sum, day) => sum + day.count, 0),
    [activityByDay]
  );
  const activeDays = useMemo(
    () => activityByDay.filter((day) => day.count > 0).length,
    [activityByDay]
  );
  const maxDailyCount = activityByDay.reduce(
    (max, day) => Math.max(max, day.count),
    0
  );

  const subjectStatesSorted = useMemo(
    () =>
      [...subjectStates].sort(
        (a, b) => parseDateValue(b.updatedAt) - parseDateValue(a.updatedAt)
      ),
    [subjectStates]
  );
  const primarySubject = subjectStatesSorted[0] ?? null;

  const lastActiveIso =
    lastStudyDate ?? (attempts.length > 0 ? attempts[0].createdAt : null);
  const daysSinceLastStudy = useMemo(() => {
    if (!lastActiveIso) return null;
    const last = new Date(lastActiveIso);
    if (!Number.isFinite(last.getTime())) return null;
    const now = new Date();
    const diffMs = now.getTime() - last.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    return diffDays < 0 ? 0 : diffDays;
  }, [lastActiveIso]);

  const milestonePoints = useMemo(() => {
    const milestones = [0, 100, 250, 500, 1000, 2000, 5000, 10000];
    const next = milestones.find((value) => value > points) ?? points + 500;
    const prev =
      [...milestones].reverse().find((value) => value <= points) ?? 0;
    const span = next - prev;
    const rawProgress = span > 0 ? (points - prev) / span : 1;
    return {
      prev,
      next,
      progress: Math.max(0, Math.min(1, rawProgress)),
    };
  }, [points]);

  const milestoneLessons = useMemo(() => {
    const milestones = [0, 1, 5, 10, 20, 35, 50, 75, 100];
    const next =
      milestones.find((value) => value > lessonsCompleted) ??
      lessonsCompleted + 10;
    const prev =
      [...milestones].reverse().find((value) => value <= lessonsCompleted) ??
      0;
    const span = next - prev;
    const rawProgress =
      span > 0 ? (lessonsCompleted - prev) / span : 1;
    return {
      prev,
      next,
      progress: Math.max(0, Math.min(1, rawProgress)),
    };
  }, [lessonsCompleted]);

  const milestoneStreak = useMemo(() => {
    const milestones = [0, 1, 3, 7, 14, 21, 30, 60, 100];
    const next = milestones.find((value) => value > streak) ?? streak + 5;
    const prev =
      [...milestones].reverse().find((value) => value <= streak) ?? 0;
    const span = next - prev;
    const rawProgress = span > 0 ? (streak - prev) / span : 1;
    return {
      prev,
      next,
      progress: Math.max(0, Math.min(1, rawProgress)),
    };
  }, [streak]);

  const badgeGroups = useMemo<BadgeGroup[]>(() => {
    type BadgeDefinition = Omit<GroupedBadge, "unlocked" | "progress">;

    const definitions: BadgeDefinition[] = [
      // Progress Ladder
      {
        id: "points-100",
        title: "Spark Starter",
        description: "Earn 100 total points.",
        icon: Sparkles,
        current: points,
        target: 100,
        category: "progress",
        tier: "Bronze",
        order: 1,
      },
      {
        id: "points-500",
        title: "Point Collector",
        description: "Reach 500 points across your study sessions.",
        icon: Trophy,
        current: points,
        target: 500,
        category: "progress",
        tier: "Silver",
        order: 2,
      },
      {
        id: "points-1000",
        title: "Power Earner",
        description: "Collect 1,000 lifetime points.",
        icon: Award,
        current: points,
        target: 1000,
        category: "progress",
        tier: "Gold",
        order: 3,
      },
      {
        id: "points-2500",
        title: "Point Tycoon",
        description: "Stack up 2,500 lifetime points.",
        icon: Crown,
        current: points,
        target: 2500,
        category: "progress",
        tier: "Platinum",
        order: 4,
      },
      {
        id: "lessons-1",
        title: "First Steps",
        description: "Complete your first full lesson.",
        icon: BadgeCheck,
        current: lessonsCompleted,
        target: 1,
        category: "progress",
        tier: "Bronze",
        order: 5,
      },
      {
        id: "lessons-10",
        title: "Lesson Grinder",
        description: "Complete 10 lessons.",
        icon: BookOpen,
        current: lessonsCompleted,
        target: 10,
        category: "progress",
        tier: "Silver",
        order: 6,
      },
      {
        id: "lessons-25",
        title: "Course Climber",
        description: "Finish 25 lessons across any subjects.",
        icon: Rocket,
        current: lessonsCompleted,
        target: 25,
        category: "progress",
        tier: "Gold",
        order: 7,
      },
      {
        id: "lessons-50",
        title: "Curriculum Conqueror",
        description: "Wrap up 50 cumulative lessons.",
        icon: Medal,
        current: lessonsCompleted,
        target: 50,
        category: "progress",
        tier: "Mythic",
        order: 8,
      },
      // Momentum Makers
      {
        id: "streak-3",
        title: "Sparked Streak",
        description: "Keep a 3-day streak alive.",
        icon: Flame,
        current: streak,
        target: 3,
        category: "momentum",
        tier: "Bronze",
        order: 1,
      },
      {
        id: "streak-7",
        title: "Streak Keeper",
        description: "Maintain a 7-day learning streak.",
        icon: Flame,
        current: streak,
        target: 7,
        category: "momentum",
        tier: "Silver",
        order: 2,
      },
      {
        id: "streak-14",
        title: "Momentum Train",
        description: "Stay on track for 14 days straight.",
        icon: Timer,
        current: streak,
        target: 14,
        category: "momentum",
        tier: "Gold",
        order: 3,
      },
      {
        id: "streak-30",
        title: "Relentless Rhythm",
        description: "Hit a 30-day streak without breaking focus.",
        icon: Trophy,
        current: streak,
        target: 30,
        category: "momentum",
        tier: "Platinum",
        order: 4,
      },
      {
        id: "active-days-4",
        title: "Weekday Warrior",
        description: "Study on 4 different days in a single week.",
        icon: CalendarCheck2,
        current: activeDays,
        target: 4,
        category: "momentum",
        tier: "Silver",
        order: 5,
      },
      {
        id: "active-days-6",
        title: "Calendar Crusher",
        description: "Turn 6 days active in the same week.",
        icon: CalendarCheck2,
        current: activeDays,
        target: 6,
        category: "momentum",
        tier: "Gold",
        order: 6,
      },
      // Precision Plays
      {
        id: "accuracy-75",
        title: "Sharpening Aim",
        description: "Lift accuracy to 75%.",
        icon: Target,
        current: accuracyPercent ?? 0,
        target: 75,
        category: "precision",
        tier: "Bronze",
        order: 1,
      },
      {
        id: "accuracy-90",
        title: "Sharpshooter",
        description: "Reach 90% lesson accuracy.",
        icon: Target,
        current: accuracyPercent ?? 0,
        target: 90,
        category: "precision",
        tier: "Gold",
        order: 2,
      },
      {
        id: "accuracy-95",
        title: "Pinpoint Pro",
        description: "Maintain elite precision at 95% accuracy.",
        icon: Star,
        current: accuracyPercent ?? 0,
        target: 95,
        category: "precision",
        tier: "Platinum",
        order: 3,
      },
      {
        id: "perfect-1",
        title: "Perfect Start",
        description: "Record your first perfect lesson.",
        icon: Sparkles,
        current: perfectCount,
        target: 1,
        category: "precision",
        tier: "Bronze",
        order: 4,
      },
      {
        id: "perfect-5",
        title: "Perfection Run",
        description: "Log 5 perfect lesson scores.",
        icon: Medal,
        current: perfectCount,
        target: 5,
        category: "precision",
        tier: "Silver",
        order: 5,
      },
      {
        id: "perfect-12",
        title: "Faultless Dozen",
        description: "Celebrate 12 perfect lessons.",
        icon: Crown,
        current: perfectCount,
        target: 12,
        category: "precision",
        tier: "Mythic",
        order: 6,
      },
      // Explorer Kudos
      {
        id: "subjects-3",
        title: "Subject Explorer",
        description: "Study 3 different subjects.",
        icon: Compass,
        current: uniqueSubjects,
        target: 3,
        category: "explorer",
        tier: "Bronze",
        order: 1,
      },
      {
        id: "subjects-5",
        title: "Curious Voyager",
        description: "Learn across 5 different subjects.",
        icon: TrendingUp,
        current: uniqueSubjects,
        target: 5,
        category: "explorer",
        tier: "Silver",
        order: 2,
      },
      {
        id: "subjects-8",
        title: "Interdisciplinary Ace",
        description: "Explore 8 unique subject areas.",
        icon: Rocket,
        current: uniqueSubjects,
        target: 8,
        category: "explorer",
        tier: "Gold",
        order: 3,
      },
      {
        id: "mastered-1",
        title: "Subject Specialist",
        description: "Master 1 subject with high accuracy.",
        icon: Award,
        current: masteredCount,
        target: 1,
        category: "explorer",
        tier: "Gold",
        order: 4,
      },
      {
        id: "mastered-3",
        title: "Focused Maestro",
        description: "Master 3 subjects with consistent accuracy.",
        icon: Crown,
        current: masteredCount,
        target: 3,
        category: "explorer",
        tier: "Mythic",
        order: 5,
      },
      // Weekly Rhythm
      {
        id: "weekly-3",
        title: "Weekend Kickoff",
        description: "Complete 3 lessons this week.",
        icon: BookOpen,
        current: weeklyTotal,
        target: 3,
        category: "weekly",
        tier: "Bronze",
        order: 1,
      },
      {
        id: "weekly-5",
        title: "Rhythm Rider",
        description: "Finish 5 lessons within the week.",
        icon: Timer,
        current: weeklyTotal,
        target: 5,
        category: "weekly",
        tier: "Silver",
        order: 2,
      },
      {
        id: "weekly-7",
        title: "Seven-Day Sweep",
        description: "Complete 7 lessons in the same week.",
        icon: Flame,
        current: weeklyTotal,
        target: 7,
        category: "weekly",
        tier: "Gold",
        order: 3,
      },
    ];

    const computed = definitions.map((item) => ({
      ...item,
      unlocked: item.current >= item.target && item.target > 0,
      progress:
        item.target > 0 ? Math.min(1, item.current / item.target) : 1,
    }));

    const byCategory = new Map<BadgeCategoryKey, BadgeGroup>();
    computed.forEach((badge) => {
      const meta = BADGE_CATEGORY_META[badge.category as BadgeCategoryKey];
      if (!meta) return;
      const existing = byCategory.get(badge.category as BadgeCategoryKey);
      if (existing) {
        existing.badges.push(badge);
        return;
      }

      byCategory.set(badge.category as BadgeCategoryKey, {
        id: badge.category,
        title: meta.title,
        description: meta.description,
        order: meta.order,
        accentClass: meta.accentClass,
        headerAccentClass: meta.headerAccentClass,
        badges: [badge],
      });
    });

    return Array.from(byCategory.values())
      .map((group) => ({
        ...group,
        badges: [...group.badges].sort((a, b) => {
          if (a.unlocked !== b.unlocked) {
            return Number(b.unlocked) - Number(a.unlocked);
          }
          return a.order - b.order;
        }),
      }))
      .sort((a, b) => a.order - b.order);
  }, [
    points,
    lessonsCompleted,
    streak,
    activeDays,
    accuracyPercent,
    perfectCount,
    uniqueSubjects,
    masteredCount,
    weeklyTotal,
  ]);

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const items: TimelineEvent[] = [];
    if (lastActiveIso) {
      items.push({
        id: "streak",
        title: streak > 0 ? "Streak in motion" : "Ready to start",
        detail:
          streak > 0
            ? `You are on a ${streak}-day streak. Keep it alive.`
            : "Begin a streak with a session today.",
        date: formatDate(lastActiveIso),
        icon: Flame,
        highlight: streak >= 3,
      });
    }
    attempts.slice(0, 3).forEach((attempt, index) => {
      if (!attempt.createdAt) return;
      items.push({
        id: `lesson-${index}`,
        title: attempt.subject
          ? `Finished ${attempt.subject}`
          : "Finished a lesson",
        detail:
          attempt.total > 0
            ? `Scored ${attempt.correctCount}/${attempt.total} correct.`
            : "Completed a lesson.",
        date: formatDate(attempt.createdAt),
        icon: BookOpen,
      });
    });
    if (perfectCount > 0) {
      const firstPerfect = attempts.find(
        (attempt) =>
          attempt.createdAt &&
          attempt.total > 0 &&
          attempt.correctCount === attempt.total
      );
      items.push({
        id: "perfect",
        title: perfectCount >= 5 ? "Perfection streak" : "Perfect finish",
        detail:
          perfectCount >= 5
            ? "Five perfect lessons recorded."
            : "You recorded a perfect lesson score.",
        date: formatDate(firstPerfect?.createdAt ?? null),
        icon: Medal,
        highlight: perfectCount >= 5,
      });
    }
    return items.slice(0, 4);
  }, [attempts, perfectCount, lastActiveIso, streak]);

  const heroName = displayName ?? fallbackName;
  const firstName = heroName ? heroName.split(" ")[0] : null;
  const heroTitle = firstName
    ? `Keep going, ${firstName}!`
    : "Keep going and keep growing!";

  const showSkeleton = loading && attempts.length === 0 && statsLoading;

  if (!user && !statsLoading) {
    return (
      <main className="min-h-[calc(100vh-56px)] mx-auto flex w-full max-w-3xl items-center justify-center px-4 py-16 text-neutral-900 dark:text-white">
        <div className="w-full max-w-xl rounded-3xl border border-white/50 bg-white/70 p-10 text-center shadow-xl ring-1 ring-black/5 backdrop-blur-sm dark:border-slate-800 dark:bg-[#0b1424]/85 dark:ring-0">
          <Sparkles className="mx-auto h-10 w-10 text-lernex-blue" />
          <h1 className="mt-4 text-3xl font-semibold">Achievements</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            Sign in to track streaks, milestones, and personal bests.
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-lernex-blue px-5 py-2 text-sm font-medium text-white shadow transition hover:shadow-md"
            >
              <CalendarCheck2 className="h-4 w-4" />
              Go to login
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-[calc(100vh-56px)] mx-auto w-full max-w-5xl overflow-hidden px-4 py-10 text-neutral-900 dark:text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-40vw] -top-40 h-80 rounded-full bg-gradient-to-br from-sky-100 via-white to-transparent opacity-80 blur-3xl dark:hidden -z-10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-25vw] top-1/2 h-[520px] -translate-y-1/2 rounded-full bg-gradient-to-br from-rose-50 via-amber-50/80 to-transparent opacity-70 blur-3xl dark:hidden -z-10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-35vw] -top-48 hidden h-[520px] rounded-full bg-gradient-to-br from-lernex-blue/30 via-neutral-900/60 to-transparent opacity-70 blur-3xl dark:block -z-10"
      />
      {error && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-full border border-red-400 px-3 py-1 text-xs font-medium transition hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
          >
            Retry
          </button>
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl border border-white/50 bg-white/70 p-6 shadow-lg ring-1 ring-black/5 backdrop-blur-sm transition-colors dark:border-slate-800 dark:bg-[#0b1424]/85 dark:ring-0">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 -top-28 h-72 w-72 rounded-full bg-lernex-blue/20 blur-3xl opacity-80 dark:bg-lernex-blue/40 -z-10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -bottom-32 h-96 w-96 rounded-full bg-sky-200/50 blur-3xl opacity-70 dark:hidden -z-10"
        />
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-lernex-blue shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:text-lernex-blue/90 dark:ring-0">
              <Sparkles className="h-3.5 w-3.5" />
              Achievements
            </span>
            <h1 className="mt-4 text-3xl font-semibold md:text-4xl">
              {heroTitle}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-neutral-600 dark:text-neutral-300">
              Celebrate every step. Your points, streaks, and study wins power
              a stronger learning journey.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-0">
                <Flame className="h-3.5 w-3.5 text-lernex-blue" />
                {describeRelativeDays(daysSinceLastStudy)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-0">
                <BookOpen className="h-3.5 w-3.5 text-lernex-blue" />
                {lessonsCompleted} lessons completed
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-0">
                <TrendingUp className="h-3.5 w-3.5 text-lernex-blue" />
                {masteredCount} subjects mastered
              </span>
            </div>
          </div>
          <div className="grid w-full max-w-sm grid-cols-2 gap-3 rounded-2xl border border-white/60 bg-white/80 p-4 text-sm shadow-inner ring-1 ring-black/5 backdrop-blur dark:border-neutral-800/70 dark:bg-gradient-to-br dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c] dark:ring-0 md:max-w-xs">
            <div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Current streak
              </div>
              <div className="mt-1 text-2xl font-semibold">{streak}</div>
              <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                {milestoneStreak.next > streak
                  ? `${milestoneStreak.next - streak} days until ${milestoneStreak.next}`
                  : "New streak milestone reached"}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Total points
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {points.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                {milestonePoints.next > points
                  ? `${milestonePoints.next - points} to reach ${milestonePoints.next}`
                  : "Keep stacking points"}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Accuracy
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {accuracyPercent != null ? `${accuracyPercent}%` : "�"}
              </div>
              <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                Based on {totalQuestions} questions
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Perfect lessons
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {perfectCount.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                {perfectCount >= 5
                  ? "Amazing consistency"
                  : `${Math.max(0, 5 - perfectCount)} to unlock badge`}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            id: "points",
            label: "Total points",
            value: points.toLocaleString(),
            icon: Trophy,
            progress: milestonePoints.progress,
            description:
              milestonePoints.next > points
                ? `${milestonePoints.next - points} points to the next milestone`
                : "You passed your latest milestone. Aim higher.",
          },
          {
            id: "streak",
            label: "Active streak",
            value: `${streak} days`,
            icon: Flame,
            progress: milestoneStreak.progress,
            description:
              milestoneStreak.next > streak
                ? `${milestoneStreak.next - streak} days until ${milestoneStreak.next}`
                : "New streak milestone unlocked.",
          },
          {
            id: "lessons",
            label: "Lessons completed",
            value: lessonsCompleted.toLocaleString(),
            icon: BookOpen,
            progress: milestoneLessons.progress,
            description:
              milestoneLessons.next > lessonsCompleted
                ? `${milestoneLessons.next - lessonsCompleted} lessons to reach ${milestoneLessons.next}`
                : "Keep building your catalog of wins.",
          },
          {
            id: "accuracy",
            label: "Overall accuracy",
            value: accuracyPercent != null ? `${accuracyPercent}%` : "�",
            icon: Target,
            progress:
              accuracyPercent != null ? Math.min(1, accuracyPercent / 100) : 0,
            description:
              totalQuestions > 0
                ? `${totalQuestions} questions answered so far`
                : "Complete lessons to unlock accuracy insights.",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.id}
              className="rounded-2xl border border-white/40 bg-white/70 p-5 shadow-sm ring-1 ring-black/5 backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-[#0b1424]/85 dark:ring-0"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    {stat.label}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {stat.value}
                  </div>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-lernex-blue/15 via-lernex-blue/10 to-white text-lernex-blue ring-1 ring-lernex-blue/20 dark:bg-lernex-blue/20 dark:text-lernex-blue/90 dark:ring-0">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-4 h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-lernex-blue transition-[width]"
                  style={{
                    width: `${Math.round(stat.progress * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                {stat.description}
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/40 bg-white/70 p-5 shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:border-slate-800 dark:bg-[#0b1424]/85 dark:ring-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Weekly rhythm</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {weeklyTotal > 0
                  ? `Completed ${weeklyTotal} lesson${
                      weeklyTotal === 1 ? "" : "s"
                    } this week`
                  : "No lessons this week yet"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800/80"
            >
              Refresh
            </button>
          </div>
          <div className="mt-6 flex items-end gap-3">
            {activityByDay.map((day) => {
              const heightBase =
                maxDailyCount > 0 ? Math.max(10, (day.count / maxDailyCount) * 100) : 10;
              return (
                <div
                  key={day.key}
                  className="flex w-full flex-col items-center gap-2 text-xs"
                >
                  <div className="relative flex h-32 w-full items-end overflow-hidden rounded-full bg-white/80 ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-0">
                    <div
                      className={`w-full rounded-full bg-gradient-to-t from-lernex-blue/70 to-lernex-blue/40 transition-[height] ${
                        day.isToday ? "ring-2 ring-lernex-blue/60" : ""
                      }`}
                      style={{ height: `${heightBase}%` }}
                    />
                    {day.perfect > 0 && (
                      <span className="absolute inset-x-0 top-2 mx-auto flex h-6 w-6 items-center justify-center rounded-full border border-white/60 bg-white/95 text-[10px] font-semibold text-lernex-blue shadow-sm ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-0">
                        {day.perfect}
                      </span>
                    )}
                  </div>
                  <span className="font-medium text-neutral-600 dark:text-neutral-300">
                    {day.label}
                  </span>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {day.count} lesson{day.count === 1 ? "" : "s"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
            <span>
              Active {activeDays} day{activeDays === 1 ? "" : "s"} this week
            </span>
            <span>
              Perfect finishes show as blue badges above the bars
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/40 bg-white/70 p-5 shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:border-slate-800 dark:bg-[#0b1424]/85 dark:ring-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Subject focus</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Discover where you lead and where to spend an extra session.
              </p>
            </div>
            {primarySubject && (
              <span className="inline-flex items-center gap-2 rounded-full bg-lernex-blue/10 px-3 py-1 text-xs font-medium text-lernex-blue dark:bg-lernex-blue/20 dark:text-lernex-blue/90">
                <Rocket className="h-3.5 w-3.5" />
                {primarySubject.subject}
              </span>
            )}
          </div>
          <ul className="mt-6 space-y-4">
            {bestSubjects.length === 0 ? (
              <li className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                Complete a few lessons to unlock subject insights.
              </li>
            ) : (
              bestSubjects.map((subject) => (
                <li key={subject.subject}>
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>{subject.subject}</span>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {subject.accuracy != null
                        ? `${Math.round(subject.accuracy * 100)}%`
                        : "�"}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-lernex-blue"
                      style={{
                        width: `${
                          subject.accuracy != null
                            ? Math.round(subject.accuracy * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {subject.lessons} lesson
                    {subject.lessons === 1 ? "" : "s"} studied
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="mt-6 rounded-xl border border-white/40 bg-white/70 p-4 text-xs text-neutral-600 ring-1 ring-black/5 backdrop-blur-sm dark:border-slate-800 dark:bg-[#0b1424]/85 dark:text-neutral-300 dark:ring-0">
            {needsAttention ? (
              <>
                <div className="font-semibold text-neutral-800 dark:text-neutral-100">
                  Focus opportunity: {needsAttention.subject}
                </div>
                <p className="mt-1">
                  Spend one more session to lift accuracy from {
                    needsAttention.accuracy != null
                      ? Math.round(needsAttention.accuracy * 100)
                      : 0
                  }%
                  .
                </p>
              </>
            ) : (
              <>
                <div className="font-semibold text-neutral-800 dark:text-neutral-100">
                  Balanced progress
                </div>
                <p className="mt-1">
                  You are building solid accuracy across the subjects you have
                  tried. Keep exploring or revisit a favourite topic.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Achievement badges</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Hit the targets below to unlock every badge and level up your
              profile flair.
            </p>
          </div>
        </div>
        <div className="space-y-6">
          {badgeGroups.map((group) => (
            <div
              key={group.id}
              className={`rounded-3xl border border-white/50 p-6 shadow-sm ring-1 ring-black/5 backdrop-blur-sm ${group.accentClass} dark:border-slate-800/80 dark:ring-0`}
            >
              <div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${group.headerAccentClass}`}
                >
                  {group.title}
                </span>
                <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-300">
                  {group.description}
                </p>
              </div>
              <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.badges.map((badge) => {
                  const Icon = badge.icon;
                  const progressPercent = Math.round(badge.progress * 100);
                  const theme = TIER_THEMES[badge.tier] ?? TIER_THEMES.Bronze;
                  return (
                    <li
                      key={badge.id}
                      className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                        badge.unlocked
                          ? "border-transparent bg-gradient-to-br from-lernex-blue/15 via-lernex-blue/10 to-sky-500/10 text-neutral-900 ring-1 ring-lernex-blue/25 dark:from-lernex-blue/25 dark:via-indigo-500/20 dark:to-sky-500/15 dark:text-white dark:ring-lernex-blue/20"
                          : "border-white/60 bg-white/70 text-neutral-900 dark:border-slate-800 dark:bg-[#101a27]/85 dark:text-neutral-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-1 items-start gap-3">
                          <span
                            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${theme.icon}`}
                          >
                            <Icon className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold">{badge.title}</p>
                            <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                              {badge.description}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${theme.chip}`}
                        >
                          {badge.tier}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                          <span>
                            {Math.min(badge.current, badge.target).toLocaleString()} /{" "}
                            {badge.target.toLocaleString()}
                          </span>
                          <span
                            className={
                              badge.unlocked
                                ? "font-medium text-emerald-500"
                                : "text-neutral-500 dark:text-neutral-400"
                            }
                          >
                            {badge.unlocked
                              ? "Unlocked"
                              : `${Math.max(0, badge.target - badge.current).toLocaleString()} to go`}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-neutral-200/80 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              badge.unlocked ? "bg-emerald-500" : "bg-lernex-blue/70"
                            }`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/40 bg-white/70 p-5 shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:border-slate-800 dark:bg-[#0b1424]/85 dark:ring-0 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Recent highlights</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Your latest wins and moments worth celebrating.
              </p>
            </div>
          </div>
          <ol className="mt-5 space-y-4 border-l border-neutral-200 pl-5 dark:border-neutral-800">
            {timelineEvents.length === 0 ? (
              <li className="border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-xs text-neutral-500 dark:border-slate-700 dark:bg-[#0b1424]/85 dark:text-neutral-400">
                Highlights will appear once you complete your first lesson.
              </li>
            ) : (
              timelineEvents.map((event) => {
                const Icon = event.icon;
                return (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[30px] flex h-8 w-8 items-center justify-center rounded-full border border-white/50 bg-white/80 text-lernex-blue shadow-sm ring-1 ring-black/5 dark:border-slate-700 dark:bg-[#0f1728] dark:ring-0">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        event.highlight
                          ? "border-lernex-blue/40 bg-lernex-blue/15 text-lernex-blue-950 ring-1 ring-lernex-blue/30 shadow-sm dark:border-lernex-blue/40 dark:bg-lernex-blue/20 dark:text-white dark:ring-lernex-blue/20"
                          : "border-white/50 bg-white/70 ring-1 ring-black/5 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-[#0e172a]/90 dark:ring-0"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{event.title}</span>
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          {event.date}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                        {event.detail}
                      </p>
                    </div>
                  </li>
                );
              })
            )}
          </ol>
        </div>

        <div className="flex h-full flex-col gap-4">
          <div className="rounded-2xl border border-white/40 bg-white/70 p-5 shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:border-slate-800 dark:bg-[#0b1424]/85 dark:ring-0">
            <h2 className="text-lg font-semibold">Next best action</h2>
            {primarySubject ? (
              <div className="mt-3 text-sm">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Rocket className="h-4 w-4 text-lernex-blue" />
                  {primarySubject.subject}
                  {primarySubject.course ? (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {primarySubject.course}
                    </span>
                  ) : null}
                </div>
                {primarySubject.nextTopic ? (
                  <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                    Up next: {primarySubject.nextTopic}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                    You are caught up on this path. Explore a new subject to
                    keep momentum.
                  </p>
                )}
                {primarySubject.mastery != null && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                      <span>Mastery progress</span>
                      <span>{Math.round(primarySubject.mastery)}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800">
                      <div
                        className="h-full rounded-full bg-lernex-blue"
                        style={{
                          width: `${Math.max(
                            5,
                            Math.min(100, Math.round(primarySubject.mastery))
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {primarySubject.updatedAt && (
                  <p className="mt-3 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Last updated {formatDate(primarySubject.updatedAt)}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                Start a personalised path to reveal your mastery targets and
                next recommended topics.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/fyp"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-lernex-blue px-4 py-2 text-sm font-medium text-white transition hover:shadow md:w-auto"
              >
                <Target className="h-4 w-4" />
                Generate lesson
              </Link>
              <Link
                href="/playlists"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 md:w-auto"
              >
                <BookOpen className="h-4 w-4" />
                Browse playlists
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/40 bg-white/70 p-5 text-sm shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:border-slate-800 dark:bg-[#0b1424]/85 dark:ring-0">
            <h2 className="text-lg font-semibold">More ways to celebrate</h2>
            <ul className="mt-3 space-y-3 text-xs text-neutral-600 dark:text-neutral-300">
              <li>
                Challenge friends and compare progress on the {" "}
                <Link href="/leaderboard" className="text-lernex-blue underline">
                  leaderboard
                </Link>
                .
              </li>
              <li>
                Join upcoming study quests inside the {" "}
                <Link href="/challenges" className="text-lernex-blue underline">
                  challenges hub
                </Link>
                .
              </li>
              <li>
                Keep streak reminders on by visiting {" "}
                <Link href="/settings" className="text-lernex-blue underline">
                  settings
                </Link>{" "}
                and enabling notifications.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {showSkeleton && (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, idx) => (
            <div
              key={idx}
              className="h-32 animate-pulse rounded-2xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
            />
          ))}
        </div>
      )}
    </main>
  );
}


