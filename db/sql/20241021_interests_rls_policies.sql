-- Migration: Interest Management RLS Policies
-- Date: 2024-10-21
-- Description: Ensures proper RLS policies for the interest add/remove functionality

BEGIN;

-- =======================
-- PROFILES TABLE
-- =======================

-- Ensure RLS is enabled on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile
-- This allows updating interests, level_map, placement_ready, etc.
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: Users can insert their own profile (for first-time setup)
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =======================
-- USER_SUBJECT_STATE TABLE
-- =======================

-- Ensure RLS is enabled on user_subject_state table
ALTER TABLE public.user_subject_state ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can read own subject state" ON public.user_subject_state;
DROP POLICY IF EXISTS "Users can insert own subject state" ON public.user_subject_state;
DROP POLICY IF EXISTS "Users can update own subject state" ON public.user_subject_state;
DROP POLICY IF EXISTS "Users can delete own subject state" ON public.user_subject_state;

-- Policy: Users can read their own subject state
CREATE POLICY "Users can read own subject state"
  ON public.user_subject_state
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own subject state (via placement tests)
CREATE POLICY "Users can insert own subject state"
  ON public.user_subject_state
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own subject state
CREATE POLICY "Users can update own subject state"
  ON public.user_subject_state
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own subject state (when removing interests)
CREATE POLICY "Users can delete own subject state"
  ON public.user_subject_state
  FOR DELETE
  USING (auth.uid() = user_id);

-- =======================
-- COMMENTS
-- =======================

COMMENT ON POLICY "Users can read own profile" ON public.profiles IS
  'Allows users to read their own profile data including interests and level_map';

COMMENT ON POLICY "Users can update own profile" ON public.profiles IS
  'Allows users to update their profile including adding/removing interests';

COMMENT ON POLICY "Users can insert own profile" ON public.profiles IS
  'Allows users to create their profile on first login';

COMMENT ON POLICY "Users can read own subject state" ON public.user_subject_state IS
  'Allows users to read their learning state for each subject';

COMMENT ON POLICY "Users can insert own subject state" ON public.user_subject_state IS
  'Allows placement tests to create subject state entries';

COMMENT ON POLICY "Users can update own subject state" ON public.user_subject_state IS
  'Allows updating mastery, difficulty, and learning paths';

COMMENT ON POLICY "Users can delete own subject state" ON public.user_subject_state IS
  'Allows users to delete subject state when removing an interest';

COMMIT;
