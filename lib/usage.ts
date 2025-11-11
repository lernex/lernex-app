import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Model pricing per 1M tokens
 *
 * Free Tier Models (gpt-oss-20b):
 * - Groq: $0.075 input / $0.30 output per 1M tokens
 * - Deepinfra: $0.03 input / $0.14 output per 1M tokens
 *
 * Plus/Premium Tier Models (gpt-oss-120b):
 * - Groq: $0.15 input / $0.60 output per 1M tokens
 * - Deepinfra: $0.10 input / $0.40 output per 1M tokens
 * - Fireworks AI: $0.15 input / $0.60 output per 1M tokens (legacy, kept for backwards compatibility)
 * - Cerebras: $0.35 input / $0.75 output per 1M tokens (legacy, kept for backwards compatibility)
 * - LightningAI: $0.10 input / $0.40 output per 1M tokens (legacy, kept for backwards compatibility)
 *
 * TTS Models:
 * - hexgrad/Kokoro-82M: $0.62 per 1M input tokens (via DeepInfra)
 *
 * OCR Models:
 * - DeepSeek-OCR: $0.03 input / $0.1 output per 1M tokens (via DeepInfra)
 *
 * Speech-to-Text Models:
 * - Whisper-large-v3-turbo: $0.0002 per minute (via DeepInfra)
 *   Note: Stored as input_tokens = duration_minutes * 1000 for precision
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
  "gpt-oss-20b": { input: 0.075 / 1_000_000, output: 0.3 / 1_000_000 },
  "groq/gpt-oss-20b": { input: 0.075 / 1_000_000, output: 0.3 / 1_000_000 },

  // Deepinfra gpt-oss-20b (SLOW model for free tier)
  "openai/gpt-oss-20b": { input: 0.03 / 1_000_000, output: 0.14 / 1_000_000 },
  "deepinfra/gpt-oss-20b": { input: 0.03 / 1_000_000, output: 0.14 / 1_000_000 },

  // PLUS/PREMIUM TIER - gpt-oss-120b models (larger, more intelligent)
  // Groq gpt-oss-120b (FAST model for paid tiers)
  "gpt-oss-120b": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  "groq/gpt-oss-120b": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },

  // Deepinfra gpt-oss-120b (SLOW model for paid tiers)
  "deepinfra/gpt-oss-120b": { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },

  // Fireworks AI gpt-oss-120b (legacy - kept for backwards compatibility with old usage logs)
  "fireworksai/gpt-oss-120b": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },

  // Cerebras gpt-oss-120b (legacy - kept for backwards compatibility with old usage logs)
  "cerebras/gpt-oss-120b": { input: 0.35 / 1_000_000, output: 0.75 / 1_000_000 },

  // LightningAI gpt-oss-120b (legacy - kept for backwards compatibility with old usage logs)
  "lightningai/gpt-oss-120b": { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },

  // TTS (Text-to-Speech) models
  // hexgrad/Kokoro-82M via DeepInfra: $0.62 per 1M INPUT tokens
  // We use "input" field to represent tokens (approximating 1 char ≈ 1 token)
  "kokoro-tts": { input: 0.62 / 1_000_000, output: 0 },
  "deepinfra/kokoro-82m": { input: 0.62 / 1_000_000, output: 0 },

  // OCR models
  // DeepSeek-OCR via DeepInfra: $0.03 per 1M input, $0.1 per 1M output tokens
  "deepseek-ocr": { input: 0.03 / 1_000_000, output: 0.1 / 1_000_000 },
  "deepseek-ai/DeepSeek-OCR": { input: 0.03 / 1_000_000, output: 0.1 / 1_000_000 },

  // Speech-to-Text models
  // Whisper-large-v3-turbo via DeepInfra: $0.0002 per minute
  // Stored as: input_tokens = duration_minutes * 1000
  // So price per token = $0.0002 / 1000 = $0.0000002
  "whisper-large-v3-turbo": { input: 0.0002 / 1000, output: 0 },
  "openai/whisper-large-v3-turbo": { input: 0.0002 / 1000, output: 0 },
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

    // Update period cost for usage limits
    const cost = calcCost(model, usage.input_tokens ?? 0, usage.output_tokens ?? 0);
    if (cost > 0) {
      await updatePeriodCost(sb, userId, cost);
    }
  }
}

/**
 * Usage limit constants per subscription tier
 */
export const USAGE_LIMITS = {
  free: 0.06,      // $0.06 per day
  plus: 2.50,      // $2.50 per month
  premium: 5.00,   // $5.00 per month
} as const;

/**
 * Period duration in hours per subscription tier
 */
