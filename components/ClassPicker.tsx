"use client";
import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { useLernexStore } from "@/lib/store";
import { useProfileBasics } from "@/app/providers/ProfileBasicsProvider";

type Pair = { subject: string; course?: string };

export default function ClassPicker() {
  const { selectedSubjects, setSelectedSubjects, classPickerOpen: open, setClassPickerOpen } = useLernexStore();
  const { data: profileBasics } = useProfileBasics();

  const pairs = useMemo<Pair[]>(() => {
    const levelMap = profileBasics.levelMap;
    return profileBasics.interests.map((subject) => ({ subject, course: levelMap[subject] }));
  }, [profileBasics]);

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

  const subLabel = useMemo(() => {
    if (isAllMode) return "Even rotation through all subjects";
    if (isMixMode) return "Prioritizes subjects needing practice";
    if (currentPair && currentPair.course && currentPair.course !== currentPair.subject) {
      return currentPair.subject;
    }
    return null;
  }, [isAllMode, isMixMode, currentPair]);

  const choose = (mode: "all" | "merge" | "one", subject?: string) => {
    if (mode === "all") {
        setSelectedSubjects([]);
    } else if (mode === "merge") {
      const subs = pairs.map((p) => p.subject).filter(Boolean);
      setSelectedSubjects(subs);
    } else if (mode === "one" && subject) {
      setSelectedSubjects([subject]);
    }
    setClassPickerOpen(false);
  };

  if (!pairs.length) return null;

  return (
    <div className="relative z-30">
      <button
        onClick={() => setClassPickerOpen(!open)}
        className="group inline-flex min-w-[200px] items-center justify-between gap-3 rounded-full border border-neutral-200/70 bg-white/85 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-[0_18px_38px_-24px_rgba(47,128,237,0.9)] backdrop-blur transition hover:border-lernex-blue/40 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/60 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:border-lernex-blue/60"
        aria-haspopup="menu"
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
      >
        <div className="flex flex-1 flex-col text-left leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.4em] text-neutral-400 dark:text-white/50">
            Class
          </span>
          <span className="text-sm font-semibold text-neutral-800 dark:text-white">{label}</span>
          {subLabel && (
            <span className="text-xs font-medium text-neutral-400 dark:text-neutral-400">{subLabel}</span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180 text-lernex-blue" : "group-hover:text-neutral-600 dark:group-hover:text-white"}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 mt-3 w-72 rounded-2xl border border-neutral-200/70 bg-white/95 p-3 text-neutral-900 shadow-[0_32px_90px_-50px_rgba(47,128,237,0.95)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0b0f1a]/95 dark:text-white z-50">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-neutral-400 dark:text-neutral-500">
            Your classes
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto overflow-x-visible px-1 pr-2">
            {pairs.map((p) => {
              const on = normalizedSelection.length === 1 && normalizedSelection[0] === p.subject;
              return (
                <button
                  key={p.subject}
                  onClick={() => choose("one", p.subject)}
                  className={`w-full rounded-xl px-4 py-3 text-left transition hover:bg-neutral-100 dark:hover:bg-white/10 ${on ? "bg-neutral-100 dark:bg-white/10" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{p.course || p.subject}</div>
                      {p.course && p.course !== p.subject && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{p.subject}</div>
                      )}
                    </div>
                    {on && <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-lernex-blue" aria-hidden="true" />}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 border-t border-neutral-200/70 dark:border-white/10" />
          <div className="mt-3 grid gap-2">
            <button
              onClick={() => choose("merge")}
              className={`w-full rounded-xl px-4 py-3 text-left transition hover:bg-neutral-100 dark:hover:bg-white/10 ${isMixMode ? "bg-neutral-100 dark:bg-white/10" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Mix subjects</span>
                {isMixMode && <span className="inline-block h-2.5 w-2.5 rounded-full bg-lernex-blue" aria-hidden="true" />}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Smart focus on subjects needing practice</div>
            </button>
            <button
              onClick={() => choose("all")}
              className={`w-full rounded-xl px-4 py-3 text-left transition hover:bg-neutral-100 dark:hover:bg-white/10 ${isAllMode ? "bg-neutral-100 dark:bg-white/10" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">All</span>
                {isAllMode && <span className="inline-block h-2.5 w-2.5 rounded-full bg-lernex-blue" aria-hidden="true" />}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Even rotation through all subjects</div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
