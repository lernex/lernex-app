-- Collaborative Filtering & Learning Style Detection Migration
-- Created: 2025-02-06
-- Purpose: Add user similarity tracking and learning style profiling for enhanced recommendations
-- Features:
--   1. Collaborative Filtering: Find similar users and recommend what they enjoyed
--   2. Learning Style Detection: Track behavioral patterns and adapt content accordingly
-- Expected Impact: 25% engagement boost via personalized recommendations

BEGIN;

-- ============================================================================
-- 1. USER COHORTS TABLE
-- ============================================================================
-- Purpose: Cluster similar users based on interests, performance, and preferences
-- Used by: Collaborative filtering to find "users like you"
-- Update frequency: Daily background job

CREATE TABLE IF NOT EXISTS public.user_cohorts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  cohort_id TEXT NOT NULL,                  -- e.g., "math_intermediate_visual_learners"
  similarity_score NUMERIC(5,4) NOT NULL,   -- 0.0000 to 1.0000 (distance to cohort center)

  -- Encoded vectors for clustering (compressed for performance)
  interests_vector JSONB,                   -- Subject interests as numeric encoding
  performance_vector JSONB,                 -- Accuracy patterns across topics
  preference_vector JSONB,                  -- Tone tag preferences encoded

  -- Metadata
  cohort_size INTEGER,                      -- Number of users in this cohort
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (user_id, subject),
  CONSTRAINT valid_similarity_score CHECK (similarity_score >= 0 AND similarity_score <= 1)
);

