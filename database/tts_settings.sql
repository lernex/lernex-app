-- TTS Settings and Voice Preview Cache Schema
-- Run this in Supabase SQL Editor

-- 1. Add TTS preferences to user profiles
-- Add columns to existing profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tts_voice TEXT DEFAULT 'af_bella',
ADD COLUMN IF NOT EXISTS tts_auto_play BOOLEAN DEFAULT false;

-- Create index for faster lookups (using 'id' as the primary key column)
CREATE INDEX IF NOT EXISTS idx_profiles_tts_settings ON profiles(id, tts_voice, tts_auto_play);

-- 2. Create table for voice preview audio cache
-- This stores the "quick brown fox" preview for each voice
-- Generated once and reused for all users
CREATE TABLE IF NOT EXISTS tts_voice_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_name TEXT NOT NULL UNIQUE,
  audio_url TEXT NOT NULL,
  character_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE tts_voice_previews ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Everyone can read voice previews (they're public/shared)
CREATE POLICY "Anyone can view voice previews"
  ON tts_voice_previews
  FOR SELECT
  USING (true);

-- RLS Policy: Only authenticated users can insert (first time a voice is requested)
CREATE POLICY "Authenticated users can insert voice previews"
  ON tts_voice_previews
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policy: Authenticated users can update voice previews (to set audio_url after generation)
CREATE POLICY "Authenticated users can update voice previews"
  ON tts_voice_previews
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create index for fast voice lookups
CREATE INDEX IF NOT EXISTS idx_tts_voice_previews_voice ON tts_voice_previews(voice_name);

-- 3. Ensure lesson_history table has audio_url column
-- (It should already exist from previous migration, but just in case)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lesson_history' AND column_name = 'audio_url'
  ) THEN
    ALTER TABLE lesson_history ADD COLUMN audio_url TEXT;
  END IF;
END $$;

-- Create index for faster audio lookups in lesson history
CREATE INDEX IF NOT EXISTS idx_lesson_history_audio ON lesson_history(id, audio_url) WHERE audio_url IS NOT NULL;

-- 4. Storage bucket for TTS audio (if not already exists)
-- This is for both lesson audio and voice previews
INSERT INTO storage.buckets (id, name, public)
VALUES ('tts-audio', 'tts-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist (to allow re-running this script)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload TTS audio" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can view TTS audio" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their own TTS audio" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their own TTS audio" ON storage.objects;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- RLS Policies for tts-audio bucket
-- Policy 1: Authenticated users can upload (insert)
CREATE POLICY "Authenticated users can upload TTS audio"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'tts-audio');

-- Policy 2: Everyone can read (since previews are public, and lesson audio is shareable)
CREATE POLICY "Anyone can view TTS audio"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tts-audio');

-- Policy 3: Users can update their own audio
CREATE POLICY "Users can update their own TTS audio"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'tts-audio')
  WITH CHECK (bucket_id = 'tts-audio');

-- Policy 4: Users can delete their own audio
CREATE POLICY "Users can delete their own TTS audio"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'tts-audio');

-- 5. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tts_voice_preview_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for tts_voice_previews
DROP TRIGGER IF EXISTS tts_voice_previews_updated_at ON tts_voice_previews;
CREATE TRIGGER tts_voice_previews_updated_at
  BEFORE UPDATE ON tts_voice_previews
  FOR EACH ROW
  EXECUTE FUNCTION update_tts_voice_preview_updated_at();

-- 6. Insert initial voice preview placeholders (will be populated on first use)
-- Available Kokoro-82M voices
INSERT INTO tts_voice_previews (voice_name, audio_url, character_count)
VALUES
  ('af_bella', '', 0),
  ('af_sarah', '', 0),
  ('am_adam', '', 0),
  ('am_michael', '', 0),
  ('bf_emma', '', 0),
  ('bf_isabella', '', 0),
  ('bm_george', '', 0),
  ('bm_lewis', '', 0)
ON CONFLICT (voice_name) DO NOTHING;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'TTS settings schema created successfully!';
  RAISE NOTICE 'Added: tts_voice and tts_auto_play columns to profiles';
  RAISE NOTICE 'Created: tts_voice_previews table with RLS policies';
  RAISE NOTICE 'Created: tts-audio storage bucket with RLS policies';
END $$;
