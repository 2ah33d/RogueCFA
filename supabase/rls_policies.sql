-- ════════════════════════════════════════════════════════════════
-- SUPABASE ROW-LEVEL SECURITY (RLS) HARDENING SCRIPT FOR ROGUEFA
-- Execute in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- ════════════════════════════════════════════════════════════════

-- 1. Create site_traffic table for anonymous visitor counting (if not already existing)
CREATE TABLE IF NOT EXISTS public.site_traffic (
    id BIGSERIAL PRIMARY KEY,
    metric_date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
    page_views BIGINT DEFAULT 0,
    unique_visitors BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
ALTER TABLE IF EXISTS public.digest_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.analyst_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.analyst_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.price_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.site_traffic ENABLE ROW LEVEL SECURITY;

-- 3. DROP EXISTING POLICIES TO AVOID CONFLICTS
DROP POLICY IF EXISTS "Public read access for digest_jobs" ON public.digest_jobs;
DROP POLICY IF EXISTS "Deny public inserts on digest_jobs" ON public.digest_jobs;
DROP POLICY IF EXISTS "Deny public updates on digest_jobs" ON public.digest_jobs;
DROP POLICY IF EXISTS "Deny public deletes on digest_jobs" ON public.digest_jobs;

DROP POLICY IF EXISTS "Public read access for analyst_scores" ON public.analyst_scores;
DROP POLICY IF EXISTS "Deny public inserts on analyst_scores" ON public.analyst_scores;
DROP POLICY IF EXISTS "Deny public updates on analyst_scores" ON public.analyst_scores;
DROP POLICY IF EXISTS "Deny public deletes on analyst_scores" ON public.analyst_scores;

DROP POLICY IF EXISTS "Public read access for site_traffic" ON public.site_traffic;

-- 4. STRICT POLICIES FOR DIGEST_JOBS
-- Public / Anon: SELECT ONLY (read-only)
CREATE POLICY "Public read access for digest_jobs"
ON public.digest_jobs
FOR SELECT
TO anon, authenticated
USING (true);

-- Public / Anon: DENY WRITE OPERATIONS (Service role bypasses RLS automatically)
CREATE POLICY "Deny public inserts on digest_jobs"
ON public.digest_jobs
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "Deny public updates on digest_jobs"
ON public.digest_jobs
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "Deny public deletes on digest_jobs"
ON public.digest_jobs
FOR DELETE
TO anon
USING (false);

-- 5. STRICT POLICIES FOR ANALYST_SCORES
CREATE POLICY "Public read access for analyst_scores"
ON public.analyst_scores
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Deny public inserts on analyst_scores"
ON public.analyst_scores
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "Deny public updates on analyst_scores"
ON public.analyst_scores
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "Deny public deletes on analyst_scores"
ON public.analyst_scores
FOR DELETE
TO anon
USING (false);

-- 6. STRICT POLICIES FOR SITE_TRAFFIC
CREATE POLICY "Public read access for site_traffic"
ON public.site_traffic
FOR SELECT
TO anon, authenticated
USING (true);

-- 7. SERVICE ROLE GRANTS
-- Note: Supabase 'service_role' key inherently bypasses RLS in Postgres.
-- These grants ensure proper permissions are active.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Verification query:
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
