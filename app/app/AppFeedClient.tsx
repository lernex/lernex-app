"use client";
import { useEffect, useRef } from "react";
import FypFeed from "@/components/FypFeed";
import ClassPicker from "@/components/ClassPicker";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";
import { ProfileBasicsProvider } from "@/app/providers/ProfileBasicsProvider";
import WelcomeTourOverlay from "@/components/WelcomeTourOverlay";
import type { ProfileBasics } from "@/lib/profile-basics";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

type AppFeedClientProps = {
  initialProfile?: ProfileBasics | null;
};

const MAIN_FALLBACK_BACKGROUND =
  "radial-gradient(circle at 22% 24%, rgba(96,180,255,0.6), transparent 58%), radial-gradient(circle at 80% 20%, rgba(239,91,197,0.45), transparent 62%), radial-gradient(circle at 48% 88%, rgba(68,225,195,0.34), transparent 68%), linear-gradient(135deg, #111d4d 0%, #09123a 48%, #03041a 100%)";

export default function AppFeedClient({ initialProfile }: AppFeedClientProps) {
  const { selectedSubjects } = useLernexStore();
  const hasSelection = selectedSubjects.length > 0;
  const mainRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;
    mainEl.dataset.auroraMotion = prefersReducedMotion ? "pause" : "play";
    console.debug("[AppFeedClient] aurora motion preference", {
      prefersReducedMotion,
      dataset: { ...mainEl.dataset },
    });
  }, [prefersReducedMotion]);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    const emitDebugInfo = (reason: string) => {
      const computed = window.getComputedStyle(mainEl);
      console.debug("[AppFeedClient] background inspection", {
        reason,
        backgroundColor: computed.backgroundColor,
        backgroundImage: computed.backgroundImage,
        dataset: { ...mainEl.dataset },
      });
      if (!computed.backgroundImage || computed.backgroundImage === "none") {
        console.warn("[AppFeedClient] missing gradient background. Applying inline fallback.");
        mainEl.style.backgroundImage = MAIN_FALLBACK_BACKGROUND;
        mainEl.dataset.backgroundFallbackApplied = "true";
      }
    };

    emitDebugInfo("initial mount");
    const observer = new MutationObserver(() => emitDebugInfo("class/style mutation"));
    observer.observe(mainEl, { attributes: true, attributeFilter: ["class", "style"] });
    window.setTimeout(() => emitDebugInfo("post hydration delay"), 0);

    return () => observer.disconnect();
  }, []);

  return (
    <ProfileBasicsProvider initialData={initialProfile ?? undefined}>
      <WelcomeTourOverlay />
      <main
        ref={mainRef}
        data-app-feed-root="true"
        data-aurora-motion={prefersReducedMotion ? "pause" : "play"}
        className="relative min-h-[calc(100vh-56px)] overflow-hidden bg-gradient-to-br from-[#111d4d] via-[#0b1645] to-[#03051a]"
      >
        <div className="absolute inset-0 -z-40 bg-[radial-gradient(circle_at_20%_24%,rgba(109,184,255,0.6),transparent_58%),radial-gradient(circle_at_84%_20%,rgba(226,102,213,0.48),transparent_62%),radial-gradient(circle_at_50%_86%,rgba(74,226,197,0.32),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 -z-30 bg-[linear-gradient(118deg,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_36%),linear-gradient(304deg,rgba(140,177,255,0.16)_0%,rgba(255,255,255,0)_48%)] opacity-50" />
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(rgba(255,255,255,0.16)_1px,transparent_1px)] bg-[size:160px_160px] opacity-[0.28]" />
        <div className="aurora-field" style={{ zIndex: -15 }}>
          <div className="aurora-layer aurora-layer--one" />
          <div className="aurora-layer aurora-layer--two" />
          <div className="aurora-layer aurora-layer--three" />
        </div>
        <div className="pointer-events-none absolute -left-[35%] top-1/2 -z-10 h-[900px] w-[900px] -translate-y-1/2 rounded-full bg-[conic-gradient(from_100deg_at_50%_50%,rgba(59,130,246,0.36)_0deg,rgba(236,72,153,0.26)_150deg,rgba(56,189,248,0.36)_320deg,rgba(59,130,246,0.36)_360deg)] blur-[180px] opacity-80 animate-[spin_95s_linear_infinite]" />
        <div className="pointer-events-none absolute right-[-12%] top-[14%] -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.5),transparent_68%)] blur-[160px] opacity-70" />
        <div className="relative mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pb-16 pt-8">
          <header className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                For you
              </span>
              <h1 className="text-2xl font-semibold text-white">Your Lernex feed</h1>
              <p className="text-sm text-white/60">
                Fresh lessons tailored to the classes you care about.
              </p>
            </div>
            <div className="shrink-0">
              <ClassPicker />
            </div>
          </header>

          {!hasSelection && (
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-white/80 shadow-[0_32px_90px_-60px_rgba(47,128,237,0.95)] backdrop-blur">
              Personalize your feed by {" "}
              <Link href="/onboarding" className="font-medium text-lernex-blue hover:underline">
                choosing subjects
              </Link>
              .
            </div>
          )}

          <div className="relative">
            <div className="pointer-events-none absolute -left-32 -right-32 -top-24 bottom-[-25%] -z-10 bg-[radial-gradient(circle_at_24%_20%,rgba(94,180,255,0.6),transparent_64%),radial-gradient(circle_at_78%_74%,rgba(183,112,255,0.5),transparent_70%),radial-gradient(circle_at_50%_105%,rgba(64,229,168,0.3),transparent_78%)] blur-[120px]" />
            <div className="pointer-events-none absolute inset-0 -z-20 rounded-[40px] border border-white/20 bg-white/10 opacity-55 blur-3xl backdrop-blur-2xl" />
            <FypFeed />
          </div>
        </div>
      </main>
    </ProfileBasicsProvider>
  );
}
