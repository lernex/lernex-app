-- =====================================================
-- ADD FIREWORKS AI PRICING TO USAGE_LOGS
-- Updates the calculate_usage_cost function to include
-- Fireworks AI gpt-oss-120b pricing
-- Migration Date: 2025-11-10
-- =====================================================

-- Step 1: Update the calculate_usage_cost function with Fireworks AI pricing
CREATE OR REPLACE FUNCTION public.calculate_usage_cost(
  p_model TEXT,
  p_input_tokens INTEGER DEFAULT 0,
  p_output_tokens INTEGER DEFAULT 0
)
RETURNS NUMERIC AS $$
DECLARE
  v_input_cost NUMERIC := 0;
  v_output_cost NUMERIC := 0;
  v_total_cost NUMERIC := 0;
BEGIN
  -- Pricing per 1M tokens (converted to per-token pricing)
  CASE p_model
    -- Legacy models
    WHEN 'gpt-5-nano' THEN
      v_input_cost := 0.05 / 1000000.0;
      v_output_cost := 0.4 / 1000000.0;
    WHEN 'gpt-4.1-nano' THEN
      v_input_cost := 0.1 / 1000000.0;
      v_output_cost := 0.4 / 1000000.0;
    WHEN 'gpt-4o-mini' THEN
      v_input_cost := 0.15 / 1000000.0;
      v_output_cost := 0.6 / 1000000.0;
    WHEN 'llama-3.1-8b-instant' THEN
      v_input_cost := 0.05 / 1000000.0;
      v_output_cost := 0.08 / 1000000.0;
    WHEN 'grok-4-fast-reasoning' THEN
      v_input_cost := 0.2 / 1000000.0;
      v_output_cost := 0.5 / 1000000.0;

    -- FREE TIER - gpt-oss-20b models
    -- Groq (FAST)
    WHEN 'gpt-oss-20b', 'groq/gpt-oss-20b' THEN
      v_input_cost := 0.075 / 1000000.0;
      v_output_cost := 0.3 / 1000000.0;

    -- Deepinfra (SLOW)
    WHEN 'openai/gpt-oss-20b', 'deepinfra/gpt-oss-20b' THEN
      v_input_cost := 0.03 / 1000000.0;
      v_output_cost := 0.14 / 1000000.0;

    -- PLUS/PREMIUM TIER - gpt-oss-120b models
    -- Fireworks AI (FAST) - NEW as of 2025-11-10
    WHEN 'gpt-oss-120b', 'fireworksai/gpt-oss-120b' THEN
      v_input_cost := 0.15 / 1000000.0;
      v_output_cost := 0.6 / 1000000.0;

    -- Deepinfra (SLOW)
    WHEN 'deepinfra/gpt-oss-120b' THEN
      v_input_cost := 0.1 / 1000000.0;
      v_output_cost := 0.4 / 1000000.0;

    -- Cerebras (legacy - kept for backwards compatibility)
    WHEN 'cerebras/gpt-oss-120b' THEN
      v_input_cost := 0.35 / 1000000.0;
      v_output_cost := 0.75 / 1000000.0;

    -- LightningAI (legacy - kept for backwards compatibility)
    WHEN 'lightningai/gpt-oss-120b' THEN
      v_input_cost := 0.1 / 1000000.0;
      v_output_cost := 0.4 / 1000000.0;

    -- TTS models
    -- hexgrad/Kokoro-82M via DeepInfra
    WHEN 'kokoro-tts', 'deepinfra/kokoro-82m' THEN
      v_input_cost := 0.62 / 1000000.0;
      v_output_cost := 0;

    -- OCR models
    -- DeepSeek-OCR via DeepInfra
    WHEN 'deepseek-ocr', 'deepseek-ai/DeepSeek-OCR' THEN
      v_input_cost := 0.03 / 1000000.0;
      v_output_cost := 0.1 / 1000000.0;

    -- Speech-to-Text models
    -- Whisper-large-v3-turbo via DeepInfra
    WHEN 'whisper-large-v3-turbo', 'openai/whisper-large-v3-turbo' THEN
      v_input_cost := 0.0002 / 1000.0;
      v_output_cost := 0;

    ELSE
      -- Unknown model, return 0
      RETURN 0;
  END CASE;

  -- Calculate total cost
  v_total_cost := (COALESCE(p_input_tokens, 0) * v_input_cost) +
                  (COALESCE(p_output_tokens, 0) * v_output_cost);

  RETURN v_total_cost;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Grant permissions on updated function
