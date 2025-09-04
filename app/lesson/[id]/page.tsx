"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { lessons } from "@/data/lessons";
import LessonCard from "@/components/LessonCard";
import QuizBlock from "@/components/QuizBlock";
import { bumpStreakAndPoints } from "@/lib/user";

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const lesson = useMemo(() => lessons.find((l) => l.id === id), [id]);

  if (!lesson) {
    return <div className="p-6 text-neutral-900 dark:text-white">Not found.</div>;
  }

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 space-y-4">
        <LessonCard lesson={lesson} />

        <QuizBlock
          lesson={lesson}
          onDone={(correctCount) => {
            // award cloud points: +10 per correct
            bumpStreakAndPoints(correctCount * 10).catch(() => {});
            // go back to the vertical feed after a short beat
            setTimeout(() => router.push("/"), 200);
          }}
        />
      </div>
    </main>
  );
}
