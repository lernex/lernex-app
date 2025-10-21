"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useLernexStore } from "@/lib/store";
import { useProfileStats } from "@/app/providers/ProfileStatsProvider";
import type { Database } from "@/lib/types_db";
import type { LucideIcon } from "lucide-react";
import { Crown, Sparkles, Flame, Target, Trophy } from "lucide-react";

const POINTS_PER_CORRECT = 10;

type AppSupabaseClient = SupabaseClient<Database>;

type Scope = "global" | "friends";
type Range = "all" | "monthly" | "weekly" | "daily";

const SCOPE_OPTIONS: Array<{ value: Scope; label: string }> = [
  { value: "global", label: "Global" },
  { value: "friends", label: "Friends" },
];

const RANGE_OPTIONS: Array<{ value: Range; label: string }> = [
  { value: "all", label: "All Time" },
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
];

type ProfileRow = {
  id: string;
  username: string | null;
  points: number | null;
  streak: number | null;
  plus: boolean;
  premium: boolean;
};

type RawProfile = {
  id?: unknown;
  username?: unknown;
  points?: unknown;
  streak?: unknown;
  plus?: unknown;
  premium?: unknown;
};

function toStr(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function toStrOrNull(value: unknown): string | null {
  return value == null ? null : toStr(value);
}

function toNumOrNull(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized === "true" || normalized === "t" || normalized === "1";
  }
  return false;
}

function normalizeProfiles(rows: unknown[] | null | undefined): ProfileRow[] {
  const arr = Array.isArray(rows) ? (rows as RawProfile[]) : [];
  return arr.map((row) => ({
    id: toStr(row.id),
    username: toStrOrNull(row.username),
    points: toNumOrNull(row.points),
    streak: toNumOrNull(row.streak),
    plus: toBool(row.plus),
    premium: toBool(row.premium),
  }));
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  ids.forEach((id) => {
    if (typeof id === "string" && id.length > 0) {
      seen.add(id);
    }
  });
  return Array.from(seen);
}

function calcRangeStart(range: Range): Date {
  const now = new Date();
  switch (range) {
    case "daily":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "weekly":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "monthly": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      return start;
    }
    default:
      return new Date(0);
  }
}

type AttemptRow = Database["public"]["Tables"]["attempts"]["Row"];

