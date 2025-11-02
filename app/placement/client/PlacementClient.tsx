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
      router.replace("/fyp?welcome=1");
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
            router.replace("/fyp");
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
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900 text-neutral-900 dark:text-white">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-lg font-medium bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Loading placement...
          </p>
        </div>
      </div>
    );
  }
  if (err) {
    return (
      <main className="min-h-screen grid place-items-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900 text-neutral-900 dark:text-white">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="text-red-500 dark:text-red-400 text-lg font-medium">{err}</div>
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
            className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 font-semibold text-white transition-all duration-300 transform hover:scale-105 hover:shadow-xl"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }
  if (!state || !item) return null;

  return (
    <main className="min-h-screen grid place-items-center text-neutral-900 dark:text-white bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900 transition-all duration-500">
      <div className="w-full max-w-md px-6 py-8 space-y-5 rounded-2xl bg-white/80 backdrop-blur-sm border border-neutral-200 shadow-2xl dark:bg-neutral-900/80 dark:border-neutral-700 animate-fade-in">
        {/* Header with subject and progress */}
        <div className="flex items-center justify-between text-sm font-medium text-neutral-600 dark:text-neutral-400 animate-slide-down">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold">
              {state.subject.charAt(0)}
            </span>
            <span>{state.subject} - {state.course}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              {state.step} / {state.maxSteps}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2 animate-slide-up">
          <div className="w-full h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-500 ease-out"
              style={{ width: `${(state.step / state.maxSteps) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              {state.difficulty}
            </span>
            <span className="text-neutral-600 dark:text-neutral-300 font-medium">
              {correctTotal} / {questionTotal} correct
            </span>
          </div>
        </div>

        {nextLoading && (
          <div className="w-full h-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div className="h-full w-full bg-gradient-to-r from-blue-600 to-purple-600 animate-pulse" />
          </div>
        )}

        {/* Question */}
        <div className="text-lg font-semibold text-neutral-900 dark:text-white animate-fade-in-item pt-2">
          <FormattedText text={item.prompt} />
        </div>

        {/* Answer choices */}
        <div className="grid gap-3 pt-2">
          {item.choices.map((c, i) => {
            const isCorrect = i === item.correctIndex;
            const isSel = selected === i;
            return (
              <button
                key={i}
                onClick={() => answer(i)}
                disabled={selected !== null}
                style={{ animationDelay: `${i * 50}ms` }}
                className={`text-left px-4 py-3 rounded-xl border font-medium transition-all duration-300 transform animate-fade-in-item
                  ${isSel
                    ? (isCorrect
                      ? "bg-gradient-to-r from-green-600 to-green-500 border-green-400 text-white shadow-lg scale-[1.02]"
                      : "bg-gradient-to-r from-red-600 to-red-500 border-red-400 text-white shadow-lg scale-[1.02]")
                    : "bg-white border-neutral-300 hover:bg-neutral-50 hover:border-blue-400 dark:bg-neutral-800 dark:border-neutral-600 dark:text-white dark:hover:bg-neutral-700 dark:hover:border-purple-400 hover:scale-[1.02] hover:shadow-md disabled:hover:scale-100 disabled:hover:shadow-none"}`}
              >
                <FormattedText text={c} />
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {selected !== null && item.explanation && (
          <div className="text-sm text-neutral-600 dark:text-neutral-300 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 animate-slide-up">
            <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1">Explanation:</div>
            <FormattedText text={item.explanation} />
          </div>
        )}

        {/* Next button */}
        {selected !== null && (
          <div className="pt-3 flex justify-end animate-slide-up">
            <button
              onClick={nextQuestion}
              disabled={nextLoading}
              className={`px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold transition-all duration-300 transform ${
                nextLoading
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:scale-105 hover:shadow-xl"
              }`}
            >
              {nextLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading...
                </span>
              ) : (
                "Next Question →"
              )}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
