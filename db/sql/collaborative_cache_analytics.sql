-- ============================================================================
-- COLLABORATIVE CACHE ANALYTICS QUERIES
-- ============================================================================
-- Collection of useful SQL queries for monitoring and analyzing the
-- collaborative document cache performance and impact.
--
-- Usage: Run these queries in your Supabase SQL Editor or analytics dashboard
--
-- NOTE: All queries are safe to run on empty tables (no division by zero errors)
-- ============================================================================

-- ============================================================================
-- 0. QUICK HEALTH CHECK
-- ============================================================================
-- Run this first to verify the table exists and get basic stats
-- Safe to run even when table is empty

SELECT
  'shared_document_cache' as table_name,
  COUNT(*) as total_documents,
  COALESCE(SUM(usage_count), 0) as total_usages,
  COALESCE(MAX(usage_count), 0) as max_usage_count,
  CASE
    WHEN COUNT(*) = 0 THEN '⚠️ Empty - No documents cached yet'
    WHEN COUNT(*) < 10 THEN '✓ Getting started (' || COUNT(*) || ' documents)'
    WHEN COUNT(*) < 100 THEN '✓ Growing (' || COUNT(*) || ' documents)'
    ELSE '✅ Healthy (' || COUNT(*) || ' documents)'
  END as status
FROM public.shared_document_cache;


-- ============================================================================
-- 1. MOST POPULAR DOCUMENTS
-- ============================================================================
-- Shows which textbooks/documents are most commonly used

SELECT
  title,
  page_count,
  usage_count,
  created_at,
  -- Calculate estimated cost savings
  ROUND(((usage_count - 1) * page_count * 0.000104)::NUMERIC, 4) as savings_usd,
  -- Show fingerprint for debugging
  LEFT(fingerprint, 12) || '...' as fingerprint_preview
FROM public.shared_document_cache
ORDER BY usage_count DESC
LIMIT 20;

-- Alternative: Use the built-in function
SELECT * FROM public.get_popular_shared_documents(20);


-- ============================================================================
-- 2. OVERALL CACHE STATISTICS
-- ============================================================================
-- Platform-wide statistics about collaborative caching

SELECT
  COUNT(*) as total_documents,
  SUM(usage_count) as total_usages,
  SUM(page_count) as total_pages_cached,
  -- Total cost savings (all cache hits)
  ROUND(SUM((usage_count - 1) * page_count * 0.000104)::NUMERIC, 2) as total_savings_usd,
  -- Average usage per document
  ROUND(AVG(usage_count)::NUMERIC, 2) as avg_usage_per_document,
  -- Average pages per document
  ROUND(AVG(page_count)::NUMERIC, 0) as avg_pages_per_document,
  -- Median usage (shows typical document popularity)
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY usage_count) as median_usage
FROM public.shared_document_cache;

-- Alternative: Use the built-in function
SELECT * FROM public.get_shared_cache_stats();


-- ============================================================================
-- 3. DOCUMENTS BY POPULARITY TIER
-- ============================================================================
-- Categorize documents by how many times they've been used

SELECT
  CASE
    WHEN usage_count = 1 THEN '1. Single Use (not yet reused)'
    WHEN usage_count BETWEEN 2 AND 5 THEN '2. Low (2-5 users)'
    WHEN usage_count BETWEEN 6 AND 20 THEN '3. Medium (6-20 users)'
    WHEN usage_count BETWEEN 21 AND 100 THEN '4. High (21-100 users)'
    ELSE '5. Very High (100+ users)'
  END as popularity_tier,
  COUNT(*) as document_count,
  SUM(page_count) as total_pages,
  SUM(usage_count) as total_usages,
  ROUND(SUM((usage_count - 1) * page_count * 0.000104)::NUMERIC, 2) as tier_savings_usd
FROM public.shared_document_cache
GROUP BY popularity_tier
ORDER BY popularity_tier;


-- ============================================================================
-- 4. RECENTLY ADDED DOCUMENTS
-- ============================================================================
-- See what documents have been shared in the last week

