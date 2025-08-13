"use client";
import { useLernexStore } from "@/lib/store";

export default function Profile() {
  const { points, streak } = useLernexStore();
  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 space-y-3">
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5">
          <h1 className="text-xl font-semibold mb-2">Your Stats</h1>
          <div className="text-neutral-300">🔥 Streak: <b>{streak}</b> days</div>
          <div className="text-neutral-300">⭐ Points: <b>{points}</b></div>
        </div>
      </div>
    </main>
  );
}
