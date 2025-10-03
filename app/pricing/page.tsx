'use client';

import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Sparkles, ShieldCheck } from 'lucide-react';

type Tier = {
  name: string;
  tagline: string;
  price: string;
  priceSuffix: string;
  originalPrice: string | null;
  badge: string;
  highlight: boolean;
  accent: string;
  buttonClasses: string;
  cta: string;
  sellingPoint: string;
  features: string[];
};

const tiers: Tier[] = [
  {
    name: 'Free Explorer',
    tagline: 'Test-drive Lernex and build momentum without a commitment.',
    price: '$0',
    priceSuffix: 'forever',
    originalPrice: null,
    badge: 'Getting started',
    highlight: false,
    accent: 'border-neutral-200/80 bg-white/80 dark:border-neutral-800 dark:bg-neutral-900/70',
    buttonClasses:
      'border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-800/90',
    cta: 'Start for free',
    sellingPoint: 'Perfect for curious learners who want to explore the platform.',
    features: [
      'Daily AI-crafted warmups and micro-lessons',
      'Foundational quizzes, flashcards, and progress streaks',
      'Standard generation limits and dashboard analytics',
      'Community challenges every weekend'
    ]
  },
  {
    name: 'Premium Momentum',
    tagline: 'Unlock accelerated learning with smarter guidance and personal coaching.',
    price: '$5.99',
    priceSuffix: '/month',
    originalPrice: '$12.99',
    badge: 'Most popular',
    highlight: true,
    accent:
      'border-transparent bg-gradient-to-br from-lernex-blue/90 via-lernex-blue to-indigo-600/80 shadow-xl shadow-lernex-blue/20 dark:from-lernex-blue dark:via-lernex-blue/90 dark:to-indigo-500',
    buttonClasses:
      'bg-white text-neutral-900 hover:bg-white/90 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-900/90',
    cta: 'Accelerate with Premium',
    sellingPoint: 'Fast-track results with adaptive plans, deeper insights, and priority support.',
    features: [
      '3× higher daily AI generation limits with instant retries',
      'Adaptive study paths tuned to your weaknesses',
      'Exam playlists, mock interviews, and printable study guides',
      'Lightning priority during peak hours + concierge support'
    ]
  },
  {
    name: 'Pro Creator',
    tagline: 'For teams, tutors, and ambitious learners who need limitless creation.',
    price: '$14.99',
    priceSuffix: '/month',
    originalPrice: '$29.99',
    badge: 'Best value for power users',
    highlight: false,
    accent:
      'border-neutral-200/80 bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/70',
    buttonClasses:
      'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-white/90',
    cta: 'Go Pro and scale',
    sellingPoint: 'Create unlimited experiences with enterprise-level insights and control.',
    features: [
      'Unlimited AI generation with collaborative workspaces',
      'Access to every beta feature the moment it drops',
      'Deep personalization, spaced repetition, and auto-coaching',
      'Advanced analytics, exportable reports, and API hooks'
    ]
  }
];

const guaranteePoints = [
  'Cancel instantly from your dashboard — no emails needed',
  '14-day money-back promise if Lernex is not a match',
  'Secure payments powered by Stripe with global currency support'
];

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: index * 0.1
    }
  })
};

