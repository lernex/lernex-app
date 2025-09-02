"use client";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import ThemeToggle from "./ThemeToggle";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

export default function NavBar() {
  const { points, streak } = useLernexStore();
  // `undefined` indicates the auth state is still being resolved
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
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
    <nav className="sticky top-0 z-20 w-full border-b border-white/10 bg-gradient-to-r from-white/80 to-white/60 text-neutral-900 shadow-sm backdrop-blur-md transition-colors dark:from-lernex-charcoal/80 dark:to-lernex-charcoal/60 dark:text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 text-sm">
        <Link
          href="/"
          className="bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-xl font-bold text-transparent transition-colors hover:opacity-80"
        >
          Lernex
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="hidden text-neutral-600 transition-colors hover:text-lernex-blue dark:text-neutral-200 md:block">
            Pricing
          </Link>
          {user && pathname !== "/" && (
            <>
              <span className="hidden rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 dark:border-white/10 dark:bg-white/5 md:inline">🔥 {streak}</span>
              <span className="hidden rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 dark:border-white/10 dark:bg-white/5 md:inline">⭐ {points}</span>
            </>
          )}
          <Link
            href="/generate"
            className="rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-4 py-1 text-white shadow-sm transition hover:opacity-90"
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
                    className="absolute right-0 mt-2 w-44 rounded-md border border-white/10 bg-gradient-to-br from-white to-neutral-100 py-2 text-neutral-900 shadow-lg dark:from-lernex-charcoal dark:to-neutral-900 dark:text-white"
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
                    <ThemeToggle className="w-full bg-transparent px-4 py-2 text-left hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20" />
                    <button
                      onClick={async () => {
                        await supabase.auth.signOut();
                        setOpen(false);
                        router.refresh();
                      }}
                      className="block w-full px-4 py-2 text-left hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20"
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
              className="rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-4 py-1 text-white transition hover:opacity-90"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>

  );
}
