"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Welcome() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.replace("/login");
    })();
  }, [router]);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/profile/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username }),
    });
    setSaving(false);
    if (res.ok) router.replace("/onboarding"); // next step: pick domains
  };

  return (
    <main className="min-h-screen grid place-items-center text-white">
      <div className="w-full max-w-md px-4 py-6 space-y-4 rounded-2xl bg-neutral-900 border border-neutral-800">
        <h1 className="text-2xl font-bold">Welcome! Pick a username</h1>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="yourname"
          className="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 outline-none"
        />
        <button
          onClick={save}
          disabled={!username || saving}
          className="w-full py-3 rounded-xl bg-lernex-blue hover:bg-blue-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </main>
  );
}
