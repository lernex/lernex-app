'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';

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
  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-900 via-neutral-900/80 to-neutral-950">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-lernex-blue/20 via-lernex-purple/20 to-transparent blur-3xl" />
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 py-32 text-center text-white">
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
            className="mt-6 max-w-2xl text-lg text-neutral-300"
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
          </motion.div>
        </div>
      </section>

      <section id="how" className="mx-auto mt-32 max-w-5xl px-6 text-white">
        <h2 className="mb-10 text-center text-3xl font-bold">How it works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center shadow-md shadow-black/20 backdrop-blur"
            >
              <div className="text-4xl">{f.icon}</div>
              <div className="mt-4 text-xl font-semibold">{f.title}</div>
              <div className="mt-2 text-neutral-300">{f.desc}</div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-32 max-w-5xl px-6 text-white">
        <h2 className="mb-10 text-center text-3xl font-bold">Why Lernex?</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {benefits.map((b) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center shadow-md shadow-black/20 backdrop-blur"
            >
              <div className="text-4xl">{b.icon}</div>
              <div className="mt-4 text-xl font-semibold">{b.title}</div>
              <div className="mt-2 text-neutral-300">{b.desc}</div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-32 max-w-5xl px-6 pb-32 text-center text-white">
        <h2 className="text-3xl font-bold">Ready to level up?</h2>
        <p className="mt-4 text-neutral-300">Join thousands of learners accelerating their skills with AI.</p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-8 py-3 font-medium text-white shadow-lg shadow-lernex-blue/40 transition hover:opacity-90"
        >
          Start for free
        </Link>
      </section>
    </main>
  );
}