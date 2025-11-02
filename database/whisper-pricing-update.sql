-- =====================================================
-- UPDATE: Add Whisper Speech-to-Text Model Pricing
-- =====================================================
-- This updates the calculate_usage_cost function to include
-- pricing for OpenAI Whisper-large-v3-turbo via DeepInfra
-- Cost: $0.0002 per minute
-- Storage: input_tokens = duration_minutes * 1000
-- =====================================================

-- Drop and recreate the calculate_usage_cost function with Whisper support
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
    -- Cerebras (FAST)
    WHEN 'gpt-oss-120b', 'cerebras/gpt-oss-120b' THEN
      v_input_cost := 0.35 / 1000000.0;
      v_output_cost := 0.75 / 1000000.0;

    -- Deepinfra (SLOW)
    WHEN 'deepinfra/gpt-oss-120b' THEN
      v_input_cost := 0.1 / 1000000.0;
      v_output_cost := 0.4 / 1000000.0;

    -- LightningAI (legacy - kept for backwards compatibility)
    WHEN 'lightningai/gpt-oss-120b' THEN
      v_input_cost := 0.1 / 1000000.0;
      v_output_cost := 0.4 / 1000000.0;

    -- OCR models
    -- DeepSeek-OCR via DeepInfra
    WHEN 'deepseek-ocr', 'deepseek-ai/DeepSeek-OCR' THEN
      v_input_cost := 0.03 / 1000000.0;
      v_output_cost := 0.1 / 1000000.0;

    -- TTS models
    -- Kokoro-82M via DeepInfra
    WHEN 'kokoro-tts', 'deepinfra/kokoro-82m' THEN
      v_input_cost := 0.62 / 1000000.0;
      v_output_cost := 0;

    -- Speech-to-Text models
    -- Whisper-large-v3-turbo via DeepInfra
    -- Cost: $0.0002 per minute
    -- Stored as: input_tokens = duration_minutes * 1000
    -- So price per token = $0.0002 / 1000 = $0.0000002
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

-- Add comment
COMMENT ON FUNCTION public.calculate_usage_cost IS 'Calculates the cost of a request based on model and token usage. Supports text generation, TTS, OCR, and speech-to-text models.';

-- =====================================================
-- EXAMPLE USAGE WITH WHISPER
-- =====================================================

-- Example 1: Log a 30-second voice transcription
-- Duration: 30 seconds = 0.5 minutes
-- Input tokens: 0.5 * 1000 = 500
-- Cost: 500 * (0.0002 / 1000) = $0.0001
/*
INSERT INTO public.usage_logs (
  user_id,
  ip,
  model,
  input_tokens,
  output_tokens,
  metadata
) VALUES (
  auth.uid(),
  '192.168.1.1',
  'whisper-large-v3-turbo',
  500,  -- 0.5 minutes * 1000
  0,
  jsonb_build_object(
    'route', 'transcribe',
    'provider', 'deepinfra',
    'duration_seconds', 30,
    'duration_minutes', 0.5,
    'audio_type', 'audio/webm'
  )
);
*/

-- Example 2: Calculate cost for a 2-minute recording
-- SELECT public.calculate_usage_cost('whisper-large-v3-turbo', 2000, 0);
-- Expected result: 0.0004 (2 minutes * $0.0002/minute)

-- Example 3: Get all transcription costs for a user
/*
SELECT
  created_at,
  model,
  metadata->>'duration_seconds' as duration_seconds,
  metadata->>'duration_minutes' as duration_minutes,
  input_tokens,
  public.calculate_usage_cost(model, input_tokens, output_tokens) as cost
FROM public.usage_logs
WHERE user_id = auth.uid()
  AND model IN ('whisper-large-v3-turbo', 'openai/whisper-large-v3-turbo')
ORDER BY created_at DESC;
*/
