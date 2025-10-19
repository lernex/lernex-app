import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { take } from '@/lib/rate';
import { checkUsageLimit, logUsage } from '@/lib/usage';
import type { Database } from '@/lib/types_db';
import { rankSupportKnowledge, type SupportKnowledgeEntry } from '@/lib/support-knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORT_MODEL = process.env.CEREBRAS_SUPPORT_MODEL ?? 'gpt-oss-120b';
const SUPPORT_TEMPERATURE = Number(process.env.CEREBRAS_SUPPORT_TEMPERATURE ?? '0.35');
const SUPPORT_MAX_TOKENS = Number(process.env.CEREBRAS_SUPPORT_MAX_TOKENS ?? '768');
const CEREBRAS_BASE_URL = process.env.CEREBRAS_BASE_URL ?? 'https://api.cerebras.ai/v1';
const SUPPORT_EMAIL = 'support@lernex.net';
const WEBSITE_CONTEXT = [
  'Lernex overview:',
  '- Lernex combines adaptive lessons, analytics, achievements, playlists, leaderboards, and social learning in one workspace.',
  '',
  'Navigation highlights:',
  '- /fyp - For You feed with daily micro-lessons, reaction controls (Like, Skip, Save), streak target tiles, and next-topic hints.',
  '- /generate - Convert up to two short paragraphs into one 80-105 word lesson plus three MCQs powered by Cerebras GPT-OSS-120B; choose subject and difficulty and optionally add a next-topic hint.',
  '- /analytics - Dashboards for total attempts, weekly activity, streak momentum, accuracy trends, AI token usage, and subject insights (mastery, difficulty, next topic).',
  '- /achievements - Badge groups (Progress, Momentum, Precision, Explorer, Weekly, Lifetime, Legendary) with Bronze->Mythic tiers and roadmap cards.',
  '- /playlists - Create private/public lesson sets, reorder lessons, invite collaborators as viewers/moderators, and share links.',
  '- /friends and /leaderboard - Manage friend requests, view shared activity, and compare streaks and points.',
  '- /pricing - Manage billing, plan tiers, and invoices.',
  '',
  'Support surfaces:',
  `- /support - Quick actions to /docs, /analytics, and the onboarding clinic at /welcome. Live chat replies in 1-2 minutes (Mon-Fri 8a-6p MT), email ${SUPPORT_EMAIL} replies within ~4 hours daily, walkthrough bookings offer 25-minute cohort calls, and +1 (866) 555-LEARN handles urgent access issues.`,
  '- /docs - Help centre with weekly refreshed guides and tutorials.',
  '- /welcome - Thursday 25 minute onboarding clinic sign-up.',
].join('\n');

type ChatRole = 'user' | 'assistant';

type ChatPayloadMessage = {
  role: ChatRole;
  content: string;
};

function sanitizeMessages(input: unknown): ChatPayloadMessage[] {
  if (!Array.isArray(input)) return [];
  const result: ChatPayloadMessage[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const role = (entry as { role?: unknown }).role;
    const content = (entry as { content?: unknown }).content;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') continue;
    const trimmed = content.trim();
    if (trimmed.length === 0) continue;
    result.push({ role, content: trimmed.slice(0, 2000) });
  }
  return result.slice(-12);
}

const integerFormatter = new Intl.NumberFormat('en-US');
const percentFormatter = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

type AttemptRow = {
  subject: string;
  correctCount: number;
  total: number;
  createdAt: string | null;
};

type LearnerAnalytics = {
  totalAttempts: number;
  weeklyAttempts: number;
  activeDays: number;
  avgAccuracy: number | null;
  topSubject: string | null;
  lastAttemptAt: string | null;
  streak: number;
  points: number;
  lastStudyDate: string | null;
};

type SubjectState = {
  subject: string | null;
  course: string | null;
  mastery: number | null;
  difficulty: string | null;
  nextTopic: string | null;
  updatedAt: string | null;
};

