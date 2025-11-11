import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-lernex-blue/20 bg-white text-neutral-900 backdrop-blur-lg dark:border-lernex-blue/30 dark:bg-lernex-charcoal dark:text-white">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 text-sm sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-2">
          <div className="bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-lg font-semibold text-transparent">Lernex</div>
          <p className="text-neutral-600 dark:text-neutral-400">Learn faster with AI-generated micro-lessons and instant quizzes.</p>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Product</div>
          <ul className="space-y-2">
            <li><Link href="/generate" className="hover:underline">Generate</Link></li>
            <li><Link href="/playlists" className="hover:underline">Playlists</Link></li>
            <li><Link href="/pricing" className="hover:underline">Pricing</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Community</div>
          <ul className="space-y-2">
            <li><Link href="/leaderboard" className="hover:underline">Leaderboard</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Legal</div>
          <ul className="space-y-2">
            <li><Link href="/privacy" className="hover:underline">Privacy</Link></li>
            <li><Link href="/terms" className="hover:underline">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 border-t border-white/10 px-6 py-4 text-xs text-neutral-600 dark:text-neutral-400">
        <p>&copy; {new Date().getFullYear()} Lernex. All rights reserved.</p>
        <a href="#top" className="hover:underline">Back to top &uarr;</a>
      </div>
    </footer>
  );
}
