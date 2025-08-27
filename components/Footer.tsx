export default function Footer() {
  return (
    <footer className="mt-24 border-t border-lernex-blue/10 bg-white text-neutral-900 shadow-inner backdrop-blur-lg dark:border-lernex-blue/20 dark:bg-lernex-charcoal dark:text-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm md:flex-row">
        <p className="text-neutral-600 dark:text-neutral-400">© {new Date().getFullYear()} Lernex. All rights reserved.</p>
        <div className="flex gap-4">
          <a
            href="https://lernex-1.gitbook.io/lernex"
            className="text-lernex-blue hover:text-lernex-blue/80 hover:underline"
          >
            Privacy
          </a>
          <a
            href="https://lernex-1.gitbook.io/lernex/terms-and-conditions"
            className="text-lernex-blue hover:text-lernex-blue/80 hover:underline"
          >
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
