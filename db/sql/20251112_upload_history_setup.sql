-- UPLOAD HISTORY SETUP
-- Upload History and Resumption System
-- Created: 2025-11-12
-- Purpose: Track upload history and enable "generate more lessons" from past uploads
-- Benefits:
--   - Users can see their upload history
--   - Resume lesson generation from past uploads without re-processing
--   - Track which documents have been processed
--   - Avoid duplicate OCR charges

BEGIN;

-- ============================================================================
-- TABLE: upload_history
-- ============================================================================
-- Stores metadata and results from document uploads
-- Enables upload history viewing and lesson generation resumption

CREATE TABLE IF NOT EXISTS public.upload_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- File metadata
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL, -- SHA-256 hash for deduplication
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL, -- MIME type
  page_count INTEGER,

  -- Processing details
  subject TEXT NOT NULL DEFAULT 'General Studies',
  subject_confidence REAL, -- 0-1 confidence score from early detection
  subject_source TEXT, -- 'filename', 'firstPage', or 'default'

  -- Pipeline configuration used
  pipeline_tier TEXT, -- 'fast', 'balanced', 'premium'
  pipeline_config JSONB, -- Full PipelineConfig for reproducibility

  -- Extracted content (for "generate more lessons" feature)
  extracted_text TEXT, -- OCR'd text, compressed/truncated if too large
  text_preview TEXT, -- First 500 chars for display

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'failed'
  error_message TEXT, -- If status = 'failed'

  -- Results
  lesson_count INTEGER DEFAULT 0, -- Number of lessons generated
  lesson_ids TEXT[], -- Array of lesson IDs for reference

  -- Timestamps
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_file_hash CHECK (file_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT valid_status CHECK (status IN ('processing', 'completed', 'failed')),
  CONSTRAINT valid_pipeline_tier CHECK (pipeline_tier IS NULL OR pipeline_tier IN ('fast', 'balanced', 'premium')),
  CONSTRAINT positive_file_size CHECK (file_size > 0),
  CONSTRAINT non_negative_lesson_count CHECK (lesson_count >= 0)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary lookups by user
CREATE INDEX IF NOT EXISTS upload_history_user_id_idx
  ON public.upload_history (user_id, uploaded_at DESC);

-- Deduplication lookups (user + file hash)
CREATE INDEX IF NOT EXISTS upload_history_user_file_hash_idx
  ON public.upload_history (user_id, file_hash, uploaded_at DESC);

-- Status filtering
CREATE INDEX IF NOT EXISTS upload_history_status_idx
  ON public.upload_history (user_id, status, uploaded_at DESC);

-- Subject filtering
CREATE INDEX IF NOT EXISTS upload_history_subject_idx
  ON public.upload_history (user_id, subject, uploaded_at DESC);

-- Last accessed cleanup
CREATE INDEX IF NOT EXISTS upload_history_last_accessed_idx
  ON public.upload_history (last_accessed_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.upload_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can read their own upload history" ON public.upload_history;
DROP POLICY IF EXISTS "Users can insert their own upload history" ON public.upload_history;
DROP POLICY IF EXISTS "Users can update their own upload history" ON public.upload_history;
DROP POLICY IF EXISTS "Users can delete their own upload history" ON public.upload_history;

-- SELECT: Users can only read their own history
CREATE POLICY "Users can read their own upload history"
  ON public.upload_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: Users can only create history entries for themselves
CREATE POLICY "Users can insert their own upload history"
  ON public.upload_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own history entries
CREATE POLICY "Users can update their own upload history"
  ON public.upload_history
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can delete their own history entries
CREATE POLICY "Users can delete their own upload history"
  ON public.upload_history
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to update last_accessed_at when history is viewed
CREATE OR REPLACE FUNCTION public.touch_upload_history(history_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.upload_history
  SET last_accessed_at = NOW()
  WHERE id = history_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_upload_history(UUID) TO authenticated;

-- Function to cleanup old upload history (90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_upload_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.upload_history
  WHERE last_accessed_at < NOW() - INTERVAL '90 days';

  RAISE NOTICE 'Cleaned up upload history entries not accessed in 90 days';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_upload_history() TO authenticated;

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Recent uploads view (last 30 days)
CREATE OR REPLACE VIEW public.recent_uploads AS
SELECT
  id,
  user_id,
  file_name,
  subject,
  status,
  lesson_count,
  page_count,
  pipeline_tier,
  uploaded_at,
  completed_at,
  text_preview
FROM public.upload_history
WHERE uploaded_at >= NOW() - INTERVAL '30 days'
ORDER BY uploaded_at DESC;

-- Grant access to view
GRANT SELECT ON public.recent_uploads TO authenticated;

-- Apply RLS to view
ALTER VIEW public.recent_uploads SET (security_invoker = on);

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.upload_history IS
  'Upload history with resumption support. Tracks all uploads and enables "generate more lessons" without re-processing.';

COMMENT ON COLUMN public.upload_history.file_hash IS
  'SHA-256 hash of file content. Used for deduplication and cache lookups.';

COMMENT ON COLUMN public.upload_history.subject_confidence IS
  'Confidence score (0-1) from early subject detection. Higher = more confident.';

COMMENT ON COLUMN public.upload_history.subject_source IS
  'How subject was detected: filename, firstPage, or default.';

COMMENT ON COLUMN public.upload_history.pipeline_config IS
  'Full PipelineConfig JSON for reproducibility. Includes OCR and generation settings.';

COMMENT ON COLUMN public.upload_history.extracted_text IS
  'OCR-extracted text content. May be compressed or truncated for storage efficiency.';

COMMENT ON COLUMN public.upload_history.text_preview IS
  'First 500 characters of extracted text for quick preview in UI.';

COMMENT ON COLUMN public.upload_history.lesson_ids IS
  'Array of lesson IDs generated from this upload for easy reference.';

COMMENT ON COLUMN public.upload_history.last_accessed_at IS
  'Last time user viewed or used this upload. Used for cleanup after 90 days of inactivity.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these after migration to verify setup:

-- 1. Check table exists and has correct structure
-- SELECT table_name, column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'upload_history'
-- ORDER BY ordinal_position;

-- 2. Check RLS is enabled
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'upload_history';

-- 3. Check policies exist
-- SELECT policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'upload_history';

-- 4. Check indexes exist
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'upload_history';

-- 5. Check functions exist
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name LIKE '%upload_history%';

COMMIT;

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================
--
-- 1. Create upload history entry when upload starts:
-- INSERT INTO public.upload_history (
--   user_id, file_name, file_hash, file_size, file_type,
--   subject, subject_confidence, subject_source,
--   pipeline_tier, pipeline_config, status
-- ) VALUES (
--   auth.uid(),
--   'algebra-notes.pdf',
--   'abc123...',
--   1048576,
--   'application/pdf',
--   'Algebra',
--   0.85,
--   'filename',
--   'balanced',
--   '{"tier":"balanced",...}'::jsonb,
--   'processing'
-- ) RETURNING id;
--
-- 2. Update when processing completes:
-- UPDATE public.upload_history
-- SET
--   status = 'completed',
--   completed_at = NOW(),
--   extracted_text = 'OCR text here...',
--   text_preview = 'First 500 chars...',
--   lesson_count = 5,
--   lesson_ids = ARRAY['lesson-1', 'lesson-2', ...],
--   page_count = 10
-- WHERE id = 'upload-id' AND user_id = auth.uid();
--
-- 3. Get user's recent uploads:
-- SELECT * FROM public.recent_uploads
-- WHERE user_id = auth.uid()
-- ORDER BY uploaded_at DESC
-- LIMIT 10;
--
-- 4. Check if file was previously uploaded:
-- SELECT id, extracted_text, lesson_ids
-- FROM public.upload_history
-- WHERE user_id = auth.uid()
--   AND file_hash = 'abc123...'
--   AND status = 'completed'
-- ORDER BY uploaded_at DESC
-- LIMIT 1;
--
-- 5. Generate more lessons from past upload:
-- SELECT extracted_text, pipeline_config, subject
-- FROM public.upload_history
-- WHERE id = 'upload-id' AND user_id = auth.uid();
-- (Then use extracted_text to generate new lessons without re-OCR)
-- ============================================================================
