"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Welcome() {
  const router = useRouter();
  const [username, setUsername] = useState("");
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

  return (
    <main className="min-h-screen grid place-items-center text-white">
      <div className="w-full max-w-md px-4 py-6 space-y-4 rounded-2xl bg-neutral-900 border border-neutral-800">
        <h1 className="text-2xl font-bold">Enough about us—let’s hear about you! 🎉</h1>
        <p className="text-neutral-400 text-sm">Pick a username and add your date of birth.</p>

        <label className="text-sm text-neutral-300">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="yourname"
          className="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 outline-none"
        />

        <label className="text-sm text-neutral-300">Date of Birth</label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 outline-none"
        />

        <button
          onClick={save}
          disabled={!username || !dob || saving}
          className="w-full py-3 rounded-xl bg-lernex-blue hover:bg-blue-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </main>
  );
}
