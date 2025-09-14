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
import {
  Home,
  Diamond,
  Sparkles,
  BookOpen,
  FileText,
  Trophy,
  Medal,
  Users,
  Bell,
  BarChart3,
  LifeBuoy,
} from "lucide-react";

export default function NavBar() {
  const { points, streak } = useLernexStore();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
    const isActive = (href: string, exact = false) =>
      exact ? pathname === href : pathname.startsWith(href);

    const baseIconClasses =
      "group relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/50 text-neutral-700 shadow-sm transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40 dark:bg-white/5 dark:text-white/90";
    const activeClasses =
      "!bg-lernex-blue/15 !text-lernex-blue !border-lernex-blue/30 dark:!bg-lernex-blue/20";

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
          {/* Quick home link */}
          <Link
            href="/app"
            title="Home"
            aria-label="Home"
            className={`${baseIconClasses} ${isActive("/app", true) ? activeClasses : ""}`}
            aria-current={isActive("/app", true) ? "page" : undefined}
          >
            <Home className="h-5 w-5" />
          </Link>
          {/* Primary actions */}
          <Link
            href="/pricing"
            title="Pricing"
            aria-label="Pricing"
            className={`${baseIconClasses} ${isActive("/pricing") ? activeClasses : ""}`}
            aria-current={isActive("/pricing") ? "page" : undefined}
          >
            <Diamond className="h-5 w-5" />
          </Link>
          <Link
            href="/generate"
            title="Generate"
            aria-label="Generate"
            className={`${baseIconClasses} ${isActive("/generate") ? activeClasses : ""}`}
            aria-current={isActive("/generate") ? "page" : undefined}
          >
            <Sparkles className="h-5 w-5" />
          </Link>
          <Link
            href="/playlists"
            title="Playlists"
            aria-label="Playlists"
            className={`${baseIconClasses} ${isActive("/playlists") ? activeClasses : ""}`}
            aria-current={isActive("/playlists") ? "page" : undefined}
          >
            <BookOpen className="h-5 w-5" />
          </Link>
          <Link
            href="/docs"
            title="Docs"
            aria-label="Docs"
            className={`${baseIconClasses} ${isActive("/docs") ? activeClasses : ""}`}
            aria-current={isActive("/docs") ? "page" : undefined}
          >
            <FileText className="h-5 w-5" />
          </Link>
          <Link
            href="/leaderboard"
            title="Leaderboard"
            aria-label="Leaderboard"
            className={`${baseIconClasses} ${isActive("/leaderboard") ? activeClasses : ""}`}
            aria-current={isActive("/leaderboard") ? "page" : undefined}
          >
            <Trophy className="h-5 w-5" />
          </Link>
          {/* Secondary ideas */}
          <div className="mt-1 flex flex-col items-center gap-3">
            <Link
              href="/achievements"
              title="Achievements"
              aria-label="Achievements"
              className={`${baseIconClasses} ${isActive("/achievements") ? activeClasses : ""}`}
              aria-current={isActive("/achievements") ? "page" : undefined}
            >
              <Medal className="h-5 w-5" />
            </Link>
            <Link
              href="/friends"
              title="Friends"
              aria-label="Friends"
              className={`${baseIconClasses} ${isActive("/friends") ? activeClasses : ""}`}
              aria-current={isActive("/friends") ? "page" : undefined}
            >
              <Users className="h-5 w-5" />
            </Link>
            <Link
              href="/notifications"
              title="Notifications"
              aria-label="Notifications"
              className={`${baseIconClasses} ${isActive("/notifications") ? activeClasses : ""}`}
              aria-current={isActive("/notifications") ? "page" : undefined}
            >
              <Bell className="h-5 w-5" />
            </Link>
            <Link
              href="/analytics"
              title="Analytics"
              aria-label="Analytics"
              className={`${baseIconClasses} ${isActive("/analytics") ? activeClasses : ""}`}
              aria-current={isActive("/analytics") ? "page" : undefined}
            >
              <BarChart3 className="h-5 w-5" />
            </Link>
            <Link
              href="/support"
              title="Support"
              aria-label="Support"
              className={`${baseIconClasses} ${isActive("/support") ? activeClasses : ""}`}
              aria-current={isActive("/support") ? "page" : undefined}
            >
              <LifeBuoy className="h-5 w-5" />
            </Link>
          </div>
        </div>
        <div className="relative mb-4 flex flex-col items-center gap-3" ref={menuRef}>
          <ThemeToggle className="bg-transparent text-neutral-900 dark:text-white text-xs px-2 py-1 border border-white/15 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-lernex-blue/40" />
          {user && (
            <>
              <button
                onClick={() => setOpen((o) => !o)}
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40 dark:border-white/10 dark:bg-white/5"
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
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 text-sm">
        <Link
          href={user ? "/app" : "/"}
          className="bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-xl font-bold text-transparent transition-colors hover:opacity-80"
        >
          Lernex
        </Link>
        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/pricing"
            aria-current={pathname === "/pricing" ? "page" : undefined}
            className="px-3 py-1.5 rounded-md hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40"
          >
            Pricing
          </Link>
          <Link
            href="/generate"
            aria-current={pathname.startsWith("/generate") ? "page" : undefined}
            className="ml-1 rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-4 py-1.5 text-white shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40"
          >
            Generate
          </Link>
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

        {/* Mobile: hamburger */}
        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={() => setMobileOpen((s) => !s)}
            aria-label="Toggle menu"
            className="rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-lg backdrop-blur hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40 dark:bg-white/5"
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>
      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="md:hidden fixed inset-x-0 top-[56px] z-20 border-b border-white/10 bg-gradient-to-b from-white/90 to-white/70 p-4 backdrop-blur dark:from-lernex-charcoal/90 dark:to-lernex-charcoal/70"
          >
            <div className="grid gap-2 text-sm">
              <Link href="/pricing" onClick={() => setMobileOpen(false)} className="rounded-md px-3 py-2 hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40">Pricing</Link>
              <Link href="/generate" onClick={() => setMobileOpen(false)} className="rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-4 py-2 text-center text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40">Generate</Link>
              {user === undefined ? null : !user && (
                <Link href="/login" onClick={() => setMobileOpen(false)} className="rounded-md border border-white/10 px-3 py-2 text-center hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40">Login</Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
