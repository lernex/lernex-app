'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Bot,
  CalendarClock,
  CheckCircle2,
  Headphones,
  HelpCircle,
  LifeBuoy,
  Mail,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

type KnowledgeArticle = {
  title: string;
  summary: string;
  category: string;
  href: string;
};

type QuickAction = {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  meta: string;
};

type SupportChannel = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  response: string;
  availability: string;
  actionLabel: string;
  href: string;
};

type Tone = 'ok' | 'warn';

type StatusItem = {
  title: string;
  status: string;
  detail: string;
  icon: LucideIcon;
  tone: Tone;
};

type AdditionalResource = {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
};

const knowledgeArticles: KnowledgeArticle[] = [
  {
    title: 'Kick off with Lernex in 5 steps',
    summary: 'Set up your profile, choose subjects, and personalize the learning feed in minutes.',
    category: 'Getting Started',
    href: '/onboarding',
  },
  {
    title: 'Tune your For You feed',
    summary: 'Use reactions, streak goals, and playlists to sharpen recommendations.',
    category: 'Personalization',
    href: '/fyp',
  },
  {
    title: 'Build collaborative playlists',
    summary: 'Invite friends, curate lessons, and keep everyone on pace with shared progress.',
    category: 'Learning Paths',
    href: '/playlists',
  },
  {
    title: 'Manage billing & plans',
    summary: 'Update payment methods, switch tiers, or pause your subscription at any time.',
    category: 'Account & Billing',
    href: '/settings',
  },
  {
    title: 'Fix stalled quiz generation',
    summary: 'Troubleshoot slow prompts, malformed questions, and retry tips that work.',
    category: 'Troubleshooting',
    href: '/generate',
  },
  {
    title: 'Keep your data protected',
    summary: 'Learn how Lernex encrypts notes, exports, and what to do if something looks off.',
    category: 'Privacy & Security',
    href: '/profile',
  },
];

const quickActions: QuickAction[] = [
  {
    title: 'Search the help center',
    description: 'Browse setup guides, tutorials, and deep dives.',
    icon: BookOpen,
    href: '/docs',
    meta: 'Updated weekly',
  },
  {
    title: 'Start an AI chat',
    description: 'Get instant walkthroughs tailored to your question.',
    icon: Bot,
    href: '/generate',
    meta: 'Avg reply < 10s',
  },
  {
    title: 'Join onboarding clinic',
    description: 'Live Thursday sessions to get your workspace humming.',
    icon: Users,
    href: '/welcome',
    meta: 'Free 30-minute call',
  },
];

const supportChannels: SupportChannel[] = [
  {
    id: 'live-chat',
    name: 'Live chat',
    description: 'Real teammates and the AI co-pilot answer account or product questions.',
    icon: MessageCircle,
    response: '1–3 min response',
    availability: 'Mon–Fri · 8am–6pm MT',
    actionLabel: 'Open chat window',
    href: '#live-chat',
  },
  {
    id: 'email-desk',
    name: 'Email desk',
    description: 'Send a detailed note and we’ll follow up with steps, docs, or a quick video.',
    icon: Mail,
    response: 'Under 6 hours',
    availability: 'Every day · 7am–10pm MT',
    actionLabel: 'Email support@lernex.app',
    href: 'mailto:support@lernex.app',
  },
  {
    id: 'book-session',
    name: 'Schedule a walkthrough',
    description: 'Perfect for teams: get a 25-minute strategy call focused on your goals.',
    icon: CalendarClock,
    response: 'Pick a time that works',
    availability: 'Rolling availability · global time zones',
    actionLabel: 'Book a slot',
    href: '#book-session',
  },
  {
    id: 'voice-line',
    name: 'Voice line',
    description: 'Short urgent calls for outage reports or access issues that can’t wait.',
    icon: Headphones,
    response: 'Direct escalation',
    availability: 'Mon–Fri · 9am–5pm MT',
    actionLabel: 'Call +1 (866) 555-LEARN',
    href: 'tel:+18665555327',
  },
];

const statusItems: StatusItem[] = [
  {
    title: 'AI lesson generator',
    status: 'Operational',
    detail: 'Average generation time 1.1s · last incident 12 days ago',
    icon: Sparkles,
    tone: 'ok',
  },
  {
    title: 'Quiz engine',
    status: 'Operational',
    detail: 'Latency within expected range · monitoring new update',
    icon: CheckCircle2,
    tone: 'ok',
  },
  {
    title: 'Analytics dashboard',
    status: 'Minor delays',
    detail: 'Exports may take up to 10 minutes · fix shipping today',
    icon: AlertCircle,
    tone: 'warn',
  },
];

