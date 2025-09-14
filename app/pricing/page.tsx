export default function Pricing() {
  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-200 text-neutral-900 dark:from-neutral-900 dark:to-neutral-800 dark:text-white">
      <div className="w-full max-w-6xl px-4 py-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Choose your plan</h1>
          <p className="mt-2 text-sm md:text-base text-neutral-600 dark:text-neutral-300">Start free. Upgrade anytime. Cancel whenever.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {/* Free */}
          <div className="relative rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-xl font-semibold">Free</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">The basics to get you learning.</p>
            <div className="mt-4">
              <div className="text-3xl font-bold">$0</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">forever</div>
            </div>
            <ul className="mt-5 space-y-2 text-sm text-neutral-700 dark:text-neutral-200">
              <li>• Daily micro-lessons</li>
              <li>• Core quizzes & flashcards</li>
              <li>• Streaks, XP, and basic stats</li>
              <li>• Standard generation limits</li>
            </ul>
            <button className="mt-6 w-full rounded-2xl border border-neutral-300 bg-white py-3 text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-800/80">Start for free</button>
          </div>

          {/* Premium */}
          <div className="relative rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm ring-1 ring-transparent transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 select-none rounded-full bg-lernex-blue px-3 py-1 text-xs font-semibold text-white shadow">Most Popular</div>
            <h2 className="mt-1 text-xl font-semibold">Premium</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">More power, faster progress.</p>
            <div className="mt-4 flex items-end gap-1">
              <div className="text-3xl font-bold">$5.99</div>
              <div className="text-sm text-neutral-500 dark:text-neutral-400">/month</div>
            </div>
            <ul className="mt-5 space-y-2 text-sm text-neutral-700 dark:text-neutral-200">
              <li>• Higher daily generation limits</li>
              <li>• Smarter explanations and hints</li>
              <li>• Exam playlists & practice sets</li>
              <li>• Faster processing during peak times</li>
              <li>• Priority email support</li>
            </ul>
            <button className="mt-6 w-full rounded-2xl bg-lernex-blue py-3 text-white transition hover:bg-lernex-blue/90">Upgrade to Premium</button>
          </div>

          {/* Pro */}
          <div className="relative rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-xl font-semibold">Pro</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">For power learners and creators.</p>
            <div className="mt-4 flex items-end gap-1">
              <div className="text-3xl font-bold">$14.99</div>
              <div className="text-sm text-neutral-500 dark:text-neutral-400">/month</div>
            </div>
            <ul className="mt-5 space-y-2 text-sm text-neutral-700 dark:text-neutral-200">
              <li>• Unlimited AI generation</li>
              <li>• Access to beta features</li>
              <li>• Higher priority generation queue</li>
              <li>• Deeper personalization & adaptive review</li>
              <li>• Advanced analytics & insights</li>
              <li>• Early access to new tools</li>
            </ul>
            <button className="mt-6 w-full rounded-2xl bg-neutral-900 py-3 text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-white/90">Go Pro</button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500 dark:text-neutral-400">Prices in USD. Cancel anytime. Taxes may apply.</p>
      </div>
    </main>
  );
}
