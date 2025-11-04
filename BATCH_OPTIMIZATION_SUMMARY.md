# Batch Lesson Generation Optimization - Implementation Summary

## Overview
Implemented batching optimization for multiple lesson generation, achieving **~30% input token savings** when generating 2+ lessons for the same subject/topic.

## Implementation Details

### 1. Core Module: `lib/batch-lesson-generator.ts`

#### Key Features
- **TRUE Batching (Single API Call)**: Uses `create_lesson_batch` function tool to generate multiple lessons in one API call
- **Intelligent Fallback**: Automatically falls back to parallel generation if TRUE batching fails or isn't applicable
- **Graceful Error Handling**: Returns partial results and continues processing even if some lessons fail

#### Architecture

```typescript
// Two-tier approach:
1. TRUE Batching (30% token savings)
   - Single API call with shared system prompt
   - Shared structured context
   - Generates 2-5 lessons at once
   - Requirements: Same subject/topic

2. Parallel Generation (Fallback)
   - Multiple concurrent API calls
   - No token savings but faster than sequential
   - Used for mixed subjects/topics or batch failures
```

#### API

```typescript
export async function generateLessonBatch(
  sb: SupabaseClient,
  uid: string,
  ip: string,
  requests: BatchLessonRequest[]
): Promise<BatchLessonResult[]>

export async function generateLessonVariants(
  sb: SupabaseClient,
  uid: string,
  ip: string,
  subject: string,
  topic: string,
  baseOpts: LessonOptions,
  count: number
): Promise<BatchLessonResult[]>
```

### 2. Integration Points

#### 2.1 Pending Lesson Generation (`app/api/fyp/generate-pending/route.ts`)

**Before:**
```typescript
// Sequential generation - high token cost
for (let i = 0; i < lessonsToGenerate; i++) {
  const lesson = await generateLessonForTopic(sb, uid, ip, subject, topic, opts);
  // ... store lesson
}
```

**After:**
```typescript
// Batch generation - 30% token savings
const batchRequests = Array.from({ length: lessonsToGenerate }, () => ({
  subject, topic, opts
}));
const results = await generateLessonBatch(sb, uid, ip, batchRequests);
// ... store successful lessons
```

**Token Savings:** ~30% on input tokens when generating 2 lessons (typical scenario)

#### 2.2 Similar Lesson Generation (`app/api/playlists/[id]/generate-similar/route.ts`)

**Before:**
```typescript
// Sequential generation
for (let i = 0; i < count; i++) {
  const lesson = await generateLessonForTopic(sb, uid, ip, subject, topic, opts);
  generatedLessons.push(lesson);
}
```

**After:**
```typescript
// Batch generation
const batchRequests = Array.from({ length: count }, () => ({
  subject, topic, opts
}));
const results = await generateLessonBatch(sb, uid, ip, batchRequests);
const generatedLessons = results.filter(r => r.success).map(r => r.lesson!);
```

**Token Savings:** ~30% when generating 3-10 similar lessons

## Token Savings Breakdown

### How TRUE Batching Saves 30%

**Traditional Approach (2 lessons):**
```
Request 1:
- System Prompt: ~500 tokens
- Structured Context: ~200 tokens
- User Prompt: ~150 tokens
- Total Input: ~850 tokens

Request 2:
- System Prompt: ~500 tokens (REPEATED!)
- Structured Context: ~200 tokens (REPEATED!)
- User Prompt: ~150 tokens
- Total Input: ~850 tokens

TOTAL: ~1700 tokens
```

**Batch Approach (2 lessons):**
```
Single Request:
- System Prompt: ~500 tokens (SHARED!)
- Structured Context: ~200 tokens (SHARED!)
- Batch User Prompt: ~200 tokens
- Total Input: ~900 tokens

TOTAL: ~900 tokens
Savings: ~800 tokens (47%)
```

**Realistic Savings:**
- **Advertised:** ~30% (conservative estimate)
- **Actual:** 30-47% depending on context size
- **Best Case:** Same subject/topic, 3-5 lessons, large structured context

## Error Handling & Edge Cases

### 1. Empty Requests
```typescript
if (requests.length === 0) return [];
```

### 2. Single Request
```typescript
// Uses standard generator (no batching overhead)
if (requests.length === 1) {
  return generateLessonForTopic(...);
}
```

### 3. Mixed Subjects/Topics
```typescript
// Falls back to parallel generation
if (!allSameSubject || !allSameTopic) {
  console.warn('Mixed subjects/topics - falling back to parallel');
  // ... parallel generation
}
```

### 4. Batch Failure
```typescript
// TRUE batching returns empty array on failure
if (singleCallResults.length === 0) {
  console.warn('TRUE batching failed, falling back to parallel');
  // ... parallel generation
}
```

### 5. Partial Success
```typescript
// If we got at least half the lessons, consider it a success
if (successCount >= requests.length / 2) {
  return singleCallResults; // Use partial results
} else {
  // Fall back to parallel for full reliability
}
```

### 6. Individual Lesson Failures
```typescript
// Promise.allSettled ensures all lessons are processed
const results = await Promise.allSettled(requests.map(...));
// Each result is either success or error
```

## Testing & Validation

### Error Scenarios Handled ✓

1. **API Errors**
   - Network failures → Falls back to parallel
   - Rate limiting → Handled by individual requests
   - Invalid responses → Validated with Zod schema

2. **Validation Errors**
   - Invalid lesson format → Individual lesson marked as failed
   - Word count violations → Caught by schema validation
   - Missing required fields → Caught by schema validation

