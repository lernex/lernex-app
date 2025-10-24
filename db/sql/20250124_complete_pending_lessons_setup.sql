-- =====================================================
-- COMPLETE PENDING LESSONS SYSTEM SETUP
-- =====================================================
-- This file contains ALL necessary database changes for the
-- pending lessons pre-generation system to work properly.
-- Run this file ONCE to set up everything needed.
-- =====================================================

BEGIN;

-- =====================================================
-- 1. ENSURE PROFILES TABLE HAS SUBSCRIPTION_TIER
-- =====================================================

-- Add subscription_tier column if it doesn't exist
-- This column is used to determine which AI models to use (fast/slow, tier-specific pricing)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'subscription_tier'
    ) THEN
        ALTER TABLE public.profiles
        ADD COLUMN subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'plus', 'premium'));

        COMMENT ON COLUMN public.profiles.subscription_tier IS 'User subscription tier: free, plus, or premium. Determines AI model access and pricing.';
    END IF;
END $$;

-- Create index for efficient tier-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier
    ON public.profiles(subscription_tier);

-- Backfill subscription_tier based on existing boolean columns (if they exist)
-- This migration is safe to run multiple times and handles missing columns gracefully
DO $$
DECLARE
    has_is_premium BOOLEAN;
    has_premium BOOLEAN;
    has_plus BOOLEAN;
BEGIN
    -- Check which columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_premium'
    ) INTO has_is_premium;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'premium'
    ) INTO has_premium;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'plus'
    ) INTO has_plus;

    -- Backfill based on available columns
    IF has_is_premium AND has_premium AND has_plus THEN
        -- All columns exist
        UPDATE public.profiles
        SET subscription_tier = CASE
            WHEN is_premium = true OR premium = true THEN 'premium'
            WHEN plus = true THEN 'plus'
            ELSE 'free'
        END
        WHERE subscription_tier IS NULL;

    ELSIF has_premium AND has_plus THEN
        -- Only premium and plus exist (no is_premium)
        UPDATE public.profiles
        SET subscription_tier = CASE
            WHEN premium = true THEN 'premium'
            WHEN plus = true THEN 'plus'
            ELSE 'free'
        END
        WHERE subscription_tier IS NULL;

    ELSIF has_plus THEN
        -- Only plus exists
        UPDATE public.profiles
        SET subscription_tier = CASE
            WHEN plus = true THEN 'plus'
            ELSE 'free'
        END
        WHERE subscription_tier IS NULL;

    ELSE
        -- No boolean columns exist, just set to 'free'
        UPDATE public.profiles
        SET subscription_tier = 'free'
        WHERE subscription_tier IS NULL;
    END IF;

    RAISE NOTICE 'Backfill complete. Columns found: is_premium=%, premium=%, plus=%', has_is_premium, has_premium, has_plus;
END $$;

-- =====================================================
-- 2. CREATE USER_PENDING_LESSONS TABLE
-- =====================================================

-- This table stores lessons that are generated ahead of time but not yet completed
-- Lessons are removed from this table when completed to free up storage
CREATE TABLE IF NOT EXISTS public.user_pending_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    topic_label TEXT NOT NULL,
    lesson JSONB NOT NULL,
    model_speed TEXT NOT NULL CHECK (model_speed IN ('fast', 'slow')),
    generation_tier TEXT NOT NULL CHECK (generation_tier IN ('free', 'plus', 'premium')),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT user_pending_lessons_position_check CHECK (position >= 0)
);

-- Add helpful comments
COMMENT ON TABLE public.user_pending_lessons IS 'Stores pre-generated lessons for users, queued by position. Lessons are removed after completion.';
COMMENT ON COLUMN public.user_pending_lessons.position IS 'Queue position: 0 = next lesson to show, 1 = lesson after that, etc.';
COMMENT ON COLUMN public.user_pending_lessons.model_speed IS 'Speed of model used: fast (expensive, immediate) or slow (cheap, background)';
COMMENT ON COLUMN public.user_pending_lessons.generation_tier IS 'User tier at time of generation: free, plus, or premium';
COMMENT ON COLUMN public.user_pending_lessons.lesson IS 'Full lesson data in JSONB format (id, title, content, questions, etc.)';

