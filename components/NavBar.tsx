"use client";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";
import { supabaseServer } from "@/lib/supabase-server";

export default function NavBar() {
  const { points, streak } = useLernexStore();

  return (
    <nav className="sticky top-0 z-20 backdrop-blur-lg bg-neutral-950/60 border-b border-white/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 text-sm text-white">
        <Link
          href="/"
          className="text-xl font-bold bg-gradient-to-r from-lernex-blue to-purple-400 bg-clip-text text-transparent"
        >
          Lernex
        </Link>
        <div className="flex items-center gap-4">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">🔥 {streak}</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">⭐ {points}</span>
          <Link
            href="/profile"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1 hover:bg-white/10"
          >
            Profile
          </Link>
          <Link
            href="/generate"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1 hover:bg-white/10"
          >
            Generate
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-lernex-blue px-4 py-1 text-white hover:bg-blue-500"
          >
            Login
          </Link>
        </div>
      </div>
    </nav>

  );
}
