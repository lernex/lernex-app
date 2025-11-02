# Audio Upload & Processing Flow

## Overview

This document details the complete flow for processing audio file uploads (lecture recordings, meetings, etc.) and converting them into educational micro-lessons.

## File Size Limits

- **Maximum Audio File Size**: 250MB
  - Supports ~2 hours of high-quality audio (192kbps MP3)
  - Supports ~4 hours of medium-quality audio (128kbps MP3)
- **Supported Formats**: MP3, WAV, M4A, OGG, WebM, FLAC, AAC, WMA

## Processing Pipeline

### Step 1: File Upload (Client-Side)
**Location**: `app/upload/UploadLessonsClient.tsx` - `parseAudioFile()`

User uploads audio file through the upload page. The system detects audio files by MIME type or file extension.

### Step 2: Audio Transcription
**Endpoint**: `/api/transcribe`
**Model**: `openai/whisper-large-v3-turbo` (via DeepInfra)
**Cost**: $0.0002 per minute
**Logging**: ✅ Logged to `usage_logs` table

The audio file is sent to OpenAI's Whisper model for speech-to-text transcription.

**Input**:
- Audio file (FormData)
- Estimated duration (seconds)

**Output**:
- Full transcript text
- Actual duration

**Usage Tracking**:
```typescript
{
  model: "openai/whisper-large-v3-turbo",
  input_tokens: Math.ceil(durationMinutes * 1000),
  output_tokens: 0,
  metadata: {
    route: "transcribe",
    provider: "deepinfra",
    duration_seconds: number,
    duration_minutes: number,
    audio_type: string
  }
}
```

### Step 3: Content Shortening (NEW)
**Endpoint**: `/api/shorten`
**Model**: `deepinfra/gpt-oss-20b`
**Cost**: $0.03 input / $0.14 output per 1M tokens
**Logging**: ✅ Logged to `usage_logs` table

The full transcript is processed by a small, efficient AI model to:
- Remove filler words ("um", "uh", "like", etc.)
- Remove repetitions and tangents
- Extract key concepts, definitions, and important facts
- Preserve technical terms, formulas, and examples
- Reduce content by 40-60% while maintaining educational value

**Why This Step?**
- Lecture recordings contain a lot of unnecessary content
- Reduces token usage for expensive downstream lesson generation
- Improves lesson quality by focusing on core concepts
- Saves money: cheap model (gpt-oss-20b) does heavy lifting

**Input**:
```json
{
  "text": "full transcript from Whisper",
  "context": "Audio lecture recording from file: filename.mp3"
}
```

**Output**:
```json
{
  "success": true,
  "shortenedText": "condensed transcript",
  "originalLength": 15000,
  "shortenedLength": 7500,
  "reductionPercent": 50,
  "inputTokens": 3750,
  "outputTokens": 1875
}
```

**Usage Tracking**:
```typescript
{
  model: "deepinfra/gpt-oss-20b",
  input_tokens: number, // from OpenAI usage object
  output_tokens: number,
  metadata: {
    route: "/api/shorten",
    provider: "deepinfra",
    original_length: number,
    shortened_length: number,
    reduction_percent: number,
    duration_ms: number,
    context_provided: boolean
  }
}
```

### Step 4: Lesson Generation
**Endpoint**: `/api/generate`
**Model**: Tier-based (see below)
**Logging**: ✅ Logged to `usage_logs` table

The shortened transcript is processed through the normal lesson generation pipeline.

**Models by User Tier**:
- **Free Tier**: `groq/gpt-oss-20b` (fast) - $0.075 input / $0.30 output per 1M tokens
- **Plus/Premium Tier**: `cerebras/gpt-oss-120b` (fast) - $0.35 input / $0.75 output per 1M tokens

**Input**:
- Shortened text from Step 3
- Subject (user-selected)
- Difficulty (auto-determined based on user performance)

**Output**:
- Structured lesson object with:
  - Title
  - Content (80-105 words)
  - 3 multiple-choice quiz questions
  - Difficulty level
  - Next topic hint

**Usage Tracking**:
```typescript
{
  model: "groq/gpt-oss-20b" | "cerebras/gpt-oss-120b",
  input_tokens: number,
  output_tokens: number,
  metadata: {
    route: "lesson-stream",
    subject: string,
    difficulty: "intro" | "easy" | "medium" | "hard",
    provider: "groq" | "cerebras",
    tier: "free" | "plus" | "premium"
  }
}
```

## Complete Cost Example

### Scenario: 1-hour lecture recording (high quality MP3, ~115MB)

**Step 1: Transcription**
- Duration: 60 minutes
- Model: whisper-large-v3-turbo
- Cost: 60 × $0.0002 = **$0.012**