-- =====================================================
-- 3. CREATE INDEXES FOR EFFICIENT QUERYING
-- =====================================================

-- Index for finding the next lesson for a user/subject
CREATE INDEX IF NOT EXISTS idx_user_pending_lessons_user_subject
    ON public.user_pending_lessons (user_id, subject);

-- Index for getting lessons by position (queue order)
CREATE INDEX IF NOT EXISTS idx_user_pending_lessons_position
    ON public.user_pending_lessons (user_id, subject, position ASC);

-- Index for finding lessons by creation date (cleanup queries)
CREATE INDEX IF NOT EXISTS idx_user_pending_lessons_created
    ON public.user_pending_lessons (user_id, created_at DESC);

-- Index for finding lessons by topic
CREATE INDEX IF NOT EXISTS idx_user_pending_lessons_topic
    ON public.user_pending_lessons (user_id, subject, topic_label);

-- Unique constraint: only one lesson per user/subject/position
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_pending_lessons_unique_position
    ON public.user_pending_lessons (user_id, subject, position);

-- Composite index for common queries (user + subject + position)
CREATE INDEX IF NOT EXISTS idx_user_pending_lessons_composite
    ON public.user_pending_lessons (user_id, subject, position ASC, created_at DESC);

-- =====================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on the table
ALTER TABLE public.user_pending_lessons ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean re-run)
DROP POLICY IF EXISTS "Users read own pending lessons" ON public.user_pending_lessons;
DROP POLICY IF EXISTS "Users insert own pending lessons" ON public.user_pending_lessons;
DROP POLICY IF EXISTS "Users update own pending lessons" ON public.user_pending_lessons;
DROP POLICY IF EXISTS "Users delete own pending lessons" ON public.user_pending_lessons;
DROP POLICY IF EXISTS "Service role full access to pending lessons" ON public.user_pending_lessons;

-- Policy 1: Users can read their own pending lessons
CREATE POLICY "Users read own pending lessons"
    ON public.user_pending_lessons
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy 2: Users can insert their own pending lessons
CREATE POLICY "Users insert own pending lessons"
    ON public.user_pending_lessons
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Policy 3: Users can update their own pending lessons
CREATE POLICY "Users update own pending lessons"
    ON public.user_pending_lessons
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy 4: Users can delete their own pending lessons
CREATE POLICY "Users delete own pending lessons"
    ON public.user_pending_lessons
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy 5: Service role has full access (for admin tasks, debugging)
CREATE POLICY "Service role full access to pending lessons"
    ON public.user_pending_lessons
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- 5. HELPER FUNCTIONS
-- =====================================================

-- Function to clean up stale pending lessons (older than specified days)
-- This is called automatically in the completion API and can be run manually
CREATE OR REPLACE FUNCTION public.cleanup_stale_pending_lessons(
    p_user_id UUID DEFAULT NULL,
    p_max_age_days INTEGER DEFAULT 7
)
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
    v_cutoff_date TIMESTAMPTZ;
BEGIN
    v_cutoff_date := NOW() - (p_max_age_days || ' days')::INTERVAL;

    IF p_user_id IS NOT NULL THEN
        -- Clean up for specific user
        DELETE FROM public.user_pending_lessons
        WHERE user_id = p_user_id
          AND created_at < v_cutoff_date;
    ELSE
        -- Clean up for all users (admin operation)
        DELETE FROM public.user_pending_lessons
        WHERE created_at < v_cutoff_date;
    END IF;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.cleanup_stale_pending_lessons IS 'Removes pending lessons older than specified days. Prevents database bloat from abandoned lessons.';

-- Function to get pending lesson statistics for a user
CREATE OR REPLACE FUNCTION public.get_pending_lessons_stats(p_user_id UUID)
RETURNS TABLE(
    subject TEXT,
    topic_label TEXT,
    lesson_count BIGINT,
    oldest_lesson_age_hours NUMERIC,
    newest_lesson_age_hours NUMERIC,
    model_speed_breakdown JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        upl.subject,
        upl.topic_label,
        COUNT(*)::BIGINT as lesson_count,
        ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(upl.created_at))) / 3600, 2) as oldest_lesson_age_hours,
        ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(upl.created_at))) / 3600, 2) as newest_lesson_age_hours,
        jsonb_object_agg(
            upl.model_speed,
            COUNT(*)
        ) as model_speed_breakdown
    FROM public.user_pending_lessons upl
    WHERE upl.user_id = p_user_id
    GROUP BY upl.subject, upl.topic_label
    ORDER BY lesson_count DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_pending_lessons_stats IS 'Returns statistics about pending lessons for a user, grouped by subject and topic.';