export default function Pricing() {
  return (
    <main className="relative min-h-[calc(100vh-56px)] overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-[-20%] h-[60%] bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_65%)]" />
        <div className="absolute bottom-[-30%] left-1/2 h-[70%] w-[80%] -translate-x-1/2 bg-[radial-gradient(circle,_rgba(14,116,144,0.12),_transparent_70%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 shadow-sm backdrop-blur dark:border-white/20 dark:bg-white/10 dark:text-neutral-200">
            <Sparkles className="h-3.5 w-3.5" />
            Invest in your future self
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl md:text-6xl dark:text-white">
            Learning plans designed to <span className="bg-gradient-to-r from-lernex-blue via-indigo-500 to-purple-500 bg-clip-text text-transparent">unlock unfair advantages</span>
          </h1>
          <p className="mt-5 text-lg text-neutral-600 dark:text-neutral-300">
            Choose the plan that matches your ambition. Every upgrade comes with smarter AI tutors, richer analytics, and a team cheering for your breakthroughs.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-neutral-500 dark:text-neutral-300">
            <div className="flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 shadow-sm backdrop-blur dark:bg-white/10">
              <ShieldCheck className="h-4 w-4" /> 14-day love-it-or-refund guarantee
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 shadow-sm backdrop-blur dark:bg-white/10">
              <CheckCircle2 className="h-4 w-4" /> No hidden fees & cancel anytime
            </div>
          </div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3"
        >
          {tiers.map((tier, index) => (
            <motion.div
              key={tier.name}
              custom={index}
              variants={cardVariants}
              whileHover={{ y: -10, rotateX: 0.2, rotateY: -0.2 }}
              className={`relative overflow-hidden rounded-3xl border p-8 transition-all duration-500 ${tier.accent}`}
            >
              {tier.highlight && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute left-1/2 top-[-18px] inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-neutral-900 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-neutral-900/40 dark:bg-white dark:text-neutral-900"
                >
                  <Sparkles className="h-3.5 w-3.5" /> {tier.badge}
                </motion.div>
              )}

              {!tier.highlight && (
                <div className="absolute right-4 top-4 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  {tier.badge}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">{tier.name}</h2>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{tier.tagline}</p>
                </div>

                <div>
                  <div className="flex items-baseline gap-2">
                    {tier.originalPrice && (
                      <span className="text-sm text-neutral-400 line-through dark:text-neutral-500">{tier.originalPrice}</span>
                    )}
                    <span className="text-4xl font-bold text-neutral-900 dark:text-white">{tier.price}</span>
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">{tier.priceSuffix}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-500 dark:text-emerald-300">
                    {tier.sellingPoint}
                  </p>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`group mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold tracking-wide transition ${tier.buttonClasses}`}
                >
                  {tier.cta}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </motion.button>

                <div className="mt-6 space-y-3">
                  {tier.features.map(feature => (
                    <div key={feature} className="flex items-start gap-3 text-sm text-neutral-700 dark:text-neutral-200">
                      <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${tier.highlight ? 'text-white' : 'text-lernex-blue dark:text-lernex-blue'}`} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-20 grid gap-6 rounded-3xl border border-neutral-200 bg-white/70 p-8 shadow-xl shadow-neutral-200/40 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/70 dark:shadow-neutral-900/20 md:grid-cols-[1.3fr_1fr]"
        >
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">Still thinking it over?</h2>
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
              Lernex Premium and Pro users report reaching their exam or skill goals 2.7× faster. Join a worldwide community of focused learners and upgrade only when you are ready — the guarantee has your back.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-neutral-600 dark:text-neutral-300">
              {guaranteePoints.map(point => (
                <span key={point} className="flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-2 dark:bg-neutral-800/70">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  {point}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-gradient-to-br from-neutral-50 via-white to-neutral-100 p-6 text-sm text-neutral-600 shadow-sm dark:border-neutral-700 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-800 dark:text-neutral-200">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">What happens after you upgrade?</h3>
            <ul className="mt-4 space-y-3">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-lernex-blue" />
                <span>Instant unlock of advanced tutors, playlists, and personalised weekly missions.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-lernex-blue" />
                <span>Live progress boosters and AI study rooms that adapt to every session.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-lernex-blue" />
                <span>Priority access to new features before anyone else — including upcoming mobile apps.</span>
              </li>
            </ul>
          </div>
        </motion.div>

        <p className="mt-12 text-center text-xs text-neutral-500 dark:text-neutral-400">
          Prices listed in USD. Switch or cancel anytime. Taxes may apply based on your region.
        </p>
      </div>
    </main>
  );
}