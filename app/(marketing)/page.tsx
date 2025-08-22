export const dynamic = "force-dynamic";  // ✅ avoid static prerender
export default function Landing() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-5xl px-6 py-24 text-white">
        <div className="grid items-center gap-16 md:grid-cols-2">
          <div>
            <h1 className="text-5xl font-extrabold leading-tight bg-gradient-to-r from-lernex-blue/70 via-lernex-blue to-purple-400 bg-clip-text text-transparent">
              Learn 10x faster with AI-generated micro-lessons.
            </h1>
            <p className="mt-6 text-lg text-neutral-300">
              Bite-sized explanations, instant quizzes, and adaptive difficulty—like TikTok, but for learning.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <a href="/login" className="rounded-full bg-lernex-blue px-8 py-3 font-medium hover:bg-blue-500">
                Get started
              </a>
              <a href="#how" className="rounded-full border border-white/20 px-8 py-3 font-medium hover:bg-white/10">
                How it works
              </a>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-2 shadow-xl shadow-black/20">
            {/* Placeholder for a product screenshot / demo card */}
            <div className="grid h-full w-full place-items-center rounded-2xl bg-black/30 text-neutral-400">
              Demo preview
            </div>
          </div>
        </div>

        <section id="how" className="mt-32 grid gap-6 md:grid-cols-3">
          {[
            ["Micro-Lessons", "30–60s cards to master atomic concepts."],
            ["Instant Quizzes", "1–3 questions with feedback."],
            ["Adaptive Pace", "Difficulty tunes to your level."],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-md shadow-black/20">
              <div className="text-xl font-semibold">{title}</div>
              <div className="mt-2 text-neutral-300">{desc}</div>
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}
