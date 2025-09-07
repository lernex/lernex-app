"use client";

import Link from "next/link";

export default function Docs() {
  return (
    <main className="min-h-[calc(100vh-56px)] mx-auto w-full max-w-3xl px-4 py-8 text-neutral-900 dark:text-white">
      <h1 className="text-2xl font-semibold">Help & Docs</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-300">
        Quick tips for generating great lessons and getting clean math rendering.
      </p>

      <section className="mt-6 space-y-4">
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="font-medium">Generating a lesson</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-300">
            <li>Paste 40–4000 characters of source text; focus on one concept.</li>
            <li>Set a clear subject (e.g., “Algebra 1”, “Calculus 3”).</li>
            <li>Short, factual phrasing yields crisper micro‑lessons.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="font-medium">Math formatting</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-300">
            <li>Use inline LaTeX: <code className="rounded bg-neutral-100 px-1 dark:bg-white/5">\\( a^2 + b^2 = c^2 \\)</code>.</li>
            <li>Vectors and brackets: <code className="rounded bg-neutral-100 px-1 dark:bg-white/5">\\( \\langle 3, -4, 12 \\rangle \\)</code>, norms <code className="rounded bg-neutral-100 px-1 dark:bg-white/5">\\( \\|v\\| \\)</code>.</li>
            <li>Always close delimiters; Lernex also auto‑fixes some truncations.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="font-medium">Tips</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-neutral-600 dark:text-neutral-300">
            <li>Two short paragraphs read best on mobile.</li>
            <li>Keep choices short; include one clear correct answer.</li>
            <li>Use the <Link href="/playlists" className="underline">Playlists</Link> page for curated topics.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}