SELECT
  title,
  page_count,
  usage_count,
  created_at,
  AGE(NOW(), created_at) as age,
  ROUND(((usage_count - 1) * page_count * 0.000104)::NUMERIC, 4) as savings_usd
FROM public.shared_document_cache
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;


-- ============================================================================
-- 5. CACHE GROWTH OVER TIME
-- ============================================================================
-- Track how the cache has grown (documents added per day/week)

SELECT
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as documents_added,
  SUM(page_count) as pages_added,
  SUM(usage_count) as initial_usages
FROM public.shared_document_cache
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;


-- ============================================================================
-- 6. HIGH-VALUE DOCUMENTS (Most Cost Savings)
-- ============================================================================
-- Documents that have saved the most money

SELECT
  title,
  page_count,
  usage_count,
  created_at,
  -- Calculate total savings from this document
  ROUND(((usage_count - 1) * page_count * 0.000104)::NUMERIC, 4) as savings_usd,
  -- Calculate per-use value
  ROUND((page_count * 0.000104)::NUMERIC, 4) as value_per_use_usd
FROM public.shared_document_cache
WHERE usage_count > 1  -- Only documents with reuse
ORDER BY savings_usd DESC
LIMIT 20;


-- ============================================================================
-- 7. STALE DOCUMENTS (Candidates for Cleanup)
-- ============================================================================
-- Documents with low usage that might be removed

SELECT
  title,
  page_count,
  usage_count,
  created_at,
  AGE(NOW(), created_at) as age
FROM public.shared_document_cache
WHERE usage_count = 1  -- Never reused
  AND created_at < NOW() - INTERVAL '14 days'  -- Older than 2 weeks
ORDER BY created_at ASC
LIMIT 100;


-- ============================================================================
-- 8. CACHE SIZE AND STORAGE USAGE
-- ============================================================================
-- Monitor database storage consumption

SELECT
  pg_size_pretty(pg_total_relation_size('public.shared_document_cache')) as total_size,
  pg_size_pretty(pg_relation_size('public.shared_document_cache')) as table_size,
  pg_size_pretty(pg_indexes_size('public.shared_document_cache')) as indexes_size,
  COUNT(*) as document_count,
  -- Average document size
  pg_size_pretty(pg_relation_size('public.shared_document_cache')::bigint / GREATEST(COUNT(*), 1)) as avg_doc_size
FROM public.shared_document_cache;


-- ============================================================================
-- 9. DOCUMENTS BY PAGE COUNT DISTRIBUTION
-- ============================================================================
-- Understand the size distribution of cached documents

SELECT
  CASE
    WHEN page_count < 10 THEN '1-9 pages'
    WHEN page_count < 50 THEN '10-49 pages'
    WHEN page_count < 100 THEN '50-99 pages'
    WHEN page_count < 200 THEN '100-199 pages'
    WHEN page_count < 500 THEN '200-499 pages'
    ELSE '500+ pages'
  END as page_range,
  COUNT(*) as document_count,
  SUM(usage_count) as total_usages,
  ROUND(AVG(usage_count)::NUMERIC, 2) as avg_usage,
  ROUND(SUM((usage_count - 1) * page_count * 0.000104)::NUMERIC, 2) as savings_usd
FROM public.shared_document_cache
GROUP BY page_range
ORDER BY MIN(page_count);


-- ============================================================================
-- 10. TITLE PATTERN ANALYSIS (Academic vs. Other)
-- ============================================================================
-- Analyze what types of documents are being shared

SELECT
  CASE
    WHEN title ~* 'chapter|edition|isbn|volume' THEN 'Textbook'
    WHEN title ~* 'arxiv|doi|journal|proceedings' THEN 'Academic Paper'
    WHEN title ~* 'handbook|manual|guide|reference' THEN 'Reference Material'
    WHEN title ~* 'introduction|principles|fundamentals' THEN 'Introductory Text'
    ELSE 'Other'
  END as document_type,
  COUNT(*) as count,
  ROUND(AVG(page_count)::NUMERIC, 0) as avg_pages,
  ROUND(AVG(usage_count)::NUMERIC, 2) as avg_usage,
  SUM(usage_count) as total_usages
FROM public.shared_document_cache
GROUP BY document_type
ORDER BY count DESC;


