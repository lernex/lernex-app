# Pending Lessons Pre-Generation System

## Overview

This system implements intelligent lesson pre-generation and caching to drastically reduce AI generation costs by:

1. **Using fast models for immediate lessons**: When users first visit or need a lesson immediately, we use fast (but more expensive) models for instant response
2. **Using slow models for background generation**: While users are learning or on other pages, we generate 1-2 lessons ahead using slow (cheaper) models
3. **Persistent caching**: Generated lessons are saved in the database and persist across sessions, eliminating redundant generation costs

## Cost Savings

### Model Pricing Comparison

| Tier | Speed | Model | Cost per 1M tokens (in/out) | Use Case |
|------|-------|-------|----------------------------|----------|
| Free | Fast | Groq gpt-oss-20b | $0.10/$0.50 | Immediate lesson |
| Free | Slow | Deepinfra gpt-oss-20b | $0.03/$0.14 | Background generation |
| Plus | Fast | Cerebras gpt-oss-120b | $0.35/$0.75 | Immediate lesson |
| Plus | Slow | LightningAI gpt-oss-120b | $0.10/$0.40 | Background generation |

**Cost Reduction**:
- Free tier: ~70% cost reduction on background lessons (0.03 vs 0.10 input)
- Plus tier: ~71% cost reduction on background lessons (0.10 vs 0.35 input)

## Architecture

### Database Schema

**Table: `user_pending_lessons`**

```sql
CREATE TABLE user_pending_lessons (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  subject text NOT NULL,
  topic_label text NOT NULL,
  lesson jsonb NOT NULL,
  model_speed text NOT NULL ('fast' | 'slow'),
  generation_tier text NOT NULL ('free' | 'plus' | 'premium'),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### System Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User visits FYP Page                                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Check for Pending Lesson (position 0)                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
         YES│                       │NO
            ▼                       ▼
┌───────────────────────┐   ┌──────────────────────────────┐
│ Return Pending Lesson │   │ Generate with FAST model     │
│ (pre-generated)       │   │ (immediate response needed)  │
└───────────────────────┘   └──────────────────────────────┘
            │                       │
            └───────────┬───────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ User starts lesson                                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Background: Generate 1-2 lessons ahead with SLOW model      │
│ Store in pending_lessons table at positions 0, 1            │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ User completes lesson                                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Remove lesson at position 0                              │
│ 2. Shift remaining lessons down (1→0, etc.)                 │
│ 3. Trigger new background generation to refill queue        │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Database Migration

Location: [db/sql/20250124_pending_lessons.sql](./db/sql/20250124_pending_lessons.sql)

Creates the `user_pending_lessons` table with:
- Unique constraint on (user_id, subject, position)
- Indexes for efficient querying
- RLS policies for security

### 2. Helper Library

Location: [lib/pending-lessons.ts](./lib/pending-lessons.ts)

Key functions:
- `getNextPendingLesson()`: Retrieve the next lesson to show
- `storePendingLesson()`: Save a pre-generated lesson
- `removePendingLesson()`: Remove completed lesson and shift queue
- `countPendingLessons()`: Check queue size
- `cleanupStalePendingLessons()`: Remove lessons older than 7 days

### 3. FYP Route Integration

Location: [app/api/fyp/route.ts](./app/api/fyp/route.ts)

**Modified flow**:
1. Check cache (existing `user_topic_lesson_cache`)
2. **NEW**: Check pending lessons queue
3. If neither available, generate with fast model
4. Update progress tracking

The pending lesson check happens AFTER the cache check but BEFORE generating a new lesson, providing a second layer of cost optimization.

### 4. Background Generation API

Location: [app/api/fyp/generate-pending/route.ts](./app/api/fyp/generate-pending/route.ts)

**Endpoint**: `POST /api/fyp/generate-pending`

**Body**:
```json
{
  "subject": "Math",
  "topicLabel": "Algebra 1 > Slope of a line",
  "count": 2
}
```

**Features**:
- Uses SLOW model (cheaper)
- Generates up to 2 lessons (configurable via MAX_PENDING_LESSONS)
- Checks queue size to avoid overfilling
- Runs in background (max 60 second timeout)
- Logs to usage_logs for cost tracking

### 5. Completion API

Location: [app/api/fyp/complete/route.ts](./app/api/fyp/complete/route.ts)

**Endpoint**: `POST /api/fyp/complete`

**Body**:
```json
{
  "subject": "Math",
  "lessonId": "lesson-id-here"
}
```

**Features**:
- Removes completed lesson from queue
- Shifts remaining lessons down in position
- Opportunistically cleans up stale lessons (>7 days old)

### 6. Client Integration

Location: [components/FypFeed.tsx](./components/FypFeed.tsx)

**Triggers**:
1. **On component mount**: Generate initial background lessons when first lesson loads
2. **On lesson completion**:
   - Call completion API to remove from queue
   - Trigger background generation to refill queue

Both operations are non-blocking and failures are logged but don't disrupt user experience.

## User Experience Scenarios

### Scenario 1: First Visit
```
User visits FYP → No pending lessons
  → Generate with FAST model (immediate)
  → Show lesson to user
  → Background: Generate 2 lessons with SLOW model
  → User completes lesson
  → Next lesson already available (from pending queue)
