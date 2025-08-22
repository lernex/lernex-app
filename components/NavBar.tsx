"use client";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import ThemeToggle from "./ThemeToggle";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function NavBar() {
  const { points, streak } = useLernexStore();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <nav className="sticky top-0 z-20 backdrop-blur-lg bg-white/60 border-b border-neutral-200 text-neutral-900 dark:bg-neutral-950/60 dark:border-white/10 dark:text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 text-sm">
        <Link
          href="/"
          className="text-xl font-bold bg-gradient-to-r from-lernex-blue to-purple-400 bg-clip-text text-transparent"
        >
          Lernex
        </Link>
        <div className="flex items-center gap-4">
          <span className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 dark:border-white/10 dark:bg-white/5">🔥 {streak}</span>
          <span className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 dark:border-white/10 dark:bg-white/5">⭐ {points}</span>
          <Link
            href="/generate"
            className="rounded-full border border-neutral-200 bg-neutral-100 px-4 py-1 hover:bg-neutral-200 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          >
            Generate
          </Link>
          {user ? (
            <div className="relative">
              <button
                onClick={() => setOpen((o) => !o)}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/5"
              >
                {user.user_metadata?.avatar_url ? (
                  <Image src={user.user_metadata.avatar_url} alt="avatar" width={36} height={36} />
                ) : (
                  <span className="text-sm font-semibold">
                    {user.email?.[0]?.toUpperCase()}
                  </span>
                )}
              </button>
              {open && (
                <div className="absolute right-0 mt-2 w-40 rounded-md border border-neutral-200 bg-white py-2 text-neutral-900 shadow-lg dark:border-white/10 dark:bg-neutral-900 dark:text-white">
                  <Link
                    href="/settings"
                    className="block px-4 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onClick={() => setOpen(false)}
                  >
                    Settings
                  </Link>
                  <Link
                    href="/profile"
                    className="block px-4 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onClick={() => setOpen(false)}
                  >
                    Profile
                  </Link>
                  <a
                    href="https://lernex-1.gitbook.io/lernex"
                    className="block px-4 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setOpen(false)}
                  >
                    Privacy
                  </a>
                  <ThemeToggle className="w-full text-left px-4 py-2 bg-transparent border-0 hover:bg-neutral-100 dark:hover:bg-neutral-800" />
                  <button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setOpen(false);
                      router.refresh();
                    }}
                    className="block w-full text-left px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-lernex-blue px-4 py-1 text-white hover:bg-blue-500"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>

  );
}
