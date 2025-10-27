-- Migration: Fix Authentication and RLS Policies
-- Date: 2024-10-22
-- Description: Comprehensive fix for authentication issues and RLS policies
--              Ensures all tables have proper policies for authenticated users

BEGIN;

-- =======================
-- PROFILES TABLE
-- =======================

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for clean slate
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile
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
-- USER_TOPIC_LESSON_CACHE TABLE
-- =======================

-- Ensure RLS is enabled
ALTER TABLE public.user_topic_lesson_cache ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own cache" ON public.user_topic_lesson_cache;
DROP POLICY IF EXISTS "Users can insert own cache" ON public.user_topic_lesson_cache;
DROP POLICY IF EXISTS "Users can update own cache" ON public.user_topic_lesson_cache;
DROP POLICY IF EXISTS "Users can delete own cache" ON public.user_topic_lesson_cache;

-- Policy: Users can read their own cached lessons
CREATE POLICY "Users can read own cache"
  ON public.user_topic_lesson_cache
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own cached lessons
CREATE POLICY "Users can insert own cache"
  ON public.user_topic_lesson_cache
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own cached lessons
CREATE POLICY "Users can update own cache"
  ON public.user_topic_lesson_cache
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own cached lessons
CREATE POLICY "Users can delete own cache"
  ON public.user_topic_lesson_cache
  FOR DELETE
  USING (auth.uid() = user_id);

-- =======================
-- USER_SUBJECT_STATE TABLE
-- =======================

-- Ensure RLS is enabled
ALTER TABLE public.user_subject_state ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own subject state" ON public.user_subject_state;
DROP POLICY IF EXISTS "Users can insert own subject state" ON public.user_subject_state;
DROP POLICY IF EXISTS "Users can update own subject state" ON public.user_subject_state;
DROP POLICY IF EXISTS "Users can delete own subject state" ON public.user_subject_state;

-- Policy: Users can read their own subject state
CREATE POLICY "Users can read own subject state"
  ON public.user_subject_state
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own subject state
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

-- Policy: Users can delete their own subject state
CREATE POLICY "Users can delete own subject state"
  ON public.user_subject_state
  FOR DELETE
  USING (auth.uid() = user_id);

-- =======================
-- SAVED_LESSONS TABLE (if exists)
-- =======================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'saved_lessons') THEN
    -- Enable RLS
    EXECUTE 'ALTER TABLE public.saved_lessons ENABLE ROW LEVEL SECURITY';

    -- Drop existing policies
    DROP POLICY IF EXISTS "Users can read own saved lessons" ON public.saved_lessons;
    DROP POLICY IF EXISTS "Users can insert own saved lessons" ON public.saved_lessons;
    DROP POLICY IF EXISTS "Users can update own saved lessons" ON public.saved_lessons;
    DROP POLICY IF EXISTS "Users can delete own saved lessons" ON public.saved_lessons;

    -- Create policies
    EXECUTE 'CREATE POLICY "Users can read own saved lessons" ON public.saved_lessons FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can insert own saved lessons" ON public.saved_lessons FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can update own saved lessons" ON public.saved_lessons FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can delete own saved lessons" ON public.saved_lessons FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END $$;

-- =======================
-- STUDY_SESSIONS TABLE (if exists)
-- =======================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'study_sessions') THEN
    -- Enable RLS
    EXECUTE 'ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY';

    -- Drop existing policies
    DROP POLICY IF EXISTS "Users can read own study sessions" ON public.study_sessions;
    DROP POLICY IF EXISTS "Users can insert own study sessions" ON public.study_sessions;
    DROP POLICY IF EXISTS "Users can update own study sessions" ON public.study_sessions;
    DROP POLICY IF EXISTS "Users can delete own study sessions" ON public.study_sessions;

    -- Create policies - users can manage sessions they organize or are invited to
    EXECUTE 'CREATE POLICY "Users can read own study sessions" ON public.study_sessions FOR SELECT USING (auth.uid() = organizer_id OR auth.uid() = friend_id)';
    EXECUTE 'CREATE POLICY "Users can insert own study sessions" ON public.study_sessions FOR INSERT WITH CHECK (auth.uid() = organizer_id)';
    EXECUTE 'CREATE POLICY "Users can update own study sessions" ON public.study_sessions FOR UPDATE USING (auth.uid() = organizer_id OR auth.uid() = friend_id) WITH CHECK (auth.uid() = organizer_id OR auth.uid() = friend_id)';
    EXECUTE 'CREATE POLICY "Users can delete own study sessions" ON public.study_sessions FOR DELETE USING (auth.uid() = organizer_id)';
  END IF;
