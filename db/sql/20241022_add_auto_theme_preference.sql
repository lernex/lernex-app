-- Migration: Add 'auto' theme preference option and set it as default
-- Date: 2024-10-22
-- Description: Extends theme_pref to support 'auto', 'light', or 'dark' values.
--              Sets default to 'auto' for new users to match browser preference.

-- Step 1: Add a CHECK constraint to allow 'auto', 'light', or 'dark'
-- First, drop the existing constraint if it exists
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_theme_pref_check;

-- Add new constraint allowing 'auto', 'light', or 'dark'
ALTER TABLE profiles
  ADD CONSTRAINT profiles_theme_pref_check
  CHECK (theme_pref IS NULL OR theme_pref IN ('auto', 'light', 'dark'));

-- Step 2: Set default value to 'auto' for the theme_pref column
ALTER TABLE profiles
  ALTER COLUMN theme_pref SET DEFAULT 'auto';

-- Step 3: Update existing NULL values to 'auto' (optional, keeps existing user preferences)
-- Uncomment the line below if you want to set all NULL preferences to 'auto'
-- UPDATE profiles SET theme_pref = 'auto' WHERE theme_pref IS NULL;

-- Step 4: Add comment for documentation
COMMENT ON COLUMN profiles.theme_pref IS 'Theme preference: auto (browser default), light, or dark';

-- RLS Policies (if not already in place)
-- Ensure users can read their own theme preference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
    AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile"
      ON profiles
      FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

-- Ensure users can update their own theme preference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
    AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Enable RLS if not already enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Verification queries (for testing)
-- SELECT theme_pref, COUNT(*) FROM profiles GROUP BY theme_pref;
-- SELECT column_name, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'profiles' AND column_name = 'theme_pref';
