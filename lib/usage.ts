import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Model pricing per 1M tokens
 *
 * Free Tier Models (gpt-oss-20b):
 * - Groq: $0.10 input / $0.50 output per 1M tokens
 * - Deepinfra: $0.03 input / $0.14 output per 1M tokens
 *
 * Plus/Premium Tier Models (gpt-oss-120b):
 * - Cerebras: $0.35 input / $0.75 output per 1M tokens
 * - LightningAI: $0.10 input / $0.40 output per 1M tokens
 */
const PRICES: Record<string, { input: number; output: number }> = {
  // Legacy models (for backwards compatibility)
  "gpt-5-nano": { input: 0.05 / 1_000_000, output: 0.4 / 1_000_000 },
  "gpt-4.1-nano": { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  "llama-3.1-8b-instant": { input: 0.05 / 1_000_000, output: 0.08 / 1_000_000 },
  "grok-4-fast-reasoning": { input: 0.2 / 1_000_000, output: 0.5 / 1_000_000 },

  // FREE TIER - gpt-oss-20b models (smaller, less expensive)
  // Groq gpt-oss-20b (FAST model for free tier)
  "gpt-oss-20b": { input: 0.1 / 1_000_000, output: 0.5 / 1_000_000 },
  "groq/gpt-oss-20b": { input: 0.1 / 1_000_000, output: 0.5 / 1_000_000 },

  // Deepinfra gpt-oss-20b (SLOW model for free tier)
  "openai/gpt-oss-20b": { input: 0.03 / 1_000_000, output: 0.14 / 1_000_000 },
  "deepinfra/gpt-oss-20b": { input: 0.03 / 1_000_000, output: 0.14 / 1_000_000 },

  // PLUS/PREMIUM TIER - gpt-oss-120b models (larger, more intelligent)
  // Cerebras gpt-oss-120b (FAST model for paid tiers)
  "gpt-oss-120b": { input: 0.35 / 1_000_000, output: 0.75 / 1_000_000 },
  "cerebras/gpt-oss-120b": { input: 0.35 / 1_000_000, output: 0.75 / 1_000_000 },

  // LightningAI gpt-oss-120b (SLOW model for paid tiers)
  "lightningai/gpt-oss-120b": { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },
};

export function calcCost(model: string, inputTokens = 0, outputTokens = 0) {
  const p = PRICES[model];
  if (!p) return 0;
  return inputTokens * p.input + outputTokens * p.output;
}

export async function getUserTotalCost(sb: SupabaseClient, userId: string) {
  const { data } = await sb
    .from("usage_logs")
    .select("model, input_tokens, output_tokens")
    .eq("user_id", userId);
  return (data ?? []).reduce(
    (sum, row) =>
      sum + calcCost(row.model as string, row.input_tokens ?? 0, row.output_tokens ?? 0),
    0
  );
}

export async function checkUsageLimit(
  sb: SupabaseClient,
  userId: string,
  limit = 3
) {
    const { data } = await sb
    .from("profiles")
    .select("total_cost")
    .eq("id", userId)
    .maybeSingle();
  return (data?.total_cost ?? 0) < limit;
}

export async function updateUserTotalCost(sb: SupabaseClient, userId: string) {
  const total = await getUserTotalCost(sb, userId);
  await sb.from("profiles").update({ total_cost: total }).eq("id", userId);
}

type LogUsageOptions = {
  metadata?: Record<string, unknown>;
};

export async function logUsage(
  sb: SupabaseClient,
  userId: string | null,
  ip: string | null,
  model: string,
  usage: { input_tokens?: number | null; output_tokens?: number | null },
  opts: LogUsageOptions = {}
) {
  const baseRow = {
    user_id: userId,
    ip,
    model,
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
  };
  const row = opts.metadata ? { ...baseRow, metadata: opts.metadata } : baseRow;
  try {
    await sb.from("usage_logs").insert(row as Record<string, unknown>);
  } catch (error) {
    if (opts.metadata) {
      try {
        await sb.from("usage_logs").insert(baseRow as Record<string, unknown>);
      } catch (fallbackError) {
        throw fallbackError;
      }
    } else {
      throw error;
    }
  }

  if (userId) {
    await updateUserTotalCost(sb, userId);
  }
}


