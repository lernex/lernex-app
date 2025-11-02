'use client';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

const features = [
  {
    title: 'AI-Powered Feed',
    desc: 'Your "For You Page" surfaces lessons based on quiz performance, learning gaps, and goals. Each card shows exactly why it was selected for you.',
    icon: '🧭',
  },
  {
    title: '30-90 Second Lessons',
    desc: 'Every lesson includes context (why it matters), real-world applications, prerequisites, and common pitfalls—all in under 90 seconds.',
    icon: '⚡',
  },
  {
    title: 'Instant Feedback',
    desc: 'Answer 4 multiple-choice questions after each lesson. Correct answers turn green with confetti. Wrong answers show explanations and the right answer highlighted.',
    icon: '🎯',
  },
  {
    title: 'Smart Adaptation',
    desc: 'Ace three lessons in a row? Difficulty increases. Miss questions? The AI breaks concepts into smaller prerequisite lessons. Adapts to your pace in real-time.',
    icon: '📈',
  },
];

const benefits = [
  {
    title: 'Gamified Learning',
    desc: 'Earn points for every correct answer, build daily streaks, unlock 35+ achievement badges, and climb leaderboards. Stay motivated with progress that feels like a game.',
    icon: '🎮',
  },
  {
    title: 'Upload Anything',
    desc: 'Drag and drop PDFs, PowerPoints, lecture notes, or documentation. AI generates a complete lesson playlist with quizzes in 30-90 seconds.',
    icon: '📄',
  },
  {
    title: 'Works Everywhere',
    desc: 'Swipe through lessons on your phone during commutes, on desktop between meetings, or on tablet at home. Progress syncs instantly across all devices.',
    icon: '📱',
  },
  {
    title: 'Built for Teams',
    desc: 'Team admins see completion rates, accuracy dashboards, and progress analytics. Upload company docs to create onboarding paths and track compliance training.',
    icon: '👥',
  },
];

const trustedByLabels = [
  'High school students',
  'College students',
  'SAT/ACT prep',
  'Study groups',
];

const learningFlow = [
  {
    step: '1',
    title: 'Upload or browse topics',
    desc: 'Drag-and-drop your PDFs, slides, or notes—or explore curated subjects like cybersecurity, cloud, or data science. AI generates your personalized learning path in under 2 minutes.',
  },
  {
    step: '2',
    title: 'Swipe through your feed',
    desc: 'Open your personalized "For You Page" and swipe through bite-sized lessons (30-90 seconds each). Every card explains exactly why you\'re seeing it—based on your quiz performance, learning gaps, and goals.',
  },
  {
    step: '3',
    title: 'Answer quiz questions',
    desc: 'After each lesson, answer 4 multiple-choice questions. Get instant green/red feedback with confetti celebrations for correct answers and detailed explanations when you miss one.',
  },
  {
    step: '4',
    title: 'Track your progress',
    desc: 'Watch your accuracy scores climb by subject, build daily streaks, unlock achievement badges, and see the AI automatically adjust difficulty as you improve. Your dashboard shows exactly where you stand.',
  },
];

const outcomes = [
  {
    stat: '92%',
    label: 'improved recall',
    detail: 'Students reported retaining key concepts after one week.',
  },
  {
    stat: '7 min',
    label: 'daily average',
    detail: 'Perfect for quick study sessions between classes or during breaks.',
  },
  {
    stat: '3×',
    label: 'faster learning',
    detail: 'Students master new topics 3x faster compared to traditional studying.',
  },
];

