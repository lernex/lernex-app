"use client";
import { useEffect, useMemo, useState } from "react";
import { useLernexStore } from "@/lib/store";
import { supabaseBrowser } from "@/lib/supabase-browser";
import Image from "next/image";
import Link from "next/link";

export default function Profile() {
  const { points, streak, accuracyBySubject } = useLernexStore();
  const [email, setEmail] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const supabase = useMemo(() => supabaseBrowser(), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setEmail(u?.email ?? null);
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const a = typeof meta.avatar_url === "string" ? (meta.avatar_url as string) : null;
      setAvatar(a);
    }).catch(() => {});
  }, [supabase]);

  const subjects = Object.entries(accuracyBySubject).sort((a,b) => (b[1].total - a[1].total));

  return (
    <main className="min-h-[calc(100vh-56px)] mx-auto w-full max-w-3xl px-4 py-8 text-neutral-900 dark:text-white">
      <div className="grid gap-4 md:grid-cols-3">
        {/* Left: profile card */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 md:col-span-1">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-full border border-neutral-200 dark:border-white/10">
              {avatar ? (
                <Image src={avatar} alt="avatar" width={56} height={56} />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-lg font-semibold text-neutral-600 dark:bg-white/5 dark:text-neutral-300">
                  {email?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
            </div>
            <div>
              <div className="text-sm text-neutral-500 dark:text-neutral-400">Signed in as</div>
              <div className="text-sm font-medium">{email ?? "Guest"}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-neutral-100 p-3 dark:bg-white/5">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">🔥 Streak</div>
              <div className="text-lg font-semibold">{streak}</div>
            </div>
            <div className="rounded-xl bg-neutral-100 p-3 dark:bg-white/5">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">⭐ Points</div>
              <div className="text-lg font-semibold">{points}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href="/settings" className="rounded-xl bg-lernex-blue px-3 py-2 text-center text-white">Settings</Link>
            <Link href="/leaderboard" className="rounded-xl border border-neutral-300 px-3 py-2 text-center dark:border-neutral-700">Leaderboard</Link>
          </div>
        </section>

        {/* Right: subjects + actions */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 md:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Your Learning</h2>
          {subjects.length === 0 ? (
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              No progress yet. Try the <Link href="/generate" className="underline">generator</Link> or the <Link href="/playlists" className="underline">playlists</Link>.
            </div>
          ) : (
            <div className="space-y-3">
              {subjects.map(([subject, acc]) => {
                const pct = acc.total ? Math.round((acc.correct/acc.total)*100) : 0;
                return (
                  <div key={subject} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <div className="font-medium">{subject}</div>
                      <div className="text-neutral-500 dark:text-neutral-400">{acc.correct}/{acc.total} correct</div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800">
                      <div className="h-full rounded-full bg-lernex-blue" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Link href="/onboarding" className="rounded-xl border border-neutral-300 px-3 py-2 text-center dark:border-neutral-700">Update interests</Link>
            <Link href="/placement" className="rounded-xl border border-neutral-300 px-3 py-2 text-center dark:border-neutral-700">Run placement</Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="font-medium">Weekly Goal</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Earn 200 points</div>
              <div className="mt-2 h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div className="h-full rounded-full bg-lernex-blue transition-all" style={{ width: `${Math.min(100, Math.round(((points ?? 0) % 200) / 2))}%` }} />
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="font-medium">Next Streak Milestone</div>
              <div className="text-sm text-neutral-600 dark:text-neutral-300">{Math.max(0, 7 - ((streak ?? 0) % 7))} days to next reward</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