-- ============================================================================
-- 11. CACHE EFFECTIVENESS RATE
-- ============================================================================
-- Calculate what percentage of cached documents are actually reused

WITH reuse_stats AS (
  SELECT
    COUNT(*) as total_docs,
    COUNT(*) FILTER (WHERE usage_count > 1) as reused_docs,
    COUNT(*) FILTER (WHERE usage_count = 1) as single_use_docs
  FROM public.shared_document_cache
)
SELECT
  total_docs,
  reused_docs,
  single_use_docs,
  ROUND((reused_docs::NUMERIC / NULLIF(total_docs, 0) * 100), 2) as reuse_percentage,
  -- If >50% reuse rate, collaborative caching is working well
  CASE
    WHEN reused_docs::NUMERIC / NULLIF(total_docs, 0) > 0.5 THEN '✅ Excellent (>50% reuse)'
    WHEN reused_docs::NUMERIC / NULLIF(total_docs, 0) > 0.3 THEN '✓ Good (30-50% reuse)'
    ELSE '⚠ Needs Improvement (<30% reuse)'
  END as effectiveness
FROM reuse_stats;


-- ============================================================================
-- 12. MONTHLY SAVINGS TREND
-- ============================================================================
-- Track cost savings over time (requires historical data)

SELECT
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as documents_added,
  SUM(usage_count) as total_usages,
  SUM(page_count) as pages_processed,
  -- Savings from documents added in this month
  ROUND(SUM((usage_count - 1) * page_count * 0.000104)::NUMERIC, 2) as monthly_savings_usd
FROM public.shared_document_cache
WHERE created_at >= NOW() - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;


-- ============================================================================
-- 13. DOCUMENTS APPROACHING EXPIRATION (30-day TTL)
-- ============================================================================
-- See which documents will be cleaned up soon

SELECT
  title,
  page_count,
  usage_count,
  created_at,
  EXTRACT(DAY FROM (created_at + INTERVAL '30 days' - NOW())) as days_until_expiration,
  ROUND(((usage_count - 1) * page_count * 0.000104)::NUMERIC, 4) as savings_generated_usd
FROM public.shared_document_cache
WHERE created_at < NOW() - INTERVAL '25 days'  -- Less than 5 days remaining
ORDER BY days_until_expiration ASC
LIMIT 50;


-- ============================================================================
-- 14. TOP DOCUMENTS BY TITLE KEYWORDS
-- ============================================================================
-- Find most popular documents containing specific keywords

-- Example: Calculus textbooks
SELECT
  title,
  page_count,
  usage_count,
  ROUND(((usage_count - 1) * page_count * 0.000104)::NUMERIC, 4) as savings_usd
FROM public.shared_document_cache
WHERE title ILIKE '%calculus%'
ORDER BY usage_count DESC
LIMIT 10;

-- Example: Physics textbooks
SELECT
  title,
  page_count,
  usage_count,
  ROUND(((usage_count - 1) * page_count * 0.000104)::NUMERIC, 4) as savings_usd
FROM public.shared_document_cache
WHERE title ILIKE '%physics%'
ORDER BY usage_count DESC
LIMIT 10;


-- ============================================================================
-- 15. CACHE HIT SIMULATION
-- ============================================================================
-- Estimate potential savings if cache existed from day 1