GRANT EXECUTE ON FUNCTION public.calculate_usage_cost(TEXT, INTEGER, INTEGER) TO authenticated, anon, service_role;

-- Step 3: Add comment for documentation
COMMENT ON FUNCTION public.calculate_usage_cost IS 'Calculates cost in USD based on model pricing. Updated 2025-11-10 to include Fireworks AI pricing';

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
  v_test_cost NUMERIC;
BEGIN
  -- Test Fireworks AI pricing calculation
  -- For 1M input tokens and 1M output tokens, should cost:
  -- (1,000,000 * 0.15/1M) + (1,000,000 * 0.6/1M) = $0.15 + $0.60 = $0.75
  v_test_cost := public.calculate_usage_cost('fireworksai/gpt-oss-120b', 1000000, 1000000);

  IF v_test_cost = 0.75 THEN
    RAISE NOTICE '✓ Fireworks AI pricing verified correctly: $0.75 for 1M input + 1M output tokens';
  ELSE
    RAISE EXCEPTION '✗ Fireworks AI pricing calculation failed. Expected $0.75, got $%', v_test_cost;
  END IF;

  -- Test with generic 'gpt-oss-120b' identifier (should use Fireworks AI pricing now)
  v_test_cost := public.calculate_usage_cost('gpt-oss-120b', 1000000, 1000000);

  IF v_test_cost = 0.75 THEN
    RAISE NOTICE '✓ Generic gpt-oss-120b identifier correctly uses Fireworks AI pricing';
  ELSE
    RAISE EXCEPTION '✗ Generic gpt-oss-120b pricing failed. Expected $0.75, got $%', v_test_cost;
  END IF;

  -- Verify Cerebras pricing is still available for legacy records
  v_test_cost := public.calculate_usage_cost('cerebras/gpt-oss-120b', 1000000, 1000000);

  IF v_test_cost = 1.10 THEN
    RAISE NOTICE '✓ Cerebras legacy pricing preserved: $1.10 for 1M input + 1M output tokens';
  ELSE
    RAISE EXCEPTION '✗ Cerebras legacy pricing failed. Expected $1.10, got $%', v_test_cost;
  END IF;

  RAISE NOTICE '✓ Migration complete! Fireworks AI pricing added successfully';
  RAISE NOTICE '';
  RAISE NOTICE '=== PRICING SUMMARY ===';
  RAISE NOTICE 'Fireworks AI gpt-oss-120b (NEW FAST model for paid tiers):';
  RAISE NOTICE '  - Input:  $0.15 per 1M tokens';
  RAISE NOTICE '  - Output: $0.60 per 1M tokens';
  RAISE NOTICE '';
  RAISE NOTICE 'Cerebras gpt-oss-120b (LEGACY):';
  RAISE NOTICE '  - Input:  $0.35 per 1M tokens';
  RAISE NOTICE '  - Output: $0.75 per 1M tokens';
END $$;

-- =====================================================
-- NOTES
-- =====================================================
--
-- This migration updates the calculate_usage_cost function to add
-- Fireworks AI gpt-oss-120b pricing as the new default fast model
-- for paid tiers (plus and premium).
--
-- Changes:
-- 1. Fireworks AI gpt-oss-120b: $0.15 input / $0.60 output per 1M tokens
-- 2. Generic 'gpt-oss-120b' now uses Fireworks AI pricing
-- 3. Cerebras pricing preserved for historical usage_logs records
--
-- The existing trigger (trg_calculate_usage_cost) will automatically
-- use the updated function for all new insertions and updates.
--
-- Historical records with Cerebras pricing remain unchanged and will
-- continue to calculate correctly using the 'cerebras/gpt-oss-120b'
-- identifier.
--
