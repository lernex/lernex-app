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

  const normalizedSelection = useMemo(() => {
    if (!selectedSubjects.length) return [];
    const validSubjects = new Set(pairs.map((p) => p.subject));
    const filtered = selectedSubjects.filter((s) => validSubjects.has(s));
    return filtered;
  }, [selectedSubjects, pairs]);

  const currentPair = useMemo(() => {
    if (normalizedSelection.length !== 1) return null;
    return pairs.find((p) => p.subject === normalizedSelection[0]) ?? null;
  }, [normalizedSelection, pairs]);

  const isMixMode = normalizedSelection.length > 1;
  const isAllMode = normalizedSelection.length === 0;

  const label = useMemo(() => {
    if (isAllMode) return "All";
    if (isMixMode) return "Mix";
    if (currentPair) return currentPair.course || currentPair.subject;
    if (normalizedSelection.length === 1) return normalizedSelection[0]!;
    return "Classes";
  }, [isAllMode, isMixMode, currentPair, normalizedSelection]);

  const choose = (mode: "all" | "merge" | "one", subject?: string) => {
    if (mode === "all") {
      setSelectedSubjects([]);
    } else if (mode === "merge") {
      const subs = pairs.map((p) => p.subject).filter(Boolean);
      setSelectedSubjects(subs);
    } else if (mode === "one" && subject) {
      setSelectedSubjects([subject]);
    }
    setOpen(false);
  };

  if (!pairs.length) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 rounded-full text-sm border bg-white/85 dark:bg-neutral-900/85 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700 shadow-sm hover:shadow-md transition"
        title="Choose class feed"
      >
        <span className="font-medium">{label}</span>
        {currentPair && currentPair.course && currentPair.course !== currentPair.subject && (
          <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500">{currentPair.subject}</span>
        )}
        <span className="ml-1 inline-block align-middle text-neutral-400">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xl overflow-hidden z-20">
          <div className="px-3 py-2 text-xs uppercase tracking-wide text-neutral-400">Your classes</div>
          <div className="max-h-72 overflow-auto">
            {pairs.map((p) => {
              const on = normalizedSelection.length === 1 && normalizedSelection[0] === p.subject;
              return (
                <button
                  key={p.subject}
                  onClick={() => choose("one", p.subject)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 ${on ? "bg-neutral-50 dark:bg-neutral-800" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{p.course || p.subject}</div>
                      {p.course && p.course !== p.subject && (
                        <div className="text-xs text-neutral-500">{p.subject}</div>
                      )}
                    </div>
                    {on && <span className="mt-1 inline-block h-2 w-2 rounded-full bg-lernex-blue" aria-hidden="true" />}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-800" />
          <div className="px-2 py-2 text-xs uppercase tracking-wide text-neutral-400">Options</div>
          <div className="pb-2">
            <button
              onClick={() => choose("merge")}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 ${isMixMode ? "bg-neutral-50 dark:bg-neutral-800" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span>Mix subjects</span>
                {isMixMode && <span className="inline-block h-2 w-2 rounded-full bg-lernex-blue" aria-hidden="true" />}
              </div>
              <div className="text-xs text-neutral-500">Rotate through every class</div>
            </button>
            <button
              onClick={() => choose("all")}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 ${isAllMode ? "bg-neutral-50 dark:bg-neutral-800" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span>All</span>
                {isAllMode && <span className="inline-block h-2 w-2 rounded-full bg-lernex-blue" aria-hidden="true" />}
              </div>
              <div className="text-xs text-neutral-500">Let Lernex pick for you</div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
