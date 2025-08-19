export const dynamic = "force-dynamic";  // ✅ avoid static prerender
export default function Landing() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(47,128,237,0.12),transparent),radial-gradient(50%_35%_at_100%_100%,rgba(155,81,224,0.12),transparent)]" />
      <section className="max-w-5xl mx-auto px-6 py-16 text-white">
        <header className="flex items-center justify-between">
          <div className="text-2xl font-bold">Lernex</div>
          <a href="/login" className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20">Sign in</a>
        </header>

        <div className="mt-20 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-5xl font-extrabold leading-tight">Learn 10x faster with AI-generated micro-lessons.</h1>
            <p className="text-neutral-300 mt-4">
              Bite-sized explanations, instant quizzes, and adaptive difficulty—like TikTok, but for learning.
            </p>
            <div className="mt-8 flex gap-3">
              <a href="/login" className="px-6 py-3 rounded-2xl bg-lernex-blue hover:bg-blue-500">Get started</a>
              <a href="#how" className="px-6 py-3 rounded-2xl border border-white/15 hover:bg-white/10">How it works</a>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 aspect-[4/3] p-2">
            {/* Placeholder for a product screenshot / demo card */}
            <div className="w-full h-full rounded-2xl bg-black/30 grid place-items-center text-neutral-400">
              Demo preview
            </div>
          </div>
        </div>

        <section id="how" className="mt-24 grid md:grid-cols-3 gap-6">
          {[
            ["Micro-Lessons", "30–60s cards to master atomic concepts."],
            ["Instant Quizzes", "1–3 questions with feedback."],
            ["Adaptive Pace", "Difficulty tunes to your level."],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-xl font-semibold">{title}</div>
              <div className="text-neutral-300 mt-2">{desc}</div>
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}
