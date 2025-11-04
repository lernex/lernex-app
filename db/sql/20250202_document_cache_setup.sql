-- DOCUMENT CACHE SETUP
-- Hash-Based Deduplication System for Upload Documents
-- Created: 2025-02-02
-- Purpose: Prevent duplicate OCR processing by caching results using SHA-256 file hashes
-- Estimated Savings: 100% on duplicate uploads (common for students re-uploading notes)

BEGIN;

-- ============================================================================
-- TABLE: document_cache
-- ============================================================================
-- Stores OCR-extracted text indexed by file content hash (SHA-256)
-- User-scoped for privacy, 7-day TTL for freshness

CREATE TABLE IF NOT EXISTS public.document_cache (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_hash TEXT NOT NULL,
  text TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 1,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, file_hash),

  -- Ensure hash is valid SHA-256 (64 hex characters)
  CONSTRAINT valid_file_hash CHECK (file_hash ~ '^[a-f0-9]{64}$'),

  -- Ensure positive page count
  CONSTRAINT positive_page_count CHECK (page_count > 0),

  -- Ensure text is not empty
  CONSTRAINT non_empty_text CHECK (length(trim(text)) > 0)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for cache lookups (user_id + file_hash is already primary key)
-- Index for TTL-based cleanup queries
CREATE INDEX IF NOT EXISTS document_cache_extracted_at_idx
  ON public.document_cache (extracted_at DESC);

-- Index for per-user queries
CREATE INDEX IF NOT EXISTS document_cache_user_id_idx
  ON public.document_cache (user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.document_cache ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can read their own cached documents" ON public.document_cache;
DROP POLICY IF EXISTS "Users can insert their own cached documents" ON public.document_cache;
DROP POLICY IF EXISTS "Users can update their own cached documents" ON public.document_cache;
DROP POLICY IF EXISTS "Users can delete their own cached documents" ON public.document_cache;

-- SELECT: Users can only read their own cache entries
CREATE POLICY "Users can read their own cached documents"
  ON public.document_cache
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: Users can only create cache entries for themselves
CREATE POLICY "Users can insert their own cached documents"
  ON public.document_cache
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own cache entries
-- (Used by upsert operations when re-uploading same file)
CREATE POLICY "Users can update their own cached documents"
  ON public.document_cache
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can delete their own cache entries
-- (For manual cache invalidation if needed)
CREATE POLICY "Users can delete their own cached documents"
  ON public.document_cache
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- AUTOMATIC CLEANUP FUNCTION (Optional but recommended)
-- ============================================================================
-- Automatically delete cache entries older than 30 days
-- Runs daily to keep table size manageable

CREATE OR REPLACE FUNCTION public.cleanup_old_document_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.document_cache
  WHERE extracted_at < NOW() - INTERVAL '30 days';

  RAISE NOTICE 'Cleaned up document cache entries older than 30 days';
END;
$$;

-- Grant execute permission to authenticated users (though they won't call it directly)
GRANT EXECUTE ON FUNCTION public.cleanup_old_document_cache() TO authenticated;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.document_cache IS
  'Caches OCR-extracted document text indexed by SHA-256 file hash to prevent duplicate processing. User-scoped with 7-day query TTL.';

COMMENT ON COLUMN public.document_cache.user_id IS
  'User who uploaded the document. Privacy: users can only access their own cache entries.';

COMMENT ON COLUMN public.document_cache.file_hash IS
  'SHA-256 hash of file content (64 hex characters). Deterministic - same file always produces same hash.';

COMMENT ON COLUMN public.document_cache.text IS
  'OCR-extracted text content from the document. Can be large (PDFs with many pages).';

COMMENT ON COLUMN public.document_cache.page_count IS
  'Number of pages/images processed. Used for cache hit reporting.';

COMMENT ON COLUMN public.document_cache.extracted_at IS
  'Timestamp when OCR was performed. Used for TTL-based cache invalidation (7-day query filter).';

COMMENT ON COLUMN public.document_cache.created_at IS
  'Timestamp when cache entry was first created.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these after migration to verify setup:

-- 1. Check table exists and has correct structure
-- SELECT table_name, column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'document_cache'
-- ORDER BY ordinal_position;

-- 2. Check RLS is enabled
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'document_cache';

-- 3. Check policies exist
-- SELECT policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'document_cache';

-- 4. Check indexes exist
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'document_cache';

COMMIT;

-- ============================================================================
-- USAGE EXAMPLE
-- ============================================================================
--
-- Cache a document:
-- INSERT INTO public.document_cache (user_id, file_hash, text, page_count)
-- VALUES (auth.uid(), 'abc123...', 'extracted text here', 5)
-- ON CONFLICT (user_id, file_hash)
-- DO UPDATE SET
--   text = EXCLUDED.text,
--   page_count = EXCLUDED.page_count,
--   extracted_at = NOW();
--
-- Check for cached document:
-- SELECT text, page_count, extracted_at
-- FROM public.document_cache
-- WHERE user_id = auth.uid()
--   AND file_hash = 'abc123...'
--   AND extracted_at >= NOW() - INTERVAL '7 days'
-- LIMIT 1;
-- ============================================================================
