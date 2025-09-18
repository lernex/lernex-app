"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useLernexStore } from "@/lib/store";
import { useProfileStats } from "@/app/providers/ProfileStatsProvider";

type ProfileRow = { id: string; username: string | null; points: number | null; streak: number | null };
type RawProfile = { id?: unknown; username?: unknown; points?: unknown; streak?: unknown };

function toStr(v: unknown): string { return typeof v === "string" ? v : String(v ?? ""); }
function toStrOrNull(v: unknown): string | null { return v == null ? null : toStr(v); }
function toNumOrNull(v: unknown): number | null { return typeof v === "number" ? v : v == null ? null : Number(v); }
function normalizeProfiles(rows: unknown[] | null | undefined): ProfileRow[] {
  const arr = Array.isArray(rows) ? (rows as RawProfile[]) : [];
  return arr.map((r) => ({
    id: toStr(r.id),
    username: toStrOrNull(r.username),
    points: toNumOrNull(r.points),
    streak: toNumOrNull(r.streak),
  }));
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
  const [scope, setScope] = useState<"global" | "friends">("global");
  const [range, setRange] = useState<"all" | "monthly" | "weekly" | "daily">("all");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setUserId(uid);

      const [{ data: pts }, { data: stk }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, points, streak")
          .order("points", { ascending: false })
          .limit(20),
        supabase
          .from("profiles")
          .select("id, username, points, streak")
          .order("streak", { ascending: false })
          .limit(20),
      ]);
      setTopPoints(normalizeProfiles(pts ?? []));
      setTopStreak(normalizeProfiles(stk ?? []));

      if (uid) {
        const { data: me } = await supabase
          .from("profiles")
          .select("points, streak")
          .eq("id", uid)
          .maybeSingle();
        const myPts = (me?.points as number | null) ?? 0;
        const myStk = (me?.streak as number | null) ?? 0;
        const morePts = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gt("points", myPts);
        const moreStk = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gt("streak", myStk);
        setRankPoints(((morePts.count as number | null) ?? 0) + 1);
        setRankStreak(((moreStk.count as number | null) ?? 0) + 1);
      }
    })();
  }, [supabase]);

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
            title="Friends leaderboard coming soon"
          >
            Friends
          </button>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          {(["all","monthly","weekly","daily"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              title="Time ranges coming soon"
              className={`px-3 py-1.5 capitalize ${range === r ? "bg-lernex-blue/10 dark:bg-lernex-blue/20" : ""}`}
            >
              {r === "all" ? "All Time" : r}
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
          <ol className="space-y-2">
            {topPoints.map((r, i) => (
              <li
                key={r.id}
                aria-current={r.id === userId ? "true" : undefined}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ring-offset-2 transition ${
                  r.id === userId
                    ? "bg-lernex-blue/15 ring-2 ring-lernex-blue/40 dark:bg-lernex-blue/20"
                    : "bg-white/60 hover:bg-white/80 dark:bg-white/5 dark:hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-right text-sm text-neutral-500">
                    {i + 1}
                  </span>
                  <span className="text-sm">{r.username ?? `Learner #${r.id.slice(0, 6)}`}</span>
                </div>
                <span className="text-sm font-medium flex items-center gap-1">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null}
                  {r.points ?? 0}
                </span>
              </li>
            ))}
            {topPoints.length === 0 && (
              <div className="text-sm text-neutral-500 dark:text-neutral-400">No data yet.</div>
            )}
          </ol>
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="mb-2 text-sm font-semibold">Top Streaks</div>
          <ol className="space-y-2">
            {topStreak.map((r, i) => (
              <li
                key={r.id}
                aria-current={r.id === userId ? "true" : undefined}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ring-offset-2 transition ${
                  r.id === userId
                    ? "bg-lernex-blue/15 ring-2 ring-lernex-blue/40 dark:bg-lernex-blue/20"
                    : "bg-white/60 hover:bg-white/80 dark:bg-white/5 dark:hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-right text-sm text-neutral-500">{i + 1}</span>
                  <span className="text-sm">{r.username ?? `Learner #${r.id.slice(0, 6)}`}</span>
                </div>
                <span className="text-sm font-medium flex items-center gap-1">
                  {i === 0 ? "🏆" : null}
                  {r.streak ?? 0} days
                </span>
              </li>
            ))}
            {topStreak.length === 0 && (
              <div className="text-sm text-neutral-500 dark:text-neutral-400">No data yet.</div>
            )}
          </ol>
        </div>
      </section>

      <div className="mt-6 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        Want to climb the board? Try a <Link href="/playlists" className="underline">playlist</Link> or
        generate a fresh <Link href="/generate" className="underline">micro‑lesson</Link>.
      </div>
    </main>
  );
}
