# Pending Lessons System - Database Setup Checklist

## What's Included in the SQL File

The file `20250124_complete_pending_lessons_setup.sql` contains **everything** needed:

### 1. ✅ Profiles Table Enhancement
- Adds `subscription_tier` column (free/plus/premium)
- Creates index for efficient tier lookups
- Backfills tier from existing boolean columns (plus, premium, is_premium)
- **Required for**: Determining which AI models to use

### 2. ✅ User Pending Lessons Table
- Creates `user_pending_lessons` table
- Stores pre-generated lessons in a queue
- Position-based system (0 = next lesson, 1 = after that, etc.)
- **Required for**: Caching background-generated lessons

### 3. ✅ Indexes (7 total)
- User/subject lookup
- Position ordering
- Creation date sorting
- Topic filtering
- Unique position constraint
- Composite indexes for performance
- **Required for**: Fast queries and queue management

### 4. ✅ Row Level Security (RLS) Policies (5 total)
- Users can read their own lessons
- Users can insert their own lessons
- Users can update their own lessons
- Users can delete their own lessons
- Service role has full access
- **Required for**: Security and data isolation

### 5. ✅ Helper Functions (4 total)
- `cleanup_stale_pending_lessons()` - Remove old lessons
- `get_pending_lessons_stats()` - Statistics for monitoring
- `count_user_pending_lessons()` - Get queue size
- `normalize_pending_lesson_positions()` - Fix position gaps
- **Required for**: Maintenance and monitoring

### 6. ✅ Usage Logs Table Check
- Ensures `usage_logs` table exists
- Verifies indexes and RLS policies
- **Required for**: Cost tracking and analytics

### 7. ✅ Permissions & Grants
- Grants for authenticated users
- Grants for service role
- Execute permissions on functions
- **Required for**: API routes to work

### 8. ✅ Verification Queries
- Auto-checks that everything is set up correctly
- Displays SUCCESS/ERROR messages
- **Required for**: Confirming migration worked

## Installation Instructions

### Step 1: Run the SQL File

**Option A - Supabase Dashboard (Recommended)**:
1. Go to your Supabase project dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy the entire contents of `20250124_complete_pending_lessons_setup.sql`
5. Paste into the SQL editor
6. Click "Run" button
7. Check for SUCCESS messages in the output

**Option B - Command Line**:
```bash
psql -h your-host -U postgres -d your-database -f db/sql/20250124_complete_pending_lessons_setup.sql
```

**Option C - Supabase CLI**:
```bash
supabase db push
```

### Step 2: Verify Installation

After running the migration, you should see these SUCCESS messages:
```
✓ SUCCESS: profiles.subscription_tier column exists
✓ SUCCESS: user_pending_lessons table exists
✓ SUCCESS: RLS enabled on user_pending_lessons
✓ SUCCESS: Found 5 RLS policies for user_pending_lessons
```

If you see any ERROR or WARNING messages, check the output carefully.

### Step 3: Test the Setup

Run these verification queries in the SQL Editor:

```sql
-- 1. Check profiles table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'subscription_tier';
-- Should return: subscription_tier | text

-- 2. Check user_pending_lessons table exists
SELECT * FROM user_pending_lessons LIMIT 0;
-- Should return: Empty result with column headers (no error)

-- 3. Check RLS policies
SELECT policyname FROM pg_policies
WHERE tablename = 'user_pending_lessons';
-- Should return: 5 policy names

-- 4. Check helper functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%pending_lessons%';
-- Should return: 4 function names
```

### Step 4: Verify API Routes Work

Test each endpoint:

**Test 1 - Check for pending lessons (should be empty initially)**:
```bash
curl -X GET 'http://localhost:3000/api/fyp?subject=Math' \
  -H 'Cookie: your-session-cookie'
```

**Test 2 - Trigger background generation**:
```bash
curl -X POST 'http://localhost:3000/api/fyp/generate-pending' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: your-session-cookie' \
  -d '{
    "subject": "Math",
    "topicLabel": "Algebra 1 > Variables",
    "count": 2
  }'
```

**Test 3 - Complete a lesson**:
```bash
curl -X POST 'http://localhost:3000/api/fyp/complete' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: your-session-cookie' \
  -d '{
    "subject": "Math",
    "lessonId": "some-lesson-id"
  }'
```

## Troubleshooting

### Issue: "column subscription_tier does not exist"
**Solution**: The migration didn't run properly. Re-run the SQL file.

### Issue: "permission denied for table user_pending_lessons"
**Solution**: RLS policies or grants didn't apply. Check:
```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename = 'user_pending_lessons';

-- Verify policies exist
SELECT * FROM pg_policies WHERE tablename = 'user_pending_lessons';

-- Re-apply grants if needed
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_pending_lessons TO authenticated;
```

### Issue: "function cleanup_stale_pending_lessons does not exist"
**Solution**: Helper functions didn't create. Check:
```sql
-- List all pending_lessons related functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%pending%';
```

### Issue: Background generation not working
**Checklist**:
- [ ] Migration ran successfully
- [ ] API route exists at `/api/fyp/generate-pending/route.ts`
- [ ] Helper library exists at `/lib/pending-lessons.ts`
- [ ] User is authenticated
- [ ] Check console logs for errors: `[generate-pending]` or `[pending-lessons]`

### Issue: Lessons not appearing from queue
**Checklist**:
- [ ] Check if lessons exist: `SELECT * FROM user_pending_lessons WHERE user_id = 'your-id'`
- [ ] Verify position is 0: `SELECT * FROM user_pending_lessons WHERE position = 0`
- [ ] Check FYP route has pending lesson check (around line 1148)
- [ ] Check console logs: `[fyp]` with "pending-hit" or "pending lesson invalid"

## Monitoring Queries

### Check pending lesson usage
```sql
-- How many pending lessons exist per user?
SELECT user_id, subject, COUNT(*) as queue_size
FROM user_pending_lessons
GROUP BY user_id, subject
ORDER BY queue_size DESC;
```

### Check cost savings
```sql
-- Compare fast vs slow model usage
SELECT
  metadata->>'modelSpeed' as speed,
  COUNT(*) as count,
  SUM(COALESCE(input_tokens, 0)) as input_tokens,
  SUM(COALESCE(output_tokens, 0)) as output_tokens
FROM usage_logs
WHERE metadata->>'feature' = 'fyp-lesson'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY metadata->>'modelSpeed';
```

### Check for stale lessons
```sql
-- Find lessons older than 7 days
SELECT user_id, subject, COUNT(*) as stale_count,
       MAX(created_at) as oldest
FROM user_pending_lessons
WHERE created_at < NOW() - INTERVAL '7 days'
GROUP BY user_id, subject
ORDER BY stale_count DESC;
```

### Get statistics for a user
```sql
-- Detailed breakdown per subject/topic
SELECT * FROM get_pending_lessons_stats('user-id-here');
```

## Maintenance

### Manual cleanup (if needed)
```sql
-- Clean up all stale lessons (>7 days) for all users
SELECT cleanup_stale_pending_lessons(NULL, 7);

-- Clean up stale lessons for specific user
SELECT cleanup_stale_pending_lessons('user-id-here', 7);
```

### Fix position gaps (if queue gets corrupted)
```sql
-- Normalize positions for a user/subject
SELECT normalize_pending_lesson_positions('user-id-here', 'Math');
```

### Reset all pending lessons for a user
```sql
-- Nuclear option: delete all pending lessons
DELETE FROM user_pending_lessons WHERE user_id = 'user-id-here';
```

## What to Expect After Setup

### Immediate (First User Visit)
1. User visits FYP → No pending lessons
2. Generate with fast model (normal behavior)
3. Background generation starts (2 lessons with slow model)
4. Check database: `SELECT * FROM user_pending_lessons` should show 2 rows

### After Background Generation Completes
1. User completes first lesson
2. Next visit → Pending lesson at position 0 serves instantly
3. Check usage_logs: `modelSpeed` = 'slow' for background lessons
4. Cost savings: ~70% reduction on those lessons

### Steady State
- Queue maintains 1-2 lessons ahead
- Most lessons served from pending queue (zero generation cost)
- Fast model only used when queue is empty (rare after initial setup)
- Automatic cleanup of completed and stale lessons

## Success Metrics

Track these to confirm it's working:

1. **Pending lesson hit rate**:
   - Check headers: `x-fyp-source: pending`
   - Goal: >50% of requests after initial setup

2. **Model speed ratio**:
   - Check usage_logs: `metadata->>'modelSpeed'`
   - Goal: >70% using 'slow' model

3. **Cost reduction**:
   - Compare daily costs before/after
   - Goal: 50-70% reduction in generation costs

4. **Queue health**:
   - Check queue sizes: should stay around 1-2
   - No stale lessons accumulating

## Support

If you encounter issues:

1. **Check the logs**:
   - Console: Look for `[pending-lessons]`, `[generate-pending]`, `[fyp-complete]`
   - Database: Query `usage_logs` and `user_pending_lessons`

2. **Verify setup**:
   - Re-run verification queries above
   - Check that all SUCCESS messages appeared during migration

3. **Review code**:
   - FYP route: Line 1148 (pending lesson check)
   - Generate route: `/api/fyp/generate-pending/route.ts`
   - Complete route: `/api/fyp/complete/route.ts`
   - Helper lib: `/lib/pending-lessons.ts`

4. **Check documentation**:
   - `PENDING_LESSONS_SYSTEM.md` - Full system architecture
   - This file - Setup and troubleshooting

Everything should work out of the box once the SQL migration runs successfully! ✨
