-- =====================================================
-- LERNEX PLAYLIST SYSTEM - DATABASE SCHEMA & POLICIES
-- =====================================================
-- This file documents the playlist database schema and
-- includes necessary RLS (Row Level Security) policies.
--
-- USAGE:
-- 1. Run this in Supabase SQL Editor to set up the schema
-- 2. Safe to re-run - uses DROP POLICY IF EXISTS before CREATE
-- 3. Tables use CREATE TABLE IF NOT EXISTS for idempotency
-- 4. Existing data will NOT be affected
--
-- NOTE: The tables (playlists, playlist_memberships, etc.)
-- may already exist in your database. This script will:
-- - Create them if they don't exist (IF NOT EXISTS)
-- - Drop and recreate RLS policies for clean state
-- - Add missing indexes if needed
-- =====================================================

-- =====================================================
-- TABLE: playlists
-- =====================================================
-- Stores playlist metadata
CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlists_is_public ON playlists(is_public) WHERE is_public = true;

-- =====================================================
-- TABLE: playlist_memberships
-- =====================================================
-- Manages access control for shared playlists
CREATE TABLE IF NOT EXISTS playlist_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'moderator')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(playlist_id, profile_id)
);

-- Indexes for faster access control checks
CREATE INDEX IF NOT EXISTS idx_playlist_memberships_playlist_id ON playlist_memberships(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_memberships_profile_id ON playlist_memberships(profile_id);

-- =====================================================
-- TABLE: playlist_items
-- =====================================================
-- Stores lessons in playlists with ordering
-- Note: Uses TEXT for lesson_id to allow flexibility with both
-- saved_lessons.lesson_id and lesson_history ID references
CREATE TABLE IF NOT EXISTS playlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  position INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(playlist_id, lesson_id) -- Prevent duplicate lessons in same playlist
);

-- FIX: If the table already exists with lesson_id as UUID, convert it to TEXT
-- This is safe because TEXT can store any UUID value as a string
DO $$
BEGIN
  -- Check if lesson_id column exists and is UUID type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'playlist_items'
      AND column_name = 'lesson_id'
      AND data_type = 'uuid'
  ) THEN
    -- Drop any foreign key constraints on lesson_id
    ALTER TABLE playlist_items DROP CONSTRAINT IF EXISTS playlist_items_lesson_id_fkey;

    -- Drop the unique constraint temporarily
    ALTER TABLE playlist_items DROP CONSTRAINT IF EXISTS playlist_items_playlist_id_lesson_id_key;

    -- Change column type from UUID to TEXT
    ALTER TABLE playlist_items ALTER COLUMN lesson_id TYPE TEXT USING lesson_id::TEXT;

    -- Recreate the unique constraint
    ALTER TABLE playlist_items ADD CONSTRAINT playlist_items_playlist_id_lesson_id_key UNIQUE(playlist_id, lesson_id);

    RAISE NOTICE 'Converted playlist_items.lesson_id from UUID to TEXT';
  END IF;
END $$;

