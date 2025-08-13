"use client";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";

export default function NavBar() {
  const { points, streak } = useLernexStore();
  return (
    <nav className="sticky top-0 z-20 bg-[rgb(12,12,13,0.85)] backdrop-blur border-b border-neutral-800 text-white">
      <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold">Lernex</Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="px-2 py-1 rounded-xl bg-lernex-blue/20 border border-lernex-blue/40">🔥 {streak}</span>
          <span className="px-2 py-1 rounded-xl bg-lernex-green/20 border border-lernex-green/40">⭐ {points}</span>
          <Link href="/profile" className="px-2 py-1 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700">
            Profile
          </Link>
        </div>
      </div>
    </nav>
  );
}
