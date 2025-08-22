"use client";

import { useEffect, useState } from "react";
import type { PlacementItem, PlacementState } from "@/types/placement";
import { useRouter } from "next/navigation";

export default function PlacementClient() {
  const router = useRouter();
  const [state, setState] = useState<PlacementState | null>(null);
  const [item, setItem] = useState<PlacementItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctTotal, setCorrectTotal] = useState(0);
  const [questionTotal, setQuestionTotal] = useState(0);

  // Start placement
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/placement/start", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to start");
        setState(data);
        // immediately fetch first question
        const qres = await fetch("/api/placement/next", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: data }),
        });
        const qdata = await qres.json();
        if (!qres.ok) throw new Error(qdata?.error || "Failed to load question");
        setState(qdata.state);
        setItem(qdata.item);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const answer = async (idx: number) => {
    if (!item || !state) return;
    setSelected(idx);
    const correct = idx === item.correctIndex;
    setQuestionTotal((t) => t + 1);
    if (correct) setCorrectTotal((c) => c + 1);

    // fetch next state + item
    setLoading(true);
    try {
      const res = await fetch("/api/placement/next", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state, lastAnswer: idx, lastItem: item }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      setState(data.state);
      setItem(data.item);
      setSelected(null);

      if (data.state?.done || !data.item) {
        // finish
        await fetch("/api/placement/finish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: data.state, correctTotal, questionTotal }),
        });
        // ignore errors for now
        router.replace("/app");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !item) {
    return <div className="min-h-screen grid place-items-center text-white">Loading placement…</div>;
  }
  if (err) {
    return (
      <main className="min-h-screen grid place-items-center text-white">
        <div className="text-red-400">{err}</div>
      </main>
    );
  }
  if (!state || !item) return null;

  return (
    <main className="min-h-screen grid place-items-center text-white">
      <div className="w-full max-w-md px-4 py-6 space-y-4 rounded-2xl bg-neutral-900 border border-neutral-800">
        <div className="flex items-center justify-between text-sm text-neutral-400">
          <div>{state.subject} • {state.course}</div>
          <div>Step {state.step} / {state.maxSteps}</div>
        </div>
        <div className="text-xs uppercase tracking-wide text-neutral-400">Difficulty: {state.difficulty}</div>
        <h1 className="text-lg font-semibold">{item.prompt}</h1>

        <div className="grid gap-2">
          {item.choices.map((c, i) => {
            const isCorrect = i === item.correctIndex;
            const isSel = selected === i;
            return (
              <button
                key={i}
                onClick={() => answer(i)}
                disabled={selected !== null}
                className={`text-left px-3 py-2 rounded-xl border transition
                  ${isSel ? (isCorrect ? "bg-green-600 border-green-500" : "bg-red-600 border-red-500")
                          : "bg-neutral-800 border-neutral-700 hover:bg-neutral-700"}`}
              >
                {c}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-neutral-400">
          Correct so far: {correctTotal} / {questionTotal}
        </div>
        {selected !== null && item.explanation && (
          <div className="text-sm text-neutral-300 pt-1">{item.explanation}</div>
        )}
      </div>
    </main>
  );
}
