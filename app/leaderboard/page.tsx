"use client";

import Link from "next/link";
import { useLernexStore } from "@/lib/store";

export default function Leaderboard() {
  const { points, streak, accuracyBySubject } = useLernexStore();
  const bestSubject = Object.entries(accuracyBySubject).sort((a, b) => {
    const ap = a[1].total ? a[1].correct / a[1].total : 0;
    const bp = b[1].total ? b[1].correct / b[1].total : 0;
    return bp - ap;
  })[0]?.[0];

  return (
    <main className="min-h-[calc(100vh-56px)] mx-auto w-full max-w-3xl px-4 py-8 text-neutral-900 dark:text-white">
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-300">
        Global leaderboards are coming soon. For now, here’s your local progress.
      </p>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 p-4 text-center dark:border-neutral-800">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">🔥 Streak</div>
          <div className="text-2xl font-semibold">{streak}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 text-center dark:border-neutral-800">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">⭐ Points</div>
          <div className="text-2xl font-semibold">{points}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 text-center dark:border-neutral-800">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">Best Subject</div>
          <div className="text-lg font-medium">{bestSubject ?? "—"}</div>
        </div>
      </section>

      <div className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="font-medium">What’s next?</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-300">
          <li>Invite-only friend leaderboards.</li>
          <li>Weekly subject challenges.</li>
          <li>Bonus points for streak milestones.</li>
        </ul>
        <div className="mt-3 text-sm">
          Explore <Link href="/playlists" className="underline">Playlists</Link> or generate a new lesson on the <Link href="/generate" className="underline">Generator</Link>.
        </div>
      </div>
    </main>
  );
}

