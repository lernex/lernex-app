"use client";
import { useMemo } from "react";
import { useLernexStore } from "@/lib/store";
import { useProfileBasics } from "@/app/providers/ProfileBasicsProvider";

export default function SubjectChips() {
  const { selectedSubjects, setSelectedSubjects } = useLernexStore();
  const { data: profileBasics } = useProfileBasics();

  const options = useMemo(() => profileBasics.interests, [profileBasics.interests]);

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
