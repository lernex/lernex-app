'use client';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

const features = [
  {
    title: 'Micro-Lessons',
    desc: '30–60s cards to master atomic concepts.',
    icon: '⚡',
  },
  {
    title: 'Instant Quizzes',
    desc: '1–3 questions with feedback.',
    icon: '🎯',
  },
  {
    title: 'Adaptive Pace',
    desc: 'Difficulty tunes to your level.',
    icon: '📈',
  },
];

const benefits = [
  {
    title: 'Science-backed',
    desc: 'Spaced repetition and active recall baked in.',
    icon: '🧠',
  },
  {
    title: 'Track Progress',
    desc: 'Streaks and points keep you motivated.',
    icon: '📊',
  },
  {
    title: 'Anytime, Anywhere',
    desc: 'Works on your phone, tablet, or laptop.',
    icon: '📱',
  },
];

const confettiColors = ['#60a5fa', '#a855f7', '#facc15', '#34d399', '#f472b6', '#22d3ee'];
const MIN_USERS = 4800;

declare global {
  interface Window {
    __lernexLaunchNow?: () => void;
  }
}

type ConfettiPiece = {
  id: string;
  offsetX: number;
  drift: number;
  delay: number;
  duration: number;
  rotation: number;
  color: string;
};

function LaunchCelebration() {
  const confettiPieces = useMemo<ConfettiPiece[]>(() => {
    return Array.from({ length: 26 }, (_, index) => ({
      id: `confetti-${index}`,
      offsetX: (Math.random() - 0.5) * 220,
      drift: (Math.random() - 0.5) * 260,
      delay: Math.random() * 0.6,
      duration: 1.6 + Math.random() * 0.8,
      rotation: Math.random() * 180,
      color: confettiColors[index % confettiColors.length],
    }));
  }, []);

  return (
    <motion.div
      key="launch-celebration"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-transparent bg-gradient-to-r from-lernex-blue via-lernex-purple to-orange-400 p-10 text-center text-white shadow-2xl shadow-lernex-purple/40"
    >
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.45) 45%, rgba(255,255,255,0.15) 100%)',
          backgroundSize: '240% 240%',
        }}
        animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.28),transparent_70%)]" />
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.6 }}
      >
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1 text-sm font-medium uppercase tracking-[0.3em]">
          🎉 Launch Day
        </div>
        <h3 className="mt-6 text-4xl font-black tracking-tight md:text-5xl">
          We&apos;re live. Dive in now!
        </h3>
        <p className="mt-4 text-base text-white/85 md:text-lg">
          Lessons, quizzes, and real-time experiences are officially unlocked.
        </p>
      </motion.div>
      <motion.div
        className="mx-auto mt-8 flex w-full max-w-md items-center justify-center gap-3 rounded-full border border-white/40 bg-white/20 px-6 py-3 text-sm uppercase tracking-[0.4em]"
        animate={{ opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        ✨ Let&apos;s go
      </motion.div>
      {confettiPieces.map((piece) => (
        <motion.span
          key={piece.id}
          className="pointer-events-none absolute top-0 left-1/2 h-3 w-1.5 rounded-full"
          style={{ backgroundColor: piece.color }}
          initial={{ x: piece.offsetX, y: -40, rotate: piece.rotation, opacity: 0 }}
          animate={{
            x: piece.offsetX + piece.drift,
            y: 260,
            rotate: piece.rotation + 180,
            opacity: [0, 1, 0],
          }}
          transition={{
            delay: piece.delay,
            duration: piece.duration,
            repeat: Infinity,
            repeatDelay: 2.4,
            ease: 'easeOut',
          }}
        />
      ))}
    </motion.div>
  );
}

