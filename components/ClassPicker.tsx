"use client";
import { useEffect, useMemo, useState } from "react";
import { useLernexStore } from "@/lib/store";

type Pair = { subject: string; course?: string };

export default function ClassPicker() {
  const { selectedSubjects, setSelectedSubjects } = useLernexStore();
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/profile/me", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const lm = (j?.level_map || {}) as Record<string, string>;
        const ints: string[] = Array.isArray(j?.interests) ? j.interests : [];
        const uniqSubs = Array.from(new Set(ints.filter(Boolean)));
        const out: Pair[] = uniqSubs.map((s) => ({ subject: s, course: lm[s] }));
        if (alive) setPairs(out);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const label = useMemo(() => {
    if (selectedSubjects.length === 0) return "All";
    if (selectedSubjects.length === 1) return selectedSubjects[0]!;
    return "Merged";
  }, [selectedSubjects]);

  const choose = (mode: "all" | "merge" | "one", subject?: string) => {
    if (mode === "all") setSelectedSubjects([]); // let system pick from interests
    else if (mode === "merge") setSelectedSubjects(pairs.map((p) => p.subject));
    else if (mode === "one" && subject) setSelectedSubjects([subject]);
    setOpen(false);
  };

  if (!pairs.length) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 rounded-full text-sm border bg-white/80 dark:bg-neutral-900/80 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700 shadow-sm hover:shadow transition"
        title="Choose class feed"
      >
        {label}
        <span className="ml-1 inline-block align-middle text-neutral-400">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xl overflow-hidden z-20">
          <div className="px-3 py-2 text-xs uppercase tracking-wide text-neutral-400">Your classes</div>
          <div className="max-h-72 overflow-auto">
            {pairs.map((p) => {
              const on = selectedSubjects.length === 1 && selectedSubjects[0] === p.subject;
              return (
                <button
                  key={p.subject}
                  onClick={() => choose("one", p.subject)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 ${on ? "bg-neutral-50 dark:bg-neutral-800" : ""}`}
                >
                  <div className="font-medium">{p.subject}</div>
                  {p.course && <div className="text-xs text-neutral-500">{p.course}</div>}
                </button>
              );
            })}
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-800" />
          <div className="flex">
            <button onClick={() => choose("all")} className="flex-1 px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800">All</button>
            <button onClick={() => choose("merge")} className="flex-1 px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 border-l border-neutral-200 dark:border-neutral-800">Merge</button>
          </div>
        </div>
      )}
    </div>
  );
}

