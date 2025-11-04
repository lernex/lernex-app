-- SHARED DOCUMENT CACHE SETUP
-- Collaborative OCR Result Sharing Across Users
-- Created: 2025-02-04
-- Purpose: Share OCR results for common academic documents (textbooks, papers) across all users
-- Estimated Savings: 99% for popular textbooks (process once, use thousands of times)

BEGIN;

-- ============================================================================
-- TABLE: shared_document_cache
-- ============================================================================
-- Stores OCR-extracted text for documents shared across all users
-- Uses content-based fingerprinting (first 10KB + last 10KB + file size)
-- 30-day TTL for freshness, tracks usage count for analytics

CREATE TABLE IF NOT EXISTS public.shared_document_cache (
  fingerprint TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  title TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure fingerprint is valid SHA-256 (64 hex characters)
  CONSTRAINT valid_fingerprint CHECK (fingerprint ~ '^[a-f0-9]{64}$'),

  -- Ensure positive page count
  CONSTRAINT positive_page_count CHECK (page_count > 0),

  -- Ensure positive usage count
  CONSTRAINT positive_usage_count CHECK (usage_count > 0),

  -- Ensure text is not empty
  CONSTRAINT non_empty_text CHECK (length(trim(text)) > 0),

  -- Ensure title is not empty
  CONSTRAINT non_empty_title CHECK (length(trim(title)) > 0)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for TTL-based cleanup queries
CREATE INDEX IF NOT EXISTS shared_document_cache_created_at_idx
  ON public.shared_document_cache (created_at DESC);

-- Index for analytics queries (most popular documents)
CREATE INDEX IF NOT EXISTS shared_document_cache_usage_count_idx
  ON public.shared_document_cache (usage_count DESC);

-- Index for title search (analytics/debugging)
CREATE INDEX IF NOT EXISTS shared_document_cache_title_idx
  ON public.shared_document_cache USING gin(to_tsvector('english', title));

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Different from user-scoped cache: ALL authenticated users can read
-- This enables cross-user sharing of common documents

ALTER TABLE public.shared_document_cache ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can read shared documents" ON public.shared_document_cache;
DROP POLICY IF EXISTS "Authenticated users can insert shared documents" ON public.shared_document_cache;
DROP POLICY IF EXISTS "No direct updates allowed" ON public.shared_document_cache;
DROP POLICY IF EXISTS "No direct deletes allowed" ON public.shared_document_cache;

-- SELECT: All authenticated users can read any cached document
-- This is the core of collaborative caching - anyone can benefit from
-- documents that other users have already processed
CREATE POLICY "Anyone can read shared documents"
  ON public.shared_document_cache
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: All authenticated users can share new documents
-- Uses upsert to handle race conditions (multiple users uploading same document)
CREATE POLICY "Authenticated users can insert shared documents"
  ON public.shared_document_cache
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: Only via RPC functions (increment_shared_document_usage)
-- Prevents manual tampering with usage counts or cached text
CREATE POLICY "No direct updates allowed"
  ON public.shared_document_cache
  FOR UPDATE
  USING (false);

-- DELETE: Only via cleanup function (automatic 30-day TTL)
-- Prevents users from deleting shared cache entries
CREATE POLICY "No direct deletes allowed"
  ON public.shared_document_cache
  FOR DELETE
  USING (false);

-- ============================================================================
-- RPC FUNCTION: Increment Usage Count
-- ============================================================================
-- Atomically increments usage_count for a shared document
-- Called when a cache hit occurs to track popularity

CREATE OR REPLACE FUNCTION public.increment_shared_document_usage(
  p_fingerprint TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Atomically increment usage count
  UPDATE public.shared_document_cache
  SET usage_count = usage_count + 1
  WHERE fingerprint = p_fingerprint;

  -- Log for debugging (optional)
  IF NOT FOUND THEN
    RAISE NOTICE 'Document with fingerprint % not found in shared cache', p_fingerprint;
  END IF;
END;
$$;

-- Grant execute permission to all authenticated users
GRANT EXECUTE ON FUNCTION public.increment_shared_document_usage(TEXT) TO authenticated;

-- ============================================================================
-- AUTOMATIC CLEANUP FUNCTION
-- ============================================================================
-- Automatically delete cache entries older than 30 days
-- Runs daily to keep table size manageable and content fresh

CREATE OR REPLACE FUNCTION public.cleanup_old_shared_document_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete entries older than 30 days
  DELETE FROM public.shared_document_cache
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE NOTICE 'Cleaned up % shared document cache entries older than 30 days', deleted_count;
END;
$$;

-- Grant execute permission (for scheduled jobs or admin maintenance)
GRANT EXECUTE ON FUNCTION public.cleanup_old_shared_document_cache() TO authenticated;

-- ============================================================================
-- ANALYTICS FUNCTION: Get Popular Documents
-- ============================================================================
-- Returns most frequently used documents for analytics
-- Useful for understanding which textbooks are most common

CREATE OR REPLACE FUNCTION public.get_popular_shared_documents(
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  fingerprint TEXT,
  title TEXT,
  page_count INTEGER,
  usage_count INTEGER,
  created_at TIMESTAMPTZ,
  estimated_savings_usd NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sdc.fingerprint,
    sdc.title,
    sdc.page_count,
    sdc.usage_count,
    sdc.created_at,
    -- Calculate estimated savings: (usage_count - 1) * page_count * $0.000104 per page
    ROUND(((sdc.usage_count - 1) * sdc.page_count * 0.000104)::NUMERIC, 4) as estimated_savings_usd
  FROM public.shared_document_cache sdc
  ORDER BY sdc.usage_count DESC
  LIMIT limit_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_popular_shared_documents(INTEGER) TO authenticated;

-- ============================================================================
-- ANALYTICS FUNCTION: Get Cache Statistics
-- ============================================================================
-- Returns overall cache statistics for monitoring

CREATE OR REPLACE FUNCTION public.get_shared_cache_stats()
RETURNS TABLE (
  total_documents BIGINT,
  total_usage_count BIGINT,
  total_pages_cached BIGINT,
  total_savings_usd NUMERIC,
  avg_usage_per_document NUMERIC,
  most_used_title TEXT,
  most_used_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_documents,
    SUM(usage_count)::BIGINT as total_usage_count,
    SUM(page_count)::BIGINT as total_pages_cached,
    ROUND(SUM((usage_count - 1) * page_count * 0.000104)::NUMERIC, 2) as total_savings_usd,
    ROUND(AVG(usage_count)::NUMERIC, 2) as avg_usage_per_document,
    (SELECT title FROM public.shared_document_cache ORDER BY usage_count DESC LIMIT 1) as most_used_title,
    (SELECT usage_count FROM public.shared_document_cache ORDER BY usage_count DESC LIMIT 1) as most_used_count
  FROM public.shared_document_cache;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_shared_cache_stats() TO authenticated;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.shared_document_cache IS
  'Collaborative cache for sharing OCR results of common academic documents across all users. 30-day TTL, tracks usage for analytics.';

COMMENT ON COLUMN public.shared_document_cache.fingerprint IS
  'Content-based fingerprint (SHA-256 of first 10KB + last 10KB + file size). Identifies document regardless of filename.';

COMMENT ON COLUMN public.shared_document_cache.text IS
  'OCR-extracted text content shared across all users. Can be large for multi-page textbooks.';

COMMENT ON COLUMN public.shared_document_cache.title IS
  'Document title for analytics and debugging. Helps identify which textbooks are most commonly uploaded.';

COMMENT ON COLUMN public.shared_document_cache.page_count IS
  'Number of pages processed. Used for cache hit reporting and cost savings calculations.';

COMMENT ON COLUMN public.shared_document_cache.usage_count IS
  'Number of times this document has been used. Incremented atomically via increment_shared_document_usage().';

COMMENT ON COLUMN public.shared_document_cache.created_at IS
  'Timestamp when document was first shared. Used for 30-day TTL cleanup.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these after migration to verify setup:

-- 1. Check table exists and has correct structure
-- SELECT table_name, column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'shared_document_cache'
-- ORDER BY ordinal_position;

-- 2. Check RLS is enabled
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'shared_document_cache';

-- 3. Check policies exist
-- SELECT policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'shared_document_cache';

-- 4. Check indexes exist
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'shared_document_cache';

-- 5. Check functions exist
-- SELECT proname, prosrc
-- FROM pg_proc
-- WHERE proname LIKE '%shared_document%';

COMMIT;

-- ============================================================================
-- USAGE EXAMPLE
-- ============================================================================
--
-- 1. Check if document is already in shared cache:
-- SELECT text, page_count, usage_count, created_at
-- FROM public.shared_document_cache
-- WHERE fingerprint = 'abc123...'
--   AND created_at >= NOW() - INTERVAL '30 days'
-- LIMIT 1;
--
-- 2. Share a new document (if not found):
-- INSERT INTO public.shared_document_cache (fingerprint, text, title, page_count)
-- VALUES ('abc123...', 'extracted text here', 'Introduction to Calculus', 250)
-- ON CONFLICT (fingerprint) DO NOTHING;
--
-- 3. Increment usage count on cache hit:
-- SELECT public.increment_shared_document_usage('abc123...');
--
-- 4. Get analytics on most popular documents:
-- SELECT * FROM public.get_popular_shared_documents(10);
--
-- 5. Get overall cache statistics:
-- SELECT * FROM public.get_shared_cache_stats();
-- ============================================================================
