"use client";
import { lessons } from "@/data/lessons";
import LessonCard from "@/components/LessonCard";
import StreakPoints from "@/components/StreakPoints";
import { useState } from "react";
import SwipeCard from "@/components/SwipeCard";

export default function Home() {
  const [i, setI] = useState(0);
  const current = lessons[i];
  const next = () => setI((x) => (x + 1) % lessons.length);

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <StreakPoints />
      <div className="w-full max-w-md px-4 py-6 space-y-4">
        {/* Swipe left or right to advance */}
        <SwipeCard onSwipeLeft={next} onSwipeRight={next}>
          <LessonCard lesson={current} />
        </SwipeCard>

        <button
          onClick={next}
          className="w-full py-3 rounded-2xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition"
        >
          Next
        </button>
      </div>
    </main>
  );
}