export const PERIOD_DURATION_HOURS = {
  free: 24,        // 24 hours (1 day)
  plus: 720,       // 720 hours (30 days)
  premium: 720,    // 720 hours (30 days)
} as const;

export type SubscriptionTier = 'free' | 'plus' | 'premium';

/**
 * Get usage limit for a subscription tier
 */
export function getUsageLimit(tier: SubscriptionTier): number {
  return USAGE_LIMITS[tier] ?? USAGE_LIMITS.free;
}

/**
 * Get period duration in hours for a subscription tier
 */
export function getPeriodDurationHours(tier: SubscriptionTier): number {
  return PERIOD_DURATION_HOURS[tier] ?? PERIOD_DURATION_HOURS.free;
}

/**
 * Check if usage period has expired
 */
export function isPeriodExpired(periodStart: string | null, tier: SubscriptionTier): boolean {
  if (!periodStart) return true;

  const durationHours = getPeriodDurationHours(tier);
  const periodStartTime = new Date(periodStart).getTime();
  const periodEndTime = periodStartTime + (durationHours * 60 * 60 * 1000);
  const now = Date.now();

  return now >= periodEndTime;
}

/**
 * Calculate time remaining until period reset
 */
export function getTimeUntilReset(periodStart: string | null, tier: SubscriptionTier): number {
  if (!periodStart) return 0;

  const durationHours = getPeriodDurationHours(tier);
  const periodStartTime = new Date(periodStart).getTime();
  const periodEndTime = periodStartTime + (durationHours * 60 * 60 * 1000);
  const now = Date.now();

  return Math.max(0, periodEndTime - now);
}

/**
 * Format time remaining as { hours, minutes }
 */
export function formatTimeRemaining(milliseconds: number): { hours: number; minutes: number } {
  const totalMinutes = Math.ceil(milliseconds / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return { hours, minutes };
}

export type UsageLimitCheck = {
  allowed: boolean;
  currentCost: number;
  limitAmount: number;
  percentUsed: number;
  periodStart: string | null;
  timeUntilResetMs: number;
  reason: string;
  tier: SubscriptionTier;
};

/**
 * Check if user can perform generation (has not exceeded limit)
 * This function automatically resets the period if expired
 */
export async function canUserGenerate(
  sb: SupabaseClient,
  userId: string
): Promise<UsageLimitCheck> {
  // Get user profile
  const { data: profile, error } = await sb
    .from("profiles")
    .select("subscription_tier, period_cost, usage_period_start")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile) {
    return {
      allowed: false,
      currentCost: 0,
      limitAmount: 0,
      percentUsed: 0,
      periodStart: null,
      timeUntilResetMs: 0,
      reason: "Profile not found",
      tier: "free",
    };
  }

  const tier = (profile.subscription_tier as SubscriptionTier) ?? "free";
  const limit = getUsageLimit(tier);

  // Check if period has expired and reset if needed
  const expired = isPeriodExpired(profile.usage_period_start, tier);

  let currentCost = profile.period_cost ?? 0;
  let periodStart = profile.usage_period_start;

  if (expired) {
    // Reset the period
    const now = new Date().toISOString();
    await sb
      .from("profiles")
      .update({
        usage_period_start: now,
        period_cost: 0,
      })
      .eq("id", userId);

    currentCost = 0;
    periodStart = now;
  }

  // Calculate time until reset
  const timeUntilResetMs = getTimeUntilReset(periodStart, tier);
  const percentUsed = limit > 0 ? Math.round((currentCost / limit) * 100) : 0;

  // Check if under limit
  const allowed = currentCost < limit;
  const reason = allowed
    ? "Within usage limit"
    : `Usage limit exceeded for current period`;

  return {
    allowed,
    currentCost,
    limitAmount: limit,
    percentUsed,
    periodStart,
    timeUntilResetMs,
    reason,
    tier,
  };
}

/**
 * Update period cost after usage
 * This function is called by logUsage after each generation
 */
async function updatePeriodCost(
  sb: SupabaseClient,
  userId: string,
  costToAdd: number
): Promise<void> {
  // First, ensure period is not expired (this call resets if needed)
  await canUserGenerate(sb, userId);

  // Add to period cost
  const { data: profile } = await sb
    .from("profiles")
    .select("period_cost")
    .eq("id", userId)
    .maybeSingle();

  const currentPeriodCost = profile?.period_cost ?? 0;
  const newPeriodCost = currentPeriodCost + costToAdd;

  await sb
    .from("profiles")
    .update({ period_cost: newPeriodCost })
    .eq("id", userId);
}


