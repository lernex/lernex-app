-- Migration: Add featured_achievements to profiles
-- Date: 2025-02-10
-- Description: Allow users to showcase selected achievements on their public profile
--              Stores up to 6 achievement IDs that will be displayed prominently

BEGIN;

-- Add featured_achievements column to profiles table
-- JSONB array storing achievement IDs (max 6 badges)
-- Defaults to empty array
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS featured_achievements JSONB DEFAULT '[]'::jsonb NOT NULL;

-- Add constraint to ensure it's a JSON array
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'featured_achievements_is_array'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT featured_achievements_is_array
        CHECK (jsonb_typeof(featured_achievements) = 'array');
  END IF;
END $$;

-- Add constraint to limit to maximum 6 achievements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'featured_achievements_max_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT featured_achievements_max_length
        CHECK (jsonb_array_length(featured_achievements) <= 6);
  END IF;
END $$;

-- Add index for querying users with featured achievements
CREATE INDEX IF NOT EXISTS idx_profiles_featured_achievements
  ON public.profiles USING GIN (featured_achievements);

-- Add comment
COMMENT ON COLUMN public.profiles.featured_achievements IS
  'Array of achievement badge IDs to display on the user''s public profile. Maximum of 6 badges allowed. Format: ["badge-id-1", "badge-id-2", ...]';

COMMIT;

-- =======================
-- NOTES
-- =======================
-- After running this migration:
-- 1. All existing users will have an empty featured_achievements array
-- 2. Users can select up to 6 achievement badges to showcase on their profile
-- 3. Achievement IDs should match the badge IDs from the achievements system
-- 4. The public profile page will display these badges with animations and styling
-- 5. Users can update their featured achievements through the profile settings
