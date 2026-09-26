-- ============================================================================
-- KSMN SiteFlow - Definitive Fix: PL/pgSQL Ambiguous Column Reference
--
-- ROOT CAUSE: PostgreSQL's PL/pgSQL throws "column reference X is ambiguous"
-- when a FUNCTION PARAMETER name or RETURNS TABLE OUTPUT COLUMN name is identical
-- to a real table column name referenced inside the function body. Table-qualifying
-- the query columns (e.g., gs.setting_key) does NOT fix this — the collision is
-- with the function's own declared identifier, not just an unqualified join column.
--
-- FIX: Rename the colliding parameter/output identifiers so they cannot collide
-- with table column names, while keeping all table references fully qualified.
--
-- This patch fixes:
--   - get_overdue_followups  (RETURNS TABLE contact_id collides with table column)
--   - get_global_setting     (parameter setting_key collides with table column)
--   - get_monthly_comparison (already safe, rewritten with full qualification)
--   - get_admin_portfolio_summary (already safe, rewritten with full qualification)
--
-- Run this entire file in Supabase SQL Editor, then reload /admin.
-- ============================================================================

-- ============================================================================
-- 1. OVERDUE FOLLOWUPS
-- ============================================================================
-- PROBLEM: RETURNS TABLE declares "contact_id UUID" which creates an implicit
-- PL/pgSQL variable named contact_id. Inside the body, references to
-- interaction_notes.contact_id and site_visits.contact_id become ambiguous
-- because PostgreSQL cannot tell if "contact_id" means the output variable
-- or the table column.
--
-- FIX: Rename the output column from "contact_id" to "out_contact_id".
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_overdue_followups(INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION public.get_overdue_followups(days_threshold INTEGER DEFAULT 14)
RETURNS TABLE (
  out_contact_id UUID,
  name TEXT,
  phone TEXT,
  site_location TEXT,
  last_activity TIMESTAMPTZ,
  days_since_contact INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS out_contact_id,
    c.name,
    c.phone,
    c.site_location,
    COALESCE(
      (SELECT MAX(in2.created_at) FROM public.interaction_notes in2 WHERE in2.contact_id = c.id),
      c.created_at
    ) AS last_activity,
    EXTRACT(DAY FROM (NOW() - COALESCE(
      (SELECT MAX(in2.created_at) FROM public.interaction_notes in2 WHERE in2.contact_id = c.id),
      c.created_at
    )))::INTEGER AS days_since_contact
  FROM public.contacts c
  WHERE EXTRACT(DAY FROM (NOW() - COALESCE(
      (SELECT MAX(in2.created_at) FROM public.interaction_notes in2 WHERE in2.contact_id = c.id),
      c.created_at
    ))) >= days_threshold
  ORDER BY last_activity ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_overdue_followups(INTEGER) TO authenticated;

-- ============================================================================
-- 2. GLOBAL SETTING
-- ============================================================================
-- PROBLEM: The function parameter is named "setting_key", which is identical
-- to the global_settings table's "setting_key" column. Inside the body,
-- "WHERE gs.setting_key = setting_key" is ambiguous — PostgreSQL cannot tell
-- if the right-hand "setting_key" refers to the function parameter or the
-- table column. Table-qualifying the left side (gs.setting_key) does NOT fix
-- this because the right side remains ambiguous.
--
-- FIX: Rename the parameter from "setting_key" to "p_setting_key".
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_global_setting(TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.get_global_setting(p_setting_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT gs.setting_value FROM public.global_settings gs WHERE gs.setting_key = p_setting_key),
    NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_global_setting(TEXT) TO authenticated;

-- ============================================================================
-- 3. MONTHLY COMPARISON
-- ============================================================================
-- STATUS: Already safe — no parameter or output column collides with table
-- columns. Rewritten here with full qualification for consistency and to
-- prevent future regressions if the function signature ever changes.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_monthly_comparison() CASCADE;

CREATE OR REPLACE FUNCTION public.get_monthly_comparison()
RETURNS TABLE (
  this_month_contacts BIGINT,
  last_month_contacts BIGINT,
  this_month_confirmed BIGINT,
  last_month_confirmed BIGINT,
  this_month_value NUMERIC,
  last_month_value NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE c.date_first_met >= DATE_TRUNC('month', CURRENT_DATE))::BIGINT AS this_month_contacts,
    COUNT(*) FILTER (WHERE c.date_first_met >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                     AND c.date_first_met < DATE_TRUNC('month', CURRENT_DATE))::BIGINT AS last_month_contacts,
    COUNT(*) FILTER (WHERE c.lead_status = 'confirmed'
                     AND c.updated_at >= DATE_TRUNC('month', CURRENT_DATE))::BIGINT AS this_month_confirmed,
    COUNT(*) FILTER (WHERE c.lead_status = 'confirmed'
                     AND c.updated_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                     AND c.updated_at < DATE_TRUNC('month', CURRENT_DATE))::BIGINT AS last_month_confirmed,
    COALESCE(SUM(p.baseline_quotation_value) FILTER (WHERE p.created_at >= DATE_TRUNC('month', CURRENT_DATE)), 0)::NUMERIC AS this_month_value,
    COALESCE(SUM(p.baseline_quotation_value) FILTER (WHERE p.created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                     AND p.created_at < DATE_TRUNC('month', CURRENT_DATE)), 0)::NUMERIC AS last_month_value
  FROM public.contacts c
  LEFT JOIN public.projects p ON p.lead_id = c.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_comparison() TO authenticated;

-- ============================================================================
-- 4. PORTFOLIO SUMMARY
-- ============================================================================
-- STATUS: Already safe — no parameter or output column collides with table
-- columns. Rewritten here with full qualification for consistency and to
-- prevent future regressions. DROP + CASCADE clears any stale 3-field overload
-- from supabase-portfolio-rpc.sql so this 5-field version is the only one.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_admin_portfolio_summary() CASCADE;

CREATE OR REPLACE FUNCTION public.get_admin_portfolio_summary()
RETURNS TABLE (
  active_projects BIGINT,
  total_quoted_value NUMERIC,
  avg_margin NUMERIC,
  below_target_count BIGINT,
  total_projects BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE p.status = 'in_progress')::BIGINT AS active_projects,
    COALESCE(SUM(p.baseline_quotation_value), 0)::NUMERIC AS total_quoted_value,
    COALESCE(AVG(CASE
          WHEN p.status IN ('completed', 'closed')
          AND p.baseline_quotation_value > 0
          THEN ((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100)
          ELSE NULL
        END), 0)::NUMERIC AS avg_margin,
    COUNT(*) FILTER (
      WHERE p.status IN ('completed', 'closed')
      AND p.baseline_quotation_value > 0
      AND ((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100) < p.target_margin_percent
    )::BIGINT AS below_target_count,
    COUNT(*)::BIGINT AS total_projects
  FROM public.projects p;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_portfolio_summary() TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this patch, verify in Supabase SQL Editor:
--
--   SELECT proname, prosrc
--   FROM pg_proc
--   WHERE proname IN (
--     'get_overdue_followups',
--     'get_global_setting',
--     'get_monthly_comparison',
--     'get_admin_portfolio_summary'
--   );
--
-- Then reload /admin and confirm the browser console shows NO errors for
-- "Error fetching followups" or "Error fetching settings".
-- ============================================================================

SELECT 'Ambiguous column reference fix applied successfully.' AS status;