-- ==============================================================================
-- LESSON HISTORY DELETION COMPLETE GUIDE
-- ==============================================================================
--
-- This file documents how lesson deletion works in the Lernex application,
-- including database deletion, storage cleanup, and Row Level Security (RLS).
--
-- ==============================================================================

-- ==============================================================================
-- TABLE STRUCTURE
-- ==============================================================================

-- The lesson_history table stores generated lessons with metadata and audio URLs
-- Key fields:
--   - id: UUID primary key
--   - user_id: References auth.users with CASCADE DELETE (automatic cleanup)
--   - lesson_data: JSONB containing lesson content
--   - audio_url: URL to TTS audio file in Supabase Storage
--   - subject, topic, mode: Metadata fields
--   - created_at, updated_at: Timestamps

-- When a user account is deleted, all their lessons are automatically deleted
-- via ON DELETE CASCADE on the user_id foreign key reference

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- RLS is ENABLED on the lesson_history table to ensure users can only
-- access and delete their own lessons.

-- The following RLS policy controls deletion:

-- Policy: Users can delete their own lesson history
-- Location: lesson_history table
-- Operation: DELETE
-- Condition: auth.uid() = user_id
--
-- This ensures:
-- 1. Only authenticated users can delete lessons
-- 2. Users can ONLY delete lessons they own
-- 3. The API cannot bypass this security (unless using service role key)

-- Verify RLS is enabled:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'lesson_history';
-- Expected: rowsecurity = true

-- View all policies on lesson_history:
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'lesson_history';

-- ==============================================================================
-- STORAGE BUCKET RLS POLICIES
-- ==============================================================================

-- The tts-audio bucket stores audio files with the following structure:
-- tts-audio/
--   └── {user_id}/
--       └── {lesson_id}.mp3

-- Storage RLS policy for deletion:
-- Policy: Users can delete their own TTS audio
-- Location: storage.objects table
-- Bucket: tts-audio
-- Condition: (storage.foldername(name))[1] = auth.uid()::text
--
-- This ensures:
-- 1. Users can only delete files in their own folder (user_id matches)
-- 2. Cannot delete other users' audio files
-- 3. Public can still READ audio files (public bucket)

-- View storage policies:
SELECT
  name AS policy_name,
  command_type,
  definition
FROM pg_policies
WHERE tablename = 'objects'
  AND schemaname = 'storage'
  AND definition LIKE '%tts-audio%';

-- ==============================================================================
-- DELETION WORKFLOW
-- ==============================================================================

-- When a user deletes a lesson, the following happens:
--
-- 1. FRONTEND (LessonHistoryModal.tsx)
--    - User clicks delete button
--    - Custom DeleteConfirmModal appears (replaces browser alert)
--    - User confirms deletion
--    - Frontend calls: DELETE /api/lesson-history?id={lesson_id}
--
-- 2. API ROUTE (app/api/lesson-history/route.ts)
--    Step 1: Authenticate user
--            - Verify user is logged in
--            - Get user.id from auth
--
--    Step 2: Fetch lesson before deletion
--            - Query: SELECT audio_url FROM lesson_history
--                     WHERE id = {lesson_id} AND user_id = {user.id}
--            - RLS ensures user can only see their own lessons
--
--    Step 3: Delete audio file from storage (if exists)
--            - Parse audio_url to extract storage path
--            - Call: supabase.storage.from('tts-audio').remove([path])
--            - Storage RLS ensures user can only delete their own files
--            - Continue even if audio deletion fails (graceful degradation)
--
--    Step 4: Delete database record
--            - Query: DELETE FROM lesson_history
--                     WHERE id = {lesson_id} AND user_id = {user.id}
--            - RLS ensures user can only delete their own lessons
--
--    Step 5: Return success
--            - Frontend removes lesson from UI
--
-- 3. FRONTEND UPDATES
--    - Removes lesson from local state
--    - If the deleted lesson was selected, clear selection
--    - UI updates instantly without page refresh

-- ==============================================================================
-- SECURITY GUARANTEES
-- ==============================================================================

-- The deletion system provides the following security guarantees:

-- 1. AUTHENTICATION REQUIRED
--    - Only authenticated users can delete lessons
--    - Anonymous users cannot delete any lessons

-- 2. AUTHORIZATION ENFORCED
--    - Users can ONLY delete their own lessons
--    - Cannot delete other users' lessons (enforced by RLS)
--    - API route double-checks with .eq("user_id", user.id)

-- 3. STORAGE ISOLATION
--    - Users can only delete audio files in their own folder
--    - Cannot access or delete other users' audio files
--    - Enforced by storage RLS policy

-- 4. CASCADE DELETION
--    - When a user account is deleted, all lessons automatically delete
--    - ON DELETE CASCADE on user_id foreign key
--    - Prevents orphaned lesson records

-- 5. NO ORPHANED AUDIO FILES
--    - API route deletes both database record AND storage file
--    - Prevents wasted storage space
--    - Keeps storage bucket clean

