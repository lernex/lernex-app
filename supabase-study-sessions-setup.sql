-- =====================================================
-- LERNEX STUDY SESSIONS - COMPLETE DATABASE SETUP
-- =====================================================
-- This script creates the study_sessions table with all
-- necessary columns, indexes, RLS policies, and triggers
--
-- Run this in your Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. CREATE STUDY_SESSIONS TABLE
-- =====================================================

-- Drop table if it exists (use with caution in production)
DROP TABLE IF EXISTS study_sessions CASCADE;

-- Create the study_sessions table
CREATE TABLE study_sessions (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys to profiles table
    organizer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Session details
    title TEXT NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 200),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
    subject TEXT,
    topics TEXT[], -- Array of topics

    -- Scheduling
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0 AND duration_minutes <= 480), -- Max 8 hours

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT different_users CHECK (organizer_id != friend_id),
    CONSTRAINT future_scheduled_at CHECK (scheduled_at > created_at)
);

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for finding sessions by organizer
CREATE INDEX idx_study_sessions_organizer_id ON study_sessions(organizer_id);

-- Index for finding sessions by friend
CREATE INDEX idx_study_sessions_friend_id ON study_sessions(friend_id);

-- Index for finding sessions by scheduled date
CREATE INDEX idx_study_sessions_scheduled_at ON study_sessions(scheduled_at);

-- Index for finding sessions by status
CREATE INDEX idx_study_sessions_status ON study_sessions(status);

-- Composite index for common queries (finding upcoming sessions for a user)
CREATE INDEX idx_study_sessions_user_scheduled ON study_sessions(organizer_id, scheduled_at)
WHERE status IN ('pending', 'confirmed');

CREATE INDEX idx_study_sessions_friend_scheduled ON study_sessions(friend_id, scheduled_at)
WHERE status IN ('pending', 'confirmed');

-- =====================================================
-- 3. CREATE TRIGGER FOR UPDATED_AT
-- =====================================================

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_study_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_study_sessions_updated_at ON study_sessions;
CREATE TRIGGER trigger_update_study_sessions_updated_at
    BEFORE UPDATE ON study_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_study_sessions_updated_at();

-- =====================================================
-- 4. ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on the table
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. CREATE RLS POLICIES
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own study sessions" ON study_sessions;
DROP POLICY IF EXISTS "Users can create study sessions with friends" ON study_sessions;
DROP POLICY IF EXISTS "Users can update their own study sessions" ON study_sessions;
DROP POLICY IF EXISTS "Users can delete their own study sessions" ON study_sessions;

-- Policy 1: SELECT - Users can view sessions where they are organizer or friend
CREATE POLICY "Users can view their own study sessions"
ON study_sessions
FOR SELECT
TO authenticated
USING (
    auth.uid() = organizer_id
    OR
    auth.uid() = friend_id
);

-- Policy 2: INSERT - Users can create sessions where they are the organizer
-- and the friend exists in their friendships
CREATE POLICY "Users can create study sessions with friends"
ON study_sessions
FOR INSERT
TO authenticated
WITH CHECK (
    -- User must be the organizer
    auth.uid() = organizer_id
    AND
    -- Friend must exist in friendships table
    EXISTS (
        SELECT 1 FROM friendships
        WHERE (user_a = auth.uid() AND user_b = friend_id)
           OR (user_b = auth.uid() AND user_a = friend_id)
    )
);

-- Policy 3: UPDATE - Users can update sessions where they are organizer or friend
CREATE POLICY "Users can update their own study sessions"
ON study_sessions
FOR UPDATE
TO authenticated
USING (
    auth.uid() = organizer_id
    OR
    auth.uid() = friend_id
)
WITH CHECK (
    auth.uid() = organizer_id
    OR
    auth.uid() = friend_id
);

-- Policy 4: DELETE - Only organizers can delete sessions
CREATE POLICY "Users can delete their own study sessions"
ON study_sessions
FOR DELETE
TO authenticated
USING (
    auth.uid() = organizer_id
);

