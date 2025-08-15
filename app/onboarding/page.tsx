"use client";

import { useState } from "react";

export default function Onboarding() {
  const [subjects, setSubjects] = useState<string[]>([]);
  const all = ["Algebra", "Biology", "Chemistry", "Geometry", "History", "English"];

  const toggle = (s: string) =>
    setSubjects((prev) => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 space-y-4">
        <h1 className="text-xl font-semibold">Pick your subjects</h1>

        <div className="grid grid-cols-2 gap-2">
          {all.map((s) => {
            const on = subjects.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggle(s)}
                className={`px-3 py-2 rounded-xl border transition text-left
                  ${on ? "bg-lernex-blue border-lernex-blue text-white"
                       : "bg-neutral-900 border-neutral-800 hover:bg-neutral-800"}`}
              >
                {s}
              </button>
            );
          })}
        </div>

        <button
          className="w-full py-3 rounded-2xl bg-lernex-green hover:bg-green-600 transition"
          onClick={() => alert(`Saved: ${subjects.join(", ") || "None"}`)}
        >
          Continue
        </button>
      </div>
    </main>
  );
}
