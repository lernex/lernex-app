"use client";
import Link from "next/link";
import { useEffect, useState, useRef, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";
import { useProfileStats } from "@/app/providers/ProfileStatsProvider";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  Diamond,
  Sparkles,
  BookOpen,
  Trophy,
  Medal,
  Users,
  BarChart3,
  LifeBuoy,
  Flame,
  Star,
} from "lucide-react";

export default function NavBar() {
  const { stats } = useProfileStats();
  const points = stats?.points ?? 0;
  const streak = stats?.streak ?? 0;
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const sideNavRef = useRef<HTMLDivElement>(null);
  const collapseTimerRef = useRef<number | null>(null);
  const [navExpanded, setNavExpanded] = useState(false);
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
    document.body.style.marginLeft = "0";
    return () => {
      document.body.style.marginLeft = "0";
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(pointer: coarse)");
    const sync = () => setNavExpanded(mql.matches);
    sync();
    const handler = () => sync();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    // Fallback for Safari
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  useEffect(() => () => {
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
    }
  }, []);

  if (showSideNav) {
    const isActive = (href: string, exact = false) =>
      exact ? pathname === href : pathname.startsWith(href);

    const handleNavEnter = () => {
      if (collapseTimerRef.current) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      setNavExpanded(true);
    };

    const handleNavLeave = () => {
      if (collapseTimerRef.current) {
        window.clearTimeout(collapseTimerRef.current);
      }
      collapseTimerRef.current = window.setTimeout(() => {
        setNavExpanded(false);
        collapseTimerRef.current = null;
      }, 160);
    };

    const tileBase =
      "relative flex w-full min-h-[2.75rem] items-center rounded-2xl border border-surface bg-surface-card px-3 text-sm font-medium text-foreground shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:shadow-[0_20px_40px_-28px_rgba(0,0,0,0.6)]";
    const tilePaddingExpanded = "pl-3 pr-3.5";
    const tilePaddingCollapsed = "pl-2.5 pr-1.5";
    const tilePadding = navExpanded ? tilePaddingExpanded : tilePaddingCollapsed;
    const listPadding = navExpanded ? "px-5" : "pl-4 pr-3";

    const activeClasses =
      "border-lernex-blue/60 bg-gradient-to-br from-lernex-blue/15 via-lernex-blue/10 to-lernex-purple/15 text-lernex-blue dark:border-lernex-blue/50 dark:from-lernex-blue/25 dark:via-lernex-blue/20 dark:to-lernex-purple/25 dark:text-lernex-blue/90";
    const iconShell =
      "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-surface bg-surface-muted text-neutral-600 shadow-inner transition-colors dark:text-neutral-200";
    const activeIconShell =
      "border-lernex-blue/50 bg-gradient-to-br from-lernex-blue/15 via-lernex-blue/10 to-lernex-purple/20 text-lernex-blue dark:from-lernex-blue/25 dark:via-lernex-blue/20 dark:to-lernex-purple/30 dark:text-lernex-blue/90";
    const badgeBase =
      "absolute -bottom-1 -right-1 min-w-[1.75rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold shadow-sm";

    const metrics = [
      {
        key: "streak",
        label: "Streak",
        value: streak ?? 0,
        Icon: Flame,
        iconTone:
          "from-orange-300/35 via-orange-200/20 to-transparent text-orange-500 dark:text-orange-300",
        badgeTone: "bg-orange-500/90 text-white dark:bg-orange-400/80",
      },
      {
        key: "points",
        label: "Points",
        value: points ?? 0,
        Icon: Star,
        iconTone:
          "from-amber-300/35 via-amber-200/20 to-transparent text-amber-500 dark:text-amber-300",
        badgeTone: "bg-amber-500/90 text-white dark:bg-amber-400/80",
      },
    ] as const;

    const navItems: {
      href: string;
      label: string;
      icon: LucideIcon;
      exact?: boolean;
    }[] = [
      { href: "/app", label: "Home", icon: Home, exact: true },
      { href: "/pricing", label: "Pricing", icon: Diamond },
      { href: "/generate", label: "Generate", icon: Sparkles },
      { href: "/playlists", label: "Playlists", icon: BookOpen },
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
      { href: "/achievements", label: "Achievements", icon: Medal },
      { href: "/friends", label: "Friends", icon: Users },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/support", label: "Support", icon: LifeBuoy },
    ];

    const NAV_WIDTH_EXPANDED = 248;
    const NAV_WIDTH_COLLAPSED = 112;
    const NAV_COLLAPSED_SHIFT = 8;

    return (
      <>
        <div
          className="fixed left-0 top-0 z-[21] h-[100dvh] w-5 cursor-pointer"
          onMouseEnter={handleNavEnter}
          aria-hidden="true"
        />
        <motion.nav
          ref={sideNavRef}
          initial={false}
          animate={{
            x: navExpanded ? 0 : -NAV_COLLAPSED_SHIFT,
            width: navExpanded ? NAV_WIDTH_EXPANDED : NAV_WIDTH_COLLAPSED,
          }}
          transition={{ type: "spring", stiffness: 210, damping: 28 }}
          className="fixed left-0 top-0 z-[22] flex h-[100dvh] max-h-screen flex-col overflow-hidden border-r border-surface bg-surface-panel text-foreground shadow-xl shadow-neutral-900/5 backdrop-blur-xl transition-colors duration-300 dark:shadow-black/30"
          onMouseEnter={handleNavEnter}
          onMouseLeave={handleNavLeave}
          onFocusCapture={handleNavEnter}
          onBlurCapture={(event) => {
            if (!sideNavRef.current?.contains(event.relatedTarget as Node)) {
              handleNavLeave();
            }
          }}
        >
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-5 pt-6">
              <Link
                href={user ? "/app" : "/"}
                aria-label="Lernex home"
                className="gradient-logo bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-xl font-bold text-transparent"
              >
                Lernex
              </Link>
              <AnimatePresence initial={false}>
                {navExpanded && (
                  <motion.span
                    key="dashboard-chip"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="rounded-full bg-gradient-to-r from-lernex-blue/15 to-lernex-purple/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.25em] text-lernex-blue/80 dark:text-lernex-blue/70"
                  >
                    Dashboard
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div
              className={`mt-6 flex flex-1 flex-col overflow-y-auto overflow-x-hidden pb-6 scrollbar-thin ${listPadding}`}
              style={{ gap: "clamp(1.25rem, 3vh, 1.75rem)" }}
            >
              <div
                className="flex flex-col"
                style={{ gap: "clamp(0.65rem, 1.4vh, 1.1rem)" }}
              >
                {metrics.map(({ key, label, value, Icon, iconTone, badgeTone }) => {
                  const numeric = typeof value === "number" ? value : Number(value ?? 0);
                  const safeValue = Number.isFinite(numeric) ? numeric : 0;
                  const badgeText = safeValue > 999 ? "999+" : safeValue.toString();
                  const formattedValue = safeValue.toLocaleString();
                  return (
                    <div
                      key={key}
                      className={`${tileBase} ${tilePadding}`}
                    >
                      <span className={`${iconShell} ${iconTone}`}>
                        <Icon className="h-5 w-5" />
                        <span className={`${badgeBase} ${badgeTone}`}>{badgeText}</span>
                      </span>
                      <motion.div
                        initial={false}
                        animate={
                          navExpanded
                            ? { opacity: 1, maxWidth: 168, marginLeft: 12 }
                            : { opacity: 0, maxWidth: 0, marginLeft: 0 }
                        }
                        transition={{ duration: 0.24, ease: "easeOut" }}
                        className="flex min-w-0 flex-col overflow-hidden leading-tight"
                      >
                        <span className="text-[10px] uppercase tracking-[0.26em] text-neutral-500 dark:text-neutral-400">
                          {label}
                        </span>
                        <span className="text-base font-semibold text-neutral-900 dark:text-white">
                          {formattedValue}
                        </span>
                      </motion.div>
                    </div>
                  );
                })}
              </div>
              <div
                className="flex flex-col"
                style={{ gap: "clamp(0.85rem, 2vh, 1.35rem)" }}
              >
                {navItems.map(({ href, label, icon: Icon, exact }) => {
                  const active = isActive(href, exact);
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={label}
                      aria-label={label}
                      aria-current={active ? "page" : undefined}
                      className={`${tileBase} ${tilePadding} ${active ? activeClasses : ""}`}
                    >
                      <span className={`${iconShell} ${active ? activeIconShell : ""}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <motion.span
                        initial={false}
                        animate={
                          navExpanded
                            ? { opacity: 1, maxWidth: 160, marginLeft: 12 }
                            : { opacity: 0, maxWidth: 0, marginLeft: 0 }
                        }
                        transition={{ duration: 0.24, ease: "easeOut" }}
                        className="min-w-0 text-sm font-medium text-neutral-600 dark:text-neutral-200"
                        style={{ display: "inline-block" }}
                      >
                        {label}
                      </motion.span>
                    </Link>
                  );
                })}
              </div>
            </div>
            {user && (
              <div className="px-5 pb-6">
                <div
                  className={`${tileBase} ${tilePadding}`}
                  ref={menuRef}
                >
                  <button
                    onClick={() => setOpen((o) => !o)}
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-surface bg-surface-muted shadow-inner transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40"
                    aria-label="Account menu"
                    aria-expanded={open}
                  >
                    {user.user_metadata?.avatar_url ? (
                      <Image
                        src={user.user_metadata.avatar_url}
                        alt="avatar"
                        width={44}
                        height={44}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-neutral-700 dark:text-white">
                        {user.email?.[0]?.toUpperCase()}
                      </span>
                    )}
                  </button>
                  <motion.div
                    initial={false}
                    animate={
                      navExpanded
                        ? { opacity: 1, maxWidth: 220, marginLeft: 12 }
                        : { opacity: 0, maxWidth: 0, marginLeft: 0 }
                    }
                    transition={{ duration: 0.24, ease: "easeOut" }}
                    className="flex min-w-0 flex-1 flex-col text-left overflow-hidden"
                  >
                    <span className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                      {user.user_metadata?.full_name ?? user.email}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      Manage profile
                    </span>
                  </motion.div>
                  <AnimatePresence>
                    {open && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                        className="absolute right-0 bottom-full z-30 mb-3 w-56 rounded-xl border border-surface bg-surface-panel py-2 text-foreground shadow-xl shadow-neutral-900/10 dark:shadow-black/30"
                      >
                        <Link
                          href="/settings"
                          className="block px-4 py-2 text-sm hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20"
                          onClick={() => setOpen(false)}
                        >
                          Settings
                        </Link>
                        <a
                          href="https://lernex-1.gitbook.io/lernex"
                          className="block px-4 py-2 text-sm hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20"
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setOpen(false)}
                        >
                          Privacy
                        </a>
                        <button
                          onClick={async () => {
                            await supabase.auth.signOut();
                            setOpen(false);
                            router.replace("/login");
                          }}
                          className="block w-full px-4 py-2 text-left text-sm hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20"
                        >
                          Logout
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        </motion.nav>
      </>
    );
  }

  return (
    <nav className="sticky top-0 z-20 w-full border-b border-white/10 bg-gradient-to-r from-white/80 to-white/60 text-neutral-900 shadow-sm backdrop-blur-md transition-colors dark:from-lernex-charcoal/80 dark:to-lernex-charcoal/60 dark:text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 text-sm">
        <Link
          href={user ? "/app" : "/"}
          className="gradient-logo bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-xl font-bold text-transparent"
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
                    <a
                      href="https://lernex-1.gitbook.io/lernex"
                      className="block px-4 py-2 text-left hover:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpen(false)}
                    >
                      Privacy
                    </a>
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
