"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  CircleCheck,
  Clock,
  Flame,
  Gauge,
  LineChart,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  fetchUserSubjectStates,
  readCourseValue,
} from "@/lib/user-subject-state";
import { useProfileStats } from "@/app/providers/ProfileStatsProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { calcCost, USAGE_LIMITS } from "@/lib/usage";

type AttemptRow = {
  subject: string;
  level: string | null;
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

type UsageRow = {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string | null;
};

type ProfileSnapshot = {
  points: number;
  streak: number;
  totalCost: number;
  interests: string[];
  lastStudyDate: string | null;
  placementReady: boolean;
  subscription_tier: "free" | "plus" | "premium";
};

type DailyPoint = {
  date: string;
  attempts: number;
  correct: number;
  total: number;
};

type HeatmapPoint = {
  date: string;
  attempts: number;
};

type SubjectInsight = {
  subject: string;
  attempts: number;
  correct: number;
  total: number;
  lastActivity: string | null;
  mastery: number | null;
  course: string | null;
  nextTopic: string | null;
  masteryUpdatedAt: string | null;
  difficulty: string | null;
};

type Recommendation = {
  id: string;
  title: string;
  detail: string;
  icon: LucideIcon;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value ?? fallback);
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
  const subject = toStringOrNull(row["subject"]) ?? "General";
  const level = toStringOrNull(row["level"]);
  const correctCount = Math.max(0, Math.round(toNumber(row["correct_count"] ?? row["correctCount"], 0)));
  const total = Math.max(0, Math.round(toNumber(row["total"], 0)));
  const createdAt = toStringOrNull(row["created_at"] ?? row["createdAt"]);
  return { subject, level, correctCount, total, createdAt };
}

function normalizeSubjectState(row: Record<string, unknown>): SubjectStateRow {
  return {
    subject: toStringOrNull(row["subject"]) ?? "General",
    course: readCourseValue(row),
    mastery: row["mastery"] == null ? null : toNumber(row["mastery"], null as unknown as number),
    nextTopic: toStringOrNull(row["next_topic"] ?? row["nextTopic"]),
    updatedAt: toStringOrNull(row["updated_at"] ?? row["updatedAt"]),
    difficulty: toStringOrNull(row["difficulty"]),
  };
}

function normalizeUsage(row: Record<string, unknown>): UsageRow {
  return {
    model: toStringOrNull(row["model"]),
    inputTokens: Math.max(0, Math.round(toNumber(row["input_tokens"] ?? row["inputTokens"], 0))),
    outputTokens: Math.max(0, Math.round(toNumber(row["output_tokens"] ?? row["outputTokens"], 0))),
    createdAt: toStringOrNull(row["created_at"] ?? row["createdAt"]),
  };
}

function normalizeProfile(row: Record<string, unknown> | null | undefined): ProfileSnapshot {
  const interestsSource = row?.["interests"];
  const interests = Array.isArray(interestsSource)
    ? interestsSource.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const tier = typeof row?.["subscription_tier"] === "string"
    ? row["subscription_tier"].toLowerCase()
    : "free";
  return {
    points: Math.max(0, Math.round(toNumber(row?.["points"], 0))),
    streak: Math.max(0, Math.round(toNumber(row?.["streak"], 0))),
    totalCost: Number(row?.["total_cost"] ?? 0) || 0,
    interests,
    lastStudyDate: toStringOrNull(row?.["last_study_date"]),
    placementReady: row?.["placement_ready"] === true,
    subscription_tier: (tier === "premium" || tier === "plus") ? tier : "free",
  };
}

function isoDay(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  const now = new Date();
  now.setDate(now.getDate() - days);
  return now;
}

function buildDailySeries(attempts: AttemptRow[], days: number): DailyPoint[] {
  const byDay = new Map<string, { attempts: number; correct: number; total: number }>();
  attempts.forEach((attempt) => {
    if (!attempt.createdAt) return;
    const date = new Date(attempt.createdAt);
    if (!Number.isFinite(date.getTime())) return;
    const key = isoDay(date);
    const entry = byDay.get(key) ?? { attempts: 0, correct: 0, total: 0 };
    entry.attempts += 1;
    entry.correct += attempt.correctCount;
    entry.total += attempt.total;
    byDay.set(key, entry);
  });

  const result: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const targetDate = daysAgo(i);
    const key = isoDay(targetDate);
    const entry = byDay.get(key) ?? { attempts: 0, correct: 0, total: 0 };
    result.push({ date: key, attempts: entry.attempts, correct: entry.correct, total: entry.total });
  }
  return result;
}

function buildHeatmap(attempts: AttemptRow[], days: number): HeatmapPoint[] {
  const byDay = new Map<string, number>();
  attempts.forEach((attempt) => {
    if (!attempt.createdAt) return;
    const date = new Date(attempt.createdAt);
    if (!Number.isFinite(date.getTime())) return;
    const key = isoDay(date);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  });

  const result: HeatmapPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const targetDate = daysAgo(i);
    const key = isoDay(targetDate);
    result.push({ date: key, attempts: byDay.get(key) ?? 0 });
  }
  return result;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

