-- =====================================================
-- USAGE LOGS TABLE SCHEMA WITH RLS POLICIES
-- For tracking AI model usage, costs, and analytics
-- =====================================================

-- Create the usage_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- User and session tracking
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ip TEXT,

  -- Model information
  model TEXT NOT NULL,

  -- Token usage
  input_tokens INTEGER,
  output_tokens INTEGER,

  -- Metadata for analytics (JSONB for flexible storage)
  metadata JSONB DEFAULT '{}'::JSONB,

  -- Indexes for query performance
  CONSTRAINT usage_logs_input_tokens_check CHECK (input_tokens >= 0),
  CONSTRAINT usage_logs_output_tokens_check CHECK (output_tokens >= 0)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id
  ON public.usage_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at
  ON public.usage_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_model
  ON public.usage_logs(model);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created
  ON public.usage_logs(user_id, created_at DESC);

-- Composite index for common queries (user + date range)
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_date_model
  ON public.usage_logs(user_id, created_at DESC, model);

-- GIN index for metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_metadata
  ON public.usage_logs USING GIN(metadata);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on the table
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean re-run)
DROP POLICY IF EXISTS "Users can view their own usage logs" ON public.usage_logs;
DROP POLICY IF EXISTS "Service role can insert usage logs" ON public.usage_logs;
DROP POLICY IF EXISTS "Service role can view all usage logs" ON public.usage_logs;
DROP POLICY IF EXISTS "Service role can update usage logs" ON public.usage_logs;
DROP POLICY IF EXISTS "Service role can delete usage logs" ON public.usage_logs;
DROP POLICY IF EXISTS "Admins can view all usage logs" ON public.usage_logs;

-- Policy 1: Users can view their own usage logs
CREATE POLICY "Users can view their own usage logs"
  ON public.usage_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy 2: Service role can insert usage logs (for backend API)
-- This allows your API routes to insert logs without user authentication
CREATE POLICY "Service role can insert usage logs"
  ON public.usage_logs
  FOR INSERT
  TO authenticated, anon, service_role
  WITH CHECK (true);

-- Policy 3: Service role can view all usage logs (for admin dashboards)
CREATE POLICY "Service role can view all usage logs"
  ON public.usage_logs
  FOR SELECT
  TO service_role
  USING (true);

-- Policy 4: Service role can update usage logs (if needed)
CREATE POLICY "Service role can update usage logs"
  ON public.usage_logs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy 5: Service role can delete usage logs (for cleanup)
CREATE POLICY "Service role can delete usage logs"
  ON public.usage_logs
  FOR DELETE
  TO service_role
  USING (true);

-- Optional Policy 6: Admins can view all usage logs
-- (Create a profiles table column is_admin if you want this)
-- CREATE POLICY "Admins can view all usage logs"
--   ON public.usage_logs
--   FOR SELECT
--   TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.profiles
--       WHERE profiles.id = auth.uid()
--       AND profiles.is_admin = true
--     )
--   );

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to calculate cost based on model and tokens
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

-- Function to get total user cost
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

-- Function to get cost breakdown by model for a user
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

-- Function to get daily usage stats for a user
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

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant usage on the table to authenticated users
GRANT SELECT ON public.usage_logs TO authenticated;
GRANT INSERT ON public.usage_logs TO authenticated, anon, service_role;

-- Grant all permissions to service role
GRANT ALL ON public.usage_logs TO service_role;

-- Grant usage on helper functions
GRANT EXECUTE ON FUNCTION public.calculate_usage_cost(TEXT, INTEGER, INTEGER) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_total_cost(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_cost_by_model(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_daily_usage(UUID, INTEGER) TO authenticated, service_role;

-- =====================================================
-- EXAMPLE QUERIES
-- =====================================================

-- Example 1: Get total cost for a specific user
-- SELECT public.get_user_total_cost('your-user-uuid-here');

-- Example 2: Get cost breakdown by model for a user
-- SELECT * FROM public.get_user_cost_by_model('your-user-uuid-here');

-- Example 3: Get daily usage for the last 30 days
-- SELECT * FROM public.get_user_daily_usage('your-user-uuid-here', 30);

-- Example 4: Get recent logs with calculated costs
-- SELECT
--   id,
--   created_at,
--   model,
--   input_tokens,
--   output_tokens,
--   public.calculate_usage_cost(model, input_tokens, output_tokens) as cost,
--   metadata
-- FROM public.usage_logs
-- WHERE user_id = auth.uid()
-- ORDER BY created_at DESC
-- LIMIT 100;

-- Example 5: Get usage by route (from metadata)
-- SELECT
--   metadata->>'route' as route,
--   metadata->>'provider' as provider,
--   metadata->>'tier' as tier,
--   COUNT(*) as request_count,
--   SUM(input_tokens) as total_input,
--   SUM(output_tokens) as total_output,
--   SUM(public.calculate_usage_cost(model, input_tokens, output_tokens)) as total_cost
-- FROM public.usage_logs
-- WHERE user_id = auth.uid()
--   AND created_at >= NOW() - INTERVAL '30 days'
-- GROUP BY metadata->>'route', metadata->>'provider', metadata->>'tier'
-- ORDER BY total_cost DESC;

-- =====================================================
-- MAINTENANCE & CLEANUP
-- =====================================================

-- Optional: Create a function to clean up old logs (older than 90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_usage_logs()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.usage_logs
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Optional: Schedule cleanup using pg_cron (if available)
-- SELECT cron.schedule('cleanup-usage-logs', '0 2 * * 0', 'SELECT public.cleanup_old_usage_logs()');

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.usage_logs IS 'Tracks AI model usage, token consumption, and costs per user';
COMMENT ON COLUMN public.usage_logs.user_id IS 'Reference to the user who made the request (NULL for anonymous)';
COMMENT ON COLUMN public.usage_logs.model IS 'Model identifier matching pricing table (e.g., cerebras/gpt-oss-120b)';
COMMENT ON COLUMN public.usage_logs.input_tokens IS 'Number of input/prompt tokens consumed';
COMMENT ON COLUMN public.usage_logs.output_tokens IS 'Number of output/completion tokens generated';
COMMENT ON COLUMN public.usage_logs.metadata IS 'Additional context (route, provider, tier, subject, mode, etc.)';

COMMENT ON FUNCTION public.calculate_usage_cost IS 'Calculates the cost of a request based on model and token usage';
COMMENT ON FUNCTION public.get_user_total_cost IS 'Returns the total accumulated cost for a user across all requests';
COMMENT ON FUNCTION public.get_user_cost_by_model IS 'Returns cost breakdown by model for a specific user';
COMMENT ON FUNCTION public.get_user_daily_usage IS 'Returns daily aggregated usage statistics for a user';
