'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  Flame,
  Headphones,
  HelpCircle,
  LifeBuoy,
  Loader2,
  Mail,
  MessageCircle,
  PlayCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useProfileStats } from '@/app/providers/ProfileStatsProvider';
import FormattedText from '@/components/FormattedText';
import VoiceInput from '@/components/VoiceInput';

const SUPPORT_EMAIL = 'support@lernex.net';

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

type AttemptRow = {
  subject: string;
  correctCount: number;
  total: number;
  createdAt: string | null;
};

type SupportAnalytics = {
  totalAttempts: number;
  weeklyAttempts: number;
  activeDays: number;
  avgAccuracy: number | null;
  topSubject: string | null;
  lastAttemptAt: string | null;
  streak: number;
  points: number;
};

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

type ChatPayloadMessage = {
  role: ChatRole;
  content: string;
};

const knowledgeArticles: KnowledgeArticle[] = [
  {
    title: 'Kick off with Lernex in 5 steps',
    summary: 'Set up your profile, pick subjects, and personalise the For You feed so recommendations stay on target.',
    category: 'Getting Started',
    href: '/onboarding',
  },
  {
    title: 'Tune your For You feed',
    summary: 'Use reactions, streak goals, and playlists to signal what you like and sharpen daily lesson suggestions.',
    category: 'Personalisation',
    href: '/fyp',
  },
  {
    title: 'Unlock achievements faster',
    summary: 'Track streaks, badge progress, and perfect scores so you know exactly what to tackle next.',
    category: 'Achievements',
    href: '/achievements',
  },
  {
    title: 'Track accuracy with analytics',
    summary: 'Use the analytics dashboard to monitor correctness, lesson pace, and AI token usage in one view.',
    category: 'Analytics',
    href: '/analytics',
  },
  {
    title: 'Generate lessons with the AI tutor',
    summary: 'Turn study text into lessons, quizzes, and practice plans with the Cerebras GPT-OSS-120B powered generator.',
    category: 'AI Assistant',
    href: '/generate',
  },
  {
    title: 'Manage billing and plans',
    summary: 'Update payment details, view invoices, or switch tiers when your team is ready to scale.',
    category: 'Account & Billing',
    href: '/pricing',
  },
];

const quickActions: QuickAction[] = [
  {
    title: 'Search the help centre',
    description: 'Browse setup guides, walkthroughs, and video tutorials in one place.',
    icon: BookOpen,
    href: '/docs',
    meta: 'Fresh articles every week',
  },
  {
    title: 'Review analytics',
    description: 'Check streaks, accuracy trends, and AI usage for the last 30 days.',
    icon: Target,
    href: '/analytics',
    meta: 'Updated in real time',
  },
  {
    title: 'Join onboarding clinic',
    description: 'Thursday sessions where we co-create lesson plans and playlists with you.',
    icon: Users,
    href: '/welcome',
    meta: '25 minute group call',
  },
];

const supportChannels: SupportChannel[] = [
  {
    id: 'live-chat',
    name: 'Live chat',
    description: 'Chat with a Lernex specialist and our AI co-pilot for quick workflow fixes or product questions.',
    icon: MessageCircle,
    response: 'Replies in 1-2 minutes',
    availability: 'Mon-Fri 8am-6pm MT',
    actionLabel: 'Open support chat',
    href: '#live-chat',
  },
  {
    id: 'email-desk',
    name: 'Email desk',
    description: 'Share details, screenshots, or CSVs and we will reply with steps, docs, or a short Loom video.',
    icon: Mail,
    response: 'Under 4 hours',
    availability: 'Every day 7am-10pm MT',
    actionLabel: `Email ${SUPPORT_EMAIL}`,
    href: `mailto:${SUPPORT_EMAIL}`,
  },
  {
    id: 'book-session',
    name: 'Schedule a walkthrough',
    description: 'Perfect for teams. We tailor a 25 minute call to help map analytics, playlists, and cohort pacing.',
    icon: CalendarClock,
    response: 'Pick a slot that works',
    availability: 'Rolling availability across time zones',
    actionLabel: 'Book a session',
    href: '#book-session',
  },
  {
    id: 'voice-line',
    name: 'Voice line',
    description: 'Escalate urgent access or outage issues that need human attention right away.',
    icon: Headphones,
    response: 'Direct escalation',
    availability: 'Mon-Fri 9am-5pm MT',
    actionLabel: 'Call +1 (866) 555-LEARN',
    href: 'tel:+18665555327',
  },
];

