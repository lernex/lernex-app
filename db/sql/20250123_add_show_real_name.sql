-- Migration: Add show_real_name visibility toggle
-- Date: 2025-01-23
-- Description: Add a privacy toggle for controlling real name visibility on profiles
--              Defaults to false (hidden) to protect user privacy

BEGIN;

-- Add show_real_name column to profiles table
-- Defaults to false so users opt-in to showing their real name
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_real_name BOOLEAN DEFAULT false NOT NULL;

-- Add index for filtering by visibility preference (optional, for future queries)
CREATE INDEX IF NOT EXISTS idx_profiles_show_real_name
  ON public.profiles (show_real_name)
  WHERE show_real_name = true;

-- Add comment
COMMENT ON COLUMN public.profiles.show_real_name IS
  'Controls whether the user''s real name (full_name) is visible on their public profile. Defaults to false for privacy.';

COMMIT;

-- =======================
-- NOTES
-- =======================
-- After running this migration:
-- 1. All existing users will have show_real_name = false (privacy by default)
-- 2. Users can opt-in to showing their real name in profile settings
-- 3. The profile display logic should check this flag before showing full_name
-- 4. Username will always be visible (if set), only full_name visibility is controlled
