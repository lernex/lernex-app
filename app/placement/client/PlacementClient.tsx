"use client";

import { useEffect, useRef, useState } from "react";
import type { PlacementItem, PlacementState, PlacementNextResponse } from "@/types/placement";
import { useRouter } from "next/navigation";

export default function PlacementClient() {
  const router = useRouter();

  const [state, setState] = useState<PlacementState | null>(null);
  const [item, setItem] = useState<PlacementItem | null>(null);
  const [branches, setBranches] = useState<PlacementNextResponse["branches"] | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<number | null>(null);
  const [correctTotal, setCorrectTotal] = useState(0);
  const [questionTotal, setQuestionTotal] = useState(0);

  const stateRef = useRef<PlacementState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 1) Prime: load first question + prefetch branches
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/placement/next", { method: "POST" });
        const data: PlacementNextResponse | { error?: string } = await res.json();
        if (!res.ok) {
          // Narrow the union before reading .error
          const msg = "error" in data ? data.error ?? "Failed to start placement" : "Failed to start placement";
          throw new Error(msg);
        }
        if ("error" in data) {
          throw new Error(data.error ?? "Failed to start placement");
        }
        if (!("state" in data)) {
          throw new Error("Invalid response");
        }
        setState(data.state);
        setItem(data.item);
        setBranches(data.branches ?? null);
        if (data.state.done || !data.item) {
          router.replace("/app");
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // 2) Answer instantly with prefetched branch, then prefetch next branches in background
  const answer = async (idx: number) => {
    if (!item || !state) return;

    setSelected(idx);
    const correct = idx === item.correctIndex;
    setQuestionTotal((t) => t + 1);
    if (correct) setCorrectTotal((c) => c + 1);

    // Consume prefetched branch immediately
    const next = correct ? branches?.right : branches?.wrong;

    // If we have the prefetched branch, swap after a short delay to show feedback
    if (next && next.item && next.state) {
      // Allow the user to see correct/incorrect styling & explanation
      await new Promise((r) => setTimeout(r, 1600));

      setState(next.state);
      setItem(next.item);
      setSelected(null);
      setBranches(null);

      // Background prefetch for the following step
      const stepForPrefetch = next.state.step;
      void fetch("/api/placement/next", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Send the last answer + lastItem so the server advances canonical state (for logging / parity)
        body: JSON.stringify({ state: state, lastAnswer: idx, lastItem: item }),
      })
        .then(async (r) => {
          const data: PlacementNextResponse | { error?: string } = await r.json();
          if (!r.ok) throw new Error((("error" in data) && data.error) || "Failed prefetch");
          if (!("state" in data)) throw new Error("Invalid response");
          // If finished according to server, end flow
          if (data.state?.done || !data.item) {
            router.replace("/app");
            return;
          }
          // Only update branches if we're still on the same step
          if (stateRef.current?.step === stepForPrefetch) {
            setBranches(data.branches ?? null);
          }
        })
        .catch(() => {
          /* soft fail: keep current question; user can still continue */
        });

      return;
    }

    // Fallback: if no prefetched branch (rare), hit server synchronously (old behavior)
    try {
      setLoading(true);
      const res = await fetch("/api/placement/next", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state, lastAnswer: idx, lastItem: item }),
      });
      const data: PlacementNextResponse | { error?: string } = await res.json();
      if (!res.ok) throw new Error((("error" in data) && data.error) || "Failed");
      if (!("state" in data)) throw new Error("Invalid response");
      setState(data.state);
      setItem(data.item);
      setBranches(data.branches ?? null);
      setSelected(null);
      if (data.state?.done || !data.item) {
        router.replace("/app");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !item) {
    return <div className="min-h-screen grid place-items-center text-neutral-900 dark:text-white">Loading placement…</div>;
  }
  if (err) {
    return (
      <main className="min-h-screen grid place-items-center text-neutral-900 dark:text-white">
        <div className="text-red-500 dark:text-red-400">{err}</div>
      </main>
    );
  }
  if (!state || !item) return null;

  return (
    <main className="min-h-screen grid place-items-center text-neutral-900 dark:text-white">
      <div className="w-full max-w-md px-4 py-6 space-y-4 rounded-2xl bg-white border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800">
        <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
          <div>{state.subject} • {state.course}</div>
          <div>Step {state.step} / {state.maxSteps}</div>
        </div>
        <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Difficulty: {state.difficulty}</div>

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
                  ${isSel ? (isCorrect ? "bg-green-600 border-green-500 text-white" : "bg-red-600 border-red-500 text-white")
                          : "bg-neutral-100 border-neutral-300 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:hover:bg-neutral-700"}`}
              >
                {c}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Correct so far: {correctTotal} / {questionTotal}
        </div>
        {selected !== null && item.explanation && (
          <div className="text-sm text-neutral-600 dark:text-neutral-300 pt-1">{item.explanation}</div>
        )}
      </div>
    </main>
  );
}
