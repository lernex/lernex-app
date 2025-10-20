'use client';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

const features = [
  {
    title: 'Personalized Launchpad',
    desc: 'Tell Lernex what you need and receive a curated path of micro-lessons, ready in seconds.',
    icon: '🧭',
  },
  {
    title: 'Micro-Lessons',
    desc: 'Digestible 30–60s cards with visuals, mnemonics, and real-world context to lock in each concept.',
    icon: '⚡',
  },
  {
    title: 'Instant Quizzes',
    desc: 'Rapid-fire checks with contextual explanations keep you honest about what you really know.',
    icon: '🎯',
  },
  {
    title: 'Adaptive Pace',
    desc: 'Difficulty and frequency adjust automatically based on performance across sessions.',
    icon: '📈',
  },
];

const benefits = [
  {
    title: 'Science-backed',
    desc: 'Spacing, recall, and interleaving built directly into every learning session.',
    icon: '🧠',
  },
  {
    title: 'Track Progress',
    desc: 'Dashboards, streaks, and cohorts keep you accountable, without the noise.',
    icon: '📊',
  },
  {
    title: 'Learning Everywhere',
    desc: 'Native experience on phone, tablet, or laptop—syncing in real time.',
    icon: '📱',
  },
  {
    title: 'Enterprise Ready',
    desc: 'Secure profiles, admin controls, and team analytics for ambitious teams.',
    icon: '🛡️',
  },
];

const trustedByLabels = [
  'YC founders',
  'Top bootcamps',
  'Intense ops teams',
  'University study clubs',
];

const learningFlow = [
  {
    step: '1',
    title: 'Align on outcomes',
    desc: 'Pick a skill, certification, or curriculum. Lernex ingests your source materials in seconds.',
  },
  {
    step: '2',
    title: 'Train with micro-bursts',
    desc: 'AI condenses the critical ideas into cinematic cards that you can swipe through anywhere.',
  },
  {
    step: '3',
    title: 'Validate instantly',
    desc: 'Quick quizzes surface blind spots with clear explanations you can save to revisit later.',
  },
  {
    step: '4',
    title: 'Stay in the groove',
    desc: 'Smart pacing, reminders, and progress reviews keep momentum—and burnout—managed.',
  },
];

const outcomes = [
  {
    stat: '92%',
    label: 'improved recall',
    detail: 'Beta learners reported retaining new frameworks after one week.',
  },
  {
    stat: '7 min',
    label: 'daily average',
    detail: 'Purpose-built for focused bursts that fit between meetings.',
  },
  {
    stat: '3×',
    label: 'faster ramp',
    detail: 'Teams shipping in regulated industries cut onboarding time dramatically.',
  },
];

const testimonials = [
  {
    quote:
      'Our analysts ramp in a third of the time. Lernex keeps everyone aligned on critical updates without another marathon training session.',
    name: 'Sasha I.',
    role: 'Head of Enablement, Series B SaaS',
  },
  {
    quote:
      'I finally replaced the 200-page study guide. The AI coach adapts to me, and the daily nudges make it impossible to fall behind.',
    name: 'Jordan M.',
    role: 'Cybersecurity Learner',
  },
  {
    quote:
      'It feels like a mentor walking me through complex material. The combination of micro-lessons + quizzes is unmatched.',
    name: 'Priya K.',
    role: 'MBA Candidate',
  },
];

const faqs = [
  {
    question: 'What kinds of topics can I learn with Lernex?',
    answer:
      'Upload your own PDFs, slide decks, or notes—or choose from our curated tracks. Lernex works best for technical, operational, compliance, and professional upskilling content.',
  },
  {
    question: 'How does Lernex personalize my experience?',
    answer:
      'Every interaction trains the difficulty, pacing, and content mix. Lernex measures confidence, accuracy, and time-on-card to deliver the right challenge at the right moment.',
  },
  {
    question: 'Can teams adopt Lernex?',
    answer:
      'Yes. Create team spaces, assign tracks, view analytics, and plug into your existing LMS or Slack workflows. Role-based access keeps data secure.',
  },
  {
    question: 'Do I need to install anything?',
    answer:
      'No installs required. Lernex runs beautifully in your browser and on mobile devices, with offline mode rolling out soon.',
  },
];

const confettiColors = ['#60a5fa', '#a855f7', '#facc15', '#34d399', '#f472b6', '#22d3ee'];
const FALLBACK_USER_TOTAL = 5000;