END $$;

-- =======================
-- FRIENDS/FRIENDSHIPS TABLE (if exists)
-- =======================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'friendships') THEN
    -- Enable RLS
    EXECUTE 'ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY';

    -- Drop existing policies
    DROP POLICY IF EXISTS "Users can read own friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can insert own friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can update own friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can delete own friendships" ON public.friendships;

    -- Create policies (friendships table uses user_a and user_b columns)
    EXECUTE 'CREATE POLICY "Users can read own friendships" ON public.friendships FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b)';
    EXECUTE 'CREATE POLICY "Users can insert own friendships" ON public.friendships FOR INSERT WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b)';
    EXECUTE 'CREATE POLICY "Users can update own friendships" ON public.friendships FOR UPDATE USING (auth.uid() = user_a OR auth.uid() = user_b) WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b)';
    EXECUTE 'CREATE POLICY "Users can delete own friendships" ON public.friendships FOR DELETE USING (auth.uid() = user_a OR auth.uid() = user_b)';
  END IF;
END $$;

-- =======================
-- FRIEND_REQUESTS TABLE (if exists)
-- =======================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'friend_requests') THEN
    -- Enable RLS
    EXECUTE 'ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY';

    -- Drop existing policies
    DROP POLICY IF EXISTS "Users can read own friend requests" ON public.friend_requests;
    DROP POLICY IF EXISTS "Users can insert own friend requests" ON public.friend_requests;
    DROP POLICY IF EXISTS "Users can update own friend requests" ON public.friend_requests;
    DROP POLICY IF EXISTS "Users can delete own friend requests" ON public.friend_requests;

    -- Create policies
    EXECUTE 'CREATE POLICY "Users can read own friend requests" ON public.friend_requests FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id)';
    EXECUTE 'CREATE POLICY "Users can insert own friend requests" ON public.friend_requests FOR INSERT WITH CHECK (auth.uid() = sender_id)';
    EXECUTE 'CREATE POLICY "Users can update own friend requests" ON public.friend_requests FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id) WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id)';
    EXECUTE 'CREATE POLICY "Users can delete own friend requests" ON public.friend_requests FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = receiver_id)';
  END IF;
END $$;

-- =======================
-- COMMENTS
-- =======================

COMMENT ON POLICY "Users can read own profile" ON public.profiles IS
  'Allows users to read their own profile data including interests and settings';

COMMENT ON POLICY "Users can update own profile" ON public.profiles IS
  'Allows users to update their profile including username, theme, and personal info';

COMMENT ON POLICY "Users can insert own profile" ON public.profiles IS
  'Allows users to create their profile on first login';

COMMENT ON POLICY "Users can read own cache" ON public.user_topic_lesson_cache IS
  'Allows users to read their cached FYP lessons';

COMMENT ON POLICY "Users can insert own cache" ON public.user_topic_lesson_cache IS
  'Allows system to cache lessons for users';

COMMENT ON POLICY "Users can update own cache" ON public.user_topic_lesson_cache IS
  'Allows updating cached lessons with new content';

COMMENT ON POLICY "Users can delete own cache" ON public.user_topic_lesson_cache IS
  'Allows clearing stale cache entries';

COMMENT ON POLICY "Users can read own subject state" ON public.user_subject_state IS
  'Allows users to read their learning state for each subject';

COMMENT ON POLICY "Users can insert own subject state" ON public.user_subject_state IS
  'Allows placement tests to create subject state entries';

COMMENT ON POLICY "Users can update own subject state" ON public.user_subject_state IS
  'Allows updating mastery, difficulty, and learning paths';

COMMENT ON POLICY "Users can delete own subject state" ON public.user_subject_state IS
  'Allows users to delete subject state when removing an interest';

COMMIT;