type LearnerContext = {
  profile: {
    fullName: string | null;
    username: string | null;
    isPremium: boolean | null;
    interests: string[] | null;
    streak: number | null;
    points: number | null;
    lastStudyDate: string | null;
    createdAt: string | null;
  } | null;
  analytics: LearnerAnalytics | null;
  subjects: SubjectState[];
};

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

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp01(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function formatNumber(value: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return integerFormatter.format(Math.round(value));
}

function formatPercent(value: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return percentFormatter.format(value);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatAbsoluteDate(value: string | null): string | null {
  const parsed = parseDate(value);
  return parsed ? dateFormatter.format(parsed) : null;
}

function formatRelativeDays(value: string | null): string | null {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const now = Date.now();
  const diff = now - parsed.getTime();
  const dayMs = 86_400_000;
  const days = Math.floor(diff / dayMs);
  if (Number.isNaN(days)) return null;
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return dateFormatter.format(parsed);
}

function normalizeAttempt(row: Record<string, unknown>): AttemptRow {
  const subject = safeString(row['subject']) ?? 'General';
  const correctRaw = toNumber(row['correct_count'] ?? row['correctCount']) ?? 0;
  const totalRaw = toNumber(row['total']) ?? 0;
  const createdAt = safeString(row['created_at'] ?? row['createdAt']);
  return {
    subject,
    correctCount: Math.max(0, Math.round(correctRaw)),
    total: Math.max(0, Math.round(totalRaw)),
    createdAt,
  };
}

function computeAnalytics(
  attempts: AttemptRow[],
  streak: number | null,
  points: number | null,
  lastStudyDate: string | null,
): LearnerAnalytics {
  const now = Date.now();
  const weekThreshold = now - 7 * 86_400_000;
  const dayKeys = new Set<string>();
  const subjectCounts = new Map<string, { attempts: number; correct: number; total: number }>();
  let weeklyAttempts = 0;
  let totalCorrect = 0;
  let totalQuestions = 0;
  let latestTimestamp = 0;
  let latestIso: string | null = null;

  for (const attempt of attempts) {
    totalCorrect += attempt.correctCount;
    totalQuestions += attempt.total;

    const createdAt = parseDate(attempt.createdAt);
    if (createdAt) {
      const ts = createdAt.getTime();
      const dayKey = createdAt.toISOString().slice(0, 10);
      dayKeys.add(dayKey);
      if (ts >= weekThreshold) {
        weeklyAttempts += 1;
      }
      if (ts > latestTimestamp) {
        latestTimestamp = ts;
        latestIso = attempt.createdAt;
      }
    }

    const subjectKey = attempt.subject || 'General';
    const aggregate = subjectCounts.get(subjectKey) ?? { attempts: 0, correct: 0, total: 0 };
    aggregate.attempts += 1;
    aggregate.correct += attempt.correctCount;
    aggregate.total += attempt.total;
    subjectCounts.set(subjectKey, aggregate);
  }

  let topSubject: string | null = null;
  let maxAttempts = 0;
  for (const [subject, aggregate] of subjectCounts.entries()) {
    if (aggregate.attempts > maxAttempts) {
      maxAttempts = aggregate.attempts;
      topSubject = subject;
    }
  }

  const avgAccuracy = totalQuestions > 0 ? totalCorrect / Math.max(totalQuestions, 1) : null;

  return {
    totalAttempts: attempts.length,
    weeklyAttempts,
    activeDays: dayKeys.size,
    avgAccuracy,
    topSubject,
    lastAttemptAt: latestIso ?? lastStudyDate ?? null,
    streak: streak ?? 0,
    points: points ?? 0,
    lastStudyDate: lastStudyDate ?? null,
  };
}

function normalizeSubjectState(row: Record<string, unknown>): SubjectState {
  return {
    subject: safeString(row['subject']),
    course: safeString(row['course']),
    mastery: toNumber(row['mastery']),
    difficulty: safeString(row['difficulty']),
    nextTopic: safeString(row['next_topic'] ?? row['nextTopic']),
    updatedAt: safeString(row['updated_at'] ?? row['updatedAt']),
  };
}

async function gatherLearnerContext(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<LearnerContext> {
  try {
    const [profileRes, attemptsRes, subjectsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, username, is_premium, interests, streak, points, last_study_date, created_at')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('attempts')
        .select('subject, correct_count, total, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('user_subject_state')
        .select('subject, course, mastery, difficulty, next_topic, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(10),
    ]);

    if (profileRes.error) {
      console.warn('[support-chat] profile load failed', profileRes.error);
    }
    if (attemptsRes.error) {
      console.warn('[support-chat] attempts load failed', attemptsRes.error);
    }
    if (subjectsRes.error) {
      console.warn('[support-chat] subject state load failed', subjectsRes.error);
    }

    const profileRow = profileRes.data ?? null;
    const attemptsData = Array.isArray(attemptsRes.data) ? attemptsRes.data : [];
    const subjectData = Array.isArray(subjectsRes.data) ? subjectsRes.data : [];

    const profile = profileRow
      ? {
          fullName: safeString(profileRow.full_name),
          username: safeString(profileRow.username),
          isPremium: typeof profileRow.is_premium === 'boolean' ? profileRow.is_premium : null,
          interests: Array.isArray(profileRow.interests)
            ? (profileRow.interests.filter((entry: unknown): entry is string => typeof entry === 'string') as string[])
            : null,
          streak: toNumber(profileRow.streak),
          points: toNumber(profileRow.points),
          lastStudyDate: safeString(profileRow.last_study_date),
          createdAt: safeString(profileRow.created_at),
        }
      : null;

    const attempts = attemptsData.map((row) => normalizeAttempt(row as Record<string, unknown>));
    const analytics = computeAnalytics(
      attempts,
      profile?.streak ?? null,
      profile?.points ?? null,
      profile?.lastStudyDate ?? null,
    );

    const subjects = subjectData
      .map((row) => normalizeSubjectState(row as Record<string, unknown>))
      .filter((row) => row.subject || row.course);

    return { profile, analytics, subjects };
  } catch (error) {
    console.warn('[support-chat] gatherLearnerContext failed', error);
    return { profile: null, analytics: null, subjects: [] };
  }
}

function renderLearnerSummary(context: LearnerContext | null): string | null {
  if (!context) return null;
  const lines: string[] = [];

  if (context.profile) {
    const { fullName, username, isPremium, interests, streak, points, lastStudyDate, createdAt } = context.profile;
    const identityParts = [fullName, username ? `@${username}` : null].filter(Boolean);
    const identityLabel = identityParts.length > 0 ? identityParts.join(' ') : null;
    const planLabel =
      typeof isPremium === 'boolean' ? (isPremium ? 'Premium plan' : 'Standard plan') : null;
    const streakLabel = streak != null && streak > 0 ? `${formatNumber(streak)} day streak` : null;
    const pointsLabel = points != null && points > 0 ? `${formatNumber(points)} points` : null;
    const lastStudyLabel = formatRelativeDays(lastStudyDate) ?? formatAbsoluteDate(lastStudyDate);
    const memberSinceLabel = formatAbsoluteDate(createdAt);

    const profileBits = [
      identityLabel,
      planLabel,
      streakLabel,
      pointsLabel,
      lastStudyLabel ? `last study ${lastStudyLabel}` : null,
      memberSinceLabel ? `member since ${memberSinceLabel}` : null,
    ].filter(Boolean);

    if (interests && interests.length > 0) {
      profileBits.push(`interests: ${interests.slice(0, 5).join(', ')}`);
    }

    if (profileBits.length > 0) {
      lines.push(`- Profile: ${profileBits.join(' | ')}`);
    }
  }

  if (context.analytics) {
    const { totalAttempts, weeklyAttempts, activeDays, avgAccuracy, topSubject, lastAttemptAt } =
      context.analytics;
    const bits: string[] = [];

    bits.push(`${formatNumber(totalAttempts) ?? String(totalAttempts)} total attempts`);
    bits.push(`${formatNumber(weeklyAttempts) ?? String(weeklyAttempts)} this week`);
    bits.push(`${formatNumber(activeDays) ?? String(activeDays)} active days in last 7`);

    const accuracyLabel = formatPercent(avgAccuracy);
    if (accuracyLabel) {
      bits.push(`avg accuracy ${accuracyLabel}`);
    } else {
      bits.push('avg accuracy pending more quiz data');
    }

    if (topSubject) {
      bits.push(`top subject ${topSubject}`);
    }

    const lastActivityLabel = formatRelativeDays(lastAttemptAt) ?? formatAbsoluteDate(lastAttemptAt);
    if (lastActivityLabel) {
      bits.push(`last activity ${lastActivityLabel}`);
    }

    lines.push(`- Attempts: ${bits.join(' | ')}`);
  }

  if (context.subjects && context.subjects.length > 0) {
    const subjectSummaries = context.subjects.slice(0, 3).map((subject) => {
      const descriptors: string[] = [];
      const name = subject.subject ?? subject.course ?? 'Subject';
      descriptors.push(name);
      if (subject.difficulty) {
        descriptors.push(`difficulty ${subject.difficulty}`);
      }
      const masteryLabel = formatPercent(clamp01(subject.mastery));
      if (masteryLabel) {
        descriptors.push(`mastery ${masteryLabel}`);
      }
      if (subject.nextTopic) {
        descriptors.push(`next ${subject.nextTopic}`);
      }
      return descriptors.join(' | ');
    });
    lines.push(`- Subject focus: ${subjectSummaries.join('; ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function renderKnowledgeDigest(entries: SupportKnowledgeEntry[]): string | null {
  if (!entries.length) return null;
  return entries
    .map((entry) => {
      const parts = [
        `- ${entry.title} - ${entry.summary}`,
        `  Key notes: ${entry.details}`,
      ];
      const tagPreview = entry.tags.slice(0, 4);
      if (tagPreview.length > 0) {
        parts.push(`  Tags: ${tagPreview.join(', ')}`);
      }
      return parts.join('\n');
    })
    .join('\n');
}

type SystemPromptOptions = {
  knowledgeDigest?: string | null;
  learnerSummary?: string | null;
  clientContext?: string | null;
  websiteContext?: string | null;
};

function buildSystemPrompt({
  knowledgeDigest,
  learnerSummary,
  clientContext,
  websiteContext,
}: SystemPromptOptions): string {
  const base = [
    'You are the Lernex support assistant embedded on lernex.net. Provide accurate, actionable support grounded in current product behaviour.',
    `Never guess or invent product features, pricing, timelines, or policies. If information is missing, say so clearly and invite the learner to email ${SUPPORT_EMAIL} for a human follow-up.`,
    'When sharing guidance, cite the exact Lernex path (for example: /analytics, /playlists) and outline the steps in order. Keep the tone friendly, concise, and oriented around next steps.',
    'Encourage healthy study habits, streak consistency, and using analytics to review progress whenever it fits the question.',
    `If the learner asks for account actions you cannot complete, explain the self-serve alternative or direct them to ${SUPPORT_EMAIL} or live chat for escalation.`,
  ].join('\n');

  const segments = [base];

  const siteReference =
    websiteContext && websiteContext.trim().length > 0 ? websiteContext.trim() : WEBSITE_CONTEXT;
  segments.push(`Lernex site reference:\n${siteReference}`);

  if (knowledgeDigest && knowledgeDigest.trim().length > 0) {
    segments.push(`Relevant knowledge articles:\n${knowledgeDigest.trim()}`);
  } else {
    segments.push(
      `Relevant knowledge articles:\n- No specific article matched this query. Ask for clarification if needed and escalate to ${SUPPORT_EMAIL} when uncertainty remains.`,
    );
  }

  if (learnerSummary && learnerSummary.trim().length > 0) {
    segments.push(`Learner analytics snapshot:\n${learnerSummary.trim()}`);
  }

  if (clientContext && clientContext.trim().length > 0) {
    segments.push(`Client-provided context:\n${clientContext.trim().slice(0, 600)}`);
  }

  segments.push(
    `If information is missing or conflicting, acknowledge the gap, avoid speculation, and share ${SUPPORT_EMAIL} plus live chat hours (Mon-Fri 8am-6pm MT) as the escalation path.`,
  );

  return segments.join('\n\n');
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  if (!take(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 });
  }

  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: missing CEREBRAS_API_KEY' }), { status: 500 });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: missing Supabase credentials' }), { status: 500 });
  }

  const authHeaders: Record<string, string> = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeaders,
    },
  });

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    userId = null;
  }

  if (userId) {
    const allowed = await checkUsageLimit(supabase, userId);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Usage limit exceeded' }), { status: 403 });
    }
  }

  let payload: { messages?: unknown; context?: unknown };
  try {
    payload = (await req.json()) as { messages?: unknown; context?: unknown };
  } catch {
    payload = {};
  }

  const chatMessages = sanitizeMessages(payload.messages);
  if (chatMessages.length === 0 || chatMessages.every((message) => message.role !== 'user')) {
    return new Response(JSON.stringify({ error: 'Provide at least one user message.' }), { status: 400 });
  }

  const context =
    typeof payload.context === 'string' && payload.context.trim().length > 0 ? payload.context.trim() : null;

  let learnerContext: LearnerContext | null = null;
  if (userId) {
    learnerContext = await gatherLearnerContext(supabase, userId);
  }

  const userQueryText = chatMessages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => message.content)
    .join(' ');

  const knowledgeEntries = rankSupportKnowledge(userQueryText, 5);
  const knowledgeDigest = renderKnowledgeDigest(knowledgeEntries);
  const learnerSummary = renderLearnerSummary(learnerContext);
  const systemPrompt = buildSystemPrompt({
    knowledgeDigest,
    learnerSummary,
    clientContext: context,
    websiteContext: WEBSITE_CONTEXT,
  });

  const client = new OpenAI({
    apiKey,
    baseURL: CEREBRAS_BASE_URL,
  });

  try {
    const completion = await client.chat.completions.create({
      model: SUPPORT_MODEL,
      temperature: SUPPORT_TEMPERATURE,
      max_tokens: SUPPORT_MAX_TOKENS,
      reasoning_effort: 'low',
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...chatMessages.map(({ role, content }) => ({ role, content })),
      ],
    });

    const usage = completion.usage;
    const reply =
      completion.choices?.[0]?.message?.content?.trim() ??
      'I am here to help. Could you rephrase that question for me?';

    if (userId || ip) {
      const usageSummary = {
        input_tokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null,
        output_tokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null,
      };
      try {
        await logUsage(
          supabase,
          userId,
          ip,
          SUPPORT_MODEL,
          usageSummary,
          {
            metadata: {
              feature: 'support-chat',
              messageCount: chatMessages.length,
              hasContext: Boolean(context),
              knowledgeIds: knowledgeEntries.map((entry) => entry.id),
              knowledgeCount: knowledgeEntries.length,
              hasLearnerSummary: Boolean(learnerSummary),
            },
          },
        );
      } catch (logErr) {
        console.warn('[support-chat] usage log failed', logErr);
      }
    }

    return new Response(JSON.stringify({ reply }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (error) {
    console.error('[support-chat] error', error);
    const message = error instanceof Error ? error.message : 'Support chat failed';
    if (userId || ip) {
      try {
        await logUsage(
          supabase,
          userId,
          ip,
          SUPPORT_MODEL,
          { input_tokens: null, output_tokens: null },
          {
            metadata: {
              feature: 'support-chat',
              error: message,
              messageCount: chatMessages.length,
              hasContext: Boolean(context),
              knowledgeIds: knowledgeEntries.map((entry) => entry.id),
              knowledgeCount: knowledgeEntries.length,
              hasLearnerSummary: Boolean(learnerSummary),
            },
          },
        );
      } catch (logErr) {
        console.warn('[support-chat] error-log failed', logErr);
      }
    }
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
