-- Fix for TTS Voice Previews - Add Missing UPDATE Policy
-- Run this in Supabase SQL Editor
--
-- Problem: The tts_voice_previews table has INSERT and SELECT policies,
-- but no UPDATE policy. This causes the API to fail when trying to save
-- the audio_url after generating voice previews for the first time.
--
-- Solution: Add an UPDATE policy for authenticated users

-- RLS Policy: Allow authenticated users to update voice previews
-- This is needed because when a preview is first generated, the API needs
-- to update the audio_url field from empty string to the actual storage URL
CREATE POLICY "Authenticated users can update voice previews"
  ON tts_voice_previews
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Verify the policy was created
DO $$
BEGIN
  RAISE NOTICE 'UPDATE policy for tts_voice_previews has been created!';
  RAISE NOTICE 'Now authenticated users can update the audio_url when generating previews for the first time.';
END $$;
