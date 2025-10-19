import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { take } from '@/lib/rate';
import { checkUsageLimit, logUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORT_MODEL = process.env.CEREBRAS_SUPPORT_MODEL ?? 'gpt-oss-120b';
const SUPPORT_TEMPERATURE = Number(process.env.CEREBRAS_SUPPORT_TEMPERATURE ?? '0.6');
const SUPPORT_MAX_TOKENS = Number(process.env.CEREBRAS_SUPPORT_MAX_TOKENS ?? '512');
const CEREBRAS_BASE_URL = process.env.CEREBRAS_BASE_URL ?? 'https://api.cerebras.ai/v1';
const SUPPORT_EMAIL = 'support@lernex.net';

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

function buildSystemPrompt(context: string | null): string {
  const template = [
    'You are Lernex support assistant. Provide concise, friendly answers grounded in the product.',
    'Reference core Lernex features when useful: For You personalised lessons, collaborative playlists, achievements and badges, analytics dashboards, Cerebras-powered lesson generation, and friends leaderboards.',
    `Always mention that learners can email ${SUPPORT_EMAIL} for a human follow-up if needed.`,
    'If a user asks for account-specific actions you cannot perform, outline the steps or offer to escalate to the human team.',
    'Encourage healthy study habits, streak maintenance, and pointing to analytics when learners want data.',
    'Do not invent product capabilities. If unsure, ask clarifying questions or route to email support@lernex.net.',
  ].join('\n');

  if (!context || context.trim().length === 0) {
    return template;
  }

  return `${template}\n\nLearner context summary:\n${context.trim().slice(0, 600)}`;
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

  const supabase = createClient(supabaseUrl, supabaseKey, {
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
        { role: 'system' as const, content: buildSystemPrompt(context) },
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
