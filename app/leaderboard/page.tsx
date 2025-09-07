"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useLernexStore } from "@/lib/store";

type ProfileRow = { id: string; points: number | null; streak: number | null };

export default function Leaderboard() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { points, streak, accuracyBySubject } = useLernexStore();
  const bestSubject = Object.entries(accuracyBySubject).sort((a, b) => {
    const ap = a[1].total ? a[1].correct / a[1].total : 0;
    const bp = b[1].total ? b[1].correct / b[1].total : 0;
    return bp - ap;
  })[0]?.[0];

  const [topPoints, setTopPoints] = useState<ProfileRow[]>([]);
  const [topStreak, setTopStreak] = useState<ProfileRow[]>([]);
  const [rankPoints, setRankPoints] = useState<number | null>(null);
  const [rankStreak, setRankStreak] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? null;

      const [{ data: pts }, { data: stk }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, points, streak")
          .order("points", { ascending: false })
          .limit(20),
        supabase
          .from("profiles")
          .select("id, points, streak")
          .order("streak", { ascending: false })
          .limit(20),
      ]);
      setTopPoints((pts as any[])?.map((r) => ({ id: String(r.id), points: r.points ?? 0, streak: r.streak ?? 0 })) ?? []);
      setTopStreak((stk as any[])?.map((r) => ({ id: String(r.id), points: r.points ?? 0, streak: r.streak ?? 0 })) ?? []);

      if (userId) {
        const { data: me } = await supabase
          .from("profiles")
          .select("points, streak")
          .eq("id", userId)
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
                className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 dark:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-right text-sm text-neutral-500">{i + 1}</span>
                  <span className="text-sm">Learner #{r.id.slice(0, 6)}</span>
                </div>
                <span className="text-sm font-medium">{r.points ?? 0}</span>
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
                className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 dark:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-right text-sm text-neutral-500">{i + 1}</span>
                  <span className="text-sm">Learner #{r.id.slice(0, 6)}</span>
                </div>
                <span className="text-sm font-medium">{r.streak ?? 0} days</span>
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