function formatDateLabel(date: string): string {
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatRelativeDate(date: string | null): string {
  if (!date) return "No activity yet";
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return date;
  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTokens(tokens: number): string {
  return Number.isFinite(tokens) ? `${Math.round(tokens).toLocaleString()} tokens` : "0 tokens";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function pickTrendIcon(delta: number): typeof ArrowUpRight | typeof ArrowDownRight | typeof Activity {
  if (delta > 0.005) return ArrowUpRight;
  if (delta < -0.005) return ArrowDownRight;
  return Activity;
}

function Sparkline({
  values,
  color = "#2F80ED",
  height = 72,
  isDark = false,
}: { values: number[]; color?: string; height?: number; isDark?: boolean }) {
  const gradientId = useId();
  const width = values.length > 1 ? 180 : 120;
  if (values.length === 0) {
    return <div className="text-xs text-neutral-500 dark:text-neutral-400">No trend yet</div>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const polyPoints = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${polyPoints} ${width},${height}`;
  const lastValue = values[values.length - 1];
  const lastX = values.length === 1 ? width / 2 : width;
  const lastY = height - ((lastValue - min) / range) * height;
  const areaStartOpacity = isDark ? 0.4 : 0.35;
  const areaEndOpacity = isDark ? 0.12 : 0.02;
  const markerStroke = isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.9)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={areaStartOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity={areaEndOpacity} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} opacity={0.8} />
      <polyline
        points={polyPoints}
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={4} fill={color} stroke={markerStroke} strokeWidth={1.5} />
    </svg>
  );
}

function RadialMeter({ value, label, isDark = false }: { value: number; label: string; isDark?: boolean }) {
  const radius = 36;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const normalized = clamp01(value);
  const offset = circumference * (1 - normalized);
  const gradientId = useId();
  const trackColor = isDark ? "rgba(148, 163, 184, 0.25)" : "rgba(15, 23, 42, 0.12)";

  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg width="108" height="108" viewBox="0 0 108 108">
        <defs>
          <linearGradient id={gradientId} x1="1" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2F80ED" />
            <stop offset="50%" stopColor="#6C5CE7" />
            <stop offset="100%" stopColor="#19B5FE" />
          </linearGradient>
        </defs>
        <circle cx="54" cy="54" r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <circle
          cx="54"
          cy="54"
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-lg font-semibold">{Math.round(normalized * 100)}</div>
        <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-300">{label}</div>
      </div>
    </div>
  );
}

function HeatmapGrid({ points, isDark }: { points: HeatmapPoint[]; isDark: boolean }) {
  const maxAttempts = points.reduce((max, point) => Math.max(max, point.attempts), 0);
  return (
    <div className="grid grid-cols-7 gap-2">
      {points.map((point) => {
        const intensity = maxAttempts > 0 ? point.attempts / maxAttempts : 0;
        const baseFill = isDark ? "rgba(15, 23, 42, 0.42)" : "rgba(148, 163, 184, 0.18)";
        const accentStart = isDark
          ? `rgba(56, 189, 248, ${(0.18 + intensity * 0.5).toFixed(2)})`
          : `rgba(37, 99, 235, ${(0.22 + intensity * 0.55).toFixed(2)})`;
        const accentEnd = isDark
          ? `rgba(37, 99, 235, ${(0.16 + intensity * 0.45).toFixed(2)})`
          : `rgba(14, 165, 233, ${(0.18 + intensity * 0.4).toFixed(2)})`;
        const background =
          intensity === 0 ? baseFill : `linear-gradient(140deg, ${accentStart} 0%, ${accentEnd} 100%)`;
        return (
          <div
            key={point.date}
            className="group aspect-square rounded-lg border border-slate-200/60 shadow-[0_12px_28px_-18px_rgba(15,23,42,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-lernex-blue/60 hover:shadow-[0_16px_28px_-12px_rgba(37,99,235,0.45)] dark:border-slate-800/80 dark:shadow-[0_14px_32px_-18px_rgba(0,0,0,0.6)]"
            style={{ background }}
            title={`${point.date}: ${point.attempts} ${point.attempts === 1 ? "session" : "sessions"}`}
          />
        );
      })}
    </div>
  );
}

const pageShell =
  "relative mx-auto w-full overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-50/80 via-white/90 to-slate-100/80 text-slate-900 shadow-[0_45px_120px_-60px_rgba(15,23,42,0.4)] dark:from-[#12151f] dark:via-[#1a1d2e] dark:to-[#1f2438] dark:text-white";

const cardBase =
  "group relative overflow-hidden rounded-2xl border border-slate-100/80 bg-gradient-to-br from-white/95 via-white/90 to-slate-50/90 p-6 ring-1 ring-black/5 backdrop-blur-xl shadow-[0_22px_48px_-24px_rgba(15,23,42,0.3)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_34px_65px_-22px_rgba(15,23,42,0.36)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(26,30,46,0.92),rgba(32,38,54,0.88))] dark:ring-white/5 dark:hover:ring-lernex-blue/40 dark:shadow-lernex-blue/10";

const chipBase =
  "inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-[0_6px_18px_rgba(15,23,42,0.08)] transition-colors duration-200 hover:border-lernex-blue/40 hover:text-lernex-blue dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-lernex-blue/50";

function AnalyticsContent() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { resolvedTheme } = useTheme();
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });
  const { user, userId, stats, loading: statsLoading } = useProfileStats();
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [attemptCount, setAttemptCount] = useState(0);
  const [subjectStates, setSubjectStates] = useState<SubjectStateRow[]>([]);
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<7 | 14 | 30>(14);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!resolvedTheme) return;
    setIsDark(resolvedTheme === "dark");
  }, [resolvedTheme]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAnalytics = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!userId) {
        setAttempts([]);
        setAttemptCount(0);
        setSubjectStates([]);
        setProfile(null);
        setUsage([]);
        setLoading(false);
        return;
      }

      if (opts?.silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const [attemptRes, countRes, stateRes, profileRes, usageRes] = await Promise.all([
          supabase
            .from("attempts")
            .select("subject, level, correct_count, total, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(400),
          supabase
            .from("attempts")
            .select("user_id", { count: "exact", head: true })
            .eq("user_id", userId),
          fetchUserSubjectStates(supabase, {
            userId,
            limit: 30,
            order: { column: "updated_at", ascending: false, nullsLast: true },
          }),
          supabase
            .from("profiles")
            .select("points, streak, total_cost, last_study_date, interests, placement_ready, subscription_tier")
            .eq("id", userId)
            .maybeSingle(),
          supabase
            .from("usage_logs")
            .select("model, input_tokens, output_tokens, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(120),
        ]);

        if (!mountedRef.current) return;

        if (attemptRes.error) throw attemptRes.error;
        if (countRes.error) throw countRes.error;
        if (stateRes.error) throw stateRes.error;
        if (profileRes.error) throw profileRes.error;
        if (usageRes.error) throw usageRes.error;

        const attemptRows = (attemptRes.data ?? []).map((row: unknown) =>
          normalizeAttempt(row as Record<string, unknown>)
        );
        const subjectRows = (stateRes.data ?? []).map((row: unknown) =>
          normalizeSubjectState(row as Record<string, unknown>)
        );
        const profileSnapshot = normalizeProfile(
          (profileRes.data as Record<string, unknown> | null | undefined) ?? null
        );
        const usageRows = (usageRes.data ?? []).map((row: unknown) =>
          normalizeUsage(row as Record<string, unknown>)
        );

        setAttempts(attemptRows);
        setAttemptCount(typeof countRes.count === "number" ? countRes.count : attemptRows.length);
        setSubjectStates(subjectRows);
        setProfile(profileSnapshot);
        setUsage(usageRows);
      } catch (err) {
        if (!mountedRef.current) return;
        console.error("[analytics] fetch error", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!mountedRef.current) return;
        if (opts?.silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [supabase, userId]
  );

  useEffect(() => {
    if (user === undefined) return;
    if (!user) {
      setLoading(false);
      return;
    }
    fetchAnalytics().catch(() => {});
  }, [user, fetchAnalytics]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`analytics-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attempts", filter: `user_id=eq.${userId}` },
        () => fetchAnalytics({ silent: true }).catch(() => {})
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_subject_state",
          filter: `user_id=eq.${userId}`,
        },
        () => fetchAnalytics({ silent: true }).catch(() => {})
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "usage_logs", filter: `user_id=eq.${userId}` },
        () => fetchAnalytics({ silent: true }).catch(() => {})
      );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, fetchAnalytics]);

  const totalCorrect = useMemo(
    () => attempts.reduce((sum, attempt) => sum + attempt.correctCount, 0),
    [attempts]
  );
  const totalQuestions = useMemo(
    () => attempts.reduce((sum, attempt) => sum + attempt.total, 0),
    [attempts]
  );
  const averageAccuracy = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;
  const perfectSessions = useMemo(
    () =>
      attempts.filter((attempt) => attempt.total > 0 && attempt.correctCount === attempt.total).length,
    [attempts]
  );
  const lastActive = attempts.length > 0 ? attempts[0].createdAt : profile?.lastStudyDate ?? stats?.lastStudyDate ?? null;
  const streak = stats?.streak ?? profile?.streak ?? 0;
  const points = stats?.points ?? profile?.points ?? 0;

  const dailySeries = useMemo(() => buildDailySeries(attempts, timeframe), [attempts, timeframe]);
  const heatmapSeries = useMemo(() => buildHeatmap(attempts, 28), [attempts]);
  const accuracySeries = useMemo(
    () => dailySeries.map((day) => (day.total > 0 ? day.correct / day.total : 0)),
    [dailySeries]
  );
  const activeDays = dailySeries.filter((day) => day.attempts > 0).length;
  const consistency = timeframe > 0 ? activeDays / timeframe : 0;
  const momentumScore = Math.round(clamp01(consistency * 0.6 + averageAccuracy * 0.4) * 100);
  const trendDelta = accuracySeries.length > 1 ? accuracySeries[accuracySeries.length - 1] - accuracySeries[0] : 0;
  const TrendIcon = pickTrendIcon(trendDelta);

  const subjectInsights = useMemo<SubjectInsight[]>(() => {
    const map = new Map<string, SubjectInsight>();
    attempts.forEach((attempt) => {
      const key = attempt.subject;
      const existing = map.get(key) ?? {
        subject: key,
        attempts: 0,
        correct: 0,
        total: 0,
        lastActivity: null,
        mastery: null,
        course: null,
        nextTopic: null,
        masteryUpdatedAt: null,
        difficulty: null,
      };
      existing.attempts += 1;
      existing.correct += attempt.correctCount;
      existing.total += attempt.total;
      if (attempt.createdAt && (!existing.lastActivity || attempt.createdAt > existing.lastActivity)) {
        existing.lastActivity = attempt.createdAt;
      }
      map.set(key, existing);
    });

    subjectStates.forEach((state) => {
      const key = state.subject;
      const existing = map.get(key) ?? {
        subject: key,
        attempts: 0,
        correct: 0,
        total: 0,
        lastActivity: null,
        mastery: null,
        course: null,
        nextTopic: null,
        masteryUpdatedAt: null,
        difficulty: null,
      };
      existing.mastery = state.mastery == null ? existing.mastery : Math.max(0, Math.min(100, state.mastery));
      existing.course = state.course ?? existing.course;
      existing.nextTopic = state.nextTopic ?? existing.nextTopic;
      existing.masteryUpdatedAt = state.updatedAt ?? existing.masteryUpdatedAt;
      existing.difficulty = state.difficulty ?? existing.difficulty;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.attempts - a.attempts);
  }, [attempts, subjectStates]);

  const usageSummary = useMemo(() => {
    const totals = usage.reduce(
      (acc, row) => {
        acc.input += row.inputTokens;
        acc.output += row.outputTokens;
        const cost = calcCost(row.model ?? "", row.inputTokens, row.outputTokens);
        acc.cost += cost;
        const key = row.model ?? "Other";
        const existing = acc.byModel.get(key) ?? { model: key, input: 0, output: 0, cost: 0 };
        existing.input += row.inputTokens;
        existing.output += row.outputTokens;
        existing.cost += cost;
        acc.byModel.set(key, existing);
        return acc;
      },
      { input: 0, output: 0, cost: 0, byModel: new Map<string, { model: string; input: number; output: number; cost: number }>() }
    );
    return {
      totalInput: totals.input,
      totalOutput: totals.output,
      totalTokens: totals.input + totals.output,
      totalCost: totals.cost,
      byModel: Array.from(totals.byModel.values()).sort((a, b) => b.cost - a.cost),
    };
  }, [usage]);

  const planLabel = profile?.subscription_tier === "premium" ? "Premium" : profile?.subscription_tier === "plus" ? "Plus" : "Free";
  const usageAllowance = USAGE_LIMITS[profile?.subscription_tier ?? "free"];
  const usageSpent = profile?.totalCost ?? usageSummary.totalCost;
  const usageFill = usageAllowance > 0 ? clamp01(usageSpent / usageAllowance) : 0;
  const usagePercentUsed = Math.round(usageFill * 100);
  const usagePercentRemaining =
    usageAllowance > 0 ? Math.round(clamp01((usageAllowance - usageSpent) / usageAllowance) * 100) : 0;
  const usageBarWidth = usageFill > 0 ? Math.min(100, Math.max(8, usageFill * 100)) : 0;
  const usageStatusMessage = useMemo(() => {
    if (usageAllowance <= 0) {
      return "Usage limits are unavailable right now.";
    }
    if (usagePercentRemaining <= 0) {
      return "You've reached your included usage. Additional activity may exceed your plan.";
    }
    if (usagePercentRemaining < 25) {
      return "You're close to the end of your included usage—consider upgrading for more room.";
    }
    if (usagePercentRemaining < 60) {
      return "You're past the halfway mark. Keep an eye on AI usage as you explore lessons.";
    }
    return "Plenty of usage remaining—enjoy exploring new lessons.";
  }, [usageAllowance, usagePercentRemaining]);

  const recommendations = useMemo<Recommendation[]>(() => {
    const recs: Recommendation[] = [];
    if (attempts.length === 0) {
      recs.push({
        id: "get-started",
        title: "Start your first adaptive session",
        detail: "Generate a personalised lesson to unlock tailored insights and mastery tracking.",
        icon: Sparkles,
      });
      recs.push({
        id: "choose-subject",
        title: "Pick a focus area",
        detail: "Add your interests so Lernex can prioritise the subjects that matter most to you.",
        icon: Target,
      });
      return recs;
    }

    if (trendDelta < -0.04) {
      recs.push({
        id: "steady-up",
        title: "Accuracy dipped this week",
        detail: "Revisit recent quizzes to reinforce tricky concepts and recover your confidence.",
        icon: Activity,
      });
    } else if (trendDelta > 0.04) {
      recs.push({
        id: "strong-trend",
        title: "Momentum is rising",
        detail: "Capitalize on the growth by locking in another focused session today.",
        icon: TrendingUp,
      });
    }

    const subjectsWithAttempts = subjectInsights.filter((subject) => subject.total > 0);
    if (subjectsWithAttempts.length > 0) {
      const lowestAccuracy = [...subjectsWithAttempts].sort(
        (a, b) => a.correct / a.total - b.correct / b.total
      )[0];
      const accuracy = lowestAccuracy.total > 0 ? lowestAccuracy.correct / lowestAccuracy.total : 0;
      if (accuracy < 0.85) {
        recs.push({
          id: `review-${lowestAccuracy.subject}`,
          title: `Reinforce ${lowestAccuracy.subject}`,
          detail: `Schedule a quick review on ${lowestAccuracy.subject} to lift accuracy above ${formatPercent(0.9)}.`,
          icon: Target,
        });
      }
    }

    const masteryFocus = subjectInsights.find((subject) => (subject.mastery ?? 0) >= 80 && subject.nextTopic);
    if (masteryFocus) {
      recs.push({
        id: `next-${masteryFocus.subject}`,
        title: `${masteryFocus.subject} is almost mastered`,
        detail: `Tackle "${masteryFocus.nextTopic}" to push mastery above ${formatPercent((masteryFocus.mastery ?? 0) / 100 + 0.1)}.`,
        icon: Sparkles,
      });
    }

    if (consistency < 0.4) {
      recs.push({
        id: "consistency",
        title: "Build a steadier rhythm",
        detail: "Aim for short 10-minute sessions on three different days this week to raise consistency.",
        icon: Clock,
      });
    }

    return recs.slice(0, 3);
  }, [attempts, subjectInsights, trendDelta, consistency]);

  const waitingForAuth = user === undefined || statsLoading;

  if (waitingForAuth || (loading && attempts.length === 0 && !error)) {
    return (
      <main className={`${pageShell} max-w-5xl px-4 py-10`}>
        <div className="space-y-6">
          {[...Array(4)].map((_, idx) => (
            <div
              key={idx}
              className="h-40 animate-pulse rounded-2xl border border-slate-100/80 bg-gradient-to-br from-slate-100/70 via-white/80 to-white/95 dark:border-slate-800/80 dark:bg-[linear-gradient(140deg,rgba(30,41,59,0.55),rgba(15,23,42,0.7))]"
            />
          ))}
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={`${pageShell} max-w-3xl px-4 py-12`}>
        <div className={`${cardBase} text-center`}>
          <Sparkles className="mx-auto h-8 w-8 text-lernex-blue" />
          <h1 className="mt-4 text-2xl font-semibold">Sign in to unlock your analytics</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            Track your accuracy, streaks, and mastery progress once you start learning with Lernex.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={`${pageShell} max-w-6xl px-4 pb-16 pt-10`}>
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
            <BarChart3 className="h-4 w-4" />
            Insight Dashboard
          </div>
          <h1 className="mt-2 text-3xl font-semibold leading-tight">Your learning analytics</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-300">
            Visualise your progress, identify focus areas, and keep momentum with personalised insights.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span className={chipBase}>
              <CalendarRange className="h-3.5 w-3.5" />
              Last {timeframe} days overview
            </span>
            <span className={chipBase}>
              <Flame className="h-3.5 w-3.5" />
              {streak > 0 ? `${streak} day ${streak === 1 ? "streak" : "streaks"}` : "Start your streak"}
            </span>
            {lastActive ? (
              <span className={chipBase}>
                <Clock className="h-3.5 w-3.5" />
                Last active {formatRelativeDate(lastActive)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="rounded-full border border-slate-200/70 bg-white/80 px-1.5 py-1 shadow-[0_8px_20px_-12px_rgba(15,23,42,0.35)] backdrop-blur-md transition dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-[0_10px_28px_-18px_rgba(0,0,0,0.55)]">
            {[7, 14, 30].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTimeframe(option as 7 | 14 | 30)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  timeframe === option
                    ? "bg-lernex-blue text-white shadow-[0_12px_24px_-12px_rgba(37,99,235,0.55)]"
                    : "text-slate-500 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-800/70"
                }`}
              >
                {option}d
              </button>
            ))}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.35)] transition-colors hover:border-lernex-blue/50 hover:text-lernex-blue dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200 dark:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.55)]"
            onClick={() => fetchAnalytics().catch(() => {})}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className={`${cardBase} mt-6 border-red-200 bg-red-50/60 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200`}>
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6" />
            <div>
              <h2 className="text-lg font-semibold">We hit a snag loading your data</h2>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          </div>
          <button
            type="button"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-lernex-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow"
            onClick={() => fetchAnalytics().catch(() => {})}
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      ) : null}

      <section className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Avg accuracy</h3>
              <p className="mt-2 text-3xl font-semibold">{formatPercent(averageAccuracy)}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-lernex-blue/10 text-lernex-blue dark:bg-lernex-blue/25">
              <Target className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <TrendIcon className={`h-4 w-4 ${trendDelta > 0 ? "text-emerald-500" : trendDelta < 0 ? "text-red-500" : "text-neutral-400"}`} />
            <span>
              {trendDelta > 0
                ? `Up ${formatPercent(trendDelta)} vs period start`
                : trendDelta < 0
                  ? `Down ${formatPercent(Math.abs(trendDelta))}`
                  : "Holding steady"}
            </span>
          </div>
          <div className="mt-4">
            <Sparkline values={accuracySeries} isDark={isDark} />
          </div>
        </div>

        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Sessions tracked</h3>
              <p className="mt-2 text-3xl font-semibold">{formatNumber(attemptCount)}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/25">
              <Activity className="h-6 w-6" />
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-300">{perfectSessions} perfect {perfectSessions === 1 ? "session" : "sessions"}</p>
          <div className="mt-4">
            <div className="flex items-baseline gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <span>{formatNumber(activeDays)} active {activeDays === 1 ? "day" : "days"}</span>
              <span>•</span>
              <span>{formatPercent(consistency)} consistency</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <RadialMeter value={consistency} label="Consistency" isDark={isDark} />
              <div className="text-right text-sm">
                <div className="font-semibold">{momentumScore}</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">Momentum score</div>
              </div>
            </div>
          </div>
        </div>

        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Points earned</h3>
              <p className="mt-2 text-3xl font-semibold">{formatNumber(points)}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 dark:bg-amber-500/20">
              <Zap className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Flame className="h-4 w-4 text-orange-500" />
            <span>{streak > 0 ? `${streak} day streak` : "Establish a streak"}</span>
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-300">
            Keep the streak alive for bonus mastery boosts.
          </p>
        </div>

        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">AI usage</h3>
              <p className="mt-2 text-3xl font-semibold">
                ${usageSummary.totalCost.toFixed(2)}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 dark:bg-purple-500/25">
              <LineChart className="h-6 w-6" />
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-300">{formatTokens(usageSummary.totalTokens)}</p>
          <div className="mt-3 space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            {usageSummary.byModel.slice(0, 2).map((entry) => (
              <div key={entry.model} className="flex items-center justify-between">
                <span className="truncate">{entry.model}</span>
                <span>${entry.cost.toFixed(2)}</span>
              </div>
            ))}
            {usageSummary.byModel.length === 0 ? <span>No recent usage</span> : null}
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className={`${cardBase} lg:col-span-2`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Progress trend</h2>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Accuracy & activity by day</div>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <span>Accuracy</span>
                <span>{formatPercent(averageAccuracy)}</span>
              </div>
              <Sparkline values={accuracySeries} isDark={isDark} />
              <div className="mt-4 flex gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
                {dailySeries.slice(-3).map((day) => (
                  <div
                    key={day.date}
                    className="flex-1 rounded-xl border border-slate-100/70 bg-gradient-to-br from-slate-100/80 via-white/80 to-white/95 p-3 shadow-sm transition hover:shadow-md dark:border-slate-800/70 dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.55),rgba(15,23,42,0.7))]"
                  >
                    <div className="text-[10px] uppercase tracking-wide">{formatDateLabel(day.date)}</div>
                    <div className="mt-1 text-sm font-semibold">{formatPercent(day.total > 0 ? day.correct / day.total : 0)}</div>
                    <div className="text-[11px]">{day.attempts} {day.attempts === 1 ? "session" : "sessions"}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <Activity className="h-4 w-4" />
                  Sessions per day
                </div>
                <div className="mt-3 flex items-end gap-1">
                  {dailySeries.map((day) => {
                    const height = day.attempts === 0 ? 4 : 10 + Math.min(60, day.attempts * 12);
                    return (
                      <div
                        key={day.date}
                        className="flex-1 rounded-full bg-lernex-blue/20 dark:bg-lernex-blue/40"
                        style={{ height }}
                        title={`${formatDateLabel(day.date)} • ${day.attempts} ${day.attempts === 1 ? "session" : "sessions"}`}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100/70 bg-gradient-to-br from-slate-100/75 via-white/80 to-white/95 p-4 text-xs text-neutral-600 shadow-sm dark:border-slate-800/70 dark:bg-[linear-gradient(140deg,rgba(30,41,59,0.55),rgba(15,23,42,0.72))] dark:text-neutral-300">
                <div className="flex items-center gap-2">
                  <CircleCheck className="h-4 w-4 text-emerald-500" />
                  {formatNumber(perfectSessions)} perfect sessions so far
                </div>
                <div className="mt-2">
                  Average {formatPercent(averageAccuracy)} accuracy over {timeframe} days with {formatNumber(activeDays)} active {activeDays === 1 ? "day" : "days"}.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Study heatmap</h2>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Last 4 weeks</span>
          </div>
          <div className="mt-5">
            <HeatmapGrid points={heatmapSeries} isDark={isDark} />
          </div>
          <div className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
            Strongest day: {(() => {
              const peak = heatmapSeries.reduce((best, item) => (item.attempts > best.attempts ? item : best), {
                date: "",
                attempts: 0,
              });
              return peak.attempts > 0
                ? `${formatDateLabel(peak.date)} · ${peak.attempts} ${peak.attempts === 1 ? "session" : "sessions"}`
                : "Start your first session";
            })()}
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Subject focus</h2>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Breakdown by accuracy</span>
          </div>
          <div className="mt-5 space-y-4">
            {subjectInsights.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-300">Start a lesson to view subject-level insights.</p>
            ) : (
              subjectInsights.slice(0, 6).map((subject) => {
                const share = attemptCount > 0 ? subject.attempts / attemptCount : 0;
                const accuracy = subject.total > 0 ? subject.correct / subject.total : 0;
                return (
                  <div key={subject.subject}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{subject.subject}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {formatPercent(accuracy)} • {formatNumber(subject.attempts)} {subject.attempts === 1 ? "session" : "sessions"}
                      </div>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800">
                      <div
                        className="h-full rounded-full bg-lernex-blue"
                        style={{ width: `${Math.max(8, clamp01(accuracy) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                      <span className={chipBase.replace("px-3", "px-2")}>{formatPercent(share)} of activity</span>
                      {subject.mastery != null ? (
                        <span className={chipBase.replace("px-3", "px-2")}>
                          Mastery {Math.round(subject.mastery)}%
                        </span>
                      ) : null}
                      {subject.nextTopic ? (
                        <span className={chipBase.replace("px-3", "px-2")}>
                          Next: {subject.nextTopic}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Performance coach</h2>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Actionable next steps</span>
          </div>
          <ul className="mt-5 space-y-4 text-sm text-neutral-600 dark:text-neutral-300">
            {recommendations.length === 0 ? (
              <li className="rounded-xl border border-slate-100/70 bg-gradient-to-br from-slate-100/75 via-white/85 to-white/95 p-4 text-xs text-neutral-500 shadow-sm dark:border-slate-800/70 dark:bg-[linear-gradient(140deg,rgba(30,41,59,0.55),rgba(15,23,42,0.72))] dark:text-neutral-300">
                Keep exploring lessons to discover new personalised recommendations.
              </li>
            ) : (
              recommendations.map((rec) => (
                <li
                  key={rec.id}
                  className="rounded-xl border border-slate-100/70 bg-gradient-to-br from-slate-100/75 via-white/85 to-white/95 p-4 shadow-sm transition hover:shadow-md dark:border-slate-800/70 dark:bg-[linear-gradient(140deg,rgba(30,41,59,0.55),rgba(15,23,42,0.72))]"
                >
                  <div className="flex items-start gap-3">
                    <rec.icon className="mt-1 h-5 w-5 text-lernex-blue" />
                    <div>
                      <div className="font-semibold">{rec.title}</div>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{rec.detail}</p>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent sessions</h2>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Latest quizzes</span>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100/80 shadow-[0_12px_36px_-24px_rgba(15,23,42,0.28)] dark:border-slate-800/80 dark:shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
            <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
              <thead className="bg-gradient-to-r from-slate-100/75 via-white/80 to-white/95 text-xs uppercase tracking-wide text-neutral-500 dark:bg-[linear-gradient(140deg,rgba(30,41,59,0.6),rgba(15,23,42,0.78))] dark:text-neutral-300">
                <tr>
                  <th className="px-4 py-3 text-left">Subject</th>
                  <th className="px-4 py-3 text-left">Accuracy</th>
                  <th className="px-4 py-3 text-left">Level</th>
                  <th className="px-4 py-3 text-left">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {attempts.slice(0, 8).map((attempt, index) => (
                  <tr
                    key={`${attempt.createdAt}-${index}`}
                    className="bg-gradient-to-r from-white/95 via-white/90 to-slate-50/85 text-neutral-700 transition hover:bg-lernex-blue/5 dark:bg-[linear-gradient(140deg,rgba(17,24,39,0.82),rgba(15,23,42,0.9))] dark:text-neutral-200"
                  >
                    <td className="px-4 py-3 font-medium">{attempt.subject}</td>
                    <td className="px-4 py-3">
                      {attempt.total > 0 ? `${attempt.correctCount}/${attempt.total}` : "—"}
                      <span className="ml-2 text-xs text-neutral-500">
                        {attempt.total > 0 ? formatPercent(attempt.correctCount / attempt.total) : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs uppercase tracking-wide text-neutral-500">
                      {attempt.level ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {formatRelativeDate(attempt.createdAt)}
                    </td>
                  </tr>
                ))}
                {attempts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-xs text-neutral-500 dark:text-neutral-300">
                      Complete a quiz to populate your session history.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className={cardBase}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Usage remaining</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className={chipBase.replace("px-3", "px-2")}>{planLabel} plan</span>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                    {Math.max(0, usagePercentRemaining)}% left
                  </span>
                  <span className="rounded-full bg-lernex-blue/10 px-2 py-1 text-[11px] font-medium text-lernex-blue dark:bg-lernex-blue/15">
                    {profile?.subscription_tier === "free" ? "Daily limit" : "Monthly limit"}
                  </span>
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/25">
                <Gauge className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-400/10 via-lernex-blue/10 to-purple-500/15 p-4 shadow-sm dark:border-emerald-400/25 dark:from-emerald-400/20 dark:via-lernex-blue/15 dark:to-purple-500/25">
              <div className="flex items-baseline justify-between text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                <span>{usagePercentRemaining > 0 ? `${usagePercentRemaining}% remaining` : "0% remaining"}</span>
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {usagePercentUsed}% used
                </span>
              </div>
              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/60 dark:bg-slate-900/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-lernex-blue to-purple-500 transition-all duration-500"
                  style={{ width: `${usageBarWidth}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-300">
                <span>Used ${usageSpent.toFixed(2)} of ${usageAllowance.toFixed(2)}</span>
                <span>{usagePercentRemaining <= 0 ? "Limit reached" : profile?.subscription_tier === "free" ? "Resets daily" : "Resets monthly"}</span>
              </div>
            </div>
            <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-300">{usageStatusMessage}</p>
          </div>

          <div className={cardBase}>
            <h2 className="text-lg font-semibold">AI usage insights</h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              Track model usage and keep an eye on token spend as you explore new content.
            </p>
            <div className="mt-4 space-y-4 text-xs text-neutral-600 dark:text-neutral-300">
              <div className="flex items-center justify-between">
                <span>Total tokens</span>
                <span>{formatTokens(usageSummary.totalTokens)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Input vs output</span>
                <span>
                  {formatTokens(usageSummary.totalInput)}
                  <span className="text-neutral-400"> → </span>
                  {formatTokens(usageSummary.totalOutput)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated cost</span>
                <span>${usageSummary.totalCost.toFixed(2)}</span>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Top models
                </div>
                <div className="mt-2 space-y-2">
                  {usageSummary.byModel.slice(0, 4).map((entry) => (
                    <div
                      key={entry.model}
                      className="flex items-center justify-between rounded-xl border border-slate-100/70 bg-gradient-to-br from-slate-100/75 via-white/88 to-white/95 px-3 py-2 shadow-sm dark:border-slate-800/70 dark:bg-[linear-gradient(145deg,rgba(30,41,59,0.55),rgba(15,23,42,0.72))]"
                    >
                      <div>
                        <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{entry.model}</div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {formatTokens(entry.input + entry.output)}
                        </div>
                      </div>
                      <div className="text-sm font-semibold">${entry.cost.toFixed(2)}</div>
                    </div>
                  ))}
                  {usageSummary.byModel.length === 0 ? (
                    <div className="rounded-xl border border-slate-100/70 bg-gradient-to-r from-slate-100/70 via-white/85 to-white/95 px-3 py-2 text-[11px] text-neutral-500 shadow-sm dark:border-slate-800/70 dark:bg-[linear-gradient(145deg,rgba(30,41,59,0.55),rgba(15,23,42,0.72))] dark:text-neutral-300">
                      Usage insights appear once you start generating lessons.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className={cardBase}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Ready for your next milestone?</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {streak > 0
                  ? `Keep the ${streak}-day streak alive by tackling a fresh quiz in your top subject.`
                  : "Kick off a streak by committing to one short session today."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/fyp"
                className="inline-flex items-center gap-2 rounded-full bg-lernex-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow"
              >
                <Sparkles className="h-4 w-4" />
                Generate lesson
              </Link>
              <Link
                href="/playlists"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.35)] transition-colors hover:border-lernex-blue/50 hover:text-lernex-blue dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200 dark:shadow-[0_14px_32px_-18px_rgba(0,0,0,0.55)]"
              >
                <TrendingUp className="h-4 w-4" />
                Explore playlists
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function AnalyticsPage() {
  return (
    <ErrorBoundary>
      <AnalyticsContent />
    </ErrorBoundary>
  );
}