function LiveUserMeter({ count, isLaunched }: { count: number; isLaunched: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/80 p-6 text-center shadow-md shadow-black/10 backdrop-blur dark:bg-white/5"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-lernex-purple/15 via-lernex-blue/15 to-transparent" />
      <div className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-300">Learners online</div>
      <div className="mt-3 text-4xl font-extrabold tabular-nums text-neutral-900 dark:text-white">
        {count.toLocaleString('en-US')}
      </div>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
        {isLaunched ? 'The doors are open—jump into the live experience now!' : 'Already tuning in to level up before launch.'}
      </p>
      <motion.div
        className="mx-auto mt-4 h-2 w-40 overflow-hidden rounded-full bg-neutral-900/10 dark:bg-white/10"
        style={{
          backgroundImage: 'linear-gradient(90deg, rgba(59,130,246,0.35), rgba(139,92,246,0.85), rgba(59,130,246,0.35))',
          backgroundSize: '220% 100%',
        }}
        animate={{ backgroundPosition: ['0% 50%', '100% 50%'] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
      />
    </motion.div>
  );
}

export default function MarketingLanding() {
  // Compute the next Nov 1, 12:00 PM in Mountain Time (America/Denver)
  const targetTimestamp = useMemo(() => {
    const timeZone = 'America/Denver';

    // Convert a local wall-clock time in a timeZone to a UTC timestamp without external libs.
    // Strategy: format a guess timestamp in the target TZ, compute the wall-clock delta, adjust, repeat.
    const localDateTimeToUtcMillis = (year: number, month: number, day: number, hour: number, minute = 0, second = 0) => {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const targetUTCFields = Date.UTC(year, month - 1, day, hour, minute, second);

      const adjustOnce = (t: number) => {
        const parts = dtf.formatToParts(new Date(t));
        const vals: Record<string, number> = {};
        for (const p of parts) {
          if (p.type !== 'literal') vals[p.type] = parseInt(p.value, 10);
        }
        const shownUTC = Date.UTC(
          vals.year,
          (vals.month || 1) - 1,
          vals.day || 1,
          vals.hour || 0,
          vals.minute || 0,
          vals.second || 0
        );
        // Shift the UTC timestamp by the difference in naive wall-clock minutes
        return t + (targetUTCFields - shownUTC);
      };

      // Start with a naive UTC guess at the same wall-clock time
      let guess = targetUTCFields;
      // Two adjustments are sufficient to converge under normal conditions
      guess = adjustOnce(guess);
      guess = adjustOnce(guess);
      return guess;
    };

    const now = new Date();
    const year = now.getFullYear();
    let target = localDateTimeToUtcMillis(year, 11, 1, 12, 0, 0);
    if (Date.now() > target) {
      target = localDateTimeToUtcMillis(year + 1, 11, 1, 12, 0, 0);
    }
    return target;
  }, []);

  // Avoid hydration mismatches by not using Date.now() during SSR.
  const [remaining, setRemaining] = useState<number>(0);
  const [mounted, setMounted] = useState(false);
  const [hasClockStarted, setHasClockStarted] = useState(false);
  const [isLaunched, setIsLaunched] = useState(false);
  const [liveUsers, setLiveUsers] = useState(MIN_USERS);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Set immediately, then tick every second
    const tick = () => {
      const delta = Math.max(0, targetTimestamp - Date.now());
      setRemaining(delta);
      setHasClockStarted(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mounted, targetTimestamp]);

  useEffect(() => {
    if (!hasClockStarted) return;
    if (remaining <= 0) {
      setIsLaunched(true);
    }
  }, [hasClockStarted, remaining]);

  useEffect(() => {
    if (!mounted) return;
    setLiveUsers(Math.max(MIN_USERS + Math.floor(Math.random() * 180), MIN_USERS));
    const id = setInterval(() => {
      setLiveUsers((prev) => {
        const swing = Math.floor(Math.random() * 14) - 2; // slight up + occasional dip
        const growth = Math.random() > 0.45 ? Math.floor(Math.random() * 8) : 0;
        const next = prev + swing + growth;
        return Math.max(MIN_USERS, next);
      });
    }, 2500);
    return () => clearInterval(id);
  }, [mounted]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__lernexLaunchNow = () => {
      setHasClockStarted(true);
      setRemaining(0);
      setIsLaunched(true);
    };
    return () => {
      if (window.__lernexLaunchNow) {
        delete window.__lernexLaunchNow;
      }
    };
  }, []);

  const { days, hours, minutes, seconds } = useMemo(() => {
    const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
    const d = Math.floor(totalSeconds / (24 * 3600));
    const h = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return { days: d, hours: h, minutes: m, seconds: s };
  }, [remaining]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-50 via-neutral-100 to-neutral-200 text-neutral-900 dark:from-neutral-900 dark:via-neutral-900/80 dark:to-neutral-950 dark:text-white">
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-lernex-blue/20 via-lernex-purple/20 to-transparent blur-3xl" />
        <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-28 text-center md:py-32">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-5xl font-extrabold leading-tight text-transparent md:text-6xl"
          >
            Learn 10x faster with AI-generated micro-lessons.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="mt-6 max-w-2xl text-lg text-neutral-600 dark:text-neutral-300"
          >
            Bite-sized explanations, instant quizzes, and adaptive difficulty—like TikTok, but for learning.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              href="/login"
              className="group rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-8 py-3 font-medium text-white shadow-lg shadow-lernex-blue/40 transition hover:opacity-90"
            >
              <span className="inline-block transition group-hover:scale-105">Get started</span>
            </Link>
            <Link
              href="#how"
              className="rounded-full border border-white/10 bg-white/40 px-8 py-3 font-medium backdrop-blur hover:bg-white/60 dark:bg-white/5 dark:hover:bg-white/10"
            >
              See how it works
            </Link>
          </motion.div>
          <div className="mt-10 grid w-full max-w-3xl grid-cols-3 gap-3 text-left text-sm text-neutral-600 dark:text-neutral-300">
            <div className="rounded-2xl border border-white/10 bg-white/70 p-4 backdrop-blur dark:bg-white/5">
              <div className="text-2xl font-bold text-neutral-900 dark:text-white">30–60s</div>
              <div>Micro‑lessons per card</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/70 p-4 backdrop-blur dark:bg-white/5">
              <div className="text-2xl font-bold text-neutral-900 dark:text-white">1–3</div>
              <div>Instant quiz questions</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/70 p-4 backdrop-blur dark:bg-white/5">
              <div className="text-2xl font-bold text-neutral-900 dark:text-white">Adaptive</div>
              <div>Difficulty tunes to you</div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto mt-32 max-w-5xl px-6">
        <h2 className="mb-10 text-center text-3xl font-bold">How it works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="group rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-md shadow-black/20 backdrop-blur transition-transform hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-white/5"
            >
              <div className="text-4xl transition-transform group-hover:scale-110">{f.icon}</div>
              <div className="mt-4 text-xl font-semibold">{f.title}</div>
              <div className="mt-2 text-neutral-600 dark:text-neutral-300">{f.desc}</div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-32 max-w-5xl px-6">
        <h2 className="mb-10 text-center text-3xl font-bold">Why Lernex?</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {benefits.map((b) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="group rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-md shadow-black/20 backdrop-blur transition-transform hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-white/5"
            >
              <div className="text-4xl transition-transform group-hover:scale-110">{b.icon}</div>
              <div className="mt-4 text-xl font-semibold">{b.title}</div>
              <div className="mt-2 text-neutral-600 dark:text-neutral-300">{b.desc}</div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-32 max-w-5xl px-6 pb-32 text-center">
        <h2 className="text-3xl font-bold">Ready to level up?</h2>
        <p className="mt-4 text-neutral-600 dark:text-neutral-300">Join thousands of learners accelerating their skills with AI.</p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-8 py-3 font-medium text-white shadow-lg shadow-lernex-blue/40 transition hover:opacity-90"
        >
          Start for free
        </Link>
      </section>

      {/* Countdown Section */}
      <section className="mx-auto mb-16 max-w-5xl space-y-6 px-6">
        <AnimatePresence mode="wait">
          {!isLaunched ? (
            <motion.div
              key="launch-countdown"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/70 p-6 text-center shadow-md shadow-black/10 backdrop-blur dark:bg-white/5"
            >
              <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-lernex-blue/20 via-lernex-purple/20 to-transparent" />
              <h3 className="text-xl font-semibold tracking-wide text-neutral-800 dark:text-white">
                Countdown to release
              </h3>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-neutral-900 dark:text-white">
                <div className="flex min-w-[6.5rem] flex-col items-center rounded-xl bg-white/80 px-4 py-3 backdrop-blur dark:bg-white/10">
                  <div className="text-3xl font-extrabold tabular-nums">{days}</div>
                  <div className="text-xs uppercase tracking-wider text-neutral-600 dark:text-neutral-300">Days</div>
                </div>
                <div className="flex min-w-[6.5rem] flex-col items-center rounded-xl bg-white/80 px-4 py-3 backdrop-blur dark:bg-white/10">
                  <div className="text-3xl font-extrabold tabular-nums">{hours.toString().padStart(2, '0')}</div>
                  <div className="text-xs uppercase tracking-wider text-neutral-600 dark:text-neutral-300">Hours</div>
                </div>
                <div className="flex min-w-[6.5rem] flex-col items-center rounded-xl bg-white/80 px-4 py-3 backdrop-blur dark:bg-white/10">
                  <div className="text-3xl font-extrabold tabular-nums">{minutes.toString().padStart(2, '0')}</div>
                  <div className="text-xs uppercase tracking-wider text-neutral-600 dark:text-neutral-300">Minutes</div>
                </div>
                <div className="flex min-w-[6.5rem] flex-col items-center rounded-xl bg-white/80 px-4 py-3 backdrop-blur dark:bg-white/10">
                  <div className="text-3xl font-extrabold tabular-nums">{seconds.toString().padStart(2, '0')}</div>
                  <div className="text-xs uppercase tracking-wider text-neutral-600 dark:text-neutral-300">Seconds</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                Target: Nov 1, 12:00 PM MT
              </p>
            </motion.div>
          ) : (
            <LaunchCelebration />
          )}
        </AnimatePresence>
        <LiveUserMeter count={liveUsers} isLaunched={isLaunched} />
      </section>
    </main>
  );
}