declare global {
  interface Window {
    __lernexLaunchNow?: () => void;
    __lernexSetTotal?: (count: number) => void;
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

function AnimatedTotal({
  count,
  isLoading,
}: {
  count: number | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <span className="inline-flex h-12 items-center justify-center text-4xl font-extrabold text-neutral-400 transition dark:text-neutral-500">
        <span className="animate-pulse">—</span>
      </span>
    );
  }

  const value = count ?? FALLBACK_USER_TOTAL;
  const formatted = new Intl.NumberFormat('en-US').format(value);

  return (
    <span className="relative inline-flex h-12 items-center justify-center gap-0.5 text-4xl font-black tracking-tight text-neutral-900 transition dark:text-white md:text-[2.75rem]">
      {formatted.split('').map((char, index) => {
        const isSeparator = char === ',';
        return (
          <span
            key={`${index}-${char}`}
            className={`relative inline-flex justify-center ${isSeparator ? 'w-3 text-3xl text-neutral-400 dark:text-neutral-500' : 'w-[0.75em] tabular-nums'}`}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${index}-${char}-${value}`}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -16, opacity: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="absolute left-1/2 top-1/2 inline-block -translate-x-1/2 -translate-y-1/2"
              >
                {char}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}

function LiveUserMeter({
  count,
  isLaunched,
  isLoading,
  error,
}: {
  count: number | null;
  isLaunched: boolean;
  isLoading: boolean;
  error: string | null;
}) {
  const [pulse, setPulse] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (isLoading || count === null) {
      return;
    }
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setPulse(true);
    const timeout = setTimeout(() => setPulse(false), 900);
    return () => clearTimeout(timeout);
  }, [count, isLoading]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: pulse ? 1.018 : 1,
        boxShadow: pulse
          ? '0 20px 45px rgba(96,165,250,0.28)'
          : '0 20px 40px rgba(15,23,42,0.14)',
      }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/80 p-7 text-center shadow-lg backdrop-blur dark:border-white/5 dark:bg-white/10"
    >
      <motion.div
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-lernex-purple/10 via-lernex-blue/20 to-transparent"
        animate={{ backgroundPositionX: pulse ? '100%' : '0%' }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        style={{ backgroundSize: '200% 100%' }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 -z-10"
        animate={{ opacity: pulse ? 0.25 : 0 }}
        transition={{ duration: 0.4 }}
        style={{
          background:
            'radial-gradient(circle at 50% 20%, rgba(96,165,250,0.35), transparent 55%)',
        }}
      />
      <div className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-300">Total learners</div>
      <div className="mt-3 flex justify-center">
        <AnimatedTotal count={count} isLoading={isLoading} />
      </div>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
        {isLaunched
          ? 'The doors are open—dive into lessons with the Lernex community.'
          : 'Already building momentum with Lernex micro-lessons.'}
      </p>
      {error ? (
        <p className="mt-2 text-xs text-rose-500 dark:text-rose-400">
          We&apos;ll refresh totals in a moment.
        </p>
      ) : null}
      <motion.div
        className="mx-auto mt-5 h-2 w-44 overflow-hidden rounded-full bg-neutral-900/10 dark:bg-white/10"
        style={{
          backgroundImage: 'linear-gradient(90deg, rgba(59,130,246,0.35), rgba(139,92,246,0.85), rgba(59,130,246,0.35))',
          backgroundSize: '220% 100%',
        }}
        animate={{ backgroundPosition: ['0% 50%', '100% 50%'] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
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
  const [userTotal, setUserTotal] = useState<number | null>(null);
  const [userTotalError, setUserTotalError] = useState<string | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const initialUserLoad = useRef(true);
  const supabase = useMemo(() => supabaseBrowser(), []);

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
    let isActive = true;

    const loadUserTotal = async () => {
      if (initialUserLoad.current) {
        setIsLoadingUsers(true);
      }
      const { count, error } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      if (!isActive) return;
      if (error) {
        console.error('Unable to load total learners', error);
        setUserTotalError(error.message);
        setIsLoadingUsers(false);
        initialUserLoad.current = false;
        return;
      }
      setUserTotal(count ?? null);
      setUserTotalError(null);
      setIsLoadingUsers(false);
      initialUserLoad.current = false;
    };

    loadUserTotal();
    const id = setInterval(loadUserTotal, 5000);
    return () => {
      isActive = false;
      clearInterval(id);
    };
  }, [mounted, supabase]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__lernexLaunchNow = () => {
      setHasClockStarted(true);
      setRemaining(0);
      setIsLaunched(true);
    };
    window.__lernexSetTotal = (count: number) => {
      setIsLoadingUsers(false);
      setUserTotal(count);
      setUserTotalError(null);
    };
    return () => {
      if (window.__lernexLaunchNow) {
        delete window.__lernexLaunchNow;
      }
      if (window.__lernexSetTotal) {
        delete window.__lernexSetTotal;
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
            Your AI study coach for unstoppable teams.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="mt-6 max-w-2xl text-lg text-neutral-600 dark:text-neutral-300"
          >
            Lernex turns dense manuals, curricula, and notes into cinematic micro-lessons with adaptive quizzes and analytics—built to help professionals and students ramp up without the burnout.
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
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="mt-10 inline-flex flex-wrap items-center justify-center gap-4 rounded-full border border-white/10 bg-white/60 px-6 py-2 text-xs uppercase tracking-[0.4em] backdrop-blur dark:bg-white/10"
          >
            Loved by curious operators everywhere
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6 }}
            className="mt-6 flex w-full flex-wrap justify-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400"
          >
            {trustedByLabels.map((label) => (
              <span
                key={label}
                className="rounded-full border border-white/20 bg-white/50 px-4 py-1 backdrop-blur transition dark:bg-white/10"
              >
                {label}
              </span>
            ))}
          </motion.div>
          <div className="mt-10 grid w-full max-w-4xl grid-cols-1 gap-3 text-left text-sm text-neutral-600 dark:text-neutral-300 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/70 p-5 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-white/5">
              <div className="text-2xl font-bold text-neutral-900 dark:text-white">2 min</div>
              <div>From upload to your first curated Lernex path.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/70 p-5 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-white/5">
              <div className="text-2xl font-bold text-neutral-900 dark:text-white">7 min</div>
              <div>The average daily session to stay on track.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/70 p-5 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-white/5">
              <div className="text-2xl font-bold text-neutral-900 dark:text-white">92%</div>
              <div>Report remembering critical details a week later.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto mt-28 max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold">How Lernex works</h2>
          <p className="mt-4 text-neutral-600 dark:text-neutral-300">
            Four tight feedback loops keep you consistently moving forward—from aligning on outcomes to reinforcing what sticks.
          </p>
        </div>
        <div className="relative mt-14 grid gap-6 md:grid-cols-2">
          <div className="pointer-events-none absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-lernex-purple/0 via-lernex-purple/40 to-lernex-blue/0 md:block" />
          {learningFlow.map((item, idx) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="group relative overflow-hidden rounded-3xl border border-neutral-200/60 bg-white/80 p-8 shadow-lg shadow-black/10 backdrop-blur transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/5 dark:bg-white/10"
              style={{ zIndex: learningFlow.length - idx }}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-lernex-blue/0 via-lernex-purple/5 to-lernex-blue/0 opacity-0 transition group-hover:opacity-100" />
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/70 text-sm font-semibold text-lernex-purple shadow dark:bg-white/10">
                {item.step}
              </span>
              <div className="mt-6 text-xl font-semibold text-neutral-900 dark:text-white">{item.title}</div>
              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-28 max-w-6xl px-6">
        <div className="rounded-3xl border border-white/10 bg-white/70 p-10 shadow-xl shadow-lernex-blue/10 backdrop-blur dark:bg-white/5">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="text-left">
              <h2 className="text-3xl font-bold">What you get with Lernex</h2>
              <p className="mt-4 text-neutral-600 dark:text-neutral-300">
                Everything is orchestrated to make complex knowledge feel approachable—without sacrificing rigor. Swipe through content, test yourself instantly, and keep a crystal-clear pulse on your progress.
              </p>
              <div className="mt-8 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                <span className="rounded-full border border-white/10 bg-white/70 px-4 py-1 backdrop-blur dark:bg-white/10">Flash insight</span>
                <span className="rounded-full border border-white/10 bg-white/70 px-4 py-1 backdrop-blur dark:bg-white/10">Real-time analytics</span>
                <span className="rounded-full border border-white/10 bg-white/70 px-4 py-1 backdrop-blur dark:bg-white/10">Adaptive pacing</span>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-lernex-blue/20 via-lernex-purple/30 to-lernex-blue/10 p-8 text-left shadow-lg shadow-lernex-purple/30">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.4),transparent_65%)] opacity-60" />
              <div className="relative">
                <p className="text-sm uppercase tracking-[0.3em] text-white/80">Live preview</p>
                <div className="mt-4 rounded-2xl bg-white/80 p-4 text-neutral-900 shadow-lg backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Micro-lesson</p>
                  <p className="mt-2 text-lg font-semibold">Understand zero trust architecture in under a minute.</p>
                  <p className="mt-3 text-sm text-neutral-600">
                    Lernex highlights the critical frame, the analogy, and the call-to-action so you never miss the &quot;why it matters&quot; moment.
                  </p>
                </div>
                <div className="mt-4 rounded-2xl bg-white/60 p-4 text-neutral-900 shadow-lg backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Quick check</p>
                  <p className="mt-2 text-sm">
                    What is the primary goal of implementing zero trust?
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm">Limit lateral movement inside your network</div>
                    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm">Eliminate all third-party access</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200/60 bg-white/80 p-6 text-left shadow-md shadow-black/10 backdrop-blur transition hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-white/10"
              >
                <div className="text-4xl transition-transform group-hover:scale-110">{feature.icon}</div>
                <div className="mt-4 text-lg font-semibold">{feature.title}</div>
                <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{feature.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-28 max-w-5xl px-6">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-lernex-blue/20 via-lernex-purple/25 to-lernex-blue/10 p-10 text-center shadow-2xl shadow-lernex-purple/30 backdrop-blur">
          <h2 className="text-3xl font-bold text-white">Proof that the approach works</h2>
          <p className="mt-4 text-base text-white/80">
            Built and battle-tested with real operators. Lernex condenses knowledge and gives feedback loops that keep people engaged.
          </p>
          <div className="mt-10 grid gap-6 text-left text-white md:grid-cols-3">
            {outcomes.map((item) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className="rounded-2xl border border-white/20 bg-white/10 p-6 shadow-lg shadow-black/10 backdrop-blur"
              >
                <div className="text-4xl font-black">{item.stat}</div>
                <div className="mt-2 text-sm uppercase tracking-[0.3em] text-white/70">{item.label}</div>
                <p className="mt-4 text-sm text-white/80">{item.detail}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-28 max-w-5xl px-6">
        <h2 className="mb-10 text-center text-3xl font-bold">Why Lernex?</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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

      <section className="mx-auto mt-28 max-w-5xl px-6">
        <h2 className="text-center text-3xl font-bold">What learners are saying</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {testimonials.map((item) => (
            <motion.blockquote
              key={item.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="group relative overflow-hidden rounded-3xl border border-neutral-200/60 bg-white/80 p-6 text-left shadow-lg shadow-black/10 backdrop-blur transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:bg-white/10"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-lernex-blue/0 via-lernex-purple/10 to-lernex-blue/0 opacity-0 transition group-hover:opacity-100" />
              <p className="relative text-sm text-neutral-700 dark:text-neutral-200">&ldquo;{item.quote}&rdquo;</p>
              <footer className="relative mt-6 text-sm font-semibold text-neutral-900 dark:text-white">
                {item.name}
                <div className="mt-1 text-xs font-normal text-neutral-500 dark:text-neutral-300">{item.role}</div>
              </footer>
            </motion.blockquote>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-28 max-w-5xl px-6">
        <div className="rounded-3xl border border-white/10 bg-white/70 p-10 shadow-xl shadow-lernex-blue/10 backdrop-blur dark:bg-white/5">
          <h2 className="text-center text-3xl font-bold">FAQs</h2>
          <div className="mt-8 space-y-4">
            {faqs.map((item) => (
              <motion.div
                key={item.question}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className="rounded-2xl border border-neutral-200/70 bg-white/80 px-6 py-5 shadow-md shadow-black/10 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-white/10"
              >
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">{item.question}</h3>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{item.answer}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-28 max-w-5xl px-6 pb-32">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-lernex-blue via-lernex-purple to-orange-400 p-10 text-center text-white shadow-2xl shadow-lernex-purple/40">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold">Ready to level up?</h2>
            <p className="mt-4 text-base text-white/85">
              Join thousands of learners and teams accelerating their expertise with AI-crafted micro-lessons. Launch in minutes and stay ahead for the long haul.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 md:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3 font-semibold text-lernex-purple shadow-lg shadow-black/20 transition transform hover:-translate-y-0.5"
              >
                Start for free
              </Link>
              <Link
                href="#how"
                className="inline-flex items-center justify-center rounded-full border border-white/60 px-8 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                Explore the flow
              </Link>
            </div>
          </div>
        </div>
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
        <LiveUserMeter count={userTotal} isLaunched={isLaunched} isLoading={isLoadingUsers} error={userTotalError} />
      </section>
    </main>
  );
}
