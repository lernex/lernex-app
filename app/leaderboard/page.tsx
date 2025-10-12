"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useLernexStore } from "@/lib/store";
import { useProfileStats } from "@/app/providers/ProfileStatsProvider";

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

type AttemptAggregateRow = {
  total_correct: unknown;
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

function extractTotalCorrect(value: unknown): number | null {
  if (Array.isArray(value)) {
    const first = value[0];
    if (
      first &&
      typeof first === "object" &&
      "correct_count" in (first as Record<string, unknown>)
    ) {
      return toNumOrNull((first as { correct_count?: unknown }).correct_count);
    }
  }
  return toNumOrNull(value);
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

type QueryWithUrl = {
  url?: {
    searchParams?: URLSearchParams;
  };
};

function applyGroupParam<T>(query: T, group: string): T {
  const target = query as unknown as QueryWithUrl;
  const params = target.url?.searchParams;
  if (params) {
    params.set("group", group);
  }
  return query;
}

export default function Leaderboard() {
  const supabase = useMemo(() => supabaseBrowser(), []);
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
          } else {
            let attemptQuery = supabase
              .from("attempts")
              .select("user_id, total_correct:sum(correct_count)")
              .not("user_id", "is", null);
            if (rangeStart) {
              attemptQuery = attemptQuery.gte("created_at", rangeStart);
            }
            attemptQuery = applyGroupParam(attemptQuery, "user_id");

            let attemptRows: Record<string, unknown>[] = [];
            if (scope === "friends" && scopedIds && scopedIds.length) {
              const { data, error: attemptError } = await attemptQuery.in("user_id", scopedIds);
              if (attemptError) throw attemptError;
              attemptRows = (data ?? []) as Record<string, unknown>[];
            } else {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const orderedQuery = (attemptQuery as any)
                .order("total_correct", { ascending: false })
                .limit(40);
              const { data, error: attemptError } = await orderedQuery;
              if (attemptError) throw attemptError;
              attemptRows = (data ?? []) as Record<string, unknown>[];
            }

            const aggregates = attemptRows
              .map((row) => ({
                id: typeof row.user_id === "string" ? row.user_id : null,
                totalCorrect: extractTotalCorrect(row.total_correct) ?? 0,
              }))
              .sort((a, b) => (b.totalCorrect ?? 0) - (a.totalCorrect ?? 0));
            const profileIds =
              scope === "friends" && scopedIds && scopedIds.length
                ? scopedIds
                : uniqueIds(aggregates.map((entry) => entry.id));

            let profiles: ProfileRow[] = [];
            if (profileIds.length) {
              const { data: profileData, error: profileError } = await supabase
                .from("profiles")
                .select("id, username, points, streak")
                .in("id", profileIds);
              if (profileError) throw profileError;
              profiles = normalizeProfiles(profileData ?? []);
            }

            const aggregateMap = new Map<string, number>();
            aggregates.forEach((entry) => {
              if (!entry.id) return;
              aggregateMap.set(entry.id, entry.totalCorrect * POINTS_PER_CORRECT);
            });

            pointsRows = profiles
              .map((profile) => ({
                ...profile,
                points: aggregateMap.get(profile.id) ?? 0,
              }))
              .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
              .slice(0, 20);
          }
        }

        if (cancelled) return;
        setTopPoints(pointsRows);

        let streakRows: ProfileRow[] = [];
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
        } else {
          let myAggQuery = supabase
            .from("attempts")
            .select("total_correct:sum(correct_count)")
            .eq("user_id", uid);
          if (rangeStart) {
            myAggQuery = myAggQuery.gte("created_at", rangeStart);
          }
          const { data: myAggData, error: myAggError } = await myAggQuery;
          if (myAggError) throw myAggError;
          const myAggRows = Array.isArray(myAggData)
            ? (myAggData as AttemptAggregateRow[])
            : [];
          const myCorrect = extractTotalCorrect(
            myAggRows[0]?.total_correct
          ) ?? 0;
          if (myCorrect > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let rankQuery: any = supabase
              .from("attempts")
              .select("user_id, total_correct:sum(correct_count)", {
                count: "exact",
                head: true,
              });
            rankQuery = applyGroupParam(rankQuery, "user_id");
            rankQuery = rankQuery.gt("total_correct", myCorrect);
            if (rangeStart) {
              rankQuery = rankQuery.gte("created_at", rangeStart);
            }
            if (scope === "friends" && scopedIds && scopedIds.length) {
              rankQuery = rankQuery.in("user_id", scopedIds);
            }
            const { count: higherRange, error: rangeRankError } = await rankQuery;
            if (rangeRankError) throw rangeRankError;
            setRankPoints(((higherRange as number | null) ?? 0) + 1);
          } else {
            setRankPoints(null);
          }
        }

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
        <div className="rounded-xl border border-neutral-200 p-4 text-center dark:border-neutral-800">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">🔥 Your Streak</div>
          <div className="text-2xl font-semibold">{streak}</div>
          {rankStreak && (
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Rank #{rankStreak}</div>
          )}
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 text-center dark:border-neutral-800">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">⭐ Your Points</div>
          <div className="text-2xl font-semibold">{points}</div>
          {rankPoints && (
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Rank #{rankPoints}</div>
          )}
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 text-center dark:border-neutral-800">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">Best Subject</div>
          <div className="text-lg font-medium">{bestSubject ?? "—"}</div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
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
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ring-offset-2 transition ${
                        row.id === userId
                          ? "bg-lernex-blue/15 ring-2 ring-lernex-blue/40 dark:bg-lernex-blue/20"
                          : "bg-white/60 hover:bg-white/80 dark:bg-white/5 dark:hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-right text-sm text-neutral-500">{index + 1}</span>
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
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
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
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ring-offset-2 transition ${
                        row.id === userId
                          ? "bg-lernex-blue/15 ring-2 ring-lernex-blue/40 dark:bg-lernex-blue/20"
                          : "bg-white/60 hover:bg-white/80 dark:bg-white/5 dark:hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-right text-sm text-neutral-500">{index + 1}</span>
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
      </section>

      <div className="mt-6 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        Want to climb the board? Try a <Link href="/playlists" className="underline">playlist</Link> or
        generate a fresh <Link href="/generate" className="underline">micro-lesson</Link>.
      </div>
    </main>
  );
}
