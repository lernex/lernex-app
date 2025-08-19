"use client";
import { lessons } from "@/data/lessons";
import Feed from "@/components/Feed";
import StreakPoints from "@/components/StreakPoints";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";

export default function AppFeedClient() {
  const { selectedSubjects } = useLernexStore();
  return (
    <main className="min-h-[calc(100vh-56px)]">
      <StreakPoints />
      {!selectedSubjects.length && (
        <div className="max-w-md mx-auto px-4 pt-4 pb-1 text-center text-neutral-300 text-sm">
          Personalize your feed → <Link href="/onboarding" className="underline">choose subjects</Link>.
        </div>
      )}
      <Feed lessons={lessons} />
    </main>
  );
}
