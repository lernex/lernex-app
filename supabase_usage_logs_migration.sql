-- =====================================================
-- USAGE LOGS TABLE MIGRATION SCRIPT
-- Adds metadata column and updates existing schema
-- Safe to run multiple times (idempotent)
-- =====================================================

-- Step 1: Add metadata column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD COLUMN metadata JSONB DEFAULT '{}'::JSONB;

    RAISE NOTICE 'Added metadata column to usage_logs table';
  ELSE
    RAISE NOTICE 'metadata column already exists';
  END IF;
END $$;

-- Step 2: Ensure other columns exist with correct types
DO $$
BEGIN
  -- Add id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
    AND column_name = 'id'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD COLUMN id UUID DEFAULT gen_random_uuid() PRIMARY KEY;
  END IF;

  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
  END IF;

  -- Add user_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add ip column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
    AND column_name = 'ip'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD COLUMN ip TEXT;
  END IF;

  -- Add model column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
    AND column_name = 'model'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD COLUMN model TEXT NOT NULL;
  END IF;

  -- Add input_tokens column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
    AND column_name = 'input_tokens'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD COLUMN input_tokens INTEGER;
  END IF;

  -- Add output_tokens column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
    AND column_name = 'output_tokens'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD COLUMN output_tokens INTEGER;
  END IF;
END $$;

-- Step 3: Add constraints if they don't exist
DO $$
BEGIN
  -- Check for input_tokens constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'usage_logs_input_tokens_check'
    AND table_name = 'usage_logs'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD CONSTRAINT usage_logs_input_tokens_check CHECK (input_tokens >= 0);
  END IF;

  -- Check for output_tokens constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'usage_logs_output_tokens_check'
    AND table_name = 'usage_logs'
  ) THEN
    ALTER TABLE public.usage_logs
    ADD CONSTRAINT usage_logs_output_tokens_check CHECK (output_tokens >= 0);
  END IF;
END $$;

-- Step 4: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id
  ON public.usage_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at
  ON public.usage_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_model
  ON public.usage_logs(model);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created
  ON public.usage_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_date_model
  ON public.usage_logs(user_id, created_at DESC, model);

CREATE INDEX IF NOT EXISTS idx_usage_logs_metadata
  ON public.usage_logs USING GIN(metadata);

-- Step 5: Enable RLS if not already enabled
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- Step 6: Drop and recreate policies (safe approach)
DROP POLICY IF EXISTS "Users can view their own usage logs" ON public.usage_logs;
DROP POLICY IF EXISTS "Service role can insert usage logs" ON public.usage_logs;
DROP POLICY IF EXISTS "Service role can view all usage logs" ON public.usage_logs;
DROP POLICY IF EXISTS "Service role can update usage logs" ON public.usage_logs;
DROP POLICY IF EXISTS "Service role can delete usage logs" ON public.usage_logs;

-- Create policies
CREATE POLICY "Users can view their own usage logs"
  ON public.usage_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert usage logs"
  ON public.usage_logs
  FOR INSERT
  TO authenticated, anon, service_role
  WITH CHECK (true);

CREATE POLICY "Service role can view all usage logs"
  ON public.usage_logs
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can update usage logs"
  ON public.usage_logs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete usage logs"
  ON public.usage_logs
  FOR DELETE
  TO service_role
  USING (true);

-- Step 7: Create or replace helper functions
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

CREATE OR REPLACE FUNCTION public.get_user_total_cost(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_total_cost NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(
    public.calculate_usage_cost(
      model,
      COALESCE(input_tokens, 0),
      COALESCE(output_tokens, 0)
    )
  ), 0)
  INTO v_total_cost
  FROM public.usage_logs
  WHERE user_id = p_user_id;

  RETURN v_total_cost;
END;
$$ LANGUAGE plpgsql STABLE;

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
    SUM(public.calculate_usage_cost(
      ul.model,
      COALESCE(ul.input_tokens, 0),
      COALESCE(ul.output_tokens, 0)
    )) as total_cost,
    COUNT(*)::BIGINT as request_count
  FROM public.usage_logs ul
  WHERE ul.user_id = p_user_id
  GROUP BY ul.model
  ORDER BY total_cost DESC;
END;
$$ LANGUAGE plpgsql STABLE;

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
    SUM(public.calculate_usage_cost(
      ul.model,
      COALESCE(ul.input_tokens, 0),
      COALESCE(ul.output_tokens, 0)
    )) as total_cost
  FROM public.usage_logs ul
  WHERE ul.user_id = p_user_id
    AND ul.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY DATE(ul.created_at)
  ORDER BY DATE(ul.created_at) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 8: Grant permissions
GRANT SELECT ON public.usage_logs TO authenticated;
GRANT INSERT ON public.usage_logs TO authenticated, anon, service_role;
GRANT ALL ON public.usage_logs TO service_role;

GRANT EXECUTE ON FUNCTION public.calculate_usage_cost(TEXT, INTEGER, INTEGER) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_total_cost(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_cost_by_model(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_daily_usage(UUID, INTEGER) TO authenticated, service_role;

-- Step 9: Add comments
COMMENT ON TABLE public.usage_logs IS 'Tracks AI model usage, token consumption, and costs per user';
COMMENT ON COLUMN public.usage_logs.user_id IS 'Reference to the user who made the request (NULL for anonymous)';
COMMENT ON COLUMN public.usage_logs.model IS 'Model identifier matching pricing table (e.g., cerebras/gpt-oss-120b)';
COMMENT ON COLUMN public.usage_logs.input_tokens IS 'Number of input/prompt tokens consumed';
COMMENT ON COLUMN public.usage_logs.output_tokens IS 'Number of output/completion tokens generated';
COMMENT ON COLUMN public.usage_logs.metadata IS 'Additional context (route, provider, tier, subject, mode, etc.)';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify the table structure
DO $$
DECLARE
  v_has_metadata BOOLEAN;
  v_table_exists BOOLEAN;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'usage_logs table does not exist!';
  END IF;

  -- Check if metadata column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'usage_logs'
    AND column_name = 'metadata'
  ) INTO v_has_metadata;

  IF v_has_metadata THEN
    RAISE NOTICE '✓ Migration successful! usage_logs table has metadata column';
  ELSE
    RAISE EXCEPTION '✗ Migration failed! metadata column not found';
  END IF;

  RAISE NOTICE '✓ All functions created successfully';
  RAISE NOTICE '✓ All indexes created successfully';
  RAISE NOTICE '✓ RLS policies configured successfully';
END $$;

-- Show table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'usage_logs'
ORDER BY ordinal_position;