-- =====================================================
-- 6. GRANT PERMISSIONS
-- =====================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON study_sessions TO authenticated;
-- Note: No sequence needed since we use gen_random_uuid() for IDs

-- =====================================================
-- 7. CREATE HELPER FUNCTION (OPTIONAL)
-- =====================================================

-- Function to get upcoming sessions for a user
CREATE OR REPLACE FUNCTION get_upcoming_sessions(user_id UUID, limit_count INTEGER DEFAULT 20)
RETURNS TABLE (
    id UUID,
    organizer_id UUID,
    friend_id UUID,
    title TEXT,
    description TEXT,
    subject TEXT,
    topics TEXT[],
    scheduled_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.organizer_id,
        s.friend_id,
        s.title,
        s.description,
        s.subject,
        s.topics,
        s.scheduled_at,
        s.duration_minutes,
        s.status,
        s.created_at,
        s.updated_at
    FROM study_sessions s
    WHERE (s.organizer_id = user_id OR s.friend_id = user_id)
      AND s.scheduled_at >= NOW()
      AND s.status IN ('pending', 'confirmed')
    ORDER BY s.scheduled_at ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 8. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE study_sessions IS 'Stores planned study sessions between friends';
COMMENT ON COLUMN study_sessions.id IS 'Unique identifier for the study session';
COMMENT ON COLUMN study_sessions.organizer_id IS 'User who created/organized the session';
COMMENT ON COLUMN study_sessions.friend_id IS 'User who was invited to the session';
COMMENT ON COLUMN study_sessions.title IS 'Session title (max 200 chars)';
COMMENT ON COLUMN study_sessions.description IS 'Optional session description/notes (max 1000 chars)';
COMMENT ON COLUMN study_sessions.subject IS 'Subject being studied (e.g., Mathematics, Physics)';
COMMENT ON COLUMN study_sessions.topics IS 'Array of specific topics to cover';
COMMENT ON COLUMN study_sessions.scheduled_at IS 'When the session is scheduled to occur';
COMMENT ON COLUMN study_sessions.duration_minutes IS 'Planned duration in minutes (max 480 = 8 hours)';
COMMENT ON COLUMN study_sessions.status IS 'Current status: pending, confirmed, cancelled, or completed';
COMMENT ON COLUMN study_sessions.created_at IS 'When the session was created';
COMMENT ON COLUMN study_sessions.updated_at IS 'When the session was last updated';

-- =====================================================
-- 9. SAMPLE DATA (OPTIONAL - FOR TESTING)
-- =====================================================

-- Uncomment the following to insert sample data for testing
-- Replace the UUIDs with actual user IDs from your profiles table

/*
INSERT INTO study_sessions (
    organizer_id,
    friend_id,
    title,
    description,
    subject,
    topics,
    scheduled_at,
    duration_minutes,
    status
) VALUES (
    'YOUR_USER_ID_HERE'::UUID,
    'FRIEND_USER_ID_HERE'::UUID,
    'Algebra Study Session',
    'Review quadratic equations and practice problem sets',
    'Mathematics',
    ARRAY['Quadratic equations', 'Factoring', 'Graphing'],
    NOW() + INTERVAL '2 days',
    90,
    'pending'
);
*/

-- =====================================================
-- SETUP COMPLETE!
-- =====================================================

-- Verify the setup
DO $$
BEGIN
    RAISE NOTICE '✅ Study sessions table created successfully!';
    RAISE NOTICE '✅ Indexes created for optimal performance';
    RAISE NOTICE '✅ RLS policies configured';
    RAISE NOTICE '✅ Triggers set up for updated_at';
    RAISE NOTICE '';
    RAISE NOTICE 'You can now use the study planner feature!';
    RAISE NOTICE 'Navigate to /friends and click "Plan session" on any friend.';
END $$;

-- Quick verification query
SELECT
    'study_sessions' as table_name,
    COUNT(*) as policy_count
FROM pg_policies
WHERE tablename = 'study_sessions'
UNION ALL
SELECT
    'Indexes created' as table_name,
    COUNT(*) as count
FROM pg_indexes
WHERE tablename = 'study_sessions';