-- Indexes for ordering and lookups
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_id ON playlist_items(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_position ON playlist_items(playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_playlist_items_lesson_id ON playlist_items(lesson_id);

-- =====================================================
-- TABLE: saved_lessons (Reference - Already Exists)
-- =====================================================
-- This table stores full lesson data for saved lessons
-- Used for: Playlist "Saved Lessons" tab, lesson content retrieval
--
-- ACTUAL SCHEMA (from existing database):
CREATE TABLE IF NOT EXISTS saved_lessons (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  difficulty TEXT,
  questions JSONB DEFAULT '[]',
  context JSONB,
  knowledge JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id) -- Composite primary key
);

-- Indexes for saved_lessons
CREATE INDEX IF NOT EXISTS idx_saved_lessons_user_id ON saved_lessons(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_lessons_subject ON saved_lessons(user_id, subject);
CREATE INDEX IF NOT EXISTS idx_saved_lessons_created_at ON saved_lessons(user_id, created_at DESC);

-- =====================================================
-- TABLE: lesson_history (Reference - Already Exists)
-- =====================================================
-- This table stores all lesson history for "All Lessons" search
-- Used for: Playlist "All Lessons" tab, user's complete lesson history
--
-- ACTUAL SCHEMA (from existing database):
CREATE TABLE IF NOT EXISTS lesson_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_data JSONB NOT NULL, -- Full lesson object including id, title, content, questions
  subject TEXT,
  topic TEXT,
  mode TEXT,
  audio_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for lesson_history
CREATE INDEX IF NOT EXISTS idx_lesson_history_user_id ON lesson_history(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_history_subject ON lesson_history(user_id, subject);
CREATE INDEX IF NOT EXISTS idx_lesson_history_created_at ON lesson_history(user_id, created_at DESC);

-- Note: lesson_data JSONB contains:
-- {
--   "id": "unique-lesson-id",
--   "subject": "...",
--   "topic": "...",
--   "title": "...",
--   "content": "...",
--   "difficulty": "intro|easy|medium|hard",
--   "questions": [...],
--   "context": {...},
--   "knowledge": {...}
-- }

-- =====================================================
-- HELPER FUNCTION - Check Playlist Membership (No RLS)
-- =====================================================
-- This function bypasses RLS to prevent infinite recursion
CREATE OR REPLACE FUNCTION is_playlist_member(p_playlist_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM playlist_memberships
    WHERE playlist_id = p_playlist_id
      AND profile_id = p_user_id
  );
$$;

-- =====================================================
-- RLS POLICIES - playlists
-- =====================================================

-- Enable RLS
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean re-run)
DROP POLICY IF EXISTS "Users can view their own playlists" ON playlists;
DROP POLICY IF EXISTS "Users can view public playlists" ON playlists;
DROP POLICY IF EXISTS "Users can view playlists they're members of" ON playlists;
DROP POLICY IF EXISTS "Users can create playlists" ON playlists;
DROP POLICY IF EXISTS "Users can update their own playlists" ON playlists;
DROP POLICY IF EXISTS "Users can delete their own playlists" ON playlists;

-- Users can view their own playlists
CREATE POLICY "Users can view their own playlists"
  ON playlists FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view public playlists
CREATE POLICY "Users can view public playlists"
  ON playlists FOR SELECT
  USING (is_public = true);

-- Users can view playlists they're members of (using SECURITY DEFINER function to avoid recursion)
CREATE POLICY "Users can view playlists they're members of"
  ON playlists FOR SELECT
  USING (is_playlist_member(id, auth.uid()));

-- Users can create their own playlists
CREATE POLICY "Users can create playlists"
  ON playlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own playlists
CREATE POLICY "Users can update their own playlists"
  ON playlists FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own playlists
CREATE POLICY "Users can delete their own playlists"
  ON playlists FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- HELPER FUNCTION - Check Playlist Ownership (No RLS)
-- =====================================================
-- This function bypasses RLS to prevent infinite recursion
CREATE OR REPLACE FUNCTION is_playlist_owner(p_playlist_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM playlists
    WHERE id = p_playlist_id
      AND user_id = p_user_id
  );
$$;

-- =====================================================
-- RLS POLICIES - playlist_memberships
-- =====================================================

-- Enable RLS
ALTER TABLE playlist_memberships ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean re-run)
DROP POLICY IF EXISTS "Playlist owners can view memberships" ON playlist_memberships;
DROP POLICY IF EXISTS "Users can view their own memberships" ON playlist_memberships;
DROP POLICY IF EXISTS "Playlist owners can create memberships" ON playlist_memberships;
DROP POLICY IF EXISTS "Playlist owners can update memberships" ON playlist_memberships;
DROP POLICY IF EXISTS "Playlist owners can delete memberships" ON playlist_memberships;

-- Playlist owners can view all memberships (using SECURITY DEFINER function to avoid recursion)
CREATE POLICY "Playlist owners can view memberships"
  ON playlist_memberships FOR SELECT
  USING (is_playlist_owner(playlist_id, auth.uid()));

-- Users can view their own memberships
CREATE POLICY "Users can view their own memberships"
  ON playlist_memberships FOR SELECT
  USING (auth.uid() = profile_id);

-- Playlist owners can create memberships (using SECURITY DEFINER function to avoid recursion)
CREATE POLICY "Playlist owners can create memberships"
  ON playlist_memberships FOR INSERT
  WITH CHECK (is_playlist_owner(playlist_id, auth.uid()));

-- Playlist owners can update memberships (using SECURITY DEFINER function to avoid recursion)
CREATE POLICY "Playlist owners can update memberships"
  ON playlist_memberships FOR UPDATE
  USING (is_playlist_owner(playlist_id, auth.uid()));

-- Playlist owners can delete memberships (using SECURITY DEFINER function to avoid recursion)
CREATE POLICY "Playlist owners can delete memberships"
  ON playlist_memberships FOR DELETE
  USING (is_playlist_owner(playlist_id, auth.uid()));

-- =====================================================
-- HELPER FUNCTION - Check if Playlist is Public (No RLS)
-- =====================================================
CREATE OR REPLACE FUNCTION is_playlist_public(p_playlist_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM playlists
    WHERE id = p_playlist_id
      AND is_public = true
  );
$$;

-- =====================================================
-- HELPER FUNCTION - Check if User is Moderator (No RLS)
-- =====================================================
CREATE OR REPLACE FUNCTION is_playlist_moderator(p_playlist_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM playlist_memberships
    WHERE playlist_id = p_playlist_id
      AND profile_id = p_user_id
      AND role = 'moderator'
  );
$$;

-- =====================================================
-- RLS POLICIES - playlist_items
-- =====================================================

-- Enable RLS
ALTER TABLE playlist_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean re-run)
DROP POLICY IF EXISTS "Users can view their own playlist items" ON playlist_items;
DROP POLICY IF EXISTS "Users can view public playlist items" ON playlist_items;
DROP POLICY IF EXISTS "Users can view playlist items they have access to" ON playlist_items;
DROP POLICY IF EXISTS "Playlist owners can insert items" ON playlist_items;
DROP POLICY IF EXISTS "Playlist moderators can insert items" ON playlist_items;
DROP POLICY IF EXISTS "Playlist owners can update items" ON playlist_items;
DROP POLICY IF EXISTS "Playlist moderators can update items" ON playlist_items;
DROP POLICY IF EXISTS "Playlist owners can delete items" ON playlist_items;
DROP POLICY IF EXISTS "Playlist moderators can delete items" ON playlist_items;

