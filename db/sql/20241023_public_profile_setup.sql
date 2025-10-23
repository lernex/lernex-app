-- Migration: Public Profile Setup
-- Date: 2024-10-23
-- Description: Comprehensive setup for public profile features including:
--              - username, full_name, avatar_url, bio columns
--              - interests array column
--              - public_stats JSONB column
--              - RLS policies to allow authenticated users to view each other's profiles
--              - Constraints for username uniqueness and validation

BEGIN;

-- =======================
-- PROFILES TABLE SCHEMA
-- =======================

-- Add public profile columns if they don't exist
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS public_stats JSONB DEFAULT '{"showStreak": true, "showPoints": true, "showAccuracy": true, "showActivity": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add constraints
-- Username must be unique (case-insensitive)
DROP INDEX IF EXISTS profiles_username_lower_idx;
CREATE UNIQUE INDEX profiles_username_lower_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Username format: alphanumeric and underscores only, 3-30 characters
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR (username ~ '^[a-zA-Z0-9_]{3,30}$'));

-- Bio length limit (280 characters like Twitter)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bio_length;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_length
  CHECK (bio IS NULL OR length(bio) <= 280);

-- Interests array limit (max 10 interests)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_interests_limit;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_interests_limit
  CHECK (array_length(interests, 1) IS NULL OR array_length(interests, 1) <= 10);

-- =======================
-- ROW LEVEL SECURITY POLICIES
-- =======================

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for clean slate
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON public.profiles;

-- Policy 1: Users can read their own full profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Authenticated users can view other users' public profile info
-- This is crucial for the public profile feature!
CREATE POLICY "Authenticated users can view public profiles"
  ON public.profiles
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND auth.uid() IS NOT NULL
  );

-- Policy 3: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 4: Users can insert their own profile (for first-time setup)
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =======================
-- INDEXES FOR PERFORMANCE
-- =======================

-- Index for username lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Index for searching by full name
CREATE INDEX IF NOT EXISTS idx_profiles_full_name
  ON public.profiles (full_name)
  WHERE full_name IS NOT NULL;

-- Index for interests searching (GIN index for array searches)
CREATE INDEX IF NOT EXISTS idx_profiles_interests
  ON public.profiles USING GIN (interests)
  WHERE interests IS NOT NULL AND array_length(interests, 1) > 0;

-- =======================
-- FUNCTIONS
-- =======================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS profiles_updated_at_trigger ON public.profiles;

-- Trigger to automatically update updated_at on profile updates
CREATE TRIGGER profiles_updated_at_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

-- =======================
-- COMMENTS
-- =======================

COMMENT ON COLUMN public.profiles.username IS
  'Unique username (case-insensitive). Alphanumeric and underscores only, 3-30 chars';

COMMENT ON COLUMN public.profiles.full_name IS
  'User''s display name (can contain spaces and special characters)';

COMMENT ON COLUMN public.profiles.avatar_url IS
  'URL to user''s profile avatar image';

COMMENT ON COLUMN public.profiles.bio IS
  'User bio/description (max 280 characters)';

COMMENT ON COLUMN public.profiles.interests IS
  'Array of subjects the user is interested in (max 10)';

COMMENT ON COLUMN public.profiles.public_stats IS
  'JSONB object controlling which stats are visible on public profile';

COMMENT ON COLUMN public.profiles.updated_at IS
  'Timestamp of last profile update (automatically maintained)';

COMMENT ON POLICY "Users can read own profile" ON public.profiles IS
  'Allows users to read their own complete profile data';

COMMENT ON POLICY "Authenticated users can view public profiles" ON public.profiles IS
  'Allows authenticated users to view other users'' public profile information';

COMMENT ON POLICY "Users can update own profile" ON public.profiles IS
  'Allows users to update their own profile including username, bio, interests, etc.';

COMMENT ON POLICY "Users can insert own profile" ON public.profiles IS
  'Allows users to create their profile on first login';

-- =======================
-- VERIFICATION QUERIES
-- =======================

-- Uncomment to verify the migration:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'profiles'
-- AND column_name IN ('username', 'full_name', 'avatar_url', 'bio', 'interests', 'public_stats', 'updated_at')
-- ORDER BY ordinal_position;

-- Uncomment to view all policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'profiles'
-- ORDER BY policyname;

-- Uncomment to view all indexes:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'profiles'
-- ORDER BY indexname;

COMMIT;

-- =======================
-- NOTES
-- =======================
-- After running this migration:
-- 1. The profiles table will have all necessary columns for public profiles
-- 2. Authenticated users can view each other's public profile info
-- 3. Users can only modify their own profiles
-- 4. Username is unique (case-insensitive) and validated
-- 5. Bio is limited to 280 characters
-- 6. Interests are limited to 10 items per user
-- 7. Indexes are in place for efficient searching
-- 8. updated_at is automatically maintained
