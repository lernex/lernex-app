export default function Footer() {
  return (
    <footer className="mt-24 border-t border-white/10 bg-neutral-950/60 text-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm md:flex-row">
        <p className="text-neutral-400">© {new Date().getFullYear()} Lernex. All rights reserved.</p>
        <div className="flex gap-4">
          <a href="https://lernex-1.gitbook.io/lernex" className="text-neutral-400 hover:text-white">
            Privacy
          </a>
          <a href="/terms" className="text-neutral-400 hover:text-white">
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
