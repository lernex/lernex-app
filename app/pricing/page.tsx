export default function Pricing() {
  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-200 text-neutral-900 dark:from-neutral-900 dark:to-neutral-800 dark:text-white">
      <div className="w-full max-w-md px-4 py-6 space-y-3">
        <h1 className="text-center text-2xl font-semibold">Choose your plan</h1>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-xl font-semibold">Free</h2>
            <ul className="mt-2 list-disc pl-4 text-sm text-neutral-600 dark:text-neutral-300">
              <li>Daily micro-lessons</li>
              <li>Basic quizzes</li>
              <li>Streak & points</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-xl font-semibold">Premium — $8/mo</h2>
            <ul className="mt-2 list-disc pl-4 text-sm text-neutral-600 dark:text-neutral-300">
              <li>Unlimited AI generation</li>
              <li>Exam playlists</li>
              <li>Advanced explanations</li>
            </ul>
            <button className="mt-3 w-full rounded-2xl bg-lernex-blue py-3 text-white transition hover:bg-lernex-blue/90">Continue</button>
          </div>
        </div>
      </div>
    </main>
  );
}
