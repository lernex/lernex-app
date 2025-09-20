"use client";
import FypFeed from "@/components/FypFeed";
import ClassPicker from "@/components/ClassPicker";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";

export default function AppFeedClient() {
  const { selectedSubjects } = useLernexStore();
  const hasSelection = selectedSubjects.length > 0;

  return (
    <main className="relative min-h-[calc(100vh-56px)] overflow-hidden bg-[#05060f]">
      <div className="absolute inset-0 -z-20 bg-gradient-to-b from-[#080c1d] via-[#05060f] to-[#02030a]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_15%,rgba(47,128,237,0.28),transparent_55%),radial-gradient(circle_at_85%_25%,rgba(155,81,224,0.24),transparent_55%),radial-gradient(circle_at_50%_85%,rgba(39,174,96,0.18),transparent_65%)]" />
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
          <div className="pointer-events-none absolute -left-32 -right-32 -top-24 bottom-[-25%] -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.38),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(236,72,153,0.3),transparent_65%),radial-gradient(circle_at_50%_100%,rgba(32,211,238,0.22),transparent_70%)] blur-[120px]" />
          <div className="pointer-events-none absolute inset-0 -z-20 rounded-[40px] border border-white/10 bg-white/5 opacity-40 blur-3xl" />
          <FypFeed />
        </div>
      </div>
    </main>
  );
}
