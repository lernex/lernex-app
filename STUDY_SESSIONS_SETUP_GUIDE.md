# 📚 Study Sessions Database Setup Guide

This guide will walk you through setting up the `study_sessions` table in your Supabase database.

## 🎯 What You're Setting Up

The study sessions feature allows users to:
- Plan study sessions with their friends
- Schedule sessions with date, time, and duration
- Add subjects, topics, and notes
- View upcoming study sessions
- Update session status (pending, confirmed, cancelled, completed)

## 📋 Prerequisites

- Access to your Supabase project dashboard
- Admin access to the SQL Editor
- The `profiles` and `friendships` tables must already exist

## 🚀 Step-by-Step Setup

### Step 1: Access Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **"+ New query"**

### Step 2: Run the SQL Script

1. Open the file `supabase-study-sessions-setup.sql` in this directory
2. Copy **ALL** the contents
3. Paste into the SQL Editor
4. Click **"Run"** (or press `Cmd/Ctrl + Enter`)

### Step 3: Verify Setup

After running the script, you should see:
```
✅ Study sessions table created successfully!
✅ Indexes created for optimal performance
✅ RLS policies configured
✅ Triggers set up for updated_at

You can now use the study planner feature!
```

You should also see a verification table showing:
- 4 RLS policies created
- 6 indexes created

## 🔍 What Gets Created

### 1. **Main Table: `study_sessions`**
```sql
Columns:
- id (UUID, Primary Key)
- organizer_id (UUID, Foreign Key → profiles.id)
- friend_id (UUID, Foreign Key → profiles.id)
- title (TEXT, Required, Max 200 chars)
- description (TEXT, Optional, Max 1000 chars)
- subject (TEXT, Optional)
- topics (TEXT[], Array)
- scheduled_at (TIMESTAMPTZ, Required)
- duration_minutes (INTEGER, Default 60, Max 480)
- status (TEXT, Default 'pending')
- created_at (TIMESTAMPTZ, Auto)
- updated_at (TIMESTAMPTZ, Auto)
```

### 2. **Indexes** (6 total for optimal performance)
- `idx_study_sessions_organizer_id` - Fast organizer lookups
- `idx_study_sessions_friend_id` - Fast friend lookups
- `idx_study_sessions_scheduled_at` - Fast date queries
- `idx_study_sessions_status` - Fast status filtering
- `idx_study_sessions_user_scheduled` - Composite index for common queries
- `idx_study_sessions_friend_scheduled` - Composite index for friend queries

### 3. **RLS Policies** (4 total for security)

#### Policy 1: SELECT
**"Users can view their own study sessions"**
- Users can view sessions where they are organizer OR friend
- Prevents viewing other people's sessions

#### Policy 2: INSERT
**"Users can create study sessions with friends"**
- Users can only create sessions where they are the organizer
- Friend must exist in the friendships table
- Prevents creating sessions with non-friends

#### Policy 3: UPDATE
**"Users can update their own study sessions"**
- Users can update sessions where they are organizer OR friend
- Both parties can update session details

#### Policy 4: DELETE
**"Users can delete their own study sessions"**
- Only the organizer can delete a session
- Friend cannot delete (they can cancel status instead)

### 4. **Triggers**
- `trigger_update_study_sessions_updated_at` - Auto-updates `updated_at` timestamp

### 5. **Constraints**
- `different_users` - Organizer and friend must be different users
- `future_scheduled_at` - Sessions must be scheduled in the future
- `status` check - Status must be: pending, confirmed, cancelled, or completed
- `duration_minutes` check - Duration between 1 and 480 minutes (8 hours)

## 🧪 Testing the Setup

### Test 1: Verify Table Exists
```sql
SELECT * FROM study_sessions LIMIT 1;
```
Expected: Empty result set (no error)

### Test 2: Check RLS Policies
```sql
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'study_sessions';
```
Expected: 4 policies listed

### Test 3: Verify Indexes
```sql
SELECT indexname
FROM pg_indexes
WHERE tablename = 'study_sessions';
```
Expected: 6 indexes listed

### Test 4: Insert Test Data (Optional)
```sql
-- Replace with actual user IDs from your profiles table
INSERT INTO study_sessions (
    organizer_id,
    friend_id,
    title,
    subject,
    topics,
    scheduled_at,
    duration_minutes
) VALUES (
    'YOUR_USER_ID'::UUID,
    'FRIEND_USER_ID'::UUID,
    'Test Study Session',
    'Mathematics',
    ARRAY['Algebra', 'Geometry'],
    NOW() + INTERVAL '1 day',
    60
);
```

## 🐛 Troubleshooting

### Error: "relation profiles does not exist"
**Solution**: You need to create the `profiles` table first. The study_sessions table references it.

### Error: "relation friendships does not exist"
**Solution**: You need to create the `friendships` table first. The RLS policies check against it.

### Error: "permission denied for table study_sessions"
**Solution**: Make sure RLS is enabled and policies are created. Re-run the SQL script.

### Error: "duplicate key value violates unique constraint"
**Solution**: The session already exists. Use a different ID or delete the existing session first.

### Sessions not showing up in the app
**Checklist**:
1. ✅ Table created successfully
2. ✅ RLS enabled and policies created
3. ✅ User is authenticated
4. ✅ Friendship exists between users
5. ✅ Session scheduled in the future
6. ✅ Session status is 'pending' or 'confirmed'

## 🔧 Maintenance

### View All Sessions
```sql
SELECT
    s.*,
    o.full_name as organizer_name,
    f.full_name as friend_name
FROM study_sessions s
LEFT JOIN profiles o ON o.id = s.organizer_id
LEFT JOIN profiles f ON f.id = s.friend_id
ORDER BY s.scheduled_at DESC;
```

### View Upcoming Sessions for a User
```sql
SELECT * FROM get_upcoming_sessions('USER_ID_HERE'::UUID, 10);
```

### Clean Up Past Sessions
```sql
-- Mark past pending sessions as cancelled
UPDATE study_sessions
SET status = 'cancelled'
WHERE scheduled_at < NOW()
  AND status = 'pending';
```

### Delete All Test Data
```sql
-- ⚠️ WARNING: This deletes ALL study sessions!
DELETE FROM study_sessions;
```

## 📊 Database Statistics

### Check Table Size
```sql
SELECT
    pg_size_pretty(pg_total_relation_size('study_sessions')) as total_size,
    pg_size_pretty(pg_relation_size('study_sessions')) as table_size,
    pg_size_pretty(pg_total_relation_size('study_sessions') - pg_relation_size('study_sessions')) as indexes_size;
```

### Count Sessions by Status
```sql
SELECT
    status,
    COUNT(*) as count
FROM study_sessions
GROUP BY status
ORDER BY count DESC;
```

## 🎉 You're All Set!

Once the SQL script runs successfully, you can:

1. Navigate to the Friends page: `http://localhost:3000/friends`
2. Click "Plan session" on any friend
3. Fill out the beautiful multi-step form
4. Create your first study session!

The study sessions will appear in the "Upcoming study sessions" section on the friends page.

## 📚 Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Array Types](https://www.postgresql.org/docs/current/arrays.html)
- [PostgreSQL Triggers](https://www.postgresql.org/docs/current/triggers.html)

## 🆘 Need Help?

If you encounter any issues:
1. Check the browser console for error messages
2. Check the Next.js server logs
3. Check the Supabase logs in your dashboard
4. Verify all prerequisites are met
5. Try re-running the SQL script

---

**Happy studying! 📖✨**
