"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { DOMAINS } from "@/data/domains";

export default function OnboardingDomains() {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) router.replace("/login");
      // optional: fetch existing interests to prefill
      const res = await fetch("/api/profile/me");
      const me = await res.json();
      if (me?.interests?.length) setChosen(me.interests);
    })();
  }, [router]);

  const toggle = (d: string) =>
    setChosen((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const save = async () => {
    if (!chosen.length) return;
    setSaving(true);
    const res = await fetch("/api/profile/interests/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interests: chosen }),
    });
    setSaving(false);
    if (res.ok) router.replace("/onboarding/levels");
  };

  return (
    <main className="min-h-screen flex items-center justify-center text-white">
      <div className="w-full max-w-lg px-4 py-6 space-y-5 rounded-2xl bg-neutral-900 border border-neutral-800">
        <h1 className="text-2xl font-bold">What are you interested in?</h1>
        <p className="text-neutral-400 text-sm">Pick a few to personalize your feed.</p>
        <div className="grid grid-cols-2 gap-2">
          {DOMAINS.map((d) => {
            const on = chosen.includes(d);
            return (
              <button
                key={d}
                onClick={() => toggle(d)}
                className={`px-3 py-2 rounded-xl border text-left transition
                  ${on ? "bg-lernex-blue border-lernex-blue text-white"
                       : "bg-neutral-900 border-neutral-800 hover:bg-neutral-800"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <button
          onClick={save}
          disabled={!chosen.length || saving}
          className="w-full py-3 rounded-2xl bg-lernex-green hover:bg-green-600 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </main>
  );
}
