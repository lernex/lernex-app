// app/placement/client/PlacementClient.tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PlacementState, PlacementItem } from "@/types/placement";

export default function PlacementClient() {
  const router = useRouter();
  const [state, setState] = useState<PlacementState | null>(null);
  const [item, setItem] = useState<PlacementItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [correctTotal, setCorrectTotal] = useState(0);
  const [questionTotal, setQuestionTotal] = useState(0);

  const callNext = useCallback(async (payload: {
    state?: PlacementState;
    lastAnswer?: number;
    lastItem?: PlacementItem | null;
  } = {}) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/placement/next", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: Object.keys(payload).length ? JSON.stringify(payload) : "{}",
        cache: "no-store",
      });

      const text = await res.text();
      if (!res.ok) {
        // try to parse error
        try {
          const j = text ? JSON.parse(text) : null;
          throw new Error(j?.error || `Request failed (${res.status})`);
        } catch {
          throw new Error(text || `Request failed (${res.status})`);
        }
      }

      if (!text) throw new Error("Empty response from server");
      const data = JSON.parse(text) as { state: PlacementState; item: PlacementItem | null };

      setState(data.state);
      setItem(data.item ?? null);

      if (data.state.done || !data.item) {
        // finish flow
        await fetch("/api/placement/finish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: data.state, correctTotal, questionTotal }),
        }).catch(() => {});
        router.replace("/app");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load placement");
    } finally {
      setLoading(false);
    }
  }, [correctTotal, questionTotal, router]);

  useEffect(() => {
    // FIRST CALL: no state provided; server initializes
    callNext();
  }, [callNext]);

  const answer = async (idx: number) => {
    if (!state || !item) return;
    setQuestionTotal((q) => q + 1);
    if (idx === item.correctIndex) setCorrectTotal((c) => c + 1);
    await callNext({ state, lastAnswer: idx, lastItem: item });
  };

  if (loading && !item) {
    return (
      <main className="min-h-[60vh] grid place-items-center text-white">
        <div>Loading placement…</div>
        {err && <div className="text-red-400 mt-2 text-sm">{err}</div>}
      </main>
    );
  }

  if (err && !item) {
    return (
      <main className="min-h-[60vh] grid place-items-center text-white">
        <div className="text-red-400">{err}</div>
        <button
          onClick={() => callNext()}
          className="mt-3 px-4 py-2 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
        >
          Retry
        </button>
      </main>
    );
  }

  if (!item || !state) return null;

  return (
    <main className="min-h-[60vh] grid place-items-center text-white">
      <div className="w-full max-w-xl px-4 py-6 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
        <div className="text-xs text-neutral-400">
          {state.subject} • {state.course} • Step {state.step}/{state.maxSteps} • {state.difficulty}
        </div>
        <h1 className="text-xl font-semibold">{item.prompt}</h1>
        <div className="grid gap-2">
          {item.choices.map((c, i) => (
            <button
              key={i}
              onClick={() => answer(i)}
              className="text-left px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
            >
              {c}
            </button>
          ))}
        </div>
        {err && <div className="text-red-400 text-sm">{err}</div>}
      </div>
    </main>
  );
}