-- ==============================================================================
-- TESTING RLS POLICIES
-- ==============================================================================

-- You can test RLS policies in the Supabase SQL Editor by impersonating users:

-- Test as a specific user:
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims.sub = '{user_id_here}';

-- Try to delete someone else's lesson (should fail):
DELETE FROM lesson_history WHERE id = '{other_users_lesson_id}';
-- Expected: 0 rows affected (RLS blocks deletion)

-- Try to delete your own lesson (should succeed):
DELETE FROM lesson_history WHERE id = '{your_lesson_id}';
-- Expected: 1 row affected

-- Reset to default role:
RESET role;

-- ==============================================================================
-- MONITORING & CLEANUP
-- ==============================================================================

-- Check for orphaned audio files (lessons deleted but audio still exists)
-- This query finds audio URLs that no longer have a corresponding lesson:
SELECT
  obj.name AS storage_path,
  obj.created_at,
  obj.metadata->>'size' AS file_size_bytes
FROM storage.objects obj
WHERE obj.bucket_id = 'tts-audio'
  AND NOT EXISTS (
    SELECT 1
    FROM lesson_history lh
    WHERE lh.audio_url LIKE '%' || obj.name
  );

-- Check for lessons without audio (database record exists but no audio file)
SELECT
  id,
  user_id,
  audio_url,
  created_at
FROM lesson_history
WHERE audio_url IS NOT NULL
  AND audio_url != '';
-- Then manually verify these URLs are accessible

-- Count total lessons and total storage usage per user:
SELECT
  user_id,
  COUNT(*) AS total_lessons,
  COUNT(audio_url) AS lessons_with_audio,
  SUM(CASE WHEN audio_url IS NOT NULL THEN 1 ELSE 0 END) AS audio_files_count
FROM lesson_history
GROUP BY user_id
ORDER BY total_lessons DESC;

-- ==============================================================================
-- TROUBLESHOOTING
-- ==============================================================================

-- Problem: User gets "Unauthorized" when trying to delete
-- Solution:
--   1. Check user is authenticated: SELECT auth.uid();
--   2. Verify lesson belongs to user: SELECT user_id FROM lesson_history WHERE id = ?;
--   3. Check RLS is enabled: SELECT rowsecurity FROM pg_tables WHERE tablename = 'lesson_history';

-- Problem: Database record deleted but audio file remains
-- Solution:
--   1. Check API route is calling storage.remove()
--   2. Verify storage RLS policy allows deletion
--   3. Check audio_url format is parseable
--   4. Run orphaned files cleanup query (see MONITORING section)

-- Problem: Audio deletion fails but database deletion succeeds
-- Solution:
--   - This is intentional (graceful degradation)
--   - Lesson is still deleted from UI
--   - Audio file becomes orphaned
--   - Run cleanup queries periodically to remove orphaned files

-- ==============================================================================
-- BEST PRACTICES
-- ==============================================================================

-- 1. NEVER use service role key for deletions in client-facing code
--    - Always use authenticated user's access token
--    - Let RLS enforce security

-- 2. ALWAYS validate user owns the resource before deletion
--    - API route uses .eq("user_id", user.id)
--    - RLS provides second layer of defense

-- 3. DELETE storage files BEFORE database records
--    - If storage deletion fails, we can still clean up later
--    - If database deletion fails first, we lose reference to storage file

-- 4. HANDLE failures gracefully
--    - Continue with database deletion even if storage deletion fails
--    - Log errors for monitoring
--    - Prevents user-facing errors from orphaned files

-- 5. PERIODIC cleanup jobs
--    - Run orphaned file detection queries weekly
--    - Clean up old audio files manually if needed
--    - Consider implementing automatic cleanup functions

-- ==============================================================================
-- FUTURE ENHANCEMENTS
-- ==============================================================================

-- Potential improvements to consider:

-- 1. Database Trigger for Automatic Storage Cleanup
--    - Create a PostgreSQL trigger that deletes audio on row deletion
--    - Would require a PostgreSQL extension to call Supabase Storage API
--    - Currently not supported natively by Supabase

-- 2. Bulk Delete Operations
--    - Allow users to select multiple lessons and delete at once
--    - Optimize by batching storage deletions
--    - Add progress indicator for large deletions

-- 3. Soft Delete (Trash/Recycle Bin)
--    - Add 'deleted_at' column instead of hard delete
--    - Allow users to restore lessons within 30 days
--    - Automatically hard delete after 30 days

-- 4. Delete Confirmation with Lesson Preview
--    - Show lesson title/subject in deletion modal
--    - Prevent accidental deletions of important lessons
--    - Add "Don't show again" checkbox for experienced users

-- 5. Storage Usage Tracking
--    - Show users their total storage usage
--    - Add warnings when approaching storage limits
--    - Suggest deleting old lessons to free space

-- ==============================================================================
-- END OF GUIDE
-- ==============================================================================
