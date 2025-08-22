export default function Footer() {
  return (
    <footer className="mt-24 border-t border-neutral-200 bg-white/60 text-neutral-900 dark:border-white/10 dark:bg-neutral-950/60 dark:text-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm md:flex-row">
        <p className="text-neutral-600 dark:text-neutral-400">© {new Date().getFullYear()} Lernex. All rights reserved.</p>
        <div className="flex gap-4">
          <a
            href="https://lernex-1.gitbook.io/lernex"
            className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            Privacy
          </a>
          <a
            href="https://lernex-1.gitbook.io/lernex/terms-and-conditions"
            className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