const faqs = [
  {
    question: 'How do I migrate my existing study notes into Lernex?',
    answer:
      'Head to the Playlists page, create a new playlist, and paste sections of your notes into lesson cards. The importer breaks long documents into micro-lessons automatically.',
  },
  {
    question: 'Can I share playlists or quizzes with my class or friends?',
    answer:
      'Yes — from any playlist, select “Share” and invite collaborators via email or a private link. You can set edit-only or review-only access per person.',
  },
  {
    question: 'What’s the difference between AI chat and live support?',
    answer:
      'The AI tutor is available instantly with contextual suggestions for study flows. Live chat puts you in touch with a teammate when you need account help or nuanced guidance.',
  },
  {
    question: 'Where can I see past invoices or update billing info?',
    answer:
      'Open Settings → Billing. You can download invoices, switch plans, and update payment methods without contacting support.',
  },
  {
    question: 'Do you offer support for educators or teams?',
    answer:
      'Absolutely. Book a walkthrough and we’ll co-design cohort structure, reporting, and custom integrations based on your goals.',
  },
];

const additionalResources: AdditionalResource[] = [
  {
    title: 'Creator best practices',
    description: 'Format lessons that shine on mobile and keep learners moving.',
    icon: PlayCircle,
    href: '/docs',
  },
  {
    title: 'Learning path templates',
    description: 'Kickstart with proven sequences for STEM, languages, or bootcamps.',
    icon: LifeBuoy,
    href: '/playlists',
  },
  {
    title: 'Release notes',
    description: 'See what shipped last week and what’s in beta now.',
    icon: ShieldCheck,
    href: '/analytics',
  },
];

const toneStyles: Record<Tone, { badge: string; iconWrap: string }> = {
  ok: {
    badge: 'bg-lernex-green/15 text-lernex-green',
    iconWrap: 'bg-lernex-green/10 text-lernex-green',
  },
  warn: {
    badge: 'bg-lernex-yellow/20 text-lernex-yellow',
    iconWrap: 'bg-lernex-yellow/10 text-lernex-yellow',
  },
};

