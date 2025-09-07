"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Welcome() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<"idle"|"checking"|"available"|"taken"|"invalid">("idle");
  const [msg, setMsg] = useState("");
  const [dob, setDob] = useState(""); // yyyy-mm-dd
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.replace("/login");
      // prefill if coming back
      const res = await fetch("/api/profile/me");
      const me = await res.json();
      if (me?.username) setUsername(me.username);
      if (me?.dob) setDob(me.dob);
    })();
  }, [router]);

  const save = async () => {
    if (!username || !dob) return;
    setSaving(true);
    const res = await fetch("/api/profile/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, dob }),
    });
    setSaving(false);
    if (res.ok) router.replace("/onboarding");
  };

  // live availability check
  useEffect(() => {
    const u = username.trim();
    if (!u) { setStatus("idle"); setMsg(""); return; }
    if (u.length < 3 || u.length > 20 || !/^[a-zA-Z0-9_]+$/.test(u)) {
      setStatus("invalid"); setMsg("3–20 chars: letters, numbers, _"); return;
    }
    setStatus("checking"); setMsg("Checking…");
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/profile/username/check?username=${encodeURIComponent(u)}`, { cache: "no-store" });
        const j = await r.json();
        if (j.available) { setStatus("available"); setMsg("Available"); } else { setStatus("taken"); setMsg("Taken"); }
      } catch { setStatus("invalid"); setMsg("Could not check"); }
    }, 300);
    return () => clearTimeout(t);
  }, [username]);

  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-neutral-50 to-neutral-200 text-neutral-900 dark:from-neutral-900 dark:to-neutral-800 dark:text-white">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white px-4 py-6 space-y-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-2xl font-bold">Enough about us—let’s hear about you! 🎉</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Pick a username and add your date of birth.</p>

        <label className="text-sm text-neutral-700 dark:text-neutral-300">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="yourname"
          className={`w-full rounded-xl bg-white px-3 py-2 outline-none dark:bg-neutral-800 dark:text-white border ${
            status === "available" ? "border-green-500 dark:border-green-500" :
            status === "taken" || status === "invalid" ? "border-red-500 dark:border-red-500" :
            "border-neutral-300 dark:border-neutral-700"
          }`}
        />
        {status !== "idle" && (
          <div className={`${status === "available" ? "text-green-600" : status === "checking" ? "text-neutral-500" : "text-red-600"} text-xs`}>{msg}</div>
        )}

        <label className="text-sm text-neutral-700 dark:text-neutral-300">Date of Birth</label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        />

        <button
          onClick={save}
          disabled={!username || !dob || saving || status === "checking" || status === "taken" || status === "invalid"}
          className="w-full rounded-xl bg-lernex-blue py-3 transition hover:bg-blue-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </main>
  );
}