const faqs = [
  {
    question: 'How do I migrate my existing study notes into Lernex?',
    answer:
      'Navigate to the Generate page and paste up to two short paragraphs at a time. The AI tutor converts them into structured lessons and quizzes, so you can rebuild your library rapidly.',
  },
  {
    question: 'Where can I check detailed quiz analytics?',
    answer:
      'Head to Analytics for accuracy, streak, and token insights. Achievements highlights badge progress and perfect streaks, while Playlists shows subject-level mastery.',
  },
  {
    question: 'Can I collaborate with friends or classmates?',
    answer:
      'Yes. Use the Friends page to connect, share playlists, and track leaderboard standings. Support can add cohort templates or bulk import contacts if you need it.',
  },
  {
    question: 'What models power the AI tutor?',
    answer:
      'Lernex uses Cerebras GPT-OSS-120B for lesson and chat generation. Check the Generate page for modes and token usage; the Support team can advise on optimisation.',
  },
  {
    question: 'Do you support educators and teams?',
    answer:
      'Absolutely. Email support or book a walkthrough to configure analytics exports, advanced permissions, and shared playlists for your organisation.',
  },
];

const additionalResources: AdditionalResource[] = [
  {
    title: 'Achievement roadmap',
    description: 'See which badges are within reach and claim new rewards faster.',
    icon: PlayCircle,
    href: '/achievements',
  },
  {
    title: 'Friends and leaderboard',
    description: 'Invite classmates, compare streaks, and celebrate wins together.',
    icon: LifeBuoy,
    href: '/friends',
  },
  {
    title: 'Release notes',
    description: 'Catch up on the latest features, fixes, and beta experiments.',
    icon: ShieldCheck,
    href: '/analytics',
  },
];

const toneStyles: Record<Tone, { badge: string; iconWrap: string }> = {
  ok: {
    badge: 'bg-lernex-green/15 text-lernex-green dark:bg-lernex-green/25 dark:text-lernex-green',
    iconWrap: 'bg-lernex-green/10 text-lernex-green dark:bg-lernex-green/20 dark:text-lernex-green',
  },
  warn: {
    badge: 'bg-lernex-yellow/20 text-lernex-yellow dark:bg-lernex-yellow/25 dark:text-lernex-yellow',
    iconWrap: 'bg-lernex-yellow/10 text-lernex-yellow dark:bg-lernex-yellow/20 dark:text-lernex-yellow',
  },
};

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function safeString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function normalizeAttempt(row: Record<string, unknown>): AttemptRow {
  const subject = safeString(row['subject']) ?? 'General';
  const correctRaw = Number(row['correct_count'] ?? row['correctCount'] ?? 0);
  const totalRaw = Number(row['total'] ?? 0);
  const createdAtRaw = safeString(row['created_at'] ?? row['createdAt']);
  return {
    subject,
    correctCount: Number.isFinite(correctRaw) ? Math.max(0, Math.round(correctRaw)) : 0,
    total: Number.isFinite(totalRaw) ? Math.max(0, Math.round(totalRaw)) : 0,
    createdAt: createdAtRaw,
  };
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatPercent(value: number | null, fractionDigits = 1): string {
  if (value == null || Number.isNaN(value)) return '--';
  const percent = (value * 100).toFixed(fractionDigits);
  return `${percent.replace(/\.0+$/, '')}%`;
}

function computeDaysSince(iso: string | null): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  return days < 0 ? 0 : days;
}