export default function SupportPage() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const categories = useMemo(() => ['All', ...new Set(knowledgeArticles.map((item) => item.category))], []);

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return knowledgeArticles.filter((article) => {
      const matchesCategory = activeCategory === 'All' || article.category === activeCategory;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        article.title.toLowerCase().includes(normalizedQuery) ||
        article.summary.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [query, activeCategory]);

  return (
    <main className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-neutral-50 via-white to-neutral-100 text-neutral-900 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-900 dark:text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white/90 p-8 shadow-xl shadow-neutral-200/40 backdrop-blur-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-lernex-purple/10 px-3 py-1 text-sm font-medium text-lernex-purple dark:bg-lernex-purple/20">
                We’re here for you
                <ArrowUpRight className="h-4 w-4" />
              </span>
              <h1 className="mt-6 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
                Support that matches your learning pace.
              </h1>
              <p className="mt-4 max-w-xl text-lg text-neutral-600 dark:text-neutral-300">
                Find answers instantly, connect with a human, or co-create a plan for your team. The Lernex crew and AI
                co-pilot work together to keep you moving.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <Link
                  href="#contact"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-5 py-2.5 font-semibold text-white shadow-lg shadow-lernex-blue/40 transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lernex-purple"
                >
                  Talk to support
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
                >
                  Browse guides
                </Link>
              </div>
            </div>
            <div className="grid gap-4 rounded-2xl border border-neutral-200 bg-white/60 p-5 text-sm text-neutral-700 shadow-inner shadow-neutral-200/60 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-900 dark:text-white">Today’s queue</span>
                <span className="rounded-full bg-lernex-green/15 px-3 py-1 text-xs font-semibold text-lernex-green">
                  All clear
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-neutral-100 px-3 py-3 dark:bg-white/10">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Avg. first response
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">2m 14s</dd>
                </div>
                <div className="rounded-xl bg-neutral-100 px-3 py-3 dark:bg-white/10">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">CSAT (24h)</dt>
                  <dd className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">98%</dd>
                </div>
              </dl>
              <div className="flex items-center gap-3 rounded-xl bg-neutral-100 px-4 py-3 dark:bg-white/10">
                <HelpCircle className="h-12 w-12 text-lernex-purple" />
                <div>
                  <p className="font-semibold text-neutral-900 dark:text-white">Need priority help?</p>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    Flag the ticket as urgent and we’ll page the on-call specialist.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-6 md:grid-cols-3">
          {quickActions.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group relative flex h-full flex-col rounded-2xl border border-neutral-200 bg-white/90 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-lernex-purple/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lernex-purple dark:border-white/10 dark:bg-white/10"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-lernex-purple/10 text-lernex-purple transition group-hover:bg-lernex-purple group-hover:text-white">
                <item.icon className="h-6 w-6" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-neutral-900 dark:text-white">{item.title}</h2>
              <p className="mt-2 flex-1 text-sm text-neutral-600 transition group-hover:text-neutral-700 dark:text-neutral-300 dark:group-hover:text-neutral-200">
                {item.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 transition group-hover:text-lernex-purple dark:text-neutral-400">
                {item.meta}
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </section>

        <section className="mt-14 rounded-3xl border border-neutral-200 bg-white/90 p-8 shadow-sm dark:border-white/10 dark:bg-white/5" aria-labelledby="knowledge-heading">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 id="knowledge-heading" className="text-2xl font-semibold">
                Search the knowledge base
              </h2>
              <p className="mt-2 max-w-2xl text-neutral-600 dark:text-neutral-300">
                Filter by topic or type what you’re trying to solve. Results update instantly so you can keep learning
                without losing momentum.
              </p>
            </div>
            <div className="w-full max-w-md">
              <label htmlFor="support-search" className="sr-only">
                Search support articles
              </label>
              <div className="relative">
                <input
                  id="support-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search for playlists, billing, quiz tips..."
                  className="w-full rounded-full border border-neutral-200 bg-white/80 px-12 py-3 text-sm text-neutral-800 shadow-sm placeholder:text-neutral-400 focus:border-lernex-purple focus:outline-none focus:ring-2 focus:ring-lernex-purple/30 dark:border-white/10 dark:bg-white/10 dark:text-white dark:placeholder:text-neutral-500"
                />
                <Sparkles className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-lernex-purple" />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {categories.map((category) => {
              const isActive = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'border-lernex-purple bg-lernex-purple text-white'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-100 dark:border-white/10 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/15'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {filteredArticles.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-neutral-500 dark:border-white/10 dark:bg-white/10 dark:text-neutral-400">
                <p className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">Nothing yet.</p>
                <p className="mt-2 text-sm">
                  No matches for “{query}”. Try a different phrase or message us — we reply fast.
                </p>
              </div>
            ) : (
              filteredArticles.map((article) => (
                <Link
                  key={article.title}
                  href={article.href}
                  className="group flex flex-col rounded-2xl border border-neutral-200 bg-white/90 p-6 transition hover:-translate-y-1 hover:border-lernex-purple hover:shadow-lg hover:shadow-lernex-purple/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lernex-purple dark:border-white/10 dark:bg-white/10"
                >
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 group-hover:text-lernex-purple">
                    {article.category}
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-neutral-900 dark:text-white">{article.title}</h3>
                  <p className="mt-2 flex-1 text-sm text-neutral-600 dark:text-neutral-300">{article.summary}</p>
                </Link>
              ))
            )}
          </div>
        </section>

        <section id="system-status" className="mt-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">System status</h2>
              <p className="mt-2 text-neutral-600 dark:text-neutral-300">
                Real-time snapshots of the services powering Lernex. Subscribe via email to receive incident updates.
              </p>
            </div>
            <Link
              href="mailto:status@lernex.app"
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-lernex-purple hover:text-lernex-purple focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lernex-purple dark:border-white/10 dark:text-neutral-200"
            >
              Notify me
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {statusItems.map((item) => (
              <div
                key={item.title}
                className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/10"
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneStyles[item.tone].iconWrap}`}>
                    <item.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{item.title}</p>
                    <p
                      className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${toneStyles[item.tone].badge}`}
                    >
                      {item.status}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="contact" className="mt-14 rounded-3xl border border-neutral-200 bg-white/95 p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Connect with the support team</h2>
              <p className="mt-2 text-neutral-600 dark:text-neutral-300">
                Choose the channel that fits your style. We track every message so you don’t have to repeat yourself.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-lernex-blue/10 px-4 py-2 text-sm font-semibold text-lernex-blue dark:bg-lernex-blue/20">
              24/7 coverage for premium plans
            </span>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {supportChannels.map((channel) => (
              <a
                key={channel.name}
                id={channel.id}
                href={channel.href}
                className="group flex h-full flex-col justify-between rounded-2xl border border-neutral-200 bg-white/90 p-6 transition hover:-translate-y-1 hover:border-lernex-purple hover:shadow-lg hover:shadow-lernex-purple/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lernex-purple dark:border-white/10 dark:bg-white/10"
              >
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-lernex-blue/10 text-lernex-blue transition group-hover:bg-lernex-purple group-hover:text-white">
                    <channel.icon className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">{channel.name}</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-300">{channel.availability}</p>
                  </div>
                </div>
                <p className="mt-4 flex-1 text-sm text-neutral-600 dark:text-neutral-300">{channel.description}</p>
                <div className="mt-6 flex items-center justify-between text-sm">
                  <span className="font-semibold text-neutral-900 dark:text-white">{channel.actionLabel}</span>
                  <span className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-400 group-hover:text-lernex-purple">
                    {channel.response}
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-14 grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="rounded-3xl border border-neutral-200 bg-white/95 p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
            <h2 className="text-2xl font-semibold">Popular questions</h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-300">
              Still exploring? These answers cover the moments most learners ask about.
            </p>
            <div className="mt-6 space-y-4">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group rounded-2xl border border-neutral-200 bg-white/90 p-4 transition hover:border-lernex-purple focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lernex-purple dark:border-white/10 dark:bg-white/10"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 text-left text-sm font-semibold text-neutral-900 marker:hidden dark:text-white">
                    {faq.question}
                    <ArrowUpRight className="h-4 w-4 text-neutral-300 transition group-open:rotate-45 group-open:text-lernex-purple" />
                  </summary>
                  <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4 rounded-3xl border border-neutral-200 bg-white/95 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">More ways to level up</h3>
            {additionalResources.map((resource) => (
              <Link
                key={resource.title}
                href={resource.href}
                className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white/90 p-4 transition hover:-translate-y-1 hover:border-lernex-purple hover:shadow-md hover:shadow-lernex-purple/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lernex-purple dark:border-white/10 dark:bg-white/10"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-lernex-purple/10 text-lernex-purple transition group-hover:bg-lernex-purple group-hover:text-white">
                  <resource.icon className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-semibold text-neutral-900 dark:text-white">{resource.title}</p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">{resource.description}</p>
                </div>
                <ArrowUpRight className="ml-auto h-5 w-5 text-neutral-300 transition group-hover:text-white" />
              </Link>
            ))}
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-white/10 dark:bg-white/10 dark:text-neutral-300">
              Can’t find what you need? Drop a note to{' '}
              <a href="mailto:community@lernex.app" className="font-semibold text-lernex-purple hover:underline">
                community@lernex.app
              </a>{' '}
              and we’ll add a guide within 48 hours.
            </div>
          </div>
        </section>

        <section className="mt-14 rounded-3xl border border-neutral-200 bg-white/95 p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Share feedback</h2>
              <p className="mt-2 max-w-2xl text-neutral-600 dark:text-neutral-300">
                Every idea helps shape Lernex. Send a quick note, request a feature, or report a bug — the product team
                reads everything.
              </p>
            </div>
            <a
              href="mailto:feedback@lernex.app"
              className="inline-flex items-center gap-2 rounded-full bg-lernex-purple px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-lernex-purple/30 transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lernex-purple"
            >
              Email feedback@lernex.app
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white/90 p-5 dark:border-white/10 dark:bg-white/10">
              <LifeBuoy className="mt-1 h-5 w-5 text-lernex-blue" />
              <div>
                <p className="font-semibold text-neutral-900 dark:text-white">Report a bug</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  Include steps, screenshots if you can, and we’ll triage immediately.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white/90 p-5 dark:border-white/10 dark:bg-white/10">
              <Sparkles className="mt-1 h-5 w-5 text-lernex-purple" />
              <div>
                <p className="font-semibold text-neutral-900 dark:text-white">Request a feature</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  Tell us the outcome you’re chasing — we’ll reply with possible workarounds.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white/90 p-5 dark:border-white/10 dark:bg-white/10">
              <ShieldCheck className="mt-1 h-5 w-5 text-lernex-green" />
              <div>
                <p className="font-semibold text-neutral-900 dark:text-white">Security hotline</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  Spot something suspicious? Email security@lernex.app for a priority review.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