-- Indexes for fast cohort queries
CREATE INDEX IF NOT EXISTS idx_user_cohorts_cohort_id
  ON public.user_cohorts(cohort_id, similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_user_cohorts_updated
  ON public.user_cohorts(last_updated_at DESC);

COMMENT ON TABLE public.user_cohorts IS 'Clusters similar learners for collaborative filtering recommendations';
COMMENT ON COLUMN public.user_cohorts.cohort_id IS 'Identifies group of similar learners (e.g., "physics_advanced_fast_paced")';
COMMENT ON COLUMN public.user_cohorts.similarity_score IS 'Cosine similarity to cohort centroid (higher = more similar)';

-- ============================================================================
-- 2. LESSON CO-OCCURRENCES TABLE
-- ============================================================================
-- Purpose: Track which lessons are frequently liked together
-- Used by: "Users who enjoyed this also enjoyed..." recommendations
-- Update frequency: Real-time on feedback, aggregated hourly

CREATE TABLE IF NOT EXISTS public.lesson_co_occurrences (
  lesson_a_id TEXT NOT NULL,
  lesson_b_id TEXT NOT NULL,
  subject TEXT NOT NULL,

  -- Co-occurrence metrics
  co_like_count INTEGER DEFAULT 0,          -- Times both lessons liked by same user
  co_save_count INTEGER DEFAULT 0,          -- Times both lessons saved by same user
  confidence_score NUMERIC(5,4),            -- Association strength (lift metric)

  -- Metadata
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (lesson_a_id, lesson_b_id),
  CONSTRAINT no_self_reference CHECK (lesson_a_id != lesson_b_id),
  CONSTRAINT valid_confidence CHECK (confidence_score >= 0 AND confidence_score <= 1)
);

-- Indexes for recommendation queries
CREATE INDEX IF NOT EXISTS idx_lesson_co_occurrences_lookup
  ON public.lesson_co_occurrences(lesson_a_id, confidence_score DESC, subject);

CREATE INDEX IF NOT EXISTS idx_lesson_co_occurrences_subject_confidence
  ON public.lesson_co_occurrences(subject, confidence_score DESC)
  WHERE confidence_score > 0.3;

COMMENT ON TABLE public.lesson_co_occurrences IS 'Tracks lesson pairs frequently liked together for collaborative filtering';
COMMENT ON COLUMN public.lesson_co_occurrences.confidence_score IS 'Lift metric: P(B|A) / P(B) - measures association strength';

-- ============================================================================
-- 3. USER LEARNING STYLE PROFILE TABLE
-- ============================================================================
-- Purpose: Multi-dimensional behavioral learning style detection
-- Used by: Content generation to adapt lesson format and tone
-- Update frequency: After every 5 attempts (running average)

CREATE TABLE IF NOT EXISTS public.user_learning_style_profile (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,

  -- Learning Style Dimensions (normalized -1.0 to 1.0)
  visual_preference NUMERIC(4,3) DEFAULT 0.0,      -- -1=text, 0=neutral, +1=visual/diagrams
  example_preference NUMERIC(4,3) DEFAULT 0.0,     -- -1=abstract, 0=neutral, +1=concrete examples
  pace_preference NUMERIC(4,3) DEFAULT 0.0,        -- -1=thorough, 0=balanced, +1=fast-paced
  challenge_tolerance NUMERIC(4,3) DEFAULT 0.0,    -- -1=comfort-zone, 0=moderate, +1=stretch-goals
  explanation_length NUMERIC(4,3) DEFAULT 0.0,     -- -1=concise, 0=standard, +1=detailed

  -- Behavioral Indicators
  retry_tendency NUMERIC(4,3) DEFAULT 0.0,         -- -1=move-on, 0=normal, +1=perfectionist
  error_consistency NUMERIC(4,3) DEFAULT 0.0,      -- -1=random, 0=mixed, +1=systematic
  help_seeking NUMERIC(4,3) DEFAULT 0.0,           -- -1=independent, 0=occasional, +1=frequent

  -- Aggregate Metrics
  avg_time_on_task_seconds INTEGER,                -- Median time spent per lesson
  completion_rate NUMERIC(5,4),                    -- % of started lessons completed
  skip_rate NUMERIC(5,4),                          -- % of lessons skipped

  -- Confidence Scores (how certain we are about each dimension)
  confidence_level NUMERIC(4,3) DEFAULT 0.0,       -- Overall confidence (0-1, based on sample size)
  sample_size INTEGER DEFAULT 0,                   -- Number of attempts used for profiling

  -- Metadata
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (user_id, subject),
  CONSTRAINT valid_visual_pref CHECK (visual_preference >= -1 AND visual_preference <= 1),
  CONSTRAINT valid_example_pref CHECK (example_preference >= -1 AND example_preference <= 1),
  CONSTRAINT valid_pace_pref CHECK (pace_preference >= -1 AND pace_preference <= 1),
  CONSTRAINT valid_challenge_tol CHECK (challenge_tolerance >= -1 AND challenge_tolerance <= 1),
  CONSTRAINT valid_explanation_len CHECK (explanation_length >= -1 AND explanation_length <= 1),
  CONSTRAINT valid_retry_tendency CHECK (retry_tendency >= -1 AND retry_tendency <= 1),
  CONSTRAINT valid_error_consistency CHECK (error_consistency >= -1 AND error_consistency <= 1),
  CONSTRAINT valid_help_seeking CHECK (help_seeking >= -1 AND help_seeking <= 1),
  CONSTRAINT valid_confidence CHECK (confidence_level >= 0 AND confidence_level <= 1)
);

-- Indexes for profile lookups
CREATE INDEX IF NOT EXISTS idx_learning_style_user_subject
  ON public.user_learning_style_profile(user_id, subject);

CREATE INDEX IF NOT EXISTS idx_learning_style_confidence
  ON public.user_learning_style_profile(subject, confidence_level DESC)
  WHERE sample_size >= 10;

COMMENT ON TABLE public.user_learning_style_profile IS 'Behavioral learning style detection for personalized content adaptation';
COMMENT ON COLUMN public.user_learning_style_profile.visual_preference IS 'Preference for visual content vs text (-1 to +1 scale)';
COMMENT ON COLUMN public.user_learning_style_profile.confidence_level IS 'Statistical confidence in profile (higher with more attempts)';

-- ============================================================================
-- 4. INTERACTION SIGNALS TABLE
-- ============================================================================
-- Purpose: Capture detailed behavioral signals for learning style detection
-- Used by: Background jobs to compute learning style profiles
-- Retention: 90 days (for recency-weighted profiling)

CREATE TABLE IF NOT EXISTS public.interaction_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  subject TEXT NOT NULL,

  -- Behavioral Signals
  time_on_task_seconds INTEGER,                    -- Time from lesson load to submission
  scroll_depth_percent INTEGER,                    -- How much of lesson content was scrolled
  replay_count INTEGER DEFAULT 0,                  -- Times user replayed explanations
  hint_requests INTEGER DEFAULT 0,                 -- Times user requested hints

  -- Quiz Interaction Patterns
  first_attempt_correct BOOLEAN,                   -- Got it right first try?
  total_attempts INTEGER DEFAULT 1,                -- Number of retries before success/skip
  answer_change_count INTEGER DEFAULT 0,           -- Times user changed their answer
  time_to_first_answer_seconds INTEGER,            -- Thinking time before first submission

  -- Outcome
  correct_count INTEGER,
  total_questions INTEGER,
  skipped BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_scroll_depth CHECK (scroll_depth_percent >= 0 AND scroll_depth_percent <= 100)
);