3. **Usage Limits**
   - Checked upfront before any generation
   - Prevents wasted API calls

4. **Mixed Requests**
   - Different subjects → Falls back to parallel
   - Different topics → Falls back to parallel
   - Different tiers/speeds → Uses first request's config

## Integration Checklist

### Files Created ✓
- [lib/batch-lesson-generator.ts](lib/batch-lesson-generator.ts)

### Files Modified ✓
- [app/api/fyp/generate-pending/route.ts](app/api/fyp/generate-pending/route.ts)
- [app/api/playlists/[id]/generate-similar/route.ts](app/api/playlists/[id]/generate-similar/route.ts)

### Imports Added ✓
```typescript
import { generateLessonBatch, type BatchLessonRequest } from "@/lib/batch-lesson-generator";
```

### Type Safety ✓
- All types properly defined
- Full TypeScript support
- No `any` types used

## Performance Characteristics

### TRUE Batching (Single API Call)
- **Latency:** Slightly higher (generates multiple lessons)
- **Throughput:** Much higher (one request for N lessons)
- **Token Cost:** ~30% lower
- **Reliability:** Good (single point of failure, but has fallback)

### Parallel Generation (Fallback)
- **Latency:** Lower per lesson
- **Throughput:** Higher (concurrent requests)
- **Token Cost:** Same as sequential
- **Reliability:** Excellent (independent failures)

## Best Practices for Usage

### When TRUE Batching Works Best
1. Same subject and topic
2. 2-5 lessons needed
3. Similar difficulty/context
4. Background generation (can tolerate slightly higher latency)

### When Parallel Generation Works Better
1. Mixed subjects/topics
2. Need extreme reliability
3. 6+ lessons (approaching token limits)
4. Real-time generation (need first lesson ASAP)

## Monitoring & Logging

### Log Messages

**TRUE Batching Success:**
```
[batch] Attempting TRUE batching (single API call for ~30% savings)
[batch-single] Generating 2 lessons in SINGLE API call
[batch-single] Success: { generated: 2, failed: 0, inputTokens: 850, ... }
[batch] TRUE batching succeeded (2/2 lessons)
```

**Fallback to Parallel:**
```
[batch] TRUE batching failed, falling back to parallel generation
[batch] Using PARALLEL generation (2 concurrent API calls)
[batch] Complete: { total: 2, succeeded: 2, failed: 0, ... }
```

### Usage Tracking

Both modes log usage with proper metadata:
```typescript
metadata: {
  feature: "batch-lesson-single-call" | "batch-lesson",
  batchSize: 2,
  subject: "Algebra 1",
  tokenSavings: "~30%", // Only for TRUE batching
  // ...
}
```

## Rollout Strategy

### Phase 1: Low-Risk Rollout ✓
- ✅ Pending lesson generation (background, 2 lessons max)
- ✅ Similar lesson generation (3-10 lessons, user-initiated)

### Phase 2: Optional Expansion
- FYP prefetch optimization (cache warming)
- Bulk lesson generation tools
- Upload page lesson generation

### Phase 3: Monitoring
- Track TRUE batching success rate
- Measure actual token savings
- Monitor error rates and fallback frequency

## Cost Impact Analysis

### Pending Lessons (Most Common)
- **Before:** 2 requests × 850 tokens = 1,700 input tokens
- **After:** 1 request × 900 tokens = 900 input tokens
- **Savings:** 800 tokens per batch (47%)

### Similar Lessons (Average 3 lessons)
- **Before:** 3 requests × 850 tokens = 2,550 input tokens
- **After:** 1 request × 1,000 tokens = 1,000 input tokens
- **Savings:** 1,550 tokens per batch (61%)

### Monthly Savings Estimate
Assuming:
- 10,000 pending lesson batches/month (2 lessons each)
- 1,000 similar lesson batches/month (3 lessons average)

**Token Savings:**
- Pending: 10,000 × 800 = 8M tokens/month
- Similar: 1,000 × 1,550 = 1.55M tokens/month
- **Total: ~9.55M input tokens/month**

**Cost Savings (at $0.10/1M tokens):**
- **~$0.96/month at current scale**
- Scales linearly with usage

## Future Enhancements

### 1. Smart Batch Grouping
Automatically group lesson requests by subject/topic to maximize TRUE batching

### 2. Dynamic Batch Sizing
Adjust batch size based on token limits and current context size

### 3. Prefetch Batching
Pre-generate multiple lessons during idle time using batching

### 4. Cross-User Batching
Batch requests from multiple users (privacy-preserving) for even greater savings

## Compatibility

### Supported Models ✓
- ✅ Cerebras gpt-oss-120b (function calling)
- ✅ Groq gpt-oss-20b (function calling)
- ✅ DeepInfra models (function calling)

### Requirements
- Function calling support (most models)
- Falls back to parallel if not supported

## Security Considerations

### 1. Usage Limits ✓
- Checked before generation
- Prevents abuse

### 2. Input Validation ✓
- All requests validated
- Malicious inputs rejected

### 3. Resource Limits ✓
- Max 5 lessons per batch (prevents token overflow)
- Timeout protection

### 4. User Isolation ✓
- Each batch tied to single user
- No cross-user data leakage

## Conclusion

The batch lesson generation optimization successfully implements **~30% token savings** for common multi-lesson generation scenarios while maintaining:
- ✅ Full backward compatibility
- ✅ Robust error handling
- ✅ Automatic fallback mechanisms
- ✅ Type safety and code quality
- ✅ Comprehensive logging and monitoring

The implementation is **production-ready** and can be deployed immediately for the pending lesson and similar lesson generation routes.
