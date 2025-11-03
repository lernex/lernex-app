"use client";
import Link from "next/link";

export default function Paywall({ title = "Premium Feature", children }: { title?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-lernex-blue/70 bg-gradient-to-br from-white via-blue-50/30 to-purple-50/20 p-5 text-neutral-900 shadow-lg shadow-lernex-blue/10 ring-1 ring-lernex-blue/20 dark:border-lernex-blue/60 dark:from-slate-900 dark:via-blue-900/20 dark:to-purple-900/15 dark:bg-lernex-charcoal dark:text-white dark:shadow-xl dark:shadow-lernex-blue/20">
      <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.2),transparent_50%),radial-gradient(circle_at_70%_70%,rgba(168,85,247,0.15),transparent_50%)] rounded-2xl" />
      <div className="relative">
        <h3 className="text-lg font-semibold mb-2 bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-transparent">{title}</h3>
        <p className="text-neutral-600 dark:text-neutral-300 mb-3">Unlock with Lernex Premium to use this feature.</p>
        <Link href="/pricing" className="px-4 py-2 rounded-xl bg-gradient-to-r from-lernex-blue via-blue-600 to-lernex-purple hover:shadow-lg hover:shadow-lernex-blue/30 hover:scale-[1.02] text-white transition-all duration-300 inline-block shadow-md shadow-lernex-blue/25 dark:shadow-lernex-blue/35 dark:hover:shadow-lernex-blue/45">See Pricing</Link>
        {children}
      </div>
    </div>
  );
}
