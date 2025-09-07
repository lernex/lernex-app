"use client";
import Link from "next/link";
import { useLernexStore } from "@/lib/store";
import { useEffect, useState, useRef, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";
import ThemeToggle from "./ThemeToggle";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

export default function NavBar() {
  const { points, streak } = useLernexStore();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => supabaseBrowser(), []);

  // Routes that should always use the top nav. We treat `/` as an exact match
  // because every path starts with `/`.
  const marketingRoutes = [
    "/login",
    "/placement",
    "/welcome",
    "/onboarding",
    "/post-auth",
    "/auth/callback",
  ];
  const showSideNav =
    !!user &&
    pathname !== "/" &&
    !marketingRoutes.some((p) => pathname.startsWith(p));

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase.auth]);

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

  useEffect(() => {
    document.body.style.marginLeft = showSideNav ? "5rem" : "0";
    return () => {
      document.body.style.marginLeft = "0";
    };
  }, [showSideNav]);

  if (showSideNav) {
    return (
      <nav className="fixed left-0 top-0 z-20 flex h-screen w-20 flex-col justify-between border-r border-white/10 bg-gradient-to-b from-white/80 to-white/60 text-neutral-900 shadow-sm backdrop-blur-md transition-colors dark:from-lernex-charcoal/80 dark:to-lernex-charcoal/60 dark:text-white">
        <div className="mt-4 flex flex-col items-center gap-6">
          <Link
            href={user ? "/app" : "/"}
            className="bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-xl font-bold text-transparent transition-colors hover:opacity-80"
          >
            Lernex
          </Link>
          <span className="rounded-full border border-neutral-200 bg-neutral-100 px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5">
            🔥 {streak}
          </span>
          <span className="rounded-full border border-neutral-200 bg-neutral-100 px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5">
            ⭐ {points}
          </span>
          <Link href="/pricing" title="Pricing" className="text-xl transition hover:opacity-80">
            💎
          </Link>
          <Link href="/generate" title="Generate" className="text-xl transition hover:opacity-80">
            ✨
          </Link>
          <Link href="/playlists" title="Playlists" className="text-xl transition hover:opacity-80">
            📚
          </Link>
        </div>
        <div className="relative mb-4 flex justify-center" ref={menuRef}>
          {user && (
            <>
              <button
                onClick={() => setOpen((o) => !o)}
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 shadow-sm transition-transform hover:scale-105 dark:border-white/10 dark:bg-white/5"
              >
                {user.user_metadata?.avatar_url ? (
                  <Image src={user.user_metadata.avatar_url} alt="avatar" width={40} height={40} />
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
                    className="absolute left-14 bottom-0 mb-2 w-44 rounded-md border border-white/10 bg-gradient-to-br from-white to-neutral-100 py-2 text-neutral-900 shadow-lg dark:from-lernex-charcoal dark:to-neutral-900 dark:text-white"
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
                        router.replace("/login");
                      }}
                      className="block w-full px-4 py-2 text-left hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20"
                    >
                      Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </nav>
    );
  }

  return (
    <nav className="sticky top-0 z-20 w-full border-b border-white/10 bg-gradient-to-r from-white/80 to-white/60 text-neutral-900 shadow-sm backdrop-blur-md transition-colors dark:from-lernex-charcoal/80 dark:to-lernex-charcoal/60 dark:text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 text-sm">
        <Link
          href={user ? "/app" : "/"}
          className="bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-xl font-bold text-transparent transition-colors hover:opacity-80"
        >
          Lernex
        </Link>
        <div className="flex items-center gap-4">
          {/* Marketing/top navbar keeps a very small set of links */}
          <Link href="/generate" className="rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-4 py-1 text-white shadow-sm transition hover:opacity-90">Generate</Link>
          {user && pathname !== "/" && (
            <>
              <span className="hidden rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 dark:border-white/10 dark:bg-white/5 md:inline">
                🔥 {streak}
              </span>
              <span className="hidden rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 dark:border-white/10 dark:bg-white/5 md:inline">
                ⭐ {points}
              </span>
            </>
          )}
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
                        router.replace("/login");
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
