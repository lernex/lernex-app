'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Set immediately, then tick every second
    const tick = () => setRemaining(Math.max(0, targetTimestamp - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mounted, targetTimestamp]);

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
      <section className="mx-auto mb-16 max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/70 p-6 text-center shadow-md shadow-black/10 backdrop-blur dark:bg-white/5"
        >
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-lernex-blue/20 via-lernex-purple/20 to-transparent" />
          <h3 className="text-xl font-semibold tracking-wide text-neutral-800 dark:text-white">
            days until release
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
      </section>
    </main>
  );
}