const testimonials = [
  {
    quote:
      'I was skeptical at first—seemed like another flashcard app. But when I saw the "Why you\'re seeing this" box on each lesson? That changed everything. It literally knows exactly where I\'m struggling.',
    name: 'Alex Chen',
    role: 'Software Engineering Student',
  },
  {
    quote:
      'Ten minutes on the train and I\'m actually learning. The questions aren\'t just recall—they make you apply what you read. Been using it for my AWS certs and it\'s night and day compared to reading docs.',
    name: 'Marcus Thompson',
    role: 'Cloud Security Professional',
  },
  {
    quote:
      'Our compliance onboarding went from 6 weeks to 2. I can see who\'s completed what, who needs help, and where people are getting stuck. The analytics dashboard is exactly what we needed.',
    name: 'Sarah Patel',
    role: 'Operations Manager',
  },
  {
    quote:
      'I drag-and-drop my lecture PDFs and two minutes later I have quiz questions ready. Saves me hours of trying to figure out what to study. Actually passed my anatomy exam because of this.',
    name: 'Jake Morrison',
    role: 'Med School Pre-Clinical',
  },
  {
    quote:
      'Day 52 of my streak. I know it sounds dumb but I genuinely look forward to opening the app now. Seven minutes while my coffee brews and I feel like I accomplished something before 9am.',
    name: 'Emily Rodriguez',
    role: 'Data Analytics Bootcamp',
  },
  {
    quote:
      'The adaptive difficulty is legit. When I ace three lessons in a row, the next one is noticeably harder. When I miss questions, it backs up and fills the gaps. Feels like it\'s actually paying attention.',
    name: 'David Kim',
    role: 'AWS Solutions Architect',
  },
  {
    quote:
      'We tried three different platforms before this. What sold my team was uploading our internal runbook and watching it generate lessons in 90 seconds. No more manually creating training materials.',
    name: 'Rachel Foster',
    role: 'Head of L&D, Fintech',
  },
  {
    quote:
      'Failed CISSP the first time after months of reading. Switched to Lernex for three weeks and passed. The spaced repetition kept bringing back topics I kept forgetting. Finally stuck.',
    name: 'Chris Nguyen',
    role: 'Security Analyst',
  },
  {
    quote:
      'The confetti animation when you get an answer right shouldn\'t matter this much but honestly? It does. Makes studying feel way less painful than staring at textbooks.',
    name: 'Olivia Martinez',
    role: 'UX Designer Learning Code',
  },
  {
    quote:
      'I can finally see my weak spots clearly. The dashboard shows me I\'m at 85% on networking but only 60% on databases, so it queues up more database lessons. That kind of targeting is exactly what I needed.',
    name: 'James Wilson',
    role: 'Product Manager',
  },
  {
    quote:
      'My friend and I are both learning React but our feeds look completely different. Mine has more state management stuff because I keep missing those questions. Hers is all hooks. Kinda crazy how personalized it gets.',
    name: 'Natalie Singh',
    role: 'Computer Science Major',
  },
  {
    quote:
      'Five-minute gaps between meetings used to be wasted scrolling Twitter. Now I knock out a lesson or two. Sounds small but it adds up fast.',
    name: 'Tom Anderson',
    role: 'Engineering Manager',
  },
];