-- Users can view items in their own playlists (using SECURITY DEFINER function)
CREATE POLICY "Users can view their own playlist items"
  ON playlist_items FOR SELECT
  USING (is_playlist_owner(playlist_id, auth.uid()));

-- Users can view items in public playlists (using SECURITY DEFINER function)
CREATE POLICY "Users can view public playlist items"
  ON playlist_items FOR SELECT
  USING (is_playlist_public(playlist_id));

-- Users can view items in playlists they're members of (using SECURITY DEFINER function)
CREATE POLICY "Users can view playlist items they have access to"
  ON playlist_items FOR SELECT
  USING (is_playlist_member(playlist_id, auth.uid()));

-- Owners can insert items (using SECURITY DEFINER function)
CREATE POLICY "Playlist owners can insert items"
  ON playlist_items FOR INSERT
  WITH CHECK (is_playlist_owner(playlist_id, auth.uid()));

-- Moderators can insert items (using SECURITY DEFINER function)
CREATE POLICY "Playlist moderators can insert items"
  ON playlist_items FOR INSERT
  WITH CHECK (is_playlist_moderator(playlist_id, auth.uid()));

-- Owners can update items (using SECURITY DEFINER function)
CREATE POLICY "Playlist owners can update items"
  ON playlist_items FOR UPDATE
  USING (is_playlist_owner(playlist_id, auth.uid()));

-- Moderators can update items (using SECURITY DEFINER function)
CREATE POLICY "Playlist moderators can update items"
  ON playlist_items FOR UPDATE
  USING (is_playlist_moderator(playlist_id, auth.uid()));

-- Owners can delete items (using SECURITY DEFINER function)
CREATE POLICY "Playlist owners can delete items"
  ON playlist_items FOR DELETE
  USING (is_playlist_owner(playlist_id, auth.uid()));

-- Moderators can delete items (using SECURITY DEFINER function)
CREATE POLICY "Playlist moderators can delete items"
  ON playlist_items FOR DELETE
  USING (is_playlist_moderator(playlist_id, auth.uid()));

