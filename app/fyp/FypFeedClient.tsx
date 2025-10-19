"use client";
import FypFeed from "@/components/FypFeed";
import ClassPicker from "@/components/ClassPicker";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";
import { ProfileBasicsProvider } from "@/app/providers/ProfileBasicsProvider";
import WelcomeTourOverlay from "@/components/WelcomeTourOverlay";
import type { ProfileBasics } from "@/lib/profile-basics";

type FypFeedClientProps = {
  initialProfile?: ProfileBasics | null;
};

export default function FypFeedClient({ initialProfile }: FypFeedClientProps) {
  const { selectedSubjects } = useLernexStore();
  const hasSelection = selectedSubjects.length > 0;

  return (
    <ProfileBasicsProvider initialData={initialProfile ?? undefined}>
      <WelcomeTourOverlay />
      <main
        data-fyp-feed-root="true"
        className="relative mx-auto w-full max-w-5xl min-h-[calc(100vh-56px)] px-4 pb-16 pt-12 text-foreground transition-colors duration-200 sm:px-6"
      >
        <div className="relative mx-auto flex w-full max-w-[520px] flex-col gap-6">
          <header className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-white/60">
                For you
              </span>
              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Your Lernex feed</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Fresh lessons tailored to the classes you care about.
              </p>
            </div>
            <div className="shrink-0">
              <ClassPicker />
            </div>
          </header>

          {!hasSelection && (
            <div className="rounded-2xl border border-surface bg-surface-panel p-4 text-sm text-neutral-700 shadow-[0_32px_90px_-60px_rgba(47,128,237,0.95)] backdrop-blur transition-colors duration-200 dark:text-neutral-200">
              Personalize your feed by{" "}
              <Link href="/onboarding" className="font-medium text-lernex-blue hover:underline">
                choosing subjects
              </Link>
              .
            </div>
          )}

          <div className="relative">
            <FypFeed />
          </div>
        </div>
      </main>
    </ProfileBasicsProvider>
  );
}
