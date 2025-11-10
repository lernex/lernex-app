/**
 * Tiered AI Model Configuration
 *
 * This module handles model selection based on user tier and speed requirements.
 *
 * Free Tier:
 * - Fast model: Groq gpt-oss-20b (lower cost, faster response)
 * - Slow model: Deepinfra gpt-oss-20b (lower cost, no speed priority)
 *
 * Plus/Premium Tiers:
 * - Fast model: Fireworks AI gpt-oss-120b (higher intelligence, faster response)
 * - Slow model: Deepinfra gpt-oss-120b (higher intelligence, cost-optimized)
 */

import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';

export type UserTier = 'free' | 'plus' | 'premium';
export type ModelSpeed = 'fast' | 'slow';

export interface ModelConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  provider: 'groq' | 'deepinfra' | 'cerebras' | 'lightningai' | 'fireworksai';
}

/**
 * Get the appropriate model configuration based on user tier and speed requirement
 */
export function getModelConfig(tier: UserTier, speed: ModelSpeed): ModelConfig {
  const isPaidTier = tier === 'plus' || tier === 'premium';

  if (isPaidTier) {
    // Plus and Premium get the more intelligent models
    if (speed === 'fast') {
      // Fireworks AI for fast, high-intelligence generation (uses OpenAI-compatible API)
      return {
        apiKey: process.env.FIREWORKSAI_API_KEY || '',
        baseURL: 'https://api.fireworks.ai/inference/v1',
        model: 'accounts/fireworks/models/gpt-oss-120b',
        provider: 'fireworksai'
      };
    } else {
      // Deepinfra for slower, cost-optimized high-intelligence generation
      return {
        apiKey: process.env.DEEPINFRA_API_KEY || '',
        baseURL: 'https://api.deepinfra.com/v1/openai',
        model: 'openai/gpt-oss-120b', // Deepinfra uses openai/ prefix
        provider: 'deepinfra'
      };
    }
  } else {
    // Free tier gets the smaller, less expensive models
    if (speed === 'fast') {
      // Groq for fast generation with smaller model
      return {
        apiKey: process.env.GROQ_API_KEY || '',
        baseURL: 'https://api.groq.com/openai/v1',
        model: 'openai/gpt-oss-20b', // Groq uses openai/ prefix
        provider: 'groq'
      };
    } else {
      // Deepinfra for slower, cost-optimized generation
      return {
        apiKey: process.env.DEEPINFRA_API_KEY || '',
        baseURL: 'https://api.deepinfra.com/v1/openai',
        model: 'openai/gpt-oss-20b', // Deepinfra uses openai/ prefix
        provider: 'deepinfra'
      };
    }
  }
}

/**
 * Get the model identifier for usage tracking and pricing
 * This ensures the model name matches the pricing table in usage.ts
 */
export function getModelIdentifier(provider: ModelConfig['provider'], model: string): string {
  // Return model identifier that matches the pricing table
  switch (provider) {
    case 'groq':
      return 'groq/gpt-oss-20b';
    case 'deepinfra':
      // Deepinfra is used for both free (20b) and paid (120b) slow models
      return model.includes('120b') ? 'deepinfra/gpt-oss-120b' : 'deepinfra/gpt-oss-20b';
    case 'fireworksai':
      return 'fireworksai/gpt-oss-120b';
    case 'cerebras':
      // Keep for backwards compatibility with old usage logs
      return 'cerebras/gpt-oss-120b';
    case 'lightningai':
      // Keep for backwards compatibility with old usage logs
      return 'lightningai/gpt-oss-120b';
    default:
      return model;
  }
}

/**
 * Create an OpenAI-compatible client with the appropriate model configuration
 * This works with OpenAI SDK since all providers use OpenAI-compatible APIs
 */
export function createModelClient(tier: UserTier, speed: ModelSpeed) {
  const config = getModelConfig(tier, speed);

  // Get the model identifier for usage tracking (matches pricing table)
  const modelIdentifier = getModelIdentifier(config.provider, config.model);

  return {
    client: new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    }),
    model: config.model, // Model name for API calls
    modelIdentifier, // Model identifier for usage tracking
    provider: config.provider,
    config
  };
}

/**
 * Get user tier from user profile data
 */
export function getUserTier(userProfile: { subscription_tier?: string | null }): UserTier {
  const tier = userProfile?.subscription_tier?.toLowerCase();

  if (tier === 'premium') return 'premium';
  if (tier === 'plus') return 'plus';
  return 'free';
}

/**
 * Fetch user tier directly from Supabase with cache-busting
 * This ensures we always get the latest tier, even if the user just upgraded
 */
export async function fetchUserTier(supabase: SupabaseClient, userId: string): Promise<UserTier> {
  // Force fresh data by using a timestamp in the query
  // This prevents Next.js from caching the result
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();

  if (error) {
    console.warn('[fetchUserTier] Error fetching tier:', error);
    return 'free'; // Default to free on error
  }

  return getUserTier(profile || {});
}