-- =====================================================
-- FOREIGN KEY FOR REFERENCE (Optional Enhancement)
-- =====================================================
-- Note: playlist_items.lesson_id references saved_lessons.lesson_id
-- However, we use TEXT instead of UUID to allow flexibility
-- If you want strict foreign key enforcement, you would need:
-- ALTER TABLE playlist_items
--   ADD CONSTRAINT fk_playlist_items_lesson
--   FOREIGN KEY (lesson_id)
--   REFERENCES saved_lessons(lesson_id)
--   ON DELETE CASCADE;
--
-- But this requires lesson_id to be a proper foreign key column
-- The current implementation is more flexible without strict FK

-- =====================================================
-- RLS POLICIES - saved_lessons
-- =====================================================

-- Enable RLS
ALTER TABLE saved_lessons ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean re-run)
DROP POLICY IF EXISTS "Users can view their own saved lessons" ON saved_lessons;
DROP POLICY IF EXISTS "Users can insert saved lessons" ON saved_lessons;
DROP POLICY IF EXISTS "Users can update saved lessons" ON saved_lessons;
DROP POLICY IF EXISTS "Users can delete saved lessons" ON saved_lessons;

-- Users can view their own saved lessons
CREATE POLICY "Users can view their own saved lessons"
  ON saved_lessons FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own saved lessons
CREATE POLICY "Users can insert saved lessons"
  ON saved_lessons FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own saved lessons
CREATE POLICY "Users can update saved lessons"
  ON saved_lessons FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own saved lessons
CREATE POLICY "Users can delete saved lessons"
  ON saved_lessons FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- RLS POLICIES - lesson_history
-- =====================================================

-- Enable RLS
ALTER TABLE lesson_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for clean re-run)
DROP POLICY IF EXISTS "Users can view their own lesson history" ON lesson_history;
DROP POLICY IF EXISTS "Users can insert lesson history" ON lesson_history;
DROP POLICY IF EXISTS "Users can delete lesson history" ON lesson_history;

-- Users can view their own lesson history
CREATE POLICY "Users can view their own lesson history"
  ON lesson_history FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own lesson history
CREATE POLICY "Users can insert lesson history"
  ON lesson_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own lesson history
CREATE POLICY "Users can delete lesson history"
  ON lesson_history FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- HELPER FUNCTIONS (Optional)
-- =====================================================

-- Function to check if user has access to playlist (uses existing helper functions)
CREATE OR REPLACE FUNCTION user_can_access_playlist(
  p_playlist_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT (
    is_playlist_owner(p_playlist_id, p_user_id)
    OR is_playlist_public(p_playlist_id)
    OR is_playlist_member(p_playlist_id, p_user_id)
  );
$$;

-- Function to check if user can modify playlist (uses existing helper functions)
CREATE OR REPLACE FUNCTION user_can_modify_playlist(
  p_playlist_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT (
    is_playlist_owner(p_playlist_id, p_user_id)
    OR is_playlist_moderator(p_playlist_id, p_user_id)
  );
$$;

-- =====================================================
-- USAGE NOTES
-- =====================================================
-- 1. Run this script in Supabase SQL Editor
-- 2. Ensure auth.users and profiles tables exist
-- 3. Ensure saved_lessons and lesson_history tables exist
-- 4. Test RLS policies with different user roles
-- 5. Monitor query performance and add indexes as needed

-- =====================================================
-- PLAYLIST FEATURES IMPLEMENTED
-- =====================================================
-- ✅ Create playlists (public/private)
-- ✅ Add lessons from saved_lessons or lesson_history
-- ✅ Share playlists with friends (viewer/moderator roles)
-- ✅ Reorder lessons in playlist
-- ✅ Play Playlist mode (sequential playback)
-- ✅ Remix Playlist mode (AI-generated similar lessons)
-- ✅ Search "All Lessons" from lesson_history
-- ✅ Search "Saved Lessons" from saved_lessons
-- ✅ Token-optimized AI generation for remix

-- =====================================================
-- API ENDPOINTS
-- =====================================================
-- POST /api/playlists/add-saved-lessons
--   - Adds lessons to playlist (with validation)
-- GET /api/playlists/[id]/remix?count=10
--   - Generates AI remix lessons (token-optimized)
-- GET /api/playlists/[id]/learn?mode=play
--   - Play mode (sequential playback)
-- GET /api/playlists/[id]/learn?mode=remix
--   - Remix mode (AI-generated variations)

-- =====================================================
-- END OF FILE
-- =====================================================
