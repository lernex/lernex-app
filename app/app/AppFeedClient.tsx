"use client";
import FypFeed from "@/components/FypFeed";
import SubjectChips from "@/components/SubjectChips";
import ClassPicker from "@/components/ClassPicker";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";

export default function AppFeedClient() {
  const { selectedSubjects } = useLernexStore();
  return (
    <main className="min-h-[calc(100vh-56px)]">
      <div className="pointer-events-none fixed right-3 top-[72px] z-40 sm:right-6">
        <div className="pointer-events-auto"><ClassPicker /></div>
      </div>
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
