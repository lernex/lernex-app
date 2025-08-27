"use client";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import ThemeToggle from "./ThemeToggle";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

export default function NavBar() {
  const { points, streak } = useLernexStore();
  // `undefined` indicates the auth state is still being resolved
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Resolve the current session from local storage for instant results
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (open && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <nav className="sticky top-0 z-20 border-b border-lernex-blue/10 bg-white/80 text-neutral-900 shadow-sm backdrop-blur-lg transition-shadow dark:border-lernex-blue/20 dark:bg-lernex-charcoal/80 dark:text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 text-sm">
        <Link
          href="/"
          className="text-xl font-bold text-lernex-blue transition-colors hover:text-lernex-blue/80"
        >
          Lernex
        </Link>
        <div className="flex items-center gap-4">
          <span className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 dark:border-white/10 dark:bg-white/5">🔥 {streak}</span>
          <span className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 dark:border-white/10 dark:bg-white/5">⭐ {points}</span>
          <Link
            href="/generate"
            className="rounded-full bg-lernex-blue px-4 py-1 text-white shadow-sm hover:bg-lernex-blue/90"
          >
            Generate
          </Link>
          {user === undefined ? null : user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setOpen((o) => !o)}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 shadow-sm transition-transform hover:scale-105 dark:border-white/10 dark:bg-white/5"
              >
                {user.user_metadata?.avatar_url ? (
                  <Image src={user.user_metadata.avatar_url} alt="avatar" width={36} height={36} />
                ) : (
                  <span className="text-sm font-semibold">
                    {user.email?.[0]?.toUpperCase()}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {open && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-40 rounded-md border border-lernex-blue/10 bg-white py-2 text-neutral-900 shadow-lg dark:border-lernex-blue/20 dark:bg-lernex-charcoal dark:text-white"
                  >
                    <Link
                      href="/settings"
                      className="block px-4 py-2 text-left hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20"
                      onClick={() => setOpen(false)}
                    >
                      Settings
                    </Link>
                    <Link
                      href="/profile"
                      className="block px-4 py-2 text-left hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20"
                      onClick={() => setOpen(false)}
                    >
                      Profile
                    </Link>
                    <a
                      href="https://lernex-1.gitbook.io/lernex"
                      className="block px-4 py-2 text-left hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpen(false)}
                    >
                      Privacy
                    </a>
                    <ThemeToggle className="w-full text-left px-4 py-2 bg-transparent border-0 hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20" />
                    <button
                      onClick={async () => {
                        await supabase.auth.signOut();
                        setOpen(false);
                        router.refresh();
                      }}
                      className="block w-full text-left px-4 py-2 hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20"
                    >
                      Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-lernex-blue px-4 py-1 text-white hover:bg-lernex-blue/90"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>

  );
}
