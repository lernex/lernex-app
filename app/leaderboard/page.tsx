"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useLernexStore } from "@/lib/store";
import { useProfileStats } from "@/app/providers/ProfileStatsProvider";
import type { Database } from "@/lib/types_db";

const POINTS_PER_CORRECT = 10;

type Scope = "global" | "friends";
type Range = "all" | "monthly" | "weekly" | "daily";

type ProfileRow = {
  id: string;
  username: string | null;
  points: number | null;
  streak: number | null;
};

type RawProfile = {
  id?: unknown;
  username?: unknown;
  points?: unknown;
  streak?: unknown;
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

function normalizeProfiles(rows: unknown[] | null | undefined): ProfileRow[] {
  const arr = Array.isArray(rows) ? (rows as RawProfile[]) : [];
  return arr.map((row) => ({
    id: toStr(row.id),
    username: toStrOrNull(row.username),
    points: toNumOrNull(row.points),
    streak: toNumOrNull(row.streak),
  }));
}

function calcRangeStart(range: Range): string | null {
  if (range === "all") return null;
  const offsets: Record<Exclude<Range, "all">, number> = {
    monthly: 30,
    weekly: 7,
    daily: 1,
  };
  const days = offsets[range];
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return start.toISOString();
}

function uniqueIds(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  values.forEach((value) => {
    if (typeof value === "string" && value) {
      seen.add(value);
    }
  });
  return Array.from(seen);
}

type AppSupabaseClient = SupabaseClient<Database>;

const ATTEMPT_PAGE_SIZE = 1000;
const ATTEMPT_MAX_PAGES = 50;

type AttemptRow = {
  user_id: unknown;
  correct_count: unknown;
};

async function fetchAttemptTotals(
  supabase: AppSupabaseClient,
  rangeStart: string | null,
  scopedIds: string[] | null
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  const targetIds =
    scopedIds && scopedIds.length ? Array.from(new Set(scopedIds)) : null;

  for (let page = 0; page < ATTEMPT_MAX_PAGES; page += 1) {
    let query = supabase
      .from("attempts")
      .select("user_id, correct_count, created_at")
      .not("user_id", "is", null)
      .order("created_at", { ascending: false });

    if (rangeStart) {
      query = query.gte("created_at", rangeStart);
    }
    if (targetIds && targetIds.length) {
      query = query.in("user_id", targetIds);
    }

    const from = page * ATTEMPT_PAGE_SIZE;
    const to = from + ATTEMPT_PAGE_SIZE - 1;

    const { data, error } = await query.range(from, to);
    if (error) throw error;

    const rows = Array.isArray(data) ? (data as AttemptRow[]) : [];
    if (rows.length === 0) break;

    rows.forEach((row) => {
      const uid = typeof row.user_id === "string" ? row.user_id : null;
      const correct = toNumOrNull(row.correct_count);
      if (!uid || correct == null) return;
      totals.set(uid, (totals.get(uid) ?? 0) + correct);
    });

    if (rows.length < ATTEMPT_PAGE_SIZE) {
      break;
    }
    if (page === ATTEMPT_MAX_PAGES - 1) {
      console.warn("[leaderboard] attempt aggregation reached max pages", {
        rangeStart,
        scopedIds: targetIds?.length ?? 0,
      });
    }
  }

  return totals;
}

export default function Leaderboard() {
  const supabase = useMemo<AppSupabaseClient>(() => supabaseBrowser(), []);
  const { accuracyBySubject } = useLernexStore();
  const { stats } = useProfileStats();
  const points = stats?.points ?? 0;
  const streak = stats?.streak ?? 0;

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

        let friendIds: string[] = [];
        if (uid) {
          const { data: friendRows, error: friendError } = await supabase
            .from("friendships")
            .select("user_a, user_b")
            .or(`user_a.eq.${uid},user_b.eq.${uid}`);
          if (friendError) throw friendError;
          friendIds = uniqueIds(
            (friendRows ?? []).map((row) => {
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
              .select("id, username, points, streak")
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
                  .select("id, username, points, streak")
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
              .select("id, username, points, streak")
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
    <main className="min-h-[calc(100vh-56px)] mx-auto w-full max-w-3xl px-4 py-8 text-neutral-900 dark:text-white">
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-300">
        See how you stack up. Points and streaks come from your study activity.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <div className="inline-flex overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <button
            className={`px-3 py-1.5 ${scope === "global" ? "bg-lernex-blue/10 dark:bg-lernex-blue/20" : ""}`}
            onClick={() => setScope("global")}
          >
            Global
          </button>
          <button
            className={`px-3 py-1.5 ${scope === "friends" ? "bg-lernex-blue/10 dark:bg-lernex-blue/20" : ""}`}
            onClick={() => setScope("friends")}
          >
            Friends
          </button>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          {(["all", "monthly", "weekly", "daily"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`px-3 py-1.5 capitalize ${range === value ? "bg-lernex-blue/10 dark:bg-lernex-blue/20" : ""}`}
            >
              {value === "all" ? "All Time" : value}
            </button>
          ))}
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white/90 p-4 text-center shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">🔥 Your Streak</div>
          <div className="text-2xl font-semibold">{streak}</div>
          {rankStreak && (
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Rank #{rankStreak}</div>
          )}
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white/90 p-4 text-center shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">⭐ Your Points</div>
          <div className="text-2xl font-semibold">{points}</div>
          {rankPoints && (
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Rank #{rankPoints}</div>
          )}
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white/90 p-4 text-center shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">Best Subject</div>
          <div className="text-lg font-medium">{bestSubject ?? "—"}</div>
        </div>
      </section>

      <section
        className={`mt-6 grid w-full gap-4 ${
          showStreakLeaderboard ? "sm:grid-cols-2" : "sm:mx-auto sm:max-w-md"
        }`}
      >
        <div className="rounded-xl border border-neutral-200 bg-white/90 p-4 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="mb-2 text-sm font-semibold">Top Points</div>
          {error ? (
            <div className="text-sm text-rose-500 dark:text-rose-400">{error}</div>
          ) : (
            <ol className="space-y-2">
              {loading ? (
                <div className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</div>
              ) : (
                <>
                  {topPoints.map((row, index) => (
                    <li
                      key={row.id}
                      aria-current={row.id === userId ? "true" : undefined}
                      className={`flex items-center justify-between rounded-lg border border-transparent px-3 py-2 ring-offset-2 ring-offset-white transition dark:ring-offset-lernex-charcoal ${
                        row.id === userId
                          ? "bg-lernex-blue/15 ring-2 ring-lernex-blue/40 dark:bg-lernex-blue/25 dark:ring-lernex-blue/50"
                          : "bg-white/90 hover:bg-white dark:bg-neutral-900/70 dark:hover:bg-neutral-900/60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-right text-sm text-neutral-500 dark:text-neutral-400">
                          {index + 1}
                        </span>
                        <span className="text-sm">
                          {row.username ?? `Learner #${row.id.slice(0, 6)}`}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-sm font-medium">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : null}
                        {row.points ?? 0}
                      </span>
                    </li>
                  ))}
                  {topPoints.length === 0 && (
                    <div className="text-sm text-neutral-500 dark:text-neutral-400">No data yet.</div>
                  )}
                </>
              )}
            </ol>
          )}
        </div>
        {showStreakLeaderboard ? (
          <div className="rounded-xl border border-neutral-200 bg-white/90 p-4 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900/60">
            <div className="mb-2 text-sm font-semibold">Top Streaks</div>
            {error ? (
              <div className="text-sm text-rose-500 dark:text-rose-400">{error}</div>
            ) : (
              <ol className="space-y-2">
                {loading ? (
                  <div className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</div>
                ) : (
                  <>
                    {topStreak.map((row, index) => (
                      <li
                        key={row.id}
                        aria-current={row.id === userId ? "true" : undefined}
                        className={`flex items-center justify-between rounded-lg border border-transparent px-3 py-2 ring-offset-2 ring-offset-white transition dark:ring-offset-lernex-charcoal ${
                          row.id === userId
                            ? "bg-lernex-blue/15 ring-2 ring-lernex-blue/40 dark:bg-lernex-blue/25 dark:ring-lernex-blue/50"
                            : "bg-white/90 hover:bg-white dark:bg-neutral-900/70 dark:hover:bg-neutral-900/60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 text-right text-sm text-neutral-500 dark:text-neutral-400">
                            {index + 1}
                          </span>
                          <span className="text-sm">
                            {row.username ?? `Learner #${row.id.slice(0, 6)}`}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-sm font-medium">
                          {index === 0 ? "🏆" : null}
                          {row.streak ?? 0} days
                        </span>
                      </li>
                    ))}
                    {topStreak.length === 0 && (
                      <div className="text-sm text-neutral-500 dark:text-neutral-400">No data yet.</div>
                    )}
                  </>
                )}
              </ol>
            )}
          </div>
        ) : null}
      </section>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white/90 p-4 text-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900/60">
        Want to climb the board? Try a <Link href="/playlists" className="underline">playlist</Link> or
        generate a fresh <Link href="/generate" className="underline">micro-lesson</Link>.
      </div>
    </main>
  );
}
