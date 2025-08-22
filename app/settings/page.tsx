"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Me = {
  username?: string|null;
  dob?: string|null;
  interests?: string[]|null;
  level_map?: Record<string,string>|null;
  theme_pref?: "light"|"dark"|"system"|null;
};

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<Me>({});

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/profile/me");
      if (res.status === 401) { router.replace("/login"); return; }
      const data = await res.json();
      setMe(data || {});
      setLoading(false);
    })();
  }, [router]);

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

  if (loading) return <div className="min-h-screen grid place-items-center text-white">Loading…</div>;

  return (
    <main className="min-h-screen text-white grid place-items-center">
      <div className="w-full max-w-xl px-4 py-6 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
        <h1 className="text-2xl font-bold">Settings</h1>

        <label className="text-sm">Username</label>
        <input
          className="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 outline-none"
          value={me.username ?? ""}
          onChange={(e)=>setMe((m)=>({...m, username: e.target.value}))}
        />

        <label className="text-sm">Date of Birth</label>
        <input
          type="date"
          className="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 outline-none"
          value={me.dob ?? ""}
          onChange={(e)=>setMe((m)=>({...m, dob: e.target.value}))}
        />

        <label className="text-sm">Theme</label>
        <select
          className="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 outline-none"
          value={me.theme_pref ?? "dark"}
          onChange={(e)=>setMe((m)=>({...m, theme_pref: e.target.value as "light"|"dark"|"system"}))}
        >
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>

        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-xl bg-lernex-blue hover:bg-blue-500 disabled:opacity-60">Save</button>
          <button onClick={()=>router.push("/onboarding")}
            className="px-4 py-2 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700">Edit subjects</button>
          <button onClick={del}
            className="ml-auto px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500">Delete account</button>
        </div>
      </div>
    </main>
  );
}
