"use client";
import FypFeed from "@/components/FypFeed";
import SubjectChips from "@/components/SubjectChips";
import StreakPoints from "@/components/StreakPoints";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";

export default function AppFeedClient() {
  const { selectedSubjects } = useLernexStore();
  return (
    <main className="min-h-[calc(100vh-56px)]">
      <StreakPoints />
      <SubjectChips />
      {!selectedSubjects.length && (
        <div className="max-w-md mx-auto px-4 pb-1 text-center text-neutral-300 text-sm">
          Personalize your feed → <Link href="/onboarding" className="underline">choose subjects</Link>.
        </div>
      )}
      <FypFeed />
    </main>
  );
}