```

**Cost**: 1 fast generation + 2 slow generations

### Scenario 2: Returning User (Same Day)
```
User returns to FYP → Pending lesson at position 0 exists
  → Show pending lesson (NO GENERATION NEEDED)
  → User completes lesson
  → Next lesson at position 1 shifts to position 0
  → Background: Generate 2 new lessons with SLOW model
```

**Cost**: 2 slow generations (ZERO fast generations)

### Scenario 3: User Leaves and Returns Days Later
```
User returns after 3 days → Pending lessons still in database
  → Show pending lesson (NO GENERATION NEEDED)
  → Continue as normal
```

**Cost**: Minimal (only refill background generation as needed)

### Scenario 4: User Switches to Another Page
```
User is on FYP → Background generation ongoing
  → User navigates to Profile page
  → Background generation continues (non-blocking)
  → User returns to FYP
  → Lessons already generated and ready
```

**Cost**: Only background (slow model) generations

## Configuration

### Constants

**In generate-pending API** ([app/api/fyp/generate-pending/route.ts](./app/api/fyp/generate-pending/route.ts)):
- `MAX_PENDING_LESSONS`: Maximum queue size (default: 2)
- `maxDuration`: API timeout (default: 60 seconds)

**In pending-lessons library** ([lib/pending-lessons.ts](./lib/pending-lessons.ts)):
- `maxAgeDays`: Stale lesson threshold (default: 7 days)

### Adjusting Queue Size

To change how many lessons are pre-generated, modify `MAX_PENDING_LESSONS` in the generate-pending route:

```typescript
const MAX_PENDING_LESSONS = 3; // Generate up to 3 lessons ahead
```

**Trade-off**: More pending lessons = more storage but better UX and fewer gaps

## Cost Tracking

All lesson generations (both fast and slow) are logged to the `usage_logs` table with:
- `model`: The specific model used
- `input_tokens` / `output_tokens`: Token counts
- `metadata.modelSpeed`: "fast" or "slow"
- `metadata.tier`: User's subscription tier
- `metadata.feature`: "fyp-lesson"

This allows detailed cost analysis and optimization.

## Cleanup and Maintenance

### Automatic Cleanup
- On lesson completion, stale lessons (>7 days) are automatically removed
- This prevents database bloat from abandoned lessons

### Manual Cleanup (if needed)
```sql
-- Remove all pending lessons for a user
DELETE FROM user_pending_lessons WHERE user_id = 'user-id-here';

-- Remove stale lessons across all users
DELETE FROM user_pending_lessons
WHERE created_at < NOW() - INTERVAL '7 days';
```

## Monitoring

### Key Metrics to Track

1. **Pending lesson hit rate**:
```sql
SELECT
  COUNT(*) FILTER (WHERE headers->>'x-fyp-source' = 'pending') as pending_hits,
  COUNT(*) FILTER (WHERE headers->>'x-fyp-cache' = 'hit') as cache_hits,
  COUNT(*) as total_requests
FROM usage_logs
WHERE metadata->>'feature' = 'fyp-lesson'
  AND created_at > NOW() - INTERVAL '7 days';
```

2. **Cost savings**:
```sql
SELECT
  metadata->>'modelSpeed' as speed,
  COUNT(*) as generation_count,
  SUM((metadata->>'input_tokens')::int) as total_input_tokens,
  SUM((metadata->>'output_tokens')::int) as total_output_tokens
FROM usage_logs
WHERE metadata->>'feature' = 'fyp-lesson'
GROUP BY metadata->>'modelSpeed';
```

3. **Queue health**:
```sql
SELECT
  user_id,
  subject,
  COUNT(*) as pending_count,
  MAX(created_at) as latest_generated
FROM user_pending_lessons
GROUP BY user_id, subject;
```

## Benefits Summary

### Cost Reduction
- **70%+ savings** on most lesson generations (slow vs fast model)
- **Zero cost** when serving already-pending lessons
- **Persistent cache** eliminates redundant generation

### User Experience
- **Instant response** on first visit (fast model)
- **No waiting** on subsequent lessons (pre-generated)
- **Works offline-like**: Lessons persist across sessions

### Scalability
- **Non-blocking**: Background generation doesn't affect UI
- **Queue-based**: Natural backpressure mechanism
- **Automatic cleanup**: No manual intervention needed

## Future Enhancements

1. **Adaptive queue size**: Adjust based on user pace
2. **Topic prediction**: Pre-generate for likely next topics
3. **Time-based generation**: Generate during off-peak hours
4. **Multi-subject optimization**: Balance generation across subjects
5. **User-specific strategies**: Different strategies for free vs premium users

## Deployment Checklist

- [ ] Run database migration: `20250124_pending_lessons.sql`
- [ ] Deploy updated API routes
- [ ] Deploy updated client components
- [ ] Monitor initial performance
- [ ] Track cost savings metrics
- [ ] Adjust `MAX_PENDING_LESSONS` if needed

## Support

For issues or questions:
1. Check console logs for `[pending-lessons]`, `[generate-pending]`, or `[fyp-complete]` entries
2. Verify database migration was successful
3. Check pending lesson queue: `SELECT * FROM user_pending_lessons WHERE user_id = 'user-id';`
4. Review usage logs for generation patterns
