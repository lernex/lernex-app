"use client";
import FypFeed from "@/components/FypFeed";
import ClassPicker from "@/components/ClassPicker";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";
import { ProfileBasicsProvider } from "@/app/providers/ProfileBasicsProvider";
import WelcomeTourOverlay from "@/components/WelcomeTourOverlay";
import type { ProfileBasics } from "@/lib/profile-basics";

type AppFeedClientProps = {
  initialProfile?: ProfileBasics | null;
};

export default function AppFeedClient({ initialProfile }: AppFeedClientProps) {
  const { selectedSubjects } = useLernexStore();
  const hasSelection = selectedSubjects.length > 0;

  return (
    <ProfileBasicsProvider initialData={initialProfile ?? undefined}>
      <WelcomeTourOverlay />
      <main className="relative min-h-[calc(100vh-56px)] overflow-hidden bg-gradient-to-br from-[#050716] via-[#04040f] to-[#010208]">
        <div className="absolute inset-0 -z-40 bg-[radial-gradient(circle_at_18%_22%,rgba(46,119,255,0.4),transparent_55%),radial-gradient(circle_at_82%_18%,rgba(171,67,255,0.32),transparent_62%),radial-gradient(circle_at_50%_88%,rgba(20,180,149,0.26),transparent_68%)]" />
        <div className="pointer-events-none absolute inset-0 -z-30 bg-[linear-gradient(115deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_35%),linear-gradient(295deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0)_42%)] opacity-40" />
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] bg-[size:160px_160px] opacity-[0.18]" />
        <div className="pointer-events-none absolute -left-[35%] top-1/2 -z-10 h-[900px] w-[900px] -translate-y-1/2 rounded-full bg-[conic-gradient(from_100deg_at_50%_50%,rgba(59,130,246,0.32)_0deg,rgba(236,72,153,0.22)_150deg,rgba(56,189,248,0.32)_320deg,rgba(59,130,246,0.32)_360deg)] blur-[200px] opacity-75 animate-[spin_95s_linear_infinite]" />
        <div className="pointer-events-none absolute right-[-12%] top-[14%] -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.42),transparent_68%)] blur-[160px] opacity-60" />
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
            <div className="pointer-events-none absolute -left-32 -right-32 -top-24 bottom-[-25%] -z-10 bg-[radial-gradient(circle_at_25%_18%,rgba(56,189,248,0.55),transparent_65%),radial-gradient(circle_at_78%_74%,rgba(147,51,234,0.45),transparent_68%),radial-gradient(circle_at_50%_105%,rgba(34,197,94,0.22),transparent_75%)] blur-[120px]" />
            <div className="pointer-events-none absolute inset-0 -z-20 rounded-[40px] border border-white/15 bg-white/10 opacity-50 blur-3xl backdrop-blur-xl" />
            <FypFeed />
          </div>
        </div>
      </main>
    </ProfileBasicsProvider>
  );
}
