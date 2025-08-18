"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLernexStore } from "@/lib/store";

const ALL = ["Algebra","Geometry","Biology","Chemistry","Physics","History","English","Spanish","CS"];

export default function Onboarding() {
  const router = useRouter();
  const { selectedSubjects, setSelectedSubjects } = useLernexStore();
  const [chosen, setChosen] = useState<string[]>(selectedSubjects);

  const toggle = (s: string) => setChosen((prev) => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const save = () => { setSelectedSubjects(chosen); router.replace("/"); };

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 space-y-4">
        <h1 className="text-xl font-semibold">Pick your subjects</h1>
        <div className="grid grid-cols-2 gap-2">
          {ALL.map((s) => {
            const on = chosen.includes(s);
            return (
              <button key={s} onClick={() => toggle(s)}
                className={`px-3 py-2 rounded-xl border text-left transition
                  ${on ? "bg-lernex-blue border-lernex-blue text-white"
                       : "bg-neutral-900 border-neutral-800 hover:bg-neutral-800"}`}>
                {s}
              </button>
            );
          })}
        </div>
        <button onClick={save} className="w-full py-3 rounded-2xl bg-lernex-green hover:bg-green-600 transition">
          Save
        </button>
      </div>
    </main>
  );
}
