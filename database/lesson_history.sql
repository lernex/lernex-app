-- Lesson History Table
-- Stores all generated lessons with their metadata and TTS audio URLs

CREATE TABLE IF NOT EXISTS lesson_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Lesson data stored as JSONB for flexibility
  lesson_data JSONB NOT NULL,

  -- TTS audio file URL (stored in Supabase Storage)
  audio_url TEXT,

  -- Metadata
  subject TEXT,
  topic TEXT,
  mode TEXT, -- 'quick', 'mini', 'full'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS lesson_history_user_id_idx ON lesson_history(user_id);
CREATE INDEX IF NOT EXISTS lesson_history_created_at_idx ON lesson_history(created_at DESC);
CREATE INDEX IF NOT EXISTS lesson_history_subject_idx ON lesson_history(subject);

-- RLS Policies
ALTER TABLE lesson_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own lesson history
CREATE POLICY "Users can view their own lesson history"
  ON lesson_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own lesson history
CREATE POLICY "Users can insert their own lesson history"
  ON lesson_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own lesson history (for audio_url updates)
CREATE POLICY "Users can update their own lesson history"
  ON lesson_history
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own lesson history
CREATE POLICY "Users can delete their own lesson history"
  ON lesson_history
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Storage Bucket for TTS Audio Files
-- Run this in the Supabase Dashboard Storage section or via SQL:

INSERT INTO storage.buckets (id, name, public)
VALUES ('tts-audio', 'tts-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies for TTS Audio

-- Policy: Users can upload their own audio files
CREATE POLICY "Users can upload their own TTS audio"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tts-audio' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Anyone can view audio files (public bucket)
CREATE POLICY "Anyone can view TTS audio"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'tts-audio');

-- Policy: Users can delete their own audio files
CREATE POLICY "Users can delete their own TTS audio"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'tts-audio' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_lesson_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lesson_history_updated_at
  BEFORE UPDATE ON lesson_history
  FOR EACH ROW
  EXECUTE FUNCTION update_lesson_history_updated_at();