async function fetchAttemptTotals(
  supabase: AppSupabaseClient,
  rangeStart: Date,
  scopedIds: string[] | null
): Promise<Map<string, number>> {
  let query = supabase
    .from("attempts")
    .select("user_id, correct_count, created_at")
    .gte("created_at", rangeStart.toISOString());

  if (scopedIds && scopedIds.length > 0) {
    query = query.in("user_id", scopedIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const totals = new Map<string, number>();
  (data as AttemptRow[] | null | undefined)?.forEach((row) => {
    const userId = typeof row.user_id === "string" ? row.user_id : null;
    if (!userId) {
      return;
    }
    const correct =
      typeof row.correct_count === "number"
        ? row.correct_count
        : Number(row.correct_count ?? 0);
    totals.set(userId, (totals.get(userId) ?? 0) + (Number.isFinite(correct) ? correct : 0));
  });

  return totals;
}

type Tier = "premium" | "plus" | null;

function resolveTier(plus: boolean, premium: boolean): Tier {
  if (premium) return "premium";
  if (plus) return "plus";
  return null;
}

function getLeaderboardRowClasses(tier: Tier, isSelf: boolean, index: number): string {
  const base =
    "group relative flex items-center justify-between rounded-xl border px-3 py-2 ring-offset-2 ring-offset-white transition-all duration-200 ease-out dark:ring-offset-lernex-charcoal";
  if (isSelf) {
    return [
      base,
      "border-transparent bg-lernex-blue/15 ring-2 ring-lernex-blue/50 shadow-[0_10px_30px_rgba(59,130,246,0.25)] dark:bg-lernex-blue/25",
    ].join(" ");
  }
  if (tier === "premium") {
    return [
      base,
      "border-amber-200/70 bg-gradient-to-r from-amber-50/90 via-orange-50/90 to-rose-50/90 text-amber-900 shadow-[0_12px_36px_rgba(251,191,36,0.28)] dark:border-amber-400/30 dark:from-amber-500/15 dark:via-orange-500/15 dark:to-rose-500/15",
    ].join(" ");
  }
  if (tier === "plus") {
    return [
      base,
      "border-indigo-200/70 bg-gradient-to-r from-indigo-50/90 via-purple-50/90 to-fuchsia-50/90 text-indigo-900 shadow-[0_10px_28px_rgba(129,140,248,0.25)] dark:border-indigo-400/30 dark:from-indigo-500/15 dark:via-purple-500/15 dark:to-fuchsia-500/15",
    ].join(" ");
  }
  if (index < 3) {
    return [
      base,
      "border-transparent bg-gradient-to-r from-white/90 via-neutral-100/90 to-white/90 shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:from-white/10 dark:via-neutral-900/40 dark:to-white/5",
    ].join(" ");
  }
  return [
    base,
    "border-neutral-200/60 bg-white/85 hover:bg-white dark:border-neutral-800 dark:bg-neutral-900/70 dark:hover:bg-neutral-900/60",
  ].join(" ");
}

function getRankBadgeClasses(index: number): string {
  const base =
    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shadow-inner";
  if (index === 0) {
    return `${base} bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-[0_4px_16px_rgba(99,102,241,0.35)]`;
  }
  if (index === 1) {
    return `${base} bg-gradient-to-br from-neutral-200 to-neutral-100 text-neutral-700 shadow-[0_4px_14px_rgba(156,163,175,0.25)] dark:from-neutral-700 dark:to-neutral-600 dark:text-white`;
  }
  if (index === 2) {
    return `${base} bg-gradient-to-br from-amber-200 to-orange-200 text-neutral-800 shadow-[0_4px_14px_rgba(251,191,36,0.3)] dark:from-amber-400 dark:to-orange-500 dark:text-neutral-900`;
  }
  return `${base} bg-white/80 text-neutral-600 shadow-[0_2px_8px_rgba(15,23,42,0.12)] dark:bg-neutral-900/60 dark:text-neutral-300`;
}

function TierBadge({
  tier,
  variant = "icon",
}: {
  tier: Tier;
  variant?: "icon" | "pill";
}) {
  if (!tier) return null;
  const Icon = tier === "premium" ? Crown : Sparkles;
  const label = tier === "premium" ? "Premium member" : "Plus member";
  if (variant === "pill") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-[0_0_14px_rgba(99,102,241,0.28)] ${
          tier === "premium"
            ? "bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500"
            : "bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500"
        }`}
        aria-label={label}
        title={label}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
        {tier === "premium" ? "Premium" : "Plus"}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full shadow-inner ${
        tier === "premium"
          ? "bg-gradient-to-br from-amber-500/30 via-orange-500/25 to-rose-500/30 text-amber-600 dark:text-amber-300"
          : "bg-gradient-to-br from-indigo-500/30 via-purple-500/30 to-fuchsia-500/30 text-indigo-500 dark:text-indigo-300"
      }`}
      aria-label={label}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
    </span>
  );
}

