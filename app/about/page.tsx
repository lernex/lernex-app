"use client";

export default function About() {
  return (
    <main className="min-h-[calc(100vh-56px)] mx-auto w-full max-w-3xl px-4 py-8 text-neutral-900 dark:text-white">
      <h1 className="text-2xl font-semibold">About Lernex</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-300">
        Lernex helps you learn faster with tiny, focused lessons and quick quizzes.
        Paste your own material or pick from playlists — our generator adapts
        explanations and difficulty to you.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="font-medium">Micro‑lessons</div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">30–120 words focused on one concept.</div>
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="font-medium">Adaptive quizzes</div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">Short MCQs with instant feedback.</div>
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="font-medium">Math rendering</div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">LaTeX/MathJax for crisp formulas.</div>
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="font-medium">Streaks & points</div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">Stay motivated and track progress.</div>
        </div>
      </div>
    </main>
  );
}