WITH upload_simulation AS (
  SELECT
    fingerprint,
    page_count,
    -- Simulate each usage as a separate upload
    generate_series(1, usage_count) as upload_number
  FROM public.shared_document_cache
)
SELECT
  COUNT(*) as total_uploads,
  COUNT(*) FILTER (WHERE upload_number = 1) as ocr_operations,
  COUNT(*) FILTER (WHERE upload_number > 1) as cache_hits,
  -- Fix: Use NULLIF to prevent division by zero when table is empty
  ROUND((COUNT(*) FILTER (WHERE upload_number > 1)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 2) as cache_hit_rate_percent,
  -- Cost if no cache (all uploads OCR'd)
  ROUND(COALESCE(SUM(page_count * 0.000104), 0)::NUMERIC, 2) as cost_without_cache_usd,
  -- Actual cost (only first upload per document)
  ROUND(COALESCE(SUM(CASE WHEN upload_number = 1 THEN page_count * 0.000104 ELSE 0 END), 0)::NUMERIC, 2) as cost_with_cache_usd,
  -- Total savings
  ROUND((COALESCE(SUM(page_count * 0.000104), 0) - COALESCE(SUM(CASE WHEN upload_number = 1 THEN page_count * 0.000104 ELSE 0 END), 0))::NUMERIC, 2) as total_savings_usd
FROM upload_simulation;


-- ============================================================================
-- 16. MAINTENANCE: FORCE CLEANUP NOW
-- ============================================================================
-- Manually trigger cleanup of old entries (removes >30 days)

-- SELECT public.cleanup_old_shared_document_cache();


-- ============================================================================
-- 17. MAINTENANCE: REINDEX FOR PERFORMANCE
-- ============================================================================
-- Rebuild indexes if queries are slow

-- REINDEX TABLE public.shared_document_cache;


-- ============================================================================
-- 18. MAINTENANCE: ANALYZE TABLE FOR QUERY OPTIMIZATION
-- ============================================================================
-- Update table statistics for query planner

-- ANALYZE public.shared_document_cache;


-- ============================================================================
-- DASHBOARD SUMMARY QUERY
-- ============================================================================
-- Single query with all key metrics for a dashboard view

WITH stats AS (
  SELECT
    COUNT(*) as total_documents,
    COALESCE(SUM(usage_count), 0) as total_usages,
    COALESCE(SUM(page_count), 0) as total_pages,
    ROUND(COALESCE(SUM((usage_count - 1) * page_count * 0.000104), 0)::NUMERIC, 2) as total_savings,
    ROUND(AVG(usage_count)::NUMERIC, 2) as avg_usage,
    MAX(usage_count) as max_usage,
    COUNT(*) FILTER (WHERE usage_count > 1) as reused_docs
  FROM public.shared_document_cache
),
recent AS (
  SELECT COUNT(*) as docs_added_7d
  FROM public.shared_document_cache
  WHERE created_at >= NOW() - INTERVAL '7 days'
),
top_doc AS (
  -- Fix: Ensure this always returns one row even when table is empty
  (
    SELECT
      title,
      usage_count
    FROM public.shared_document_cache
    ORDER BY usage_count DESC
    LIMIT 1
  )
  UNION ALL
  (
    -- Return a dummy row if table is empty
    SELECT
      'No documents yet' as title,
      0 as usage_count
    WHERE NOT EXISTS (SELECT 1 FROM public.shared_document_cache)
  )
)
SELECT
  s.total_documents,
  s.total_usages,
  s.total_pages,
  s.total_savings || ' USD' as total_savings,
  COALESCE(s.avg_usage, 0) as avg_usage,
  COALESCE(s.max_usage, 0) as max_usage,
  COALESCE(ROUND((s.reused_docs::NUMERIC / NULLIF(s.total_documents, 0) * 100), 2), 0) || '%' as reuse_rate,
  r.docs_added_7d,
  t.title as most_popular_title,
  t.usage_count as most_popular_count
FROM stats s
CROSS JOIN recent r
CROSS JOIN top_doc t;


-- ============================================================================
-- NOTES
-- ============================================================================
--
-- Interpreting Results:
-- - High usage_count = Popular textbook, great ROI
-- - Low reuse_rate (<30%) = Too many unique documents, might need better privacy filtering
-- - Large storage size = Consider more aggressive cleanup or compression
-- - Many stale documents = Increase cleanup frequency or reduce TTL
--
-- Expected Patterns:
-- - Power law distribution: Few documents with very high usage, many with low usage
-- - Textbooks should dominate the high-usage tier
-- - Academic papers likely have lower reuse (more niche)
-- - Seasonal patterns based on academic calendar
--
-- Performance Tips:
-- - Add indexes on commonly filtered columns (e.g., created_at, usage_count)
-- - Use EXPLAIN ANALYZE to optimize slow queries
-- - Consider materialized views for expensive aggregate queries
-- - Run VACUUM ANALYZE periodically to maintain performance
--
-- ============================================================================
