"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

type Me = {
  username?: string|null;
  dob?: string|null;
  interests?: string[]|null;
  level_map?: Record<string,string>|null;
  theme_pref?: "light"|"dark"|"system"|null;
};

export default function SettingsPage() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<Me>({});
  const [nameStatus, setNameStatus] = useState<"idle"|"checking"|"available"|"taken"|"invalid">("idle");
  const [nameMsg, setNameMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/profile/me");
      if (res.status === 401) { router.replace("/login"); return; }
      const data = await res.json();
      setMe(data || {});
      setLoading(false);
    })();
  }, [router]);

  // Username availability check (debounced)
  useEffect(() => {
    const u = (me.username ?? "").trim();
    if (!u) { setNameStatus("idle"); setNameMsg(""); return; }
    if (u.length < 3 || u.length > 20 || !/^[a-zA-Z0-9_]+$/.test(u)) {
      setNameStatus("invalid"); setNameMsg("3–20 chars: letters, numbers, _"); return;
    }
    setNameStatus("checking"); setNameMsg("Checking…");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/username/check?username=${encodeURIComponent(u)}`, { cache: "no-store" });
        const data = await res.json();
        if (data.available) { setNameStatus("available"); setNameMsg("Available"); }
        else { setNameStatus("taken"); setNameMsg("Taken"); }
      } catch {
        setNameStatus("invalid"); setNameMsg("Could not check");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [me.username]);

  const save = async () => {
    setSaving(true);
    await fetch("/api/profile/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: me.username,
        dob: me.dob,
        theme_pref: me.theme_pref ?? "dark",
      }),
    });
    setSaving(false);
  };

  const del = async () => {
    if (!confirm("Delete your account? This cannot be undone.")) return;
    const r = await fetch("/api/profile/delete", { method: "POST" });
    if (r.ok) window.location.href = "/";
  };

  if (loading)
    return (
      <div className="min-h-screen grid place-items-center text-neutral-900 dark:text-white">
        Loading…
      </div>
    );

  return (
    <main className="min-h-screen grid place-items-center text-neutral-900 dark:text-white">
      <div className="w-full max-w-xl px-4 py-6 rounded-2xl bg-neutral-100 border border-neutral-200 space-y-4 dark:bg-neutral-900 dark:border-neutral-800">
        <h1 className="text-2xl font-bold">Settings</h1>

        <label className="text-sm text-neutral-700 dark:text-neutral-300">Username</label>
        <input
          className={`w-full px-3 py-2 rounded-xl bg-neutral-100 border text-neutral-900 outline-none dark:bg-neutral-800 dark:text-white ${
            nameStatus === "available" ? "border-green-500 dark:border-green-500" :
            nameStatus === "taken" || nameStatus === "invalid" ? "border-red-500 dark:border-red-500" :
            "border-neutral-300 dark:border-neutral-700"
          }`}
          value={me.username ?? ""}
          onChange={(e) => setMe((m) => ({ ...m, username: e.target.value }))}
        />
        {nameStatus !== "idle" && (
          <div className={`${nameStatus === "available" ? "text-green-600" : nameStatus === "checking" ? "text-neutral-500" : "text-red-600"} text-xs`}>{nameMsg}</div>
        )}

        <label className="text-sm text-neutral-700 dark:text-neutral-300">Date of Birth</label>
        <input
          type="date"
          className="w-full px-3 py-2 rounded-xl bg-neutral-100 border border-neutral-300 text-neutral-900 outline-none dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
          value={me.dob ?? ""}
          onChange={(e) => setMe((m) => ({ ...m, dob: e.target.value }))}
        />

        <label className="text-sm text-neutral-700 dark:text-neutral-300">Theme</label>
        <select
          className="w-full px-3 py-2 rounded-xl bg-neutral-100 border border-neutral-300 text-neutral-900 outline-none dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
          value={me.theme_pref ?? "dark"}
          onChange={(e) => {
            const value = e.target.value as "light" | "dark" | "system";
            setMe((m) => ({ ...m, theme_pref: value }));
            setTheme(value);
          }}
        >
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving || nameStatus === "checking" || nameStatus === "taken" || nameStatus === "invalid"}
            className="px-4 py-2 rounded-xl bg-lernex-blue text-white hover:bg-blue-500 disabled:opacity-60"
          >
            Save
          </button>
          <button
            onClick={() => router.push("/onboarding")}
            className="px-4 py-2 rounded-xl bg-neutral-200 border border-neutral-300 text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-700"
          >
            Edit subjects
          </button>
          <button
            onClick={del}
            className="ml-auto px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-500"
          >
            Delete account
          </button>
        </div>
      </div>
    </main>
  );
}
