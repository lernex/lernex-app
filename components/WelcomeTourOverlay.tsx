"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Compass, PartyPopper, PlayCircle, Sparkles } from "lucide-react";

type TourStep = {
  id: string;
  title: string;
  description: string;
  highlight: string;
  gradient: string;
  accent: string;
  Icon: LucideIcon;
};

const TOUR_STEPS: TourStep[] = [
  {
    id: "path",
    title: "Your learning path is unlocking",
    description: "We just crunched the placement quiz to spot your strengths and the exact concepts to work on next.",
    highlight: "Hang tight while we stitch together your personalized map in the background — this tour keeps things moving.",
    gradient: "from-lernex-blue/80 via-lernex-purple/70 to-teal-400/70",
    accent: "from-lernex-blue/25 to-lernex-purple/30",
    Icon: Sparkles,
  },
  {
    id: "feed",
    title: "Meet your For You feed",
    description: "Every card here is tuned to the subjects you care about. We’ll surface warm-ups, quick wins, and stretch challenges automatically.",
    highlight: "Add or swap classes anytime — the feed reshapes instantly to keep you in the flow.",
    gradient: "from-purple-500/60 via-lernex-blue/60 to-sky-400/60",
    accent: "from-purple-500/30 to-sky-400/25",
    Icon: Compass,
  },
  {
    id: "start",
    title: "Daily momentum, unlocked",
    description: "Point boosts, streak tracking, and gentle nudges help you keep a steady rhythm. Tapping into a lesson now sets the tone for the week.",
    highlight: "Ready when you are — let’s explore your new path and pick the first lesson together.",
    gradient: "from-emerald-400/60 via-lernex-blue/60 to-lernex-purple/60",
    accent: "from-emerald-400/30 to-lernex-blue/25",
    Icon: PartyPopper,
  },
];

const ORBITALS = [
  "absolute -left-16 top-12 h-36 w-36 rounded-full bg-lernex-blue/40 blur-3xl",
  "absolute -top-20 right-8 h-44 w-44 rounded-full bg-purple-400/40 blur-[120px]",
  "absolute bottom-[-40px] left-1/2 h-32 w-60 -translate-x-1/2 rounded-[999px] bg-emerald-300/30 blur-[100px]",
];
const TOUR_FLAG_KEY = "lernex:show-welcome-tour";
const TOUR_ACTIVE_KEY = "lernex:welcome-tour-active";

function buildPath(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export default function WelcomeTourOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const searchKey = useMemo(() => searchParams.toString(), [searchParams]);

  const closeTour = useCallback(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(TOUR_ACTIVE_KEY);
      window.sessionStorage.removeItem(TOUR_FLAG_KEY);
    }
    setOpen(false);
    setStep(0);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(searchKey);
    const hasParam = params.get("welcome") === "1" || params.get("tour") === "1";
    const shouldShowFlag = window.sessionStorage.getItem(TOUR_FLAG_KEY) === "1";
    const activeFlag = window.sessionStorage.getItem(TOUR_ACTIVE_KEY) === "1";

    if (!open && (shouldShowFlag || activeFlag || hasParam)) {
      setOpen(true);
      setStep(0);
      window.sessionStorage.setItem(TOUR_ACTIVE_KEY, "1");
      if (shouldShowFlag) {
        window.sessionStorage.removeItem(TOUR_FLAG_KEY);
      }
      if (hasParam) {
        params.delete("welcome");
        params.delete("tour");
        const next = buildPath(pathname, params);
        // Remove the query without triggering a scroll jump.
        router.replace(next, { scroll: false });
      }
    }
  }, [open, pathname, router, searchKey]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeTour();
      }
    };
    document.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [closeTour, open]);

  const nextStep = useCallback(() => {
    setStep((current) => Math.min(current + 1, TOUR_STEPS.length - 1));
  }, []);

  const prevStep = useCallback(() => {
    setStep((current) => Math.max(current - 1, 0));
  }, []);

  const currentStep = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeTour}
          />

          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -24 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-[130] w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/90 p-1 text-white shadow-[0_40px_120px_-32px_rgba(59,130,246,0.55)] backdrop-blur"
          >
            <motion.div
              className={`relative rounded-[26px] p-6 pb-7 sm:p-8 sm:pb-9 bg-gradient-to-br ${currentStep.gradient}`}
              initial={{ backgroundPosition: "50% 50%" }}
              animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            >
              {ORBITALS.map((cls, idx) => (
                <motion.span
                  key={idx}
                  className={cls}
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: [0.25, 0.6, 0.25], scale: [1, 1.05, 1] }}
                  transition={{ duration: 6 + idx * 2, repeat: Infinity, ease: "easeInOut" }}
                />
              ))}

              <div className="relative space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium tracking-wide uppercase">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/80" />
                    Lernex Tour
                  </div>
                  <button
                    onClick={closeTour}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white/80 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    Skip
                  </button>
                </div>

                <div className="flex items-start gap-4">
                  <motion.div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${currentStep.accent} text-white shadow-lg`}
                    initial={{ rotate: -10, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.05 }}
                  >
                    <currentStep.Icon className="h-6 w-6" />
                  </motion.div>
                  <div className="space-y-3">
                    <motion.h2
                      className="text-2xl font-semibold leading-tight sm:text-3xl"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.32, delay: 0.08 }}
                    >
                      {currentStep.title}
                    </motion.h2>
                    <motion.p
                      className="text-sm text-white/80 sm:text-base"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.32, delay: 0.12 }}
                    >
                      {currentStep.description}
                    </motion.p>
                  </div>
                </div>

                <motion.div
                  className="rounded-2xl border border-white/20 bg-white/10 p-4 text-sm text-white/80 shadow-inner backdrop-blur"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.18 }}
                >
                  <p className="leading-relaxed">
                    {currentStep.highlight}
                  </p>
                </motion.div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-1 items-center gap-2">
                    {TOUR_STEPS.map((s, idx) => (
                      <motion.span
                        key={s.id}
                        className={`h-1.5 flex-1 rounded-full ${idx <= step ? "bg-gradient-to-r from-white/90 via-white to-white/70" : "bg-white/25"}`}
                        layout
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                      />
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-white/70">
                    Step {step + 1}
                    <span className="text-white/40">/</span>
                    {TOUR_STEPS.length}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs text-white/70">
                    <PlayCircle className="h-4 w-4" />
                    <span>Stay here while we finish syncing your path.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={prevStep}
                      disabled={step === 0}
                      className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Back
                    </button>
                    <button
                      onClick={isLast ? closeTour : nextStep}
                      className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-white/90"
                    >
                      {isLast ? "Start exploring" : "Next"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


