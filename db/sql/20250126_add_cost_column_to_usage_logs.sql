-- =====================================================
-- ADD COST COLUMN TO USAGE_LOGS TABLE
-- Adds a computed cost column that automatically calculates
-- and stores the actual cost based on model pricing
-- Migration Date: 2025-01-26
-- =====================================================

-- Step 1: Add cost column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
    AND column_name = 'cost'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD COLUMN cost NUMERIC(12, 8) DEFAULT 0 NOT NULL;

    RAISE NOTICE 'Added cost column to usage_logs table';
  ELSE
    RAISE NOTICE 'cost column already exists';
  END IF;
END $$;

-- Step 2: Add constraint to ensure cost is non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'usage_logs_cost_check'
    AND table_name = 'usage_logs'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD CONSTRAINT usage_logs_cost_check CHECK (cost >= 0);

    RAISE NOTICE 'Added cost check constraint';
  END IF;
END $$;

-- Step 3: Create index on cost column for analytics queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_cost
  ON public.usage_logs(cost DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_cost
  ON public.usage_logs(user_id, cost DESC);

-- Step 4: Update the calculate_usage_cost function with latest pricing
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
    -- Groq (FAST) - Updated pricing as of 2025-01-26
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

    -- LightningAI (SLOW)
    WHEN 'lightningai/gpt-oss-120b' THEN
      v_input_cost := 0.1 / 1000000.0;
      v_output_cost := 0.4 / 1000000.0;

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

-- Step 5: Create trigger function to automatically calculate cost
CREATE OR REPLACE FUNCTION public.calculate_and_set_usage_cost()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate cost using the updated calculate_usage_cost function
  NEW.cost := public.calculate_usage_cost(
    NEW.model,
    COALESCE(NEW.input_tokens, 0),
    COALESCE(NEW.output_tokens, 0)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger to auto-calculate cost on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_calculate_usage_cost ON public.usage_logs;

CREATE TRIGGER trg_calculate_usage_cost
  BEFORE INSERT OR UPDATE OF model, input_tokens, output_tokens
  ON public.usage_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_and_set_usage_cost();

-- Step 7: Backfill existing rows with calculated costs (using updated pricing)
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Update all existing rows that have cost = 0 or NULL
  UPDATE public.usage_logs
  SET cost = public.calculate_usage_cost(
    model,
    COALESCE(input_tokens, 0),
    COALESCE(output_tokens, 0)
  )
  WHERE cost IS NULL OR cost = 0;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled cost for % existing rows', v_updated_count;
END $$;

-- Step 8: Update the get_user_total_cost function to use stored cost
CREATE OR REPLACE FUNCTION public.get_user_total_cost(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_total_cost NUMERIC := 0;
BEGIN
  -- Use the stored cost column instead of calculating on-the-fly
  SELECT COALESCE(SUM(cost), 0)
  INTO v_total_cost
  FROM public.usage_logs
  WHERE user_id = p_user_id;

  RETURN v_total_cost;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 9: Update the get_user_cost_by_model function to use stored cost
CREATE OR REPLACE FUNCTION public.get_user_cost_by_model(p_user_id UUID)
RETURNS TABLE(
  model TEXT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cost NUMERIC,
  request_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ul.model,
    SUM(COALESCE(ul.input_tokens, 0))::BIGINT as total_input_tokens,
    SUM(COALESCE(ul.output_tokens, 0))::BIGINT as total_output_tokens,
    SUM(ul.cost) as total_cost,
    COUNT(*)::BIGINT as request_count
  FROM public.usage_logs ul
  WHERE ul.user_id = p_user_id
  GROUP BY ul.model
  ORDER BY total_cost DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 10: Update the get_user_daily_usage function to use stored cost
CREATE OR REPLACE FUNCTION public.get_user_daily_usage(
  p_user_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  date DATE,
  total_requests BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cost NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(ul.created_at) as date,
    COUNT(*)::BIGINT as total_requests,
    SUM(COALESCE(ul.input_tokens, 0))::BIGINT as total_input_tokens,
    SUM(COALESCE(ul.output_tokens, 0))::BIGINT as total_output_tokens,
    SUM(ul.cost) as total_cost
  FROM public.usage_logs ul
  WHERE ul.user_id = p_user_id
    AND ul.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY DATE(ul.created_at)
  ORDER BY DATE(ul.created_at) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 11: Create a function to get cost breakdown by date range
CREATE OR REPLACE FUNCTION public.get_cost_breakdown(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  model TEXT,
  total_requests BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cost NUMERIC,
  avg_cost_per_request NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ul.model,
    COUNT(*)::BIGINT as total_requests,
    SUM(COALESCE(ul.input_tokens, 0))::BIGINT as total_input_tokens,
    SUM(COALESCE(ul.output_tokens, 0))::BIGINT as total_output_tokens,
    SUM(ul.cost) as total_cost,
    ROUND(AVG(ul.cost), 8) as avg_cost_per_request
  FROM public.usage_logs ul
  WHERE ul.user_id = p_user_id
    AND ul.created_at >= p_start_date
    AND ul.created_at <= p_end_date
  GROUP BY ul.model
  ORDER BY total_cost DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 12: Grant permissions on new function
GRANT EXECUTE ON FUNCTION public.calculate_and_set_usage_cost() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_cost_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- Step 13: Add comment for documentation
COMMENT ON COLUMN public.usage_logs.cost IS 'Calculated cost in USD based on model pricing at time of request (stored value for performance)';
COMMENT ON FUNCTION public.calculate_and_set_usage_cost IS 'Trigger function that automatically calculates and sets the cost column on INSERT/UPDATE';
COMMENT ON FUNCTION public.get_cost_breakdown IS 'Returns cost breakdown by model for a specific user within a date range';

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
  v_has_cost BOOLEAN;
  v_trigger_exists BOOLEAN;
BEGIN
  -- Check if cost column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
    AND column_name = 'cost'
  ) INTO v_has_cost;

  -- Check if trigger exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    AND event_object_table = 'usage_logs'
    AND trigger_name = 'trg_calculate_usage_cost'
  ) INTO v_trigger_exists;

  IF v_has_cost THEN
    RAISE NOTICE '✓ Migration successful! cost column added to usage_logs';
  ELSE
    RAISE EXCEPTION '✗ Migration failed! cost column not found';
  END IF;

  IF v_trigger_exists THEN
    RAISE NOTICE '✓ Trigger created successfully! Cost will auto-calculate on INSERT/UPDATE';
  ELSE
    RAISE EXCEPTION '✗ Trigger creation failed!';
  END IF;

  RAISE NOTICE '✓ All indexes created successfully';
  RAISE NOTICE '✓ Helper functions updated to use stored cost';
  RAISE NOTICE '✓ Migration complete!';
END $$;

-- =====================================================
-- EXAMPLE QUERIES
-- =====================================================

-- Example 1: Get total cost for a user (now uses stored cost for better performance)
-- SELECT public.get_user_total_cost('your-user-uuid-here');

-- Example 2: Get cost breakdown by model
-- SELECT * FROM public.get_user_cost_by_model('your-user-uuid-here');

-- Example 3: Get daily usage with costs
-- SELECT * FROM public.get_user_daily_usage('your-user-uuid-here', 30);

-- Example 4: Get cost breakdown for specific date range
-- SELECT * FROM public.get_cost_breakdown(
--   'your-user-uuid-here',
--   '2025-01-01'::TIMESTAMPTZ,
--   '2025-01-31'::TIMESTAMPTZ
-- );

-- Example 5: Get recent logs with their calculated costs
-- SELECT
--   id,
--   created_at,
--   model,
--   input_tokens,
--   output_tokens,
--   cost,
--   metadata
-- FROM public.usage_logs
-- WHERE user_id = auth.uid()
-- ORDER BY created_at DESC
-- LIMIT 100;

-- Example 6: Get highest cost requests
-- SELECT
--   created_at,
--   model,
--   input_tokens,
--   output_tokens,
--   cost,
--   metadata->>'route' as route
-- FROM public.usage_logs
-- WHERE user_id = auth.uid()
-- ORDER BY cost DESC
-- LIMIT 20;

-- Example 7: Get total cost by route (from metadata)
-- SELECT
--   metadata->>'route' as route,
--   COUNT(*) as request_count,
--   SUM(cost) as total_cost,
--   AVG(cost) as avg_cost,
--   SUM(input_tokens) as total_input_tokens,
--   SUM(output_tokens) as total_output_tokens
-- FROM public.usage_logs
-- WHERE user_id = auth.uid()
--   AND created_at >= NOW() - INTERVAL '30 days'
-- GROUP BY metadata->>'route'
-- ORDER BY total_cost DESC;

-- =====================================================
-- NOTES
-- =====================================================
--
-- This migration adds a `cost` column that is automatically calculated
-- and stored when records are inserted or updated. Benefits include:
--
-- 1. Performance: Queries run faster since cost is pre-calculated
-- 2. Historical accuracy: Stores the cost at the time of request
-- 3. Simplicity: No need to recalculate costs in application code
-- 4. Analytics: Easier to generate cost reports and analytics
--
-- The trigger automatically calculates the cost using the model's
-- pricing structure from the calculate_usage_cost function.
--
-- RLS policies remain unchanged - users can still only view their
-- own usage logs, and the service role has full access.
