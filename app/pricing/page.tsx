export default function Pricing() {
  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 space-y-3 text-white">
        <h1 className="text-2xl font-semibold">Choose your plan</h1>
        <div className="grid gap-3">
          <div className="rounded-2xl bg-neutral-900 border border-lernex-blue p-5">
            <h2 className="text-xl font-semibold">Free</h2>
            <ul className="text-neutral-300 text-sm mt-2 list-disc pl-4">
              <li>Daily micro-lessons</li><li>Basic quizzes</li><li>Streak & points</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-neutral-900 border border-lernex-blue p-5">
            <h2 className="text-xl font-semibold">Premium — $8/mo</h2>
            <ul className="text-neutral-300 text-sm mt-2 list-disc pl-4">
              <li>Unlimited AI generation</li><li>Exam playlists</li><li>Advanced explanations</li>
            </ul>
            <button className="mt-3 w-full py-3 rounded-2xl bg-lernex-blue hover:bg-lernex-blue/90 transition">Continue</button>
          </div>
        </div>
      </div>
    </main>
  );
}
