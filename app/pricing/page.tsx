'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, easeOut } from 'framer-motion';
import { ArrowRight, CheckCircle2, Loader2, Sparkles, ShieldCheck, Zap, TrendingUp, Brain, Users } from 'lucide-react';

type Tier = {
  id: 'free' | 'plus' | 'premium';
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
    id: 'free',
    name: 'Free Explorer',
    tagline: 'Start your learning journey with essential tools and unlimited potential.',
    price: '$0',
    priceSuffix: 'forever',
    originalPrice: null,
    badge: 'Getting started',
    highlight: false,
    accent:
      'border-white/60 bg-white/80 shadow-[0_35px_90px_-45px_rgba(47,128,237,0.35)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5 dark:shadow-[0_45px_110px_-60px_rgba(47,128,237,0.4)]',
    buttonClasses:
      'border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-800/90',
    cta: 'Start learning free',
    sellingPoint: 'Perfect for exploring what Lernex can do for your learning goals.',
    features: [
      'Daily AI-generated micro-lessons tailored to your interests',
      'Standard AI model with fundamental personalization capabilities',
      'Interactive quizzes with instant feedback and explanations',
      'Track your streaks and build consistent study habits',
      'Access to community challenges and weekend competitions',
      'Basic dashboard with progress analytics and insights',
      'Standard generation limits (refreshes daily)'
    ]
  },
  {
    id: 'plus',
    name: 'Plus Momentum',
    tagline: 'Accelerate your growth with intelligent tutoring and priority features.',
    price: '$5.99',
    priceSuffix: '/month',
    originalPrice: '$12.99',
    badge: 'Most popular',
    highlight: true,
    accent:
      'border-transparent bg-gradient-to-br from-lernex-blue/90 via-lernex-blue to-indigo-500/80 shadow-[0_55px_140px_-70px_rgba(37,99,235,0.75)] dark:from-lernex-blue dark:via-lernex-blue/90 dark:to-indigo-500 dark:shadow-[0_65px_160px_-80px_rgba(37,99,235,0.85)]',
    buttonClasses:
      'bg-white text-neutral-900 hover:bg-white/95 hover:shadow-xl hover:scale-[1.02] dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-900/95',
    cta: 'Unlock Plus now',
    sellingPoint: 'The sweet spot for serious learners who want faster results with less effort.',
    features: [
      'Advanced AI model with 6x more intelligence for deeper personalization',
      '3x higher daily AI creation limits with unlimited instant retries',
      'Adaptive study paths that learn from every question you skip or answer',
      'Curated exam playlists and interview prep drills for your field',
      'Export printable study guides and flashcard PDFs to learn anywhere',
      'Priority support from our learning concierge team (avg. <2hr response)',
      'Advanced progress analytics with weekly personalized insights',
      'Early access to beta features before they go public'
    ]
  },
  {
    id: 'premium',
    name: 'Premium Unlimited',
    tagline: 'Limitless creation power for teams, tutors, and ambitious high-achievers.',
    price: '$14.99',
    priceSuffix: '/month',
    originalPrice: '$29.99',
    badge: 'Best value for power users',
    highlight: false,
    accent:
      'border-white/60 bg-white/80 shadow-[0_35px_90px_-45px_rgba(47,128,237,0.35)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5 dark:shadow-[0_45px_110px_-60px_rgba(47,128,237,0.4)]',
    buttonClasses:
      'bg-gradient-to-r from-neutral-900 to-neutral-800 text-white hover:from-neutral-800 hover:to-neutral-700 hover:shadow-xl hover:scale-[1.02] dark:from-white dark:to-neutral-100 dark:text-neutral-900 dark:hover:from-neutral-100 dark:hover:to-white',
    cta: 'Go Premium today',
    sellingPoint: 'For those who refuse to settle - unlimited everything with enterprise-grade tools.',
    features: [
      'Advanced AI model with 6x more intelligence for maximum personalization',
      'Unlimited AI generation with zero daily caps or restrictions',
      'Collaborative workspaces for study groups, teams, or classrooms',
      'Instant access to every beta feature the moment it ships',
      'Deep personalization engine powered by spaced repetition algorithms',
      'Automated AI coaching that adapts to your learning patterns in real-time',
      'Advanced analytics dashboard with exportable performance reports',
      'API access and integrations with your favorite tools and LMS platforms',
      'White-label options for tutors and educational institutions'
    ]
  }
];

