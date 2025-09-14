"use client";
import { useEffect, useMemo, useState } from "react";
import { useLernexStore } from "@/lib/store";

export default function SubjectChips() {
  const { selectedSubjects, setSelectedSubjects } = useLernexStore();
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/profile/me", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const arr = Array.isArray(j?.interests) ? (j.interests as string[]) : [];
        if (alive) setInterests(arr);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const options = useMemo(() => interests, [interests]);

  if (!options.length) return null;

  const toggle = (s: string) => {
    const has = selectedSubjects.includes(s);
    if (has) setSelectedSubjects(selectedSubjects.filter((x) => x !== s));
    else setSelectedSubjects([...selectedSubjects, s]);
  };

  const clearable = selectedSubjects.length > 0;

  return (
    <div className="max-w-md mx-auto px-4 pt-3 pb-1">
      <div className="flex gap-2 flex-wrap items-center">
        {options.map((s) => {
          const on = selectedSubjects.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggle(s)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${on ? "bg-lernex-blue text-white border-blue-500" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700"}`}
            >
              {s}
            </button>
          );
        })}
        {clearable && (
          <button
            onClick={() => setSelectedSubjects([])}
            className="ml-auto px-3 py-1.5 rounded-full text-sm border bg-neutral-50 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:text-neutral-300"
            title="Show all"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

