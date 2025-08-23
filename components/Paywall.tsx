"use client";
import Link from "next/link";

export default function Paywall({ title = "Premium Feature", children }: { title?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-lernex-purple bg-white p-5 text-neutral-900 dark:bg-neutral-900 dark:text-white">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-neutral-600 dark:text-neutral-300 mb-3">Unlock with Lernex Premium to use this feature.</p>
      <Link href="/pricing" className="px-4 py-2 rounded-xl bg-lernex-purple hover:bg-purple-500 text-white transition inline-block">See Pricing</Link>
      {children}
    </div>
  );
}