const guaranteePoints = [
  'Cancel or downgrade in two clicks - no emails, no phone calls, no hassle',
  '14-day results guarantee: love your progress or get every penny back',
  'Secure Stripe payments supporting all major cards and digital wallets'
];

const cardVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.95 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      delay: index * 0.15,
      ease: easeOut
    }
  })
};

const featureVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (index: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.4,
      delay: index * 0.05
    }
  })
};

export default function Pricing() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingTier, setLoadingTier] = useState<Tier['id'] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkoutStatus = searchParams.get('status');
  const statusNotice =
    checkoutStatus === 'success'
      ? {
          tone: 'success' as const,
          text: 'Payment confirmed! Check your inbox for a receipt and onboarding tips within the next few minutes.'
        }
      : checkoutStatus === 'cancelled'
        ? {
            tone: 'info' as const,
            text: 'Checkout cancelled. Feel free to keep exploring and restart whenever you are ready.'
          }
        : null;

  const handleSelect = useCallback(
    async (tier: Tier) => {
      if (tier.id === 'free') {
        router.push('/login');
        return;
      }

      try {
        setErrorMessage(null);
        setLoadingTier(tier.id);

        const response = await fetch('/api/checkout/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: tier.id })
        });

        const payload = (await response
          .json()
          .catch(() => null)) as { checkoutUrl?: string | null; sessionId?: string; error?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? 'Unable to start checkout. Please try again.');
        }

        if (!payload?.checkoutUrl) {
          throw new Error('Checkout session could not be created. Please try again.');
        }

        window.location.href = payload.checkoutUrl;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'We could not start checkout. Please try again.';
        setErrorMessage(message);
      } finally {
        setLoadingTier(null);
      }
    },
    [router]
  );

  return (
    <main className="relative isolate mx-auto flex min-h-[calc(100vh-56px)] w-full flex-col overflow-hidden text-neutral-900 transition-colors dark:text-white">
      {/* Background layer matching FYP/Leaderboard pattern */}
      <div className="pointer-events-none absolute inset-0 -z-20">
        <div className="absolute inset-x-[-12%] top-[-18%] h-[420px] rounded-full bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.26),transparent_70%)]" />
        <div className="absolute left-[-6%] top-[32%] h-64 w-64 rounded-full bg-lernex-blue/20 blur-3xl opacity-70 dark:bg-lernex-blue/35 dark:opacity-60" />
        <div className="absolute right-[-8%] bottom-[14%] h-72 w-72 rounded-full bg-lernex-purple/20 blur-3xl opacity-70 dark:bg-lernex-purple/35 dark:opacity-60" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-6 py-16 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 shadow-[0_18px_45px_-30px_rgba(59,130,246,0.6)] backdrop-blur-lg dark:border-white/20 dark:bg-white/10 dark:text-neutral-200 dark:shadow-none"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Invest in your future self
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-6 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl md:text-6xl dark:text-white"
          >
            Learning plans designed to{' '}
            <span className="bg-gradient-to-r from-lernex-blue via-indigo-500 to-purple-500 bg-clip-text text-transparent">
              unlock unfair advantages
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-6 text-lg leading-relaxed text-neutral-600 dark:text-neutral-300"
          >
            Choose the plan that matches your ambition. Every upgrade unlocks smarter AI tutors, deeper analytics, and a team cheering for your breakthroughs.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-neutral-600 dark:text-neutral-300"
          >
            <motion.div
              whileHover={{ scale: 1.05, y: -2 }}
              className="flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-5 py-2.5 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.25)] backdrop-blur-lg dark:border-white/20 dark:bg-white/10 dark:shadow-none"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-400" /> 14-day love-it-or-refund guarantee
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.05, y: -2 }}
              className="flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-5 py-2.5 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.25)] backdrop-blur-lg dark:border-white/20 dark:bg-white/10 dark:shadow-none"
            >
              <CheckCircle2 className="h-4 w-4 text-lernex-blue dark:text-lernex-blue/80" /> No hidden fees & cancel anytime
            </motion.div>
          </motion.div>
        </motion.div>

        {(statusNotice || errorMessage) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mt-8 flex w-full max-w-xl flex-col gap-3"
          >
            {statusNotice && (
              <div
                className={`rounded-2xl border p-4 text-sm shadow-lg backdrop-blur-sm ${
                  statusNotice.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                    : 'border-sky-200 bg-sky-50/80 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200'
                }`}
              >
                {statusNotice.text}
              </div>
            )}
            {errorMessage && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-lg backdrop-blur-sm dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                {errorMessage}
              </div>
            )}
          </motion.div>
        )}

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3"
        >
          {tiers.map((tier, index) => {
            const isHighlight = tier.highlight;
            const headingClass = isHighlight ? "text-white" : "text-neutral-900 dark:text-white";
            const taglineClass = isHighlight ? "text-white/90" : "text-neutral-600 dark:text-neutral-300";
            const priceClass = isHighlight ? "text-white" : "text-neutral-900 dark:text-white";
            const priceSuffixClass = isHighlight ? "text-white/80" : "text-neutral-500 dark:text-neutral-400";
            const originalPriceClass = isHighlight ? "text-white/70" : "text-neutral-400 dark:text-neutral-500";
            const sellingPointClass = isHighlight ? "text-emerald-200" : "text-emerald-600 dark:text-emerald-400";
            const featureTextClass = isHighlight ? "text-white/90" : "text-neutral-600 dark:text-neutral-200";

            return (
              <motion.div
                key={tier.id}
                custom={index}
                variants={cardVariants}
                whileHover={{
                  y: -12,
                  scale: 1.02,
                  transition: { duration: 0.3, ease: "easeOut" }
                }}
                className={`relative rounded-3xl border p-8 transition-all duration-500 ${isHighlight ? 'overflow-visible md:scale-105' : 'overflow-hidden'} ${tier.accent}`}
              >
                {/* Glow effect on hover */}
                <motion.div
                  className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-500"
                  whileHover={{ opacity: isHighlight ? 0.4 : 0.2 }}
                  style={{
                    background: isHighlight
                      ? 'radial-gradient(circle at center, rgba(59,130,246,0.6), transparent 70%)'
                      : 'radial-gradient(circle at center, rgba(59,130,246,0.3), transparent 70%)'
                  }}
                />

                {isHighlight && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="absolute left-1/2 top-[-18px] inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 px-5 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-neutral-900/40 dark:from-white dark:via-neutral-100 dark:to-white dark:text-neutral-900"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> {tier.badge}
                  </motion.div>
                )}

                {!isHighlight && (
                  <div className="absolute right-5 top-5 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                    {tier.badge}
                  </div>
                )}

                <div className="relative space-y-6">
                  <div>
                    <h2 className={`text-2xl font-bold ${headingClass}`}>{tier.name}</h2>
                    <p className={`mt-3 text-sm leading-relaxed ${taglineClass}`}>{tier.tagline}</p>
                  </div>

                  <div>
                    <div className="flex items-baseline gap-2">
                      {tier.originalPrice && (
                        <motion.span
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.7 }}
                          className={`text-lg line-through ${originalPriceClass}`}
                        >
                          {tier.originalPrice}
                        </motion.span>
                      )}
                      <span className={`text-5xl font-bold ${priceClass}`}>{tier.price}</span>
                      <span className={`text-sm ${priceSuffixClass}`}>{tier.priceSuffix}</span>
                    </div>
                    <p className={`mt-3 text-xs font-bold uppercase tracking-wider ${sellingPointClass}`}>
                      {tier.sellingPoint}
                    </p>
                  </div>

                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleSelect(tier)}
                    disabled={loadingTier === tier.id}
                    className={`group relative mt-6 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-6 py-3.5 text-sm font-bold tracking-wide shadow-lg transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${tier.buttonClasses}`}
                  >
                    {/* Button shine effect */}
                    <motion.div
                      className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      whileHover={{
                        translateX: '200%',
                        transition: { duration: 0.6, ease: "easeInOut" }
                      }}
                    />
                    {loadingTier === tier.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Redirecting...</span>
                      </>
                    ) : (
                      <>
                        {tier.cta}
                        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                      </>
                    )}
                  </motion.button>

                  <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="mt-8 space-y-3"
                  >
                    {tier.features.map((feature, fIndex) => (
                      <motion.div
                        key={feature}
                        custom={fIndex}
                        variants={featureVariants}
                        className={`flex items-start gap-3 text-sm leading-relaxed ${featureTextClass}`}
                      >
                        <CheckCircle2 className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isHighlight ? 'text-white' : 'text-lernex-blue dark:text-lernex-blue/80'}`} />
                        <span>{feature}</span>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Stats section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="mt-20 grid gap-6 sm:grid-cols-3"
        >
          {[
            { icon: Brain, stat: '2.7x', label: 'Faster goal achievement for Premium users' },
            { icon: TrendingUp, stat: '10M+', label: 'AI-generated lessons created this year' },
            { icon: Users, stat: '50k+', label: 'Active learners across 120+ countries' }
          ].map(({ icon: Icon, stat, label }, idx) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              whileHover={{ y: -4 }}
              className="rounded-3xl border border-white/60 bg-white/80 p-6 text-center shadow-[0_32px_90px_-64px_rgba(47,128,237,0.65)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-lernex-blue/15 text-lernex-blue dark:bg-lernex-blue/20">
                <Icon className="h-6 w-6" />
              </div>
              <div className="text-3xl font-bold text-neutral-900 dark:text-white">{stat}</div>
              <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{label}</div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-20 grid gap-8 rounded-3xl border border-white/60 bg-white/80 p-8 shadow-[0_45px_120px_-65px_rgba(30,64,175,0.45)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5 dark:shadow-[0_60px_150px_-80px_rgba(47,128,237,0.6)] md:grid-cols-[1.3fr_1fr] md:p-12"
        >
          <div>
            <h2 className="text-3xl font-bold text-neutral-900 dark:text-white">Still thinking it over?</h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-300">
              Learners who upgrade reach their exam or skill goals <strong>2.7x faster</strong>. Join a worldwide community of focused, ambitious learners and upgrade only when you&apos;re ready - the guarantee has your back.
            </p>
            <div className="mt-6 space-y-3">
              {guaranteePoints.map((point, idx) => (
                <motion.div
                  key={point}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ x: 4 }}
                  className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm text-neutral-600 shadow-[0_18px_48px_-30px_rgba(30,64,175,0.25)] backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-neutral-300 dark:shadow-none"
                >
                  <ShieldCheck className="h-5 w-5 flex-shrink-0 text-emerald-500 dark:text-emerald-400" />
                  <span>{point}</span>
                </motion.div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/60 bg-white/70 p-6 shadow-[0_35px_90px_-55px_rgba(30,64,175,0.35)] backdrop-blur dark:border-white/10 dark:bg-white/5 dark:shadow-[0_45px_120px_-70px_rgba(47,128,237,0.5)] md:p-8">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-lernex-blue/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-lernex-blue dark:bg-lernex-blue/20">
              <Zap className="h-3 w-3" />
              After upgrade
            </div>
            <h3 className="mt-4 text-xl font-bold text-neutral-900 dark:text-white">What happens next?</h3>
            <ul className="mt-6 space-y-4">
              {[
                'Instant unlock of advanced AI tutors, curated playlists, and personalized weekly study missions',
                'Live progress boosters and adaptive AI study rooms that learn from every session you complete',
                'Priority access to new features before anyone else, including upcoming mobile apps and integrations'
              ].map((item, idx) => (
                <motion.li
                  key={item}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-start gap-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-200"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-lernex-blue dark:text-lernex-blue/80" />
                  <span>{item}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-16 text-center text-xs text-neutral-500 dark:text-neutral-400"
        >
          Prices listed in USD. Switch or cancel anytime. Taxes may apply based on your region.
        </motion.p>
      </div>
    </main>
  );
}