-- Function to get total pending lessons count for a user
CREATE OR REPLACE FUNCTION public.count_user_pending_lessons(
    p_user_id UUID,
    p_subject TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF p_subject IS NOT NULL THEN
        SELECT COUNT(*)::INTEGER INTO v_count
        FROM public.user_pending_lessons
        WHERE user_id = p_user_id AND subject = p_subject;
    ELSE
        SELECT COUNT(*)::INTEGER INTO v_count
        FROM public.user_pending_lessons
        WHERE user_id = p_user_id;
    END IF;

    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.count_user_pending_lessons IS 'Returns total count of pending lessons for a user, optionally filtered by subject.';

-- Function to validate and fix position gaps in the queue
-- This ensures positions are sequential (0, 1, 2...) with no gaps
CREATE OR REPLACE FUNCTION public.normalize_pending_lesson_positions(
    p_user_id UUID,
    p_subject TEXT
)
RETURNS INTEGER AS $$
DECLARE
    v_lesson RECORD;
    v_new_position INTEGER := 0;
    v_updated_count INTEGER := 0;
BEGIN
    -- Get all lessons for user/subject ordered by position
    FOR v_lesson IN
        SELECT id, position
        FROM public.user_pending_lessons
        WHERE user_id = p_user_id AND subject = p_subject
        ORDER BY position ASC, created_at ASC
    LOOP
        -- If position doesn't match expected, update it
        IF v_lesson.position != v_new_position THEN
            UPDATE public.user_pending_lessons
            SET position = v_new_position, updated_at = NOW()
            WHERE id = v_lesson.id;

            v_updated_count := v_updated_count + 1;
        END IF;

        v_new_position := v_new_position + 1;
    END LOOP;

    RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.normalize_pending_lesson_positions IS 'Fixes position gaps in pending lesson queue, ensuring sequential positions (0, 1, 2...).';

-- =====================================================
-- 6. ENSURE USAGE_LOGS TABLE EXISTS WITH PROPER STRUCTURE
-- =====================================================

-- Create usage_logs table if it doesn't exist (should already exist from other migration)
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ip TEXT,
    model TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    metadata JSONB DEFAULT '{}'::JSONB,

    CONSTRAINT usage_logs_input_tokens_check CHECK (input_tokens >= 0),
    CONSTRAINT usage_logs_output_tokens_check CHECK (output_tokens >= 0)
);

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON public.usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON public.usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created ON public.usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_metadata ON public.usage_logs USING GIN(metadata);

-- Ensure RLS is enabled
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- Ensure basic policies exist for usage_logs
DO $$
BEGIN
    -- Check if policy exists before creating
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'usage_logs'
        AND policyname = 'Users can view their own usage logs'
    ) THEN
        CREATE POLICY "Users can view their own usage logs"
            ON public.usage_logs
            FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'usage_logs'
        AND policyname = 'Service role can insert usage logs'
    ) THEN
        CREATE POLICY "Service role can insert usage logs"
            ON public.usage_logs
            FOR INSERT
            TO authenticated, anon, service_role
            WITH CHECK (true);
    END IF;
END $$;

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

-- Grant usage on user_pending_lessons table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_pending_lessons TO authenticated;
GRANT ALL ON public.user_pending_lessons TO service_role;