export default function Leaderboard() {
  const supabase = useMemo<AppSupabaseClient>(() => supabaseBrowser(), []);
  const { accuracyBySubject } = useLernexStore();
  const { stats } = useProfileStats();
  const points = stats?.points ?? 0;
  const streak = stats?.streak ?? 0;
  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);

  const bestSubject = Object.entries(accuracyBySubject).sort((a, b) => {
    const ap = a[1].total ? a[1].correct / a[1].total : 0;
    const bp = b[1].total ? b[1].correct / b[1].total : 0;
    return bp - ap;
  })[0]?.[0];

  const [topPoints, setTopPoints] = useState<ProfileRow[]>([]);
  const [topStreak, setTopStreak] = useState<ProfileRow[]>([]);
  const [rankPoints, setRankPoints] = useState<number | null>(null);
  const [rankStreak, setRankStreak] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("global");
  const [range, setRange] = useState<Range>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showStreakLeaderboard = range === "all";
  const podium = topPoints.slice(0, 3);
  const champion = podium[0];
  const championTier = champion ? resolveTier(champion.plus, champion.premium) : null;
  const activeRangeLabel =
    RANGE_OPTIONS.find((option) => option.value === range)?.label ?? "All Time";
  const personalCards: Array<{
    label: string;
    value: string;
    subLabel: string;
    Icon: LucideIcon;
    gradient: string;
    border: string;
  }> = [
    {
      label: "Your Streak",
      value: numberFormatter.format(streak),
      subLabel: rankStreak ? `Rank #${rankStreak}` : "Keep your streak alive",
      Icon: Flame,
      gradient: "from-orange-500/20 via-amber-500/10 to-rose-500/10",
      border: "border-orange-200/60 dark:border-orange-400/30",
    },
    {
      label: "Your Points",
      value: numberFormatter.format(points),
      subLabel: rankPoints ? `Rank #${rankPoints}` : "Answer micro-lessons to rise",
      Icon: Trophy,
      gradient: "from-lernex-blue/20 via-lernex-purple/15 to-cyan-500/10",
      border: "border-lernex-blue/40 dark:border-lernex-blue/40",
    },
    {
      label: "Best Subject",
      value: bestSubject ?? "-",
      subLabel: bestSubject
        ? "Your sharpest subject this week"
        : "Keep exploring to discover a standout",
      Icon: Target,
      gradient: "from-emerald-500/20 via-teal-500/10 to-cyan-500/10",
      border: "border-emerald-200/60 dark:border-emerald-400/25",
    },
  ];

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: auth } = await supabase.auth.getUser();
        if (cancelled) return;
        const uid = auth.user?.id ?? null;
        setUserId(uid);

        if (scope === "friends" && !uid) {
          setTopPoints([]);
          setTopStreak([]);
          setRankPoints(null);
          setRankStreak(null);
          setError("Sign in to see your friends leaderboard.");
          return;
        }

        type FriendshipRow = {
          user_a: string;
          user_b: string;
        };

        let friendIds: string[] = [];
        if (uid) {
          const { data: friendRows, error: friendError } = await supabase
            .from("friendships")
            .select("user_a, user_b")
            .or(`user_a.eq.${uid},user_b.eq.${uid}`);
          if (friendError) throw friendError;
          friendIds = uniqueIds(
            ((friendRows ?? []) as FriendshipRow[]).map((row) => {
              const a = typeof row.user_a === "string" ? row.user_a : null;
              const b = typeof row.user_b === "string" ? row.user_b : null;
              return a === uid ? b : a;
            })
          );
        }

        const scopedIds =
          scope === "friends" && uid ? uniqueIds([uid, ...friendIds]) : null;
        const rangeStart = calcRangeStart(range);

        if (scope === "friends" && scopedIds && scopedIds.length === 0) {
          setTopPoints([]);
          setTopStreak([]);
        }

        let pointsRows: ProfileRow[] = [];
        let aggregatedTotals: Map<string, number> | null = null;
        if (range === "all") {
          if (scope === "friends" && scopedIds && scopedIds.length === 0) {
            pointsRows = [];
          } else {
            let pointsQuery = supabase
              .from("profiles")
              .select("id, username, points, streak, plus, premium")
              .order("points", { ascending: false })
              .limit(20);
            if (scope === "friends" && scopedIds && scopedIds.length) {
              pointsQuery = pointsQuery.in("id", scopedIds);
            }
            const { data, error: pointsError } = await pointsQuery;
            if (pointsError) throw pointsError;
            pointsRows = normalizeProfiles(data ?? []);
          }
        } else {
          if (scope === "friends" && scopedIds && scopedIds.length === 0) {
            pointsRows = [];
            aggregatedTotals = new Map();
          } else {
            const totals = await fetchAttemptTotals(
              supabase,
              rangeStart,
              scope === "friends" ? scopedIds : null
            );
            aggregatedTotals = totals;

            let aggregates: { id: string; totalCorrect: number }[];
            if (scope === "friends" && scopedIds && scopedIds.length) {
              aggregates = scopedIds.map((id) => ({
                id,
                totalCorrect: totals.get(id) ?? 0,
              }));
              aggregates.sort((a, b) => b.totalCorrect - a.totalCorrect);
            } else {
              aggregates = Array.from(totals.entries())
                .map(([id, totalCorrect]) => ({
                  id,
                  totalCorrect,
                }))
                .filter((entry) => entry.totalCorrect > 0)
                .sort((a, b) => b.totalCorrect - a.totalCorrect);
            }

            if (aggregates.length) {
              const PROFILE_FETCH_LIMIT = 60;
              let profileIds: string[] = [];
              if (scope === "friends" && scopedIds && scopedIds.length) {
                profileIds = scopedIds;
              } else {
                profileIds = aggregates
                  .slice(0, PROFILE_FETCH_LIMIT)
                  .map((entry) => entry.id);
                if (uid && !profileIds.includes(uid)) {
                  profileIds.push(uid);
                }
              }

              let profiles: ProfileRow[] = [];
              if (profileIds.length) {
                const { data: profileData, error: profileError } = await supabase
                  .from("profiles")
                  .select("id, username, points, streak, plus, premium")
                  .in("id", profileIds);
                if (profileError) throw profileError;
                profiles = normalizeProfiles(profileData ?? []);
              }

              const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
              pointsRows = aggregates.slice(0, 20).map((entry) => {
                const base = profileMap.get(entry.id);
                return {
                  id: entry.id,
                  username: base?.username ?? null,
                  points: entry.totalCorrect * POINTS_PER_CORRECT,
                  streak: base?.streak ?? null,
                  plus: base?.plus ?? false,
                  premium: base?.premium ?? false,
                };
              });
            } else {
              pointsRows = [];
            }
          }
        }

        if (cancelled) return;
        setTopPoints(pointsRows);

        let streakRows: ProfileRow[] = [];
        if (range === "all") {
          if (scope === "friends" && scopedIds && scopedIds.length === 0) {
            streakRows = [];
          } else {
            let streakQuery = supabase
              .from("profiles")
              .select("id, username, points, streak, plus, premium")
              .order("streak", { ascending: false })
              .limit(20);
            if (scope === "friends" && scopedIds && scopedIds.length) {
              streakQuery = streakQuery.in("id", scopedIds);
            }
            const { data: streakData, error: streakError } = await streakQuery;
            if (streakError) throw streakError;
            streakRows = normalizeProfiles(streakData ?? []);
          }
        }

        if (cancelled) return;
        setTopStreak(streakRows);

        if (!uid) {
          setRankPoints(null);
          setRankStreak(null);
          return;
        }

        if (range === "all") {
          const myPoints = stats?.points ?? 0;
          let rankQuery = supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gt("points", myPoints);
          if (scope === "friends" && scopedIds && scopedIds.length) {
            rankQuery = rankQuery.in("id", scopedIds);
          }
          const { count: higherPoints, error: rankError } = await rankQuery;
          if (rankError) throw rankError;
          setRankPoints(((higherPoints as number | null) ?? 0) + 1);
        } else if (aggregatedTotals) {
          const myCorrect = aggregatedTotals.get(uid) ?? 0;
          if (myCorrect > 0) {
            let higherRange = 0;
            aggregatedTotals.forEach((value) => {
              if (value > myCorrect) {
                higherRange += 1;
              }
            });
            setRankPoints(higherRange + 1);
          } else {
            setRankPoints(null);
          }
        } else {
          setRankPoints(null);
        }

        if (range === "all") {
          const myStreak = stats?.streak ?? 0;
          let streakRankQuery = supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gt("streak", myStreak);
          if (scope === "friends" && scopedIds && scopedIds.length) {
            streakRankQuery = streakRankQuery.in("id", scopedIds);
          }
          const { count: higherStreak, error: streakRankError } = await streakRankQuery;
          if (streakRankError) throw streakRankError;
          setRankStreak(((higherStreak as number | null) ?? 0) + 1);
        } else {
          setRankStreak(null);
        }
      } catch (err) {
        console.error("[leaderboard] load error", err);
        if (cancelled) return;
        setTopPoints([]);
        setTopStreak([]);
        setRankPoints(null);
        setRankStreak(null);
        setError("We couldn’t load the leaderboard right now.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supabase, scope, range, stats?.points, stats?.streak]);

  return (
    <main className="relative mx-auto min-h-[calc(100vh-56px)] w-full max-w-4xl overflow-hidden px-4 py-10 text-neutral-900 dark:text-white">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-gradient-to-br from-lernex-blue/20 via-lernex-purple/20 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute top-52 -right-24 h-80 w-80 rounded-full bg-gradient-to-br from-amber-300/20 via-orange-300/10 to-transparent blur-3xl dark:from-amber-400/15 dark:via-orange-500/10" />
      <div className="pointer-events-none absolute bottom-0 -left-24 h-80 w-80 rounded-full bg-gradient-to-tr from-indigo-400/15 via-sky-400/10 to-transparent blur-3xl dark:from-indigo-500/15 dark:via-sky-500/10" />
      <div className="relative z-[1] space-y-8">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="rounded-3xl border border-white/30 bg-white/70 px-6 py-8 shadow-xl backdrop-blur-lg dark:border-white/10 dark:bg-neutral-900/75"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-300">
                <span className="inline-block h-1 w-8 rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple" />
                Daily Momentum
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">Leaderboard</h1>
                <p className="max-w-xl text-sm text-neutral-600 dark:text-neutral-300">
                  Friendly competition powers consistent learning. Filter the view to see who is leading the charge.
                </p>
              </div>
              {champion ? (
                <div className="flex items-center gap-3 rounded-2xl border border-white/40 bg-white/60 px-3 py-2 text-sm shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-lernex-blue/40 via-lernex-purple/30 to-cyan-400/30 font-semibold text-neutral-900 dark:text-white">
                    #1
                  </span>
                  <div className="flex flex-col">
                    <span className="flex items-center gap-2 font-medium text-neutral-900 dark:text-white">
                      {champion.username ?? `Learner #${champion.id.slice(0, 6)}`}
                      <TierBadge tier={championTier} variant="pill" />
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-300">
                      {numberFormatter.format(champion.points ?? 0)} pts, {numberFormatter.format(champion.streak ?? 0)} day streak
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-3">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-white/40 bg-white/70 p-1 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                {SCOPE_OPTIONS.map((option) => {
                  const isActive = scope === option.value;
                  return (
                    <motion.button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setScope(option.value)}
                      whileTap={{ scale: 0.95 }}
                      whileHover={{ scale: isActive ? 1.02 : 1.03 }}
                      className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                        isActive
                          ? "bg-gradient-to-r from-lernex-blue to-lernex-purple text-white shadow-[0_10px_30px_rgba(99,102,241,0.25)]"
                          : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
                      }`}
                    >
                      {option.label}
                    </motion.button>
                  );
                })}
              </div>
              <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-white/40 bg-white/70 p-1 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                {RANGE_OPTIONS.map((option) => {
                  const isActive = range === option.value;
                  return (
                    <motion.button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setRange(option.value)}
                      whileTap={{ scale: 0.95 }}
                      whileHover={{ scale: isActive ? 1.02 : 1.03 }}
                      className={`relative rounded-full px-3.5 py-1 text-xs font-semibold uppercase tracking-wide transition-all ${
                        isActive
                          ? "bg-gradient-to-r from-lernex-purple to-lernex-blue text-white shadow-[0_8px_24px_rgba(147,51,234,0.25)]"
                          : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
                      }`}
                    >
                      {option.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.section>

        <section className="grid gap-4 sm:grid-cols-3">
          {personalCards.map((card, index) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 * index, ease: "easeOut" }}
              className={`relative overflow-hidden rounded-2xl border bg-white/75 p-4 shadow-lg backdrop-blur dark:bg-neutral-900/75 ${card.border}`}
            >
              <div className={`pointer-events-none absolute -top-12 right-0 h-28 w-28 rounded-full bg-gradient-to-br ${card.gradient} blur-3xl`} />
              <div className="relative flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-300">
                  {card.label}
                </span>
                <card.Icon className="h-5 w-5 text-neutral-400 dark:text-neutral-500" />
              </div>
              <div className="relative mt-3 text-3xl font-semibold text-neutral-900 dark:text-white">
                {card.value}
              </div>
              <div className="relative mt-1 text-xs text-neutral-500 dark:text-neutral-400">{card.subLabel}</div>
            </motion.div>
          ))}
        </section>

        {podium.length > 0 && (
          <section className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/70 px-6 py-6 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/70">
            <div className="pointer-events-none absolute -top-20 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-gradient-to-br from-lernex-purple/20 via-lernex-blue/15 to-transparent blur-3xl" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end">
              {podium.map((profile, index) => {
                const tier = resolveTier(profile.plus, profile.premium);
                const isChampion = index === 0;
                return (
                  <motion.div
                    key={profile.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.08 * index, ease: "easeOut" }}
                    className={`flex-1 rounded-2xl border px-4 py-5 shadow-lg backdrop-blur-sm ${
                      isChampion
                        ? "border-lernex-blue/40 bg-gradient-to-br from-lernex-blue/15 via-lernex-purple/15 to-cyan-500/10 text-neutral-900 dark:text-white"
                        : "border-white/40 bg-white/60 text-neutral-900 shadow-md dark:border-white/10 dark:bg-neutral-900/65 dark:text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                      <span>{index === 0 ? "Champion" : index === 1 ? "Runner Up" : "Top Contender"}</span>
                      <span>#{index + 1}</span>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-lg font-semibold">
                      <span>{profile.username ?? `Learner #${profile.id.slice(0, 6)}`}</span>
                      <TierBadge tier={tier} />
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300">
                      <span>{numberFormatter.format(profile.points ?? 0)} pts</span>
                      <span>{numberFormatter.format(profile.streak ?? 0)} day streak</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        <section className={`grid gap-6 ${showStreakLeaderboard ? "lg:grid-cols-2" : ""}`}>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="rounded-3xl border border-white/20 bg-white/75 p-5 shadow-xl backdrop-blur dark:border-white/10 dark:bg-neutral-900/70"
          >
            <header className="flex items-center justify-between border-b border-white/40 pb-3 dark:border-white/10">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="h-4 w-4 text-lernex-blue" />
                Top Points
              </div>
              <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-neutral-500 dark:bg-white/10 dark:text-neutral-300">
                {activeRangeLabel}
              </span>
            </header>
            {error ? (
              <div className="mt-4 rounded-lg border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </div>
            ) : (
              <ol className="mt-4 space-y-3">
                <AnimatePresence initial={false}>
                  {loading ? (
                    <motion.li
                      key="loading-points"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm text-neutral-500 dark:text-neutral-400"
                    >
                      Loading leaderboard...
                    </motion.li>
                  ) : topPoints.length === 0 ? (
                    <motion.li
                      key="empty-points"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm text-neutral-500 dark:text-neutral-400"
                    >
                      No data yet - complete a lesson to get things moving.
                    </motion.li>
                  ) : (
                    topPoints.map((row, index) => {
                      const tier = resolveTier(row.plus, row.premium);
                      const isSelf = row.id === userId;
                      const rowClasses = getLeaderboardRowClasses(tier, isSelf, index);
                      return (
                        <motion.li
                          key={row.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          aria-current={isSelf ? "true" : undefined}
                          className={rowClasses}
                        >
                          <div className="flex items-center gap-3">
                            <span className={getRankBadgeClasses(index)}>{index + 1}</span>
                            <div className="flex flex-col">
                              <span className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-white">
                                {row.username ?? `Learner #${row.id.slice(0, 6)}`}
                                <TierBadge tier={tier} />
                              </span>
                              <span className="text-xs text-neutral-500 dark:text-neutral-300">
                                {numberFormatter.format(row.streak ?? 0)} day streak
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
                            <Trophy className="h-4 w-4 text-lernex-blue" />
                            {numberFormatter.format(row.points ?? 0)} pts
                          </div>
                        </motion.li>
                      );
                    })
                  )}
                </AnimatePresence>
              </ol>
            )}
          </motion.div>

          {showStreakLeaderboard ? (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.06, ease: "easeOut" }}
              className="rounded-3xl border border-white/20 bg-white/75 p-5 shadow-xl backdrop-blur dark:border-white/10 dark:bg-neutral-900/70"
            >
              <header className="flex items-center justify-between border-b border-white/40 pb-3 dark:border-white/10">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Flame className="h-4 w-4 text-orange-500" />
                  Top Streaks
                </div>
                <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-neutral-500 dark:bg-white/10 dark:text-neutral-300">
                  All Time
                </span>
              </header>
              {error ? (
                <div className="mt-4 rounded-lg border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {error}
                </div>
              ) : (
                <ol className="mt-4 space-y-3">
                  <AnimatePresence initial={false}>
                    {loading ? (
                      <motion.li
                        key="loading-streaks"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-sm text-neutral-500 dark:text-neutral-400"
                      >
                        Loading leaderboard...
                      </motion.li>
                    ) : topStreak.length === 0 ? (
                      <motion.li
                        key="empty-streaks"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-sm text-neutral-500 dark:text-neutral-400"
                      >
                        No streaks recorded yet - build momentum today.
                      </motion.li>
                    ) : (
                      topStreak.map((row, index) => {
                        const tier = resolveTier(row.plus, row.premium);
                        const isSelf = row.id === userId;
                        const rowClasses = getLeaderboardRowClasses(tier, isSelf, index);
                        return (
                          <motion.li
                            key={row.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            aria-current={isSelf ? "true" : undefined}
                            className={rowClasses}
                          >
                            <div className="flex items-center gap-3">
                              <span className={getRankBadgeClasses(index)}>{index + 1}</span>
                              <div className="flex flex-col">
                                <span className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-white">
                                  {row.username ?? `Learner #${row.id.slice(0, 6)}`}
                                  <TierBadge tier={tier} />
                                </span>
                                <span className="text-xs text-neutral-500 dark:text-neutral-300">
                                  {numberFormatter.format(row.points ?? 0)} pts earned
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
                              <Flame className="h-4 w-4 text-orange-500" />
                              {numberFormatter.format(row.streak ?? 0)} day streak
                            </div>
                          </motion.li>
                        );
                      })
                    )}
                  </AnimatePresence>
                </ol>
              )}
            </motion.div>
          ) : null}
        </section>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
          className="rounded-3xl border border-white/20 bg-white/75 px-5 py-4 text-sm shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/70"
        >
          Want to climb the board? Try a{" "}
          <Link href="/playlists" className="font-medium text-lernex-blue underline-offset-2 hover:underline">
            curated playlist
          </Link>{" "}
          or spark a fresh{" "}
          <Link href="/generate" className="font-medium text-lernex-purple underline-offset-2 hover:underline">
            micro-lesson
          </Link>
          .
        </motion.div>
      </div>
    </main>
  );
}
