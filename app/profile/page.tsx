"use client";
import { useEffect, useMemo, useState } from "react";
import { useLernexStore } from "@/lib/store";
import { useProfileStats } from "@/app/providers/ProfileStatsProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";
import Image from "next/image";
import Link from "next/link";

export default function Profile() {
  const { accuracyBySubject } = useLernexStore();
  const { stats } = useProfileStats();
  const points = stats?.points ?? 0;
  const streak = stats?.streak ?? 0;
  const [email, setEmail] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [avatarUrlInput, setAvatarUrlInput] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>("");
  const supabase = useMemo(() => supabaseBrowser(), []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      setEmail(u?.email ?? null);
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const a = typeof meta.avatar_url === "string" ? (meta.avatar_url as string) : null;
      setAvatar(a);
      setAvatarUrlInput(a ?? "");
      // Load profile.username if present
      if (u?.id) {
        const { data: p } = await supabase.from("profiles").select("username").eq("id", u.id).maybeSingle();
        const un = (p?.username as string | null) ?? "";
        setUsername(un);
      }
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

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="mb-2 text-sm font-semibold">Edit Profile</div>
              <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_name"
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
              <button
                onClick={async () => {
                  setSaving(true); setMsg("");
                  try {
                    const res = await fetch("/api/profile/update", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ username }),
                    });
                    const j = await res.json();
                    if (!res.ok) throw new Error(j?.error || "Failed to save");
                    setMsg("Profile updated");
                  } catch (e: unknown) {
                    const err = e as { message?: string } | undefined;
                    setMsg(err?.message || "Could not update");
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving || !username.trim()}
                className="mt-2 rounded-md bg-lernex-blue px-3 py-2 text-sm text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40"
              >
                {saving ? "Saving…" : "Save Username"}
              </button>
              {msg && <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{msg}</div>}
            </div>
            <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="mb-2 text-sm font-semibold">Avatar</div>
              <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Avatar URL</label>
              <input
                value={avatarUrlInput}
                onChange={(e) => setAvatarUrlInput(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
              <button
                onClick={async () => {
                  setSaving(true); setMsg("");
                  try {
                    const { error } = await supabase.auth.updateUser({ data: { avatar_url: avatarUrlInput || null } });
                    if (error) throw error;
                    setAvatar(avatarUrlInput || null);
                    setMsg("Avatar updated");
                  } catch (e: unknown) {
                    const err = e as { message?: string } | undefined;
                    setMsg(err?.message || "Could not update avatar");
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="mt-2 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40"
              >
                Save Avatar
              </button>
              <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">Upload support coming soon.</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