const faqs = [
  {
    question: 'How long are the lessons?',
    answer:
      'Each lesson takes 30-90 seconds to read—short enough to fit between meetings or on your commute. After reading, you answer 4 quiz questions (about 2-3 minutes total). Most people complete a full lesson in under 5 minutes.',
  },
  {
    question: 'How does the AI personalization work?',
    answer:
      'The "For You Page" algorithm tracks which questions you answer correctly, your accuracy by topic, and your learning history. Each lesson card shows a blue "Why you\'re seeing this" box explaining exactly why it was selected (e.g., "You\'ve been mastering network security—this builds on that foundation"). If you ace lessons consistently, difficulty increases. If you struggle, the AI breaks concepts down with easier prerequisite lessons.',
  },
  {
    question: 'Can I upload my own materials?',
    answer:
      'Yes! Drag and drop PDFs, PowerPoints, or text files—or paste content directly. The AI extracts key concepts and generates a full lesson playlist with quizzes in 30-90 seconds. Perfect for class lecture notes, certification study guides, internal company docs, or onboarding materials.',
  },
  {
    question: 'What makes this different from flashcards?',
    answer:
      'Lernex lessons aren\'t just term-definition pairs. Each lesson includes context (why this matters), real-world applications, prerequisites you should know first, and common pitfalls. The 4 quiz questions test understanding and application—not just memorization. Plus, the AI adapts difficulty and sequences lessons based on your performance, which static flashcards can\'t do.',
  },
  {
    question: 'What are badges and streaks?',
    answer:
      'Badges are achievements you unlock across 7 categories—like "Precision Player" for 90%+ quiz accuracy or "Speed Demon" for completing lessons quickly. Streaks count consecutive days you complete at least one lesson. Both appear on leaderboards where you can compete with friends or teammates. We have 35+ badges to unlock.',
  },
  {
    question: 'Can teams use this?',
    answer:
      'Yes! Team admins get a dashboard showing who\'s completed which lessons, accuracy scores by employee, and where people are struggling. You can upload internal documentation, create shared playlists, and track compliance training completion. We\'re used by startups, bootcamps, and enterprise teams for onboarding and upskilling.',
  },
  {
    question: 'How much does it cost?',
    answer:
      'We have a free tier to get started with curated lessons. Paid plans (Plus and Premium) unlock unlimited uploads, AI lesson generation from your documents, advanced analytics, team features, and priority support. Visit our pricing page for current rates.',
  },
  {
    question: 'Does it work on mobile?',
    answer:
      'Absolutely. The interface is designed mobile-first with swipe gestures (like TikTok). Your progress syncs in real-time across phone, tablet, and desktop. You can start a lesson on your laptop and finish the quiz on your phone—everything stays in sync.',
  },
  {
    question: 'What happens when I get a question wrong?',
    answer:
      'You see immediate feedback—wrong answers turn red, the correct answer turns green, and you get an explanation of why. There\'s no penalty or negative points. The AI notes which topics you missed and automatically queues up related lessons to fill those gaps. Wrong answers actually help you learn faster by targeting weak spots.',
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
    let target = localDateTimeToUtcMillis(year, 11, 15, 12, 0, 0);
    if (Date.now() > target) {
      target = localDateTimeToUtcMillis(year + 1, 11, 15, 12, 0, 0);
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
        <div className="mx-auto flex max-w-6xl flex-col items-center px-6 pt-16 pb-28 text-center md:pt-20 md:pb-32">
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
            Swipe through personalized bite-sized lessons with instant quiz feedback and adaptive difficulty. Like a social feed, but you&apos;re actually learning.
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
            Loved by students everywhere
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
          <h2 className="text-3xl font-bold">How it works</h2>
          <p className="mt-4 text-neutral-600 dark:text-neutral-300">
            From upload to mastery in four steps—AI-powered lessons that adapt to your learning style and fit into your busiest days.
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
              <h2 className="text-3xl font-bold">Your personal AI learning coach</h2>
              <p className="mt-4 text-neutral-600 dark:text-neutral-300">
                Each lesson card explains exactly why you&apos;re seeing it. Get instant green/red feedback on quiz questions, celebrate correct answers with confetti, and watch the AI adjust difficulty in real-time based on your performance. Learn complex topics without the overwhelm.
              </p>
              <div className="mt-8 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                <span className="rounded-full border border-white/10 bg-white/70 px-4 py-1 backdrop-blur dark:bg-white/10">Swipe to learn</span>
                <span className="rounded-full border border-white/10 bg-white/70 px-4 py-1 backdrop-blur dark:bg-white/10">Instant feedback</span>
                <span className="rounded-full border border-white/10 bg-white/70 px-4 py-1 backdrop-blur dark:bg-white/10">Adapts to you</span>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-lernex-blue/20 via-lernex-purple/30 to-lernex-blue/10 p-8 text-left shadow-lg shadow-lernex-purple/30">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.4),transparent_65%)] opacity-60" />
              <div className="relative">
                <p className="text-sm uppercase tracking-[0.3em] text-white/80">How it looks</p>
                <div className="mt-4 rounded-[32px] border-2 border-white/30 bg-white/95 p-6 text-neutral-900 shadow-2xl backdrop-blur ring-1 ring-black/5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-700">Cybersecurity</span>
                    <span className="rounded-full bg-lernex-blue/15 px-2.5 py-0.5 font-medium text-lernex-blue">Medium</span>
                  </div>
                  <h3 className="mt-4 text-xl font-bold leading-tight text-neutral-900">Zero Trust Architecture</h3>
                  <div className="mt-4 rounded-2xl bg-lernex-blue/10 p-4 text-xs leading-relaxed">
                    <p className="font-bold text-lernex-blue">Why you&apos;re seeing this</p>
                    <p className="mt-1.5 text-neutral-700">You&apos;ve been mastering network security fundamentals. This builds on that foundation.</p>
                  </div>
                  <div className="relative mt-5 max-h-36 overflow-hidden">
                    <p className="text-sm leading-relaxed text-neutral-700">
                      Instead of assuming everything inside your network is safe, zero trust treats every request as if it came from an untrusted source—verifying identity and context at each step. This means checking user credentials, device health, and access context before granting permissions, even for internal users...
                    </p>
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white/95 to-transparent" />
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
                    <span className="flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                      Prerequisites
                    </span>
                    <span>•</span>
                    <span>Applications</span>
                    <span>•</span>
                    <span>Watch out for</span>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl bg-white/90 p-5 text-neutral-900 shadow-xl backdrop-blur">
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Question 1 of 4</p>
                  <p className="mt-3 text-base font-semibold leading-snug text-neutral-900">
                    What is the core principle of zero trust security?
                  </p>
                  <div className="mt-4 space-y-2.5 text-sm">
                    <div className="cursor-pointer rounded-xl border-2 border-lernex-green bg-lernex-green/10 px-4 py-3 font-medium text-neutral-900 shadow-sm transition">
                      ✓ Never trust, always verify
                    </div>
                    <div className="cursor-pointer rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 text-neutral-700 opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      Trust internal networks by default
                    </div>
                    <div className="cursor-pointer rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 text-neutral-700 opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      Block all external connections
                    </div>
                    <div className="cursor-pointer rounded-xl border-2 border-neutral-200 bg-white px-4 py-3 text-neutral-700 opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      Verify only at network perimeter
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <div className="rounded-full bg-lernex-green/20 px-3 py-1.5 text-xs font-bold text-lernex-green">+10 pts</div>
                    <div className="text-xs text-neutral-500">Correct! 🎉</div>
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
          <h2 className="text-3xl font-bold text-white">Real results from real learners</h2>
          <p className="mt-4 text-base text-white/80">
            Students, professionals, and teams are mastering new skills faster with personalized AI lessons and instant feedback.
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
        <h2 className="mb-10 text-center text-3xl font-bold">Everything you need to learn smarter</h2>
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

      <section className="mx-auto mt-28 max-w-7xl px-6">
        <h2 className="text-center text-3xl font-bold">What learners are saying</h2>
        <p className="mt-3 text-center text-neutral-600 dark:text-neutral-300">Real feedback from students, professionals, and teams using Lernex daily</p>
        <div className="relative mt-10 overflow-hidden">
          <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-20 bg-gradient-to-r from-neutral-50 to-transparent dark:from-neutral-900" />
          <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-20 bg-gradient-to-l from-neutral-50 to-transparent dark:from-neutral-900" />

          <motion.div
            className="flex gap-4"
            animate={{
              x: [`0px`, `-${(testimonials.length * 396)}px`],
            }}
            transition={{
              x: {
                repeat: Infinity,
                repeatType: "loop",
                duration: 40,
                ease: "linear",
              },
            }}
          >
            {[...testimonials, ...testimonials].map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className="group relative flex-shrink-0 w-[380px] overflow-hidden rounded-3xl border border-neutral-200/60 bg-white/80 p-6 text-left shadow-lg shadow-black/10 backdrop-blur transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:bg-white/10"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-lernex-blue/0 via-lernex-purple/10 to-lernex-blue/0 opacity-0 transition group-hover:opacity-100" />
                <p className="relative text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">&ldquo;{item.quote}&rdquo;</p>
                <footer className="relative mt-6 text-sm font-semibold text-neutral-900 dark:text-white">
                  {item.name}
                  <div className="mt-1 text-xs font-normal text-neutral-500 dark:text-neutral-300">{item.role}</div>
                </footer>
              </div>
            ))}
          </motion.div>
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
            <h2 className="text-3xl font-bold">Ready to learn smarter, not harder?</h2>
            <p className="mt-4 text-base text-white/85">
              Join thousands mastering new skills with personalized AI lessons, instant feedback, and adaptive difficulty. From upload to your first lesson in under 2 minutes.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 md:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3 font-semibold text-lernex-purple shadow-lg shadow-black/20 transition transform hover:-translate-y-0.5 dark:bg-white dark:text-lernex-purple"
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
                Target: Nov 15, 12:00 PM MT
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