**Step 2: Shortening**
- Estimated transcript: ~15,000 words = ~20,000 tokens input
- Estimated output: ~10,000 tokens (50% reduction)
- Model: deepinfra/gpt-oss-20b
- Cost: (20,000 × $0.03/1M) + (10,000 × $0.14/1M) = $0.0006 + $0.0014 = **$0.002**

**Step 3: Lesson Generation** (assuming 5 lessons from the shortened content)
- Input per lesson: ~2,000 tokens (shortened text chunk)
- Output per lesson: ~500 tokens (lesson + quiz)
- Total: 5 lessons × (2,000 input + 500 output)

**Free Tier (groq/gpt-oss-20b)**:
- Cost: (10,000 × $0.075/1M) + (2,500 × $0.30/1M) = $0.00075 + $0.00075 = **$0.0015**

**Paid Tier (cerebras/gpt-oss-120b)**:
- Cost: (10,000 × $0.35/1M) + (2,500 × $0.75/1M) = $0.0035 + $0.001875 = **$0.005375**

### Total Cost Per 1-Hour Lecture:

- **Free Tier**: $0.012 + $0.002 + $0.0015 = **$0.0155** (~1.5 cents)
- **Paid Tier**: $0.012 + $0.002 + $0.005375 = **$0.019375** (~1.9 cents)

### ROI Analysis:

**Free Plan** ($0/month):
- Cost per lecture: $0.0155
- Daily limit: ~5 lessons from text generation
- With audio: 1 lecture → 5 lessons (still within limits)
- Platform loses ~1.5 cents per lecture, but user engagement drives retention

**Plus Plan** ($5.99/month):
- Cost per lecture: $0.019375
- User pays $5.99/month = $0.20/day (30-day month)
- Can process ~10 lectures/day at this cost = ~$0.19/day
- **Profit margin**: ~5% + subscription value

**Premium Plan** ($14.99/month):
- Cost per lecture: $0.019375
- User pays $14.99/month = $0.50/day
- Can process ~25 lectures/day = ~$0.48/day
- **Profit margin**: ~4% + unlimited value proposition

## Database Schema

All usage is logged to the `usage_logs` table with automatic cost calculation via the `calculate_usage_cost()` trigger function.

**Columns**:
- `user_id`: UUID (nullable for anonymous users)
- `ip`: Text (IP address for rate limiting)
- `model`: Text (model identifier matching PRICES table in lib/usage.ts)
- `input_tokens`: Integer (or duration × 1000 for Whisper)
- `output_tokens`: Integer
- `metadata`: JSONB (route, provider, context-specific data)
- `cost`: Numeric (auto-calculated by trigger)
- `created_at`: Timestamp

## Monitoring & Optimization

### Key Metrics to Track:

1. **Average Reduction %** (Step 3 shortening)
   - Target: 40-60% reduction
   - Monitor: `metadata->>'reduction_percent'` in usage_logs

2. **Cost per Lesson** (by tier)
   - Free tier target: < $0.005/lesson
   - Paid tier target: < $0.01/lesson

3. **Audio Upload Adoption Rate**
   - Track: Number of audio uploads vs PDF uploads
   - Goal: 20-30% of uploads being audio

4. **User Cost Distribution**
   - Alert if any user exceeds $5/day (potential abuse)
   - Monitor heavy users for plan upgrade opportunities

### Optimization Opportunities:

1. **Batch Processing**: Process multiple audio files from same user in single API call
2. **Caching**: Cache shortened transcripts for repeated uploads of same lecture
3. **Quality Gates**: Skip shortening for already-concise transcripts (<1000 chars)
4. **Model Selection**: A/B test cheaper models for shortening (e.g., llama-3.1-8b)

## Error Handling & Fallbacks

### Transcription Failure:
- Return error to user
- Log to `usage_logs` with metadata.error

### Shortening Failure:
- **Fallback**: Use full transcript (bypass Step 3)
- Log warning but continue processing
- Still functional, just more expensive

### Lesson Generation Failure:
- Retry once with same model
- If still fails, try fallback model
- Return error if all retries fail

## Future Enhancements

1. **Speaker Diarization**: Identify different speakers in multi-person lectures
2. **Timestamp Preservation**: Link lessons back to specific audio timestamps
3. **Multi-Language Support**: Whisper supports 90+ languages
4. **Real-time Transcription**: Stream audio → live lesson generation
5. **Audio Quality Analysis**: Warn users about poor audio quality before processing

## Technical Notes

- All API routes use `runtime: 'nodejs'` for OpenAI SDK compatibility
- Maximum duration: 300 seconds (5 minutes) to handle large files
- Supabase connection uses service role key for server-side operations
- Authentication is optional (allows anonymous uploads with IP-based rate limiting)
- All costs are tracked per-user in `profiles.total_cost` column