-- Indexes for signal aggregation queries
CREATE INDEX IF NOT EXISTS idx_interaction_signals_user_subject_created
  ON public.interaction_signals(user_id, subject, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interaction_signals_cleanup
  ON public.interaction_signals(created_at);

COMMENT ON TABLE public.interaction_signals IS 'Detailed behavioral signals for learning style detection';
COMMENT ON COLUMN public.interaction_signals.time_on_task_seconds IS 'Engagement duration (too short = rushed, too long = struggling)';
COMMENT ON COLUMN public.interaction_signals.first_attempt_correct IS 'Indicates confidence and preparation level';

-- ============================================================================
-- 5. COLLABORATIVE RECOMMENDATIONS CACHE TABLE
-- ============================================================================
-- Purpose: Pre-computed recommendations from similar users
-- Used by: FYP route to quickly serve collaborative recommendations
-- Update frequency: Hourly background job

CREATE TABLE IF NOT EXISTS public.collaborative_recommendations (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,

  -- Recommendation Data
  recommended_lesson_ids TEXT[] NOT NULL,          -- Array of lesson IDs
  recommendation_scores NUMERIC[] NOT NULL,        -- Corresponding confidence scores
  recommendation_sources JSONB,                    -- {"cohort": [...], "co_occurrence": [...]}

  -- Metadata
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '2 hours',

  PRIMARY KEY (user_id, subject)
);

-- Index for cache expiration cleanup
CREATE INDEX IF NOT EXISTS idx_collab_recommendations_expiry
  ON public.collaborative_recommendations(expires_at);

COMMENT ON TABLE public.collaborative_recommendations IS 'Pre-computed collaborative filtering recommendations cache';
COMMENT ON COLUMN public.collaborative_recommendations.recommendation_scores IS 'Confidence scores parallel to recommended_lesson_ids array';

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE public.user_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_co_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_learning_style_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborative_recommendations ENABLE ROW LEVEL SECURITY;

-- User Cohorts Policies
CREATE POLICY "Users can view their own cohorts"
  ON public.user_cohorts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view cohort members (for discovery)"
  ON public.user_cohorts
  FOR SELECT
  USING (
    cohort_id IN (
      SELECT cohort_id FROM public.user_cohorts WHERE user_id = auth.uid()
    )
  );

-- Lesson Co-occurrences Policies (public read for recommendations)
CREATE POLICY "Anyone can read lesson co-occurrences"
  ON public.lesson_co_occurrences
  FOR SELECT
  USING (true);

-- Learning Style Profile Policies
CREATE POLICY "Users can view their own learning style profile"
  ON public.user_learning_style_profile
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own learning style profile"
  ON public.user_learning_style_profile
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Interaction Signals Policies
CREATE POLICY "Users can view their own interaction signals"
  ON public.interaction_signals
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own interaction signals"
  ON public.interaction_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Collaborative Recommendations Policies
CREATE POLICY "Users can view their own recommendations"
  ON public.collaborative_recommendations
  FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function: Update lesson co-occurrences when user likes/saves a lesson
CREATE OR REPLACE FUNCTION public.update_lesson_co_occurrences()
RETURNS TRIGGER AS $$
DECLARE
  liked_lessons TEXT[];
  lesson_a TEXT;
  lesson_b TEXT;
BEGIN
  -- Only process on liked_ids or saved_ids array updates
  IF TG_OP = 'UPDATE' AND NEW.liked_ids IS DISTINCT FROM OLD.liked_ids THEN
    liked_lessons := NEW.liked_ids;
  ELSIF TG_OP = 'UPDATE' AND NEW.saved_ids IS DISTINCT FROM OLD.saved_ids THEN
    liked_lessons := NEW.saved_ids;
  ELSIF TG_OP = 'INSERT' THEN
    liked_lessons := COALESCE(NEW.liked_ids, ARRAY[]::TEXT[]);
  ELSE
    RETURN NEW;
  END IF;

  -- Update co-occurrences for all lesson pairs
  IF array_length(liked_lessons, 1) >= 2 THEN
    FOR i IN 1..array_length(liked_lessons, 1) LOOP
      lesson_a := liked_lessons[i];
      FOR j IN (i+1)..array_length(liked_lessons, 1) LOOP
        lesson_b := liked_lessons[j];

        -- Insert or increment co-occurrence (both directions for symmetric lookup)
        INSERT INTO public.lesson_co_occurrences (lesson_a_id, lesson_b_id, subject, co_like_count, confidence_score)
        VALUES (lesson_a, lesson_b, NEW.subject, 1, 0.5)
        ON CONFLICT (lesson_a_id, lesson_b_id)
        DO UPDATE SET
          co_like_count = public.lesson_co_occurrences.co_like_count + 1,
          confidence_score = LEAST(1.0, public.lesson_co_occurrences.co_like_count::NUMERIC / 10.0),
          last_updated_at = NOW();

        INSERT INTO public.lesson_co_occurrences (lesson_a_id, lesson_b_id, subject, co_like_count, confidence_score)
        VALUES (lesson_b, lesson_a, NEW.subject, 1, 0.5)
        ON CONFLICT (lesson_a_id, lesson_b_id)
        DO UPDATE SET
          co_like_count = public.lesson_co_occurrences.co_like_count + 1,
          confidence_score = LEAST(1.0, public.lesson_co_occurrences.co_like_count::NUMERIC / 10.0),
          last_updated_at = NOW();
      END LOOP;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update co-occurrences on preference changes
CREATE TRIGGER trigger_update_lesson_co_occurrences
  AFTER INSERT OR UPDATE OF liked_ids, saved_ids ON public.user_subject_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lesson_co_occurrences();

-- Function: Clean up expired recommendations cache
CREATE OR REPLACE FUNCTION public.cleanup_expired_recommendations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.collaborative_recommendations
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Clean up old interaction signals (90 day retention)
CREATE OR REPLACE FUNCTION public.cleanup_old_interaction_signals()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.interaction_signals
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. INITIAL DATA MIGRATION
-- ============================================================================

-- Populate learning style profiles from existing tone_tags
INSERT INTO public.user_learning_style_profile (
  user_id,
  subject,
  visual_preference,
  example_preference,
  pace_preference,
  sample_size,
  confidence_level
)
SELECT
  p.user_id,
  p.subject,
  -- Infer visual preference from tone_tags
  CASE
    WHEN 'visual' = ANY(p.tone_tags) THEN 0.5
    WHEN 'story-driven' = ANY(p.tone_tags) THEN -0.3
    ELSE 0.0
  END AS visual_preference,
  -- Infer example preference from tone_tags
  CASE
    WHEN 'real-world' = ANY(p.tone_tags) THEN 0.7
    WHEN 'practice-heavy' = ANY(p.tone_tags) THEN 0.5
    ELSE 0.0
  END AS example_preference,
  -- Infer pace preference from tone_tags
  CASE
    WHEN 'fast-paced' = ANY(p.tone_tags) THEN 0.6
    WHEN 'step-by-step' = ANY(p.tone_tags) THEN -0.4
    WHEN 'supportive' = ANY(p.tone_tags) THEN -0.3
    ELSE 0.0
  END AS pace_preference,
  -- Sample size based on liked/saved lessons count
  COALESCE(array_length(p.liked_ids, 1), 0) + COALESCE(array_length(p.saved_ids, 1), 0) AS sample_size,
  -- Confidence based on sample size (sigmoid function)
  LEAST(1.0, (COALESCE(array_length(p.liked_ids, 1), 0) + COALESCE(array_length(p.saved_ids, 1), 0))::NUMERIC / 20.0) AS confidence_level
FROM public.user_subject_preferences p
WHERE COALESCE(array_length(p.tone_tags, 1), 0) > 0
ON CONFLICT (user_id, subject) DO NOTHING;

-- Populate lesson co-occurrences from existing liked lessons
DO $$
DECLARE
  pref_record RECORD;
  liked_lessons TEXT[];
  lesson_a TEXT;
  lesson_b TEXT;
BEGIN
  FOR pref_record IN
    SELECT user_id, subject, liked_ids
    FROM public.user_subject_preferences
    WHERE array_length(liked_ids, 1) >= 2
  LOOP
    liked_lessons := pref_record.liked_ids;

    FOR i IN 1..array_length(liked_lessons, 1) LOOP
      lesson_a := liked_lessons[i];
      FOR j IN (i+1)..array_length(liked_lessons, 1) LOOP
        lesson_b := liked_lessons[j];

        INSERT INTO public.lesson_co_occurrences (lesson_a_id, lesson_b_id, subject, co_like_count, confidence_score)
        VALUES (lesson_a, lesson_b, pref_record.subject, 1, 0.5)
        ON CONFLICT (lesson_a_id, lesson_b_id)
        DO UPDATE SET co_like_count = public.lesson_co_occurrences.co_like_count + 1;

        INSERT INTO public.lesson_co_occurrences (lesson_a_id, lesson_b_id, subject, co_like_count, confidence_score)
        VALUES (lesson_b, lesson_a, pref_record.subject, 1, 0.5)
        ON CONFLICT (lesson_a_id, lesson_b_id)
        DO UPDATE SET co_like_count = public.lesson_co_occurrences.co_like_count + 1;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 9. PERFORMANCE OPTIMIZATION
-- ============================================================================

-- Analyze new tables for query planner
ANALYZE public.user_cohorts;
ANALYZE public.lesson_co_occurrences;
ANALYZE public.user_learning_style_profile;
ANALYZE public.interaction_signals;
ANALYZE public.collaborative_recommendations;

COMMIT;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
--
-- COLLABORATIVE FILTERING INTEGRATION:
-- 1. Query user's cohort: SELECT cohort_id FROM user_cohorts WHERE user_id = $1 AND subject = $2
-- 2. Find similar users: SELECT user_id FROM user_cohorts WHERE cohort_id = $1 AND user_id != $2 LIMIT 50
-- 3. Get their liked lessons: SELECT liked_ids FROM user_subject_preferences WHERE user_id = ANY($1)
-- 4. Get co-occurrences: SELECT lesson_b_id, confidence_score FROM lesson_co_occurrences
--    WHERE lesson_a_id = ANY($liked_lessons) AND confidence_score > 0.5 ORDER BY confidence_score DESC
--
-- LEARNING STYLE ADAPTATION:
-- 1. Load profile: SELECT * FROM user_learning_style_profile WHERE user_id = $1 AND subject = $2
-- 2. Adapt prompt:
--    - visual_preference > 0.3: "Include visual descriptions and diagrams"
--    - example_preference > 0.4: "Use concrete, real-world examples"
--    - pace_preference > 0.5: "Keep explanations concise and fast-paced"
--    - challenge_tolerance > 0.6: "Include stretch challenges"
-- 3. Update after attempts: Call update_learning_style_profile() function
--
-- BACKGROUND JOBS (CRON):
-- 1. Hourly: Generate collaborative recommendations cache
-- 2. Daily: Update user cohorts via k-means clustering
-- 3. Daily: Cleanup expired recommendations and old interaction signals
--
-- MONITORING:
-- - Track cohort distribution: SELECT cohort_id, COUNT(*) FROM user_cohorts GROUP BY cohort_id
-- - Monitor recommendation hit rate: Check collaborative_recommendations cache hits
-- - Profile confidence: SELECT AVG(confidence_level) FROM user_learning_style_profile WHERE sample_size > 10
--
