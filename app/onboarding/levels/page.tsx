"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { LEVELS_BY_DOMAIN } from "@/data/domains";

type LevelMap = Record<string, string>;

export default function OnboardingLevels() {
  const router = useRouter();
  const [interests, setInterests] = useState<string[]>([]);
  const [levelMap, setLevelMap] = useState<LevelMap>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/profile/me");
      const me = await res.json();
      if (!me?.interests || me.interests.length === 0) {
        router.replace("/onboarding");
        return;
      }
      setInterests(me.interests as string[]);
      // prefill from existing profile if any
      if (me?.level_map) setLevelMap(me.level_map as LevelMap);
    })();
  }, [router]);

  const allPicked = useMemo(
    () => interests.length > 0 && interests.every((d) => !!levelMap[d]),
    [interests, levelMap]
  );

  const setLevel = (domain: string, level: string) =>
    setLevelMap((prev) => ({ ...prev, [domain]: level }));

  const save = async () => {
    if (!allPicked) return;
    setSaving(true);
    const res = await fetch("/api/profile/levels/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level_map: levelMap }),
    });
    setSaving(false);
    if (res.ok) router.replace("/app");
  };

  return (
    <main className="min-h-screen flex items-center justify-center text-white">
      <div className="w-full max-w-2xl px-4 py-6 space-y-5 rounded-2xl bg-neutral-900 border border-neutral-800">
        <h1 className="text-2xl font-bold">Choose your starting level</h1>
        <p className="text-neutral-400 text-sm">
          For each interest, pick the course that matches where you want to start.
        </p>

        <div className="space-y-6">
          {interests.map((domain) => {
            const levels = LEVELS_BY_DOMAIN[domain] ?? [];
            return (
              <div key={domain}>
                <div className="mb-2 font-semibold">{domain}</div>
                <div className="grid md:grid-cols-3 gap-2">
                  {levels.map((lvl) => {
                    const on = levelMap[domain] === lvl;
                    return (
                      <button
                        key={lvl}
                        onClick={() => setLevel(domain, lvl)}
                        className={`px-3 py-2 rounded-xl border text-left transition
                          ${on ? "bg-lernex-blue border-lernex-blue text-white"
                               : "bg-neutral-900 border-neutral-800 hover:bg-neutral-800"}`}
                      >
                        {lvl}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={save}
          disabled={!allPicked || saving}
          className="w-full py-3 rounded-2xl bg-lernex-green hover:bg-green-600 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Finish"}
        </button>
      </div>
    </main>
  );
}