-- Grant sequence usage (for ID generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.cleanup_stale_pending_lessons(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_lessons_stats(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_user_pending_lessons(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_pending_lesson_positions(UUID, TEXT) TO authenticated, service_role;

-- =====================================================
-- 8. VERIFICATION QUERIES
-- =====================================================

-- These queries help verify the setup is correct
-- Run these after migration to confirm everything works

-- Verify profiles table has subscription_tier
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'subscription_tier'
    ) THEN
        RAISE EXCEPTION 'ERROR: profiles.subscription_tier column not found!';
    ELSE
        RAISE NOTICE 'SUCCESS: profiles.subscription_tier column exists';
    END IF;
END $$;

-- Verify user_pending_lessons table exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'user_pending_lessons'
    ) THEN
        RAISE EXCEPTION 'ERROR: user_pending_lessons table not found!';
    ELSE
        RAISE NOTICE 'SUCCESS: user_pending_lessons table exists';
    END IF;
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'user_pending_lessons'
        AND rowsecurity = true
    ) THEN
        RAISE WARNING 'WARNING: RLS not enabled on user_pending_lessons';
    ELSE
        RAISE NOTICE 'SUCCESS: RLS enabled on user_pending_lessons';
    END IF;
END $$;

-- Verify policies exist
DO $$
DECLARE
    v_policy_count INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'user_pending_lessons';

    IF v_policy_count < 4 THEN
        RAISE WARNING 'WARNING: Expected at least 4 RLS policies, found %', v_policy_count;
    ELSE
        RAISE NOTICE 'SUCCESS: Found % RLS policies for user_pending_lessons', v_policy_count;
    END IF;
END $$;

-- =====================================================
-- 9. EXAMPLE USAGE QUERIES
-- =====================================================

-- Example 1: Get all pending lessons for current user
-- SELECT * FROM public.user_pending_lessons
-- WHERE user_id = auth.uid()
-- ORDER BY subject, position;

-- Example 2: Get next lesson to show (position 0)
-- SELECT lesson FROM public.user_pending_lessons
-- WHERE user_id = auth.uid()
--   AND subject = 'Math'
--   AND position = 0
-- LIMIT 1;

-- Example 3: Count pending lessons by subject
-- SELECT subject, COUNT(*) as lesson_count
-- FROM public.user_pending_lessons
-- WHERE user_id = auth.uid()
-- GROUP BY subject;

-- Example 4: Get pending lesson statistics
-- SELECT * FROM public.get_pending_lessons_stats(auth.uid());

-- Example 5: Clean up old pending lessons (manually)
-- SELECT public.cleanup_stale_pending_lessons(auth.uid(), 7);

-- Example 6: Verify queue positions are sequential
-- SELECT public.normalize_pending_lesson_positions(auth.uid(), 'Math');

-- Example 7: Check for cost savings (compare fast vs slow model usage)
-- SELECT
--   metadata->>'modelSpeed' as speed,
--   COUNT(*) as generation_count,
--   SUM(COALESCE(input_tokens, 0)) as total_input_tokens,
--   SUM(COALESCE(output_tokens, 0)) as total_output_tokens
-- FROM public.usage_logs
-- WHERE user_id = auth.uid()
--   AND metadata->>'feature' = 'fyp-lesson'
--   AND created_at > NOW() - INTERVAL '30 days'
-- GROUP BY metadata->>'modelSpeed'
-- ORDER BY speed;

-- =====================================================
-- 10. MAINTENANCE NOTES
-- =====================================================

-- AUTOMATIC CLEANUP:
-- Stale lessons (>7 days) are automatically cleaned up when users complete lessons
-- via the /api/fyp/complete endpoint.

-- MANUAL CLEANUP (if needed):
-- Run this to clean up old pending lessons for all users:
-- SELECT public.cleanup_stale_pending_lessons(NULL, 7);

-- MONITORING:
-- Check pending lesson queue sizes:
-- SELECT user_id, subject, COUNT(*) as queue_size
-- FROM public.user_pending_lessons
-- GROUP BY user_id, subject
-- HAVING COUNT(*) > 5
-- ORDER BY queue_size DESC;

-- Check for stale lessons:
-- SELECT user_id, subject, COUNT(*) as stale_count
-- FROM public.user_pending_lessons
-- WHERE created_at < NOW() - INTERVAL '7 days'
-- GROUP BY user_id, subject
-- ORDER BY stale_count DESC;

COMMIT;

-- =====================================================
-- MIGRATION COMPLETE!
-- =====================================================

-- Verify the setup by checking:
-- 1. profiles.subscription_tier column exists
-- 2. user_pending_lessons table exists with all indexes
-- 3. RLS policies are in place
-- 4. Helper functions are available
-- 5. Permissions are granted

-- If you see SUCCESS messages above, everything is ready!
-- The pending lessons system is now fully operational.