function formatRelativeDate(iso: string | null): string {
  const days = computeDaysSince(iso);
  if (days == null) return 'No activity yet';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (!iso) return 'No activity yet';
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : 'Recently';
}

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}

function SupportChat({ context }: { context: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: createId('assistant'),
      role: 'assistant',
      content: `Hi! I am the Lernex support assistant. Ask me about lessons, analytics, or billing. You can email us any time at ${SUPPORT_EMAIL}.`,
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const userMessage: ChatMessage = {
      id: createId('user'),
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const payload: { messages: ChatPayloadMessage[]; context: string } = {
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        context,
      };

      const response = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as { reply?: string };
      const replyContent =
        typeof data.reply === 'string' && data.reply.trim().length > 0
          ? data.reply.trim()
          : 'I am here to help. Could you try asking that another way?';

      setMessages((prev) => [
        ...prev,
        { id: createId('assistant'), role: 'assistant', content: replyContent, createdAt: Date.now() },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to contact the support assistant.';
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: createId('assistant'),
          role: 'assistant',
          content: `I could not reach the chat service. Please email us at ${SUPPORT_EMAIL} and we will jump in.`,
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [context, input, messages, sending]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      void sendMessage();
    },
    [sendMessage],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage],
  );

  return (
    <div className="flex h-full flex-col rounded-3xl border border-neutral-200 bg-white/95 p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Live support chat</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Powered by Cerebras GPT-OSS-120B. We hand off to a human whenever you ask.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-lernex-blue/15 px-3 py-1 text-xs font-semibold text-lernex-blue dark:bg-lernex-blue/25">
          Avg reply &lt; 2 min
        </span>
      </div>

      {context ? (
        <div className="mt-4 rounded-2xl bg-neutral-100/70 p-3 text-xs text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
          <span className="font-semibold text-neutral-800 dark:text-white">Context for the assistant:</span>{' '}
          {context}
        </div>
      ) : null}

      <div ref={listRef} className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-2xl bg-neutral-50/70 p-4 dark:bg-white/10">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
              message.role === 'assistant'
                ? 'bg-white text-neutral-800 shadow-sm dark:bg-white/20 dark:text-neutral-100'
                : 'ml-auto bg-lernex-purple text-white shadow-sm'
            }`}
          >
            <div className="block whitespace-pre-wrap">
              <FormattedText text={message.content} />
            </div>
          </div>
        ))}
      </div>

      {error ? <p className="mt-3 text-xs text-red-500 dark:text-red-400">Error: {error}</p> : null}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="relative">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about playlists, analytics, billing, or anything else..."
            rows={3}
            className="w-full resize-none rounded-2xl border border-neutral-200 bg-white px-4 py-3 pr-14 text-sm text-neutral-800 shadow-sm outline-none focus:border-lernex-purple focus:ring-2 focus:ring-lernex-purple/30 dark:border-white/10 dark:bg-white/10 dark:text-white"
          />
          <div className="absolute bottom-2 right-2">
            <VoiceInput
              onTranscription={(transcribedText) => {
                setInput((prev) => (prev ? prev + " " + transcribedText : transcribedText));
              }}
              size="md"
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span>Enter to send / Shift+Enter for a new line</span>
          <button
            type="submit"
            disabled={sending || input.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function SupportPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { stats, user, loading: statsLoading } = useProfileStats();

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  const userId = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setAttempts([]);
      setAttemptsError(null);
      setAttemptsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function loadAttempts() {
      setAttemptsLoading(true);
      setAttemptsError(null);
      try {
        // userId is guaranteed to be non-null here due to early return check above
        const { data, error } = await supabase
          .from('attempts')
          .select('subject, correct_count, total, created_at')
          .eq('user_id', userId as string)
          .order('created_at', { ascending: false })
          .limit(200);

        if (cancelled) return;
        if (error) throw error;

        const normalized = (data ?? []).map((row) => normalizeAttempt(row as Record<string, unknown>));
        setAttempts(normalized);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to load analytics.';
        setAttempts([]);
        setAttemptsError(message);
      } finally {
        if (!cancelled) setAttemptsLoading(false);
      }
    }

    loadAttempts();

    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const analytics = useMemo<SupportAnalytics>(() => {
    const lastStudy = stats?.lastStudyDate ?? null;

    if (attempts.length === 0) {
      return {
        totalAttempts: 0,
        weeklyAttempts: 0,
        activeDays: 0,
        avgAccuracy: null,
        topSubject: null,
        lastAttemptAt: lastStudy,
        streak: stats?.streak ?? 0,
        points: stats?.points ?? 0,
      };
    }

    const now = Date.now();
    const weekThreshold = now - 7 * 24 * 60 * 60 * 1000;
    const dayKeys = new Set<string>();
    const subjectCounts = new Map<string, { attempts: number; correct: number; total: number }>();
    let weeklyAttempts = 0;
    let totalCorrect = 0;
    let totalQuestions = 0;
    let latestTimestamp = 0;
    let latestIso: string | null = null;

    for (const attempt of attempts) {
      const createdAtMs = attempt.createdAt ? Date.parse(attempt.createdAt) : NaN;
      if (Number.isFinite(createdAtMs)) {
        if (createdAtMs >= weekThreshold) {
          weeklyAttempts += 1;
          const dayKey = new Date(createdAtMs).toISOString().slice(0, 10);
          dayKeys.add(dayKey);
        }
        if (createdAtMs > latestTimestamp) {
          latestTimestamp = createdAtMs;
          latestIso = attempt.createdAt;
        }
      }

      const entry = subjectCounts.get(attempt.subject) ?? { attempts: 0, correct: 0, total: 0 };
      entry.attempts += 1;
      entry.correct += attempt.correctCount;
      entry.total += attempt.total;
      subjectCounts.set(attempt.subject, entry);

      totalCorrect += attempt.correctCount;
      totalQuestions += attempt.total;
    }

    let topSubject: string | null = null;
    let bestCount = -1;
    for (const [subject, entry] of subjectCounts.entries()) {
      if (entry.attempts > bestCount) {
        bestCount = entry.attempts;
        topSubject = subject;
      }
    }

    return {
      totalAttempts: attempts.length,
      weeklyAttempts,
      activeDays: dayKeys.size,
      avgAccuracy: totalQuestions > 0 ? totalCorrect / totalQuestions : null,
      topSubject,
      lastAttemptAt: latestIso ?? lastStudy,
      streak: stats?.streak ?? 0,
      points: stats?.points ?? 0,
    };
  }, [attempts, stats]);

  const statusItems = useMemo<StatusItem[]>(() => {
    const daysSince = computeDaysSince(analytics.lastAttemptAt);
    const weeklyTone: Tone = analytics.weeklyAttempts > 0 ? 'ok' : 'warn';
    const accuracyTone: Tone =
      analytics.avgAccuracy != null && analytics.avgAccuracy >= 0.6 ? 'ok' : analytics.avgAccuracy == null ? 'warn' : 'warn';
    const streakTone: Tone =
      analytics.streak > 0 && (daysSince === null || daysSince <= 1) ? 'ok' : analytics.streak > 0 ? 'warn' : 'warn';

    return [
      {
        title: 'Session momentum',
        status:
          analytics.weeklyAttempts > 0
            ? `${formatNumber(analytics.weeklyAttempts)} lesson${analytics.weeklyAttempts === 1 ? '' : 's'} this week`
            : 'No sessions logged this week yet',
        detail:
          analytics.activeDays > 0
            ? `${formatNumber(analytics.activeDays)} active day${analytics.activeDays === 1 ? '' : 's'} in the past 7 days.`
            : 'Launch a quick lesson from your For You feed to start a new streak.',
        icon: Activity,
        tone: weeklyTone,
      },
      {
        title: 'Quiz accuracy',
        status:
          analytics.avgAccuracy != null
            ? `${formatPercent(analytics.avgAccuracy, analytics.avgAccuracy >= 0.95 ? 0 : 1)} correct`
            : 'Need more quiz attempts',
        detail:
          analytics.totalAttempts > 0
            ? `Based on ${formatNumber(analytics.totalAttempts)} completed quiz attempts.`
            : 'Complete a quiz to unlock accuracy tracking.',
        icon: Target,
        tone: accuracyTone,
      },
      {
        title: 'Streak health',
        status:
          analytics.streak > 0
            ? `${formatNumber(analytics.streak)} day streak`
            : 'No active streak yet',
        detail:
          daysSince == null
            ? 'We will highlight your last session once you complete one.'
            : daysSince <= 1
            ? 'Last activity was today or yesterday.'
            : `Last activity ${daysSince} days ago. A short lesson will restart momentum.`,
        icon: Flame,
        tone: streakTone,
      },
    ];
  }, [analytics]);

  const metrics = useMemo(
    () => [
      {
        label: 'Points earned',
        value: statsLoading ? 'Loading...' : formatNumber(analytics.points),
      },
      {
        label: 'Lessons this week',
        value: attemptsLoading ? 'Loading...' : formatNumber(analytics.weeklyAttempts),
      },
      {
        label: 'Average accuracy',
        value: attemptsLoading ? 'Loading...' : formatPercent(analytics.avgAccuracy),
      },
      {
        label: 'Focus subject',
        value: attemptsLoading ? 'Loading...' : analytics.topSubject ?? 'Not set yet',
      },
    ],
    [analytics.avgAccuracy, analytics.points, analytics.topSubject, analytics.weeklyAttempts, attemptsLoading, statsLoading],
  );

  const contextSummary = useMemo(() => {
    const parts: string[] = [];
    if (analytics.topSubject) {
      parts.push(`Top subject: ${analytics.topSubject}`);
    }
    if (analytics.avgAccuracy != null) {
      parts.push(`Average accuracy ${formatPercent(analytics.avgAccuracy)}`);
    }
    if (analytics.weeklyAttempts > 0) {
      parts.push(`${formatNumber(analytics.weeklyAttempts)} lessons this week`);
    }
    if (analytics.streak > 0) {
      parts.push(`Streak ${formatNumber(analytics.streak)} day${analytics.streak === 1 ? '' : 's'}`);
    }
    if (analytics.points > 0) {
      parts.push(`${formatNumber(analytics.points)} total points`);
    }
    if (analytics.lastAttemptAt) {
      parts.push(`Last activity ${formatRelativeDate(analytics.lastAttemptAt)}`);
    }
    if (!parts.length && (attemptsLoading || statsLoading)) {
      return 'Loading learner analytics...';
    }
    return parts.join(' | ');
  }, [
    analytics.avgAccuracy,
    analytics.lastAttemptAt,
    analytics.points,
    analytics.streak,
    analytics.topSubject,
    analytics.weeklyAttempts,
    attemptsLoading,
    statsLoading,
  ]);

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
    <main className="min-h-[calc(100vh-56px)] text-neutral-900 dark:text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white/90 p-8 shadow-xl shadow-neutral-200/40 backdrop-blur-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-lernex-purple/10 px-3 py-1 text-sm font-medium text-lernex-purple dark:bg-lernex-purple/25 dark:text-lernex-purple">
                We are here for you
                <ArrowUpRight className="h-4 w-4" />
              </span>
              <h1 className="mt-6 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
                Support that keeps pace with your learning.
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-neutral-600 dark:text-neutral-300">
                Find answers instantly, connect with a human, or co-create a plan for your team. Lernex support combines
                rich analytics, personalised achievements, and the Cerebras-powered AI tutor so you never lose momentum.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <Link
                  href="#contact"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-5 py-2.5 font-semibold text-white shadow-lg shadow-lernex-blue/40 transition hover:opacity-90 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-lernex-purple"
                >
                  Talk to support
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link
                  href="#live-chat"
                  className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-white/15 dark:text-white dark:hover:bg-white/10"
                >
                  Start live chat
                </Link>
              </div>
            </div>
            <div className="grid gap-4 rounded-2xl border border-neutral-200 bg-white/70 p-5 text-sm text-neutral-700 shadow-inner shadow-neutral-200/60 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-900 dark:text-white">Your support snapshot</span>
                {(attemptsLoading || statsLoading) && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
              </div>
              {attemptsError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200">
                  We could not load analytics right now. The team has been notified.
                </p>
              ) : (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {metrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-xl border border-neutral-100 bg-white/80 px-3 py-2 shadow-sm dark:border-white/10 dark:bg-white/10"
                    >
                      <dt className="text-xs uppercase tracking-wide text-neutral-400 dark:text-neutral-400">{metric.label}</dt>
                      <dd className="mt-1 text-base font-semibold text-neutral-900 dark:text-white">{metric.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="rounded-xl bg-neutral-100/70 px-3 py-2 text-xs text-neutral-500 dark:bg-white/10 dark:text-neutral-300">
                Last activity: {formatRelativeDate(analytics.lastAttemptAt)}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group flex h-full flex-col gap-4 rounded-3xl border border-neutral-200 bg-white/95 p-6 shadow-sm transition hover:-translate-y-1 hover:border-lernex-purple hover:shadow-lg hover:shadow-lernex-purple/10 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-lernex-purple dark:border-white/10 dark:bg-white/5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-lernex-purple/10 text-lernex-purple transition group-hover:bg-lernex-purple group-hover:text-white dark:bg-lernex-purple/20 dark:text-lernex-purple">
                <item.icon className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{item.title}</h2>
                <p className="mt-2 flex-1 text-sm text-neutral-600 transition group-hover:text-neutral-700 dark:text-neutral-300 dark:group-hover:text-neutral-200">
                  {item.description}
                </p>
              </div>
              <span className="mt-auto inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 transition group-hover:text-lernex-purple dark:text-neutral-400">
                {item.meta}
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </section>

        <section className="mt-12 rounded-3xl border border-neutral-200 bg-white/95 p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Support insights</h2>
              <p className="mt-2 max-w-2xl text-neutral-600 dark:text-neutral-300">
                We pull real data from your recent lessons, streaks, and achievements. Use it to decide whether to reach
                for analytics, achievements, or the live chat.
              </p>
            </div>
            <Link
              href="/analytics"
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
            >
              Open analytics
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {statusItems.map((item) => {
              const tone = toneStyles[item.tone];
              return (
                <div
                  key={item.title}
                  className="flex h-full flex-col gap-4 rounded-3xl border border-neutral-200 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone.iconWrap}`}>
                      <item.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tone.badge}`}>
                        {item.status}
                      </span>
                      <h3 className="mt-2 text-base font-semibold text-neutral-900 dark:text-white">{item.title}</h3>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </section>
        <section id="contact" className="mt-12 grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-3xl border border-neutral-200 bg-white/95 p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold">Connect with the support team</h2>
              <p className="text-neutral-600 dark:text-neutral-300">
                We aim to respond fast and bring the right context. Pick the option that matches your question and we will
                take it from there.
              </p>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {supportChannels.map((channel) => (
                <a
                  key={channel.id}
                  href={channel.href}
                  className="group flex h-full flex-col rounded-3xl border border-neutral-200 bg-white/90 p-5 transition hover:-translate-y-1 hover:border-lernex-purple hover:shadow-lg hover:shadow-lernex-purple/10 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-lernex-purple dark:border-white/10 dark:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lernex-purple/10 text-lernex-purple transition group-hover:bg-lernex-purple group-hover:text-white dark:bg-lernex-purple/20 dark:text-lernex-purple">
                      <channel.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">{channel.name}</h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-300">{channel.availability}</p>
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
          </div>
          <div id="live-chat" className="h-full min-h-[420px]">
            <SupportChat context={contextSummary || 'No recent analytics yet. Encourage the learner to start a lesson.'} />
          </div>
        </section>
        <section className="mt-14 rounded-3xl border border-neutral-200 bg-white/90 p-8 shadow-sm dark:border-white/10 dark:bg-white/5" aria-labelledby="knowledge-heading">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 id="knowledge-heading" className="text-2xl font-semibold">
                Search the knowledge base
              </h2>
              <p className="mt-2 max-w-2xl text-neutral-600 dark:text-neutral-300">
                Filter by topic or type what you are trying to solve. Results update instantly so you can keep learning
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
              <div className="col-span-full flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-neutral-500 dark:border-white/10 dark:bg-white/10 dark:text-neutral-400">
                <HelpCircle className="h-6 w-6 text-neutral-300 dark:text-neutral-500" />
                <p className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">No matches yet.</p>
                <p className="text-sm">
                  No results for &quot;{query}&quot;. Try a different phrase or open the live chat and we will point you in the right direction.
                </p>
              </div>
            ) : (
              filteredArticles.map((article) => (
                <Link
                  key={article.title}
                  href={article.href}
                  className="group flex h-full flex-col gap-3 rounded-3xl border border-neutral-200 bg-white/90 p-6 transition hover:-translate-y-1 hover:border-lernex-purple hover:shadow-lg hover:shadow-lernex-purple/10 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-lernex-purple dark:border-white/10 dark:bg-white/10"
                >
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 transition group-hover:text-lernex-purple dark:text-neutral-400">
                    {article.category}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-lg font-semibold text-neutral-900 transition group-hover:text-lernex-purple dark:text-white">
                    {article.title}
                  </h3>
                  <p className="text-sm text-neutral-600 transition group-hover:text-neutral-700 dark:text-neutral-300 dark:group-hover:text-neutral-200">
                    {article.summary}
                  </p>
                </Link>
              ))
            )}
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
                  className="group rounded-2xl border border-neutral-200 bg-white/90 p-4 transition hover:border-lernex-purple focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-lernex-purple dark:border-white/10 dark:bg-white/10"
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
                className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white/90 p-4 transition hover:-translate-y-1 hover:border-lernex-purple hover:shadow-md hover:shadow-lernex-purple/10 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-lernex-purple dark:border-white/10 dark:bg-white/10"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-lernex-purple/10 text-lernex-purple transition group-hover:bg-lernex-purple group-hover:text-white dark:bg-lernex-purple/25 dark:text-lernex-purple">
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
              Cannot find what you need? Drop a note to{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-lernex-purple hover:underline">
                {SUPPORT_EMAIL}
              </a>{' '}
              and we will add a guide within two days.
            </div>
          </div>
        </section>
        <section className="mt-14 rounded-3xl border border-neutral-200 bg-white/95 p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Share feedback</h2>
              <p className="mt-2 max-w-2xl text-neutral-600 dark:text-neutral-300">
                Every idea helps shape Lernex. Send a quick note, request a feature, or report a bug - the product team
                reads everything.
              </p>
            </div>
            <a
              href="mailto:feedback@lernex.app"
              className="inline-flex items-center gap-2 rounded-full bg-lernex-purple px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-lernex-purple/30 transition hover:opacity-90 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-lernex-purple"
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
                  Include steps and screenshots if you can, and we will triage immediately.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white/90 p-5 dark:border-white/10 dark:bg-white/10">
              <Sparkles className="mt-1 h-5 w-5 text-lernex-purple" />
              <div>
                <p className="font-semibold text-neutral-900 dark:text-white">Request a feature</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  Tell us the outcome you are chasing - we will reply with ideas or workarounds.
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

