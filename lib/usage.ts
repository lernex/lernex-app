import type { SupabaseClient } from "@supabase/supabase-js";

const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-5-nano": { input: 0.05 / 1_000_000, output: 0.4 / 1_000_000 },
  "gpt-4.1-nano": { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  // Fireworks OSS 20B
  "accounts/fireworks/models/gpt-oss-20b": { input: 0.07 / 1_000_000, output: 0.3 / 1_000_000 },
  "gpt-oss-20b": { input: 0.07 / 1_000_000, output: 0.3 / 1_000_000 },
  // Groq alias for OSS 20B
  "openai/gpt-oss-20b": { input: 0.1 / 1_000_000, output: 0.5 / 1_000_000 },
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

export async function logUsage(
  sb: SupabaseClient,
  userId: string | null,
  ip: string | null,
  model: string,
  usage: { input_tokens?: number | null; output_tokens?: number | null }
) {
  await sb.from("usage_logs").insert({
    user_id: userId,
    ip,
    model,
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
  });

  if (userId) {
    await updateUserTotalCost(sb, userId);
  }
}
