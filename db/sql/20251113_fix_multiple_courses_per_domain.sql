-- Migration: Fix Multiple Courses Per Domain
-- Created: 2025-11-13
-- Purpose: Allow users to study multiple courses from the same domain
-- Changes:
--   1. Change user_subject_state primary key from (user_id, subject) to (user_id, course)
--   2. This allows users to have entries for both "Calculus 2" and "Algebra 2" (both Math domain)
--   3. Data model update: interests array will now store courses directly instead of domains

BEGIN;

-- Drop the existing primary key constraint
ALTER TABLE public.user_subject_state DROP CONSTRAINT IF EXISTS user_subject_state_pkey;

-- Add new primary key on (user_id, course)
ALTER TABLE public.user_subject_state ADD PRIMARY KEY (user_id, course);

-- Add index on subject for efficient domain-based queries
CREATE INDEX IF NOT EXISTS user_subject_state_subject_idx
  ON public.user_subject_state (user_id, subject);

-- Update comments to reflect new structure
COMMENT ON TABLE public.user_subject_state IS
  'User progress per course. Primary key is (user_id, course) to allow multiple courses per domain.';

COMMENT ON COLUMN public.user_subject_state.subject IS
  'The domain/subject area (e.g., "Math", "Science"). Derived from course.';

COMMENT ON COLUMN public.user_subject_state.course IS
  'The specific course (e.g., "Calculus 2", "AP Chemistry"). Part of primary key.';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these after migration to verify:

-- 1. Check primary key is correct
-- SELECT constraint_name, constraint_type
-- FROM information_schema.table_constraints
-- WHERE table_schema = 'public' AND table_name = 'user_subject_state';

-- 2. Check indexes
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'user_subject_state';

-- 3. Test inserting multiple courses from same domain (should work now)
-- INSERT INTO user_subject_state (user_id, subject, course, mastery, difficulty)
-- VALUES
--   (auth.uid(), 'Math', 'Calculus 2', 80, 'medium'),
--   (auth.uid(), 'Math', 'Algebra 2', 75, 'medium')
-- ON CONFLICT (user_id, course) DO NOTHING;
