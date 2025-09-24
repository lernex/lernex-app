"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlacementItem, PlacementState, PlacementNextResponse } from "@/types/placement";
import { useRouter } from "next/navigation";
import FormattedText from "@/components/FormattedText";
import { useProfileStats } from "@/app/providers/ProfileStatsProvider";
import { normalizeProfileStats } from "@/lib/profile-stats";

export default function PlacementClient() {
  const router = useRouter();
  const { stats, setStats, refresh } = useProfileStats();
  const DEBUG = process.env.NEXT_PUBLIC_PLACEMENT_DEBUG !== "0";
  const dlog = useCallback((...args: unknown[]) => { if (DEBUG) console.debug("[placement]", ...args); }, [DEBUG]);

  const [state, setState] = useState<PlacementState | null>(null);
  const [item, setItem] = useState<PlacementItem | null>(null);
  const [branches, setBranches] = useState<PlacementNextResponse["branches"] | null>(null);
  const [pendingNext, setPendingNext] = useState<{ state: PlacementState; item: PlacementItem | null } | null>(null);
  const [pendingAnswer, setPendingAnswer] = useState<{ state: PlacementState; item: PlacementItem; answer: number } | null>(null);
  const prefetchKeyRef = useRef<string | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [nextLoading, setNextLoading] = useState(false);
  const nextLoadingRef = useRef(false);
  const [prefetching, setPrefetching] = useState(false);

  const [selected, setSelected] = useState<number | null>(null);
  const [correctTotal, setCorrectTotal] = useState(0);
  const [questionTotal, setQuestionTotal] = useState(0);
  const correctTotalRef = useRef(0);
  const questionTotalRef = useRef(0);
  useEffect(() => { correctTotalRef.current = correctTotal; }, [correctTotal]);
  useEffect(() => { questionTotalRef.current = questionTotal; }, [questionTotal]);

  const stateRef = useRef<PlacementState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => () => {
    prefetchAbortRef.current?.abort();
  }, []);

  // Finish handler: persist results, generate level map, clear placement flag
  const finishingRef = useRef(false);
  const finishAndGo = useCallback(async (finalState: PlacementState | null) => {
    if (finishingRef.current) { dlog("finish: already in-progress"); return; }
    finishingRef.current = true;
    try {
      const ct = correctTotalRef.current;
      const qt = questionTotalRef.current;
      dlog("finish: POST /api/placement/finish", {
        subject: finalState?.subject, course: finalState?.course,
        correctTotal: ct, questionTotal: qt
      });
      const res = await fetch("/api/placement/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: finalState, correctTotal: ct, questionTotal: qt }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        dlog("finish: non-OK", { status: res.status, payload });
      } else {
        dlog("finish: ok");
        if (payload && typeof payload === "object") {
          const profileData = "profile" in payload
            ? (payload as { profile: Record<string, unknown> | null }).profile
            : null;
          if (profileData && typeof profileData === "object") {
            setStats(normalizeProfileStats(profileData));
          } else if (typeof (payload as { addPts?: unknown }).addPts === "number") {
            const addPts = Number((payload as { addPts: number }).addPts) || 0;
            const newStreakVal = typeof (payload as { newStreak?: unknown }).newStreak === "number"
              ? Number((payload as { newStreak: number }).newStreak)
              : stats?.streak ?? 0;
            const fallback = {
              points: (stats?.points ?? 0) + addPts,
              streak: newStreakVal,
              last_study_date: new Date().toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            };
            setStats(normalizeProfileStats(fallback));
          }
        }
        await refresh().catch(() => {});
      }
    } catch (e) {
      dlog("finish: catch", e instanceof Error ? e.message : String(e));
    } finally {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("lernex:show-welcome-tour", "1");
      }
      router.replace("/app?welcome=1");
    }
  }, [router, dlog, refresh, setStats, stats]);

  const prefetchNext = useCallback(async (payload: { state: PlacementState; item: PlacementItem; answer: number }, key: string) => {
    try { dlog("prefetch", { step: payload.state.step, key }); } catch {}
    prefetchAbortRef.current?.abort();
    const controller = new AbortController();
    prefetchAbortRef.current = controller;
    prefetchKeyRef.current = key;
    try {
      const res = await fetch("/api/placement/next", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: payload.state, lastAnswer: payload.answer, lastItem: payload.item }),
        signal: controller.signal,
      });
      const data: PlacementNextResponse | { error?: string } = await res.json();
      if (prefetchKeyRef.current !== key) { return; }
      if (!res.ok || !("state" in data)) { throw new Error((("error" in data) && data.error) || `HTTP ${res.status}`); }
      const d = data as PlacementNextResponse;
      setPendingNext({ state: d.state, item: d.item ?? null });
      setBranches(d.branches ?? null);
      setPrefetching(false);
    } catch (e) {
      if (controller.signal.aborted || prefetchKeyRef.current !== key) { return; }
      dlog("prefetch: catch", e instanceof Error ? e.message : String(e));
      setPrefetching(false);
    } finally {
      if (prefetchKeyRef.current === key) {
        prefetchAbortRef.current = null;
        prefetchKeyRef.current = null;
      }
    }
  }, [dlog]);

  // 1) Prime: load first question + prefetch branches
  const primeRanRef = useRef(false);
  useEffect(() => {
    if (primeRanRef.current) { dlog("prime: skip"); return; }
    primeRanRef.current = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        dlog("prime: POST /api/placement/next");
        const res = await fetch("/api/placement/next", { method: "POST" });
        const data: PlacementNextResponse | { error?: string } = await res.json();
        if (!res.ok) {
          // Narrow the union before reading .error
          const msg = "error" in data ? data.error ?? "Failed to start placement" : "Failed to start placement";
          dlog("prime: non-OK", { status: res.status, msg });
          throw new Error(msg);
        }
        if ("error" in data) {
          dlog("prime: error key present", data.error);
          throw new Error(data.error ?? "Failed to start placement");
        }
        if (!("state" in data)) {
          dlog("prime: invalid response shape");
          throw new Error("Invalid response");
        }
        const d = data as PlacementNextResponse;
        dlog("prime: ok", {
          step: d.state.step, diff: d.state.difficulty, course: d.state.course,
          hasItem: !!d.item, hasBranches: !!d.branches,
        });
        setState(data.state);
        setItem(data.item);
        setBranches(data.branches ?? null);
        // Only finish + redirect when truly finished (done and no remaining courses)
        if (data.state.done && (!data.state.remaining || data.state.remaining.length === 0)) {
          void finishAndGo(data.state);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        dlog("prime: catch", msg);
        setErr(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, dlog, finishAndGo]);

  // 2) Select answer and wait for user to move on
  const answer = (idx: number) => {
    if (!item || !state || selected !== null) return;
    dlog("answer", { idx, correctIndex: item.correctIndex, correct: idx === item.correctIndex });
    setSelected(idx);
    const correct = idx === item.correctIndex;
    setQuestionTotal((t) => t + 1);
    if (correct) setCorrectTotal((c) => c + 1);

    const payload = { state, item, answer: idx };
    setPendingAnswer(payload);

    const branch = correct ? branches?.right : branches?.wrong;
    const branchState = branch?.state ?? null;
    const branchItem = branch?.item ?? null;
    const hasImmediateNext = !!(branchState && (branchItem !== null || branchState?.done));

    if (hasImmediateNext && branchState) {
      setPendingNext({ state: branchState, item: branchItem });
      setPrefetching(false);
    } else {
      if (branchState) {
        setPendingNext({ state: branchState, item: branchItem });
      } else {
        setPendingNext(null);
      }
      setPrefetching(true);
      const key = [state.subject, state.course, state.step, idx].join("-");
      void prefetchNext(payload, key);
    }
  };

  const nextQuestion = async () => {
    if (!pendingAnswer || nextLoadingRef.current) { dlog("nextQuestion: guard", { hasPending: !!pendingAnswer, loading: nextLoadingRef.current }); return; }
    if (prefetching) { dlog("nextQuestion: prefetch in-flight; continuing"); }
    nextLoadingRef.current = true;
    setNextLoading(true);
    const prev = pendingAnswer;
    const next = pendingNext;

    dlog("nextQuestion", { hasPrefetch: !!next, hasItem: !!next?.item });
    // Use optimistic path only when we have a prefetched item
    if (next && next.item) {
      setState(next.state);
      setItem(next.item);
      setSelected(null);
      setBranches(null);
      setPendingNext(null);
      if (prev.state.course !== next.state.course) {
        setCorrectTotal(0);
        setQuestionTotal(0);
      }

      if (next.state.done && (!next.state.remaining || next.state.remaining.length === 0)) {
        void finishAndGo(next.state);
        setPendingAnswer(null);
        setNextLoading(false);
        nextLoadingRef.current = false;
        return;
      }

      setPendingAnswer(null);
      setNextLoading(false);
      nextLoadingRef.current = false;
      const stepForPrefetch = next.state.step;
      dlog("prefetch-advance: POST /api/placement/next");
      void fetch("/api/placement/next", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: prev.state, lastAnswer: prev.answer, lastItem: prev.item }),
      })
        .then(async (r) => {
          dlog("prefetch-advance: res", { status: r.status });
          const data: PlacementNextResponse | { error?: string } = await r.json();
          if (!r.ok) throw new Error((("error" in data) && data.error) || "Failed prefetch");
          if (!("state" in data)) throw new Error("Invalid response");
          if (data.state?.done && (!data.state.remaining || data.state.remaining.length === 0)) {
            router.replace("/app");
            return;
          }
          if (stateRef.current?.step === stepForPrefetch) {
            setBranches(data.branches ?? null);
          }
        })
        .catch((e) => { dlog("prefetch-advance: catch", e instanceof Error ? e.message : String(e)); });
    } else {
      // Fallback: no usable prefetched item, request synchronously
      prefetchAbortRef.current?.abort();
      prefetchKeyRef.current = null;
      setPrefetching(false);
      try {
        setLoading(true);
        dlog("sync-advance: POST /api/placement/next");
        const res = await fetch("/api/placement/next", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: prev.state, lastAnswer: prev.answer, lastItem: prev.item }),
        });

        const data: PlacementNextResponse | { error?: string } = await res.json();
        if (!res.ok) {
          const msg = (("error" in data) && data.error) || `HTTP ${res.status}`;
          dlog("sync-advance: non-OK", { status: res.status, msg });
          throw new Error(msg);
        }
        if (!("state" in data)) throw new Error("Invalid response");
        const d = data as PlacementNextResponse;
        dlog("sync-advance: ok", { step: d.state.step, hasItem: !!d.item, hasBranches: !!d.branches });
        setState(data.state);
        setItem(data.item);
        setBranches(data.branches ?? null);
        if (prev.state.course !== data.state.course) {
          setCorrectTotal(0);
          setQuestionTotal(0);
        }
        if (data.state?.done && (!data.state.remaining || data.state.remaining.length === 0)) {
          void finishAndGo(data.state);
        }
        setSelected(null);
        setPendingAnswer(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        dlog("sync-advance: catch", msg);
        setErr(msg);
      } finally {
        setLoading(false);
        setNextLoading(false);
        nextLoadingRef.current = false;
      }
    }
  };

  if (loading && !item) {
    return <div className="min-h-screen grid place-items-center text-neutral-900 dark:text-white">Loading placement...</div>;
  }
  if (err) {
    return (
      <main className="min-h-screen grid place-items-center text-neutral-900 dark:text-white">
        <div className="text-red-500 dark:text-red-400">{err}</div>
        <button
          onClick={() => {
            // Retry by re-calling the prime flow
            setErr(null);
            setLoading(true);
            // mimic initial effect
            fetch("/api/placement/next", { method: "POST" })
              .then(async (r) => {
                dlog("retry: res", { status: r.status });
                const data: PlacementNextResponse | { error?: string } = await r.json();
                if (!r.ok) throw new Error((("error" in data) && data.error) || `HTTP ${r.status}`);
                if (!("state" in data)) throw new Error("Invalid response");
                setState(data.state);
                setItem(data.item);
                setBranches(data.branches ?? null);
              })
              .catch((e) => setErr(e instanceof Error ? e.message : "Unknown error"))
              .finally(() => setLoading(false));
          }}
          className="mt-3 rounded-xl border border-neutral-300 bg-white px-4 py-2 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
        >
          Retry
        </button>
      </main>
    );
  }
  if (!state || !item) return null;

  return (
    <main className="min-h-screen grid place-items-center text-neutral-900 dark:text-white bg-gradient-to-br from-blue-50 to-purple-50 dark:from-neutral-900 dark:to-neutral-800">
      <div className="w-full max-w-md px-4 py-6 space-y-4 rounded-2xl bg-white border border-neutral-200 shadow-lg dark:bg-neutral-900 dark:border-neutral-800">
        <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
          <div>{state.subject} - {state.course}</div>
          <div>Step {state.step} / {state.maxSteps}</div>
        </div>
        <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Difficulty: {state.difficulty}</div>
        {nextLoading && (
          <div className="w-full h-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div className="h-full w-full bg-gradient-to-r from-lernex-blue to-lernex-purple animate-pulse" />
          </div>
        )}

        <div className="text-lg font-semibold"><FormattedText text={item.prompt} /></div>
        <div className="grid gap-2">
          {item.choices.map((c, i) => {
            const isCorrect = i === item.correctIndex;
            const isSel = selected === i;
            return (
              <button
                key={i}
                onClick={() => answer(i)}
                disabled={selected !== null}
                className={`text-left px-3 py-2 rounded-xl border transition-transform
                  ${isSel ? (isCorrect ? "bg-green-600 border-green-500 text-white" : "bg-red-600 border-red-500 text-white")
                          : "bg-neutral-100 border-neutral-300 hover:bg-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:hover:bg-neutral-700 hover:scale-[1.02]"}`}
              >
                <FormattedText text={c} />
              </button>
            );
          })}
        </div>

        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Correct so far: {correctTotal} / {questionTotal}
        </div>
        {selected !== null && item.explanation && (
          <div className="text-sm text-neutral-600 dark:text-neutral-300 pt-1">
            <FormattedText text={item.explanation} />
          </div>
        )}
        {selected !== null && (
          <div className="pt-3 flex justify-end">
            <button
              onClick={nextQuestion}
              disabled={nextLoading}
              className={"px-4 py-2 rounded-xl bg-lernex-blue text-white transition-transform transform animate-fade-in " + (nextLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-lernex-blue/90 hover:scale-105") }
            >
              {nextLoading ? "Loading..." : "Next"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
