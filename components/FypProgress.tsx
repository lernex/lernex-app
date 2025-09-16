"use client";
import { useEffect, useMemo, useState } from "react";
import { useLernexStore } from "@/lib/store";

export default function FypProgress() {
  const { selectedSubjects } = useLernexStore();
  const [state, setState] = useState<{ subject: string; total: number; completed: number; percent: number } | null>(null);
  const subject = useMemo(() => selectedSubjects.length === 1 ? selectedSubjects[0]! : null, [selectedSubjects]);

  useEffect(() => {
    let alive = true;
    if (!subject) { setState(null); return; }
    (async () => {
      try {
        const r = await fetch(`/api/fyp/progress?subject=${encodeURIComponent(subject)}`, { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        if (r.ok) setState(j);
        else setState(null);
      } catch { setState(null); }
    })();
    return () => { alive = false; };
  }, [subject]);

  if (!subject || !state) return null;

  const pct = Math.max(0, Math.min(100, Math.round(state.percent)));

  return (
    <div className="px-4 pb-2">
      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>Progress in {subject}</span>
        <span>{pct}% ({state.completed}/{state.total})</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-neutral-200/60 dark:bg-neutral-800/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-lernex-blue via-lernex-purple to-pink-500 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

