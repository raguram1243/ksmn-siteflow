-- ============================================================================
-- FIX: Admin Dashboard Stats - Definitive version
-- 
-- PROBLEM: Multiple SQL files had conflicting versions of 
-- get_admin_portfolio_summary() with different field names and signatures.
-- The AdminDashboard.tsx expects: active_projects, total_quoted_value, 
-- avg_margin, below_target_count, total_projects
--
-- This file properly drops ALL overloads and creates the correct version.
-- ============================================================================

-- Drop ALL existing overloads of this function (CASCADE to remove dependencies)
DROP FUNCTION IF EXISTS public.get_admin_portfolio_summary() CASCADE;

-- Recreate with the correct 5-field signature matching AdminDashboard.tsx
CREATE OR REPLACE FUNCTION public.get_admin_portfolio_summary()
RETURNS TABLE (
  active_projects bigint,
  total_quoted_value numeric,
  avg_margin numeric,
  below_target_count bigint,
  total_projects bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- Active Projects = count of in_progress only
    COUNT(*) FILTER (WHERE p.status = 'in_progress')::bigint AS active_projects,
    -- Total Quoted Value = sum of baseline across ALL projects
    COALESCE(SUM(p.baseline_quotation_value), 0)::numeric AS total_quoted_value,
    -- Avg Margin = average across ONLY completed/closed projects
    COALESCE(
      AVG(
        CASE 
          WHEN p.status IN ('completed', 'closed')
          AND p.baseline_quotation_value > 0 
          THEN ((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100)
          ELSE NULL 
        END
      ), 0
    )::numeric AS avg_margin,
    -- Below Target Margin = count of completed/closed projects below THEIR OWN target
    COUNT(*) FILTER (
      WHERE p.status IN ('completed', 'closed')
      AND p.baseline_quotation_value > 0 
      AND ((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100) < p.target_margin_percent
    )::bigint AS below_target_count,
    -- Total Projects = count of ALL projects
    COUNT(*)::bigint AS total_projects
  FROM public.projects p;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_portfolio_summary() TO authenticated;

-- ============================================================================
-- VERIFICATION: Run this to confirm the function exists and returns data
-- ============================================================================
-- SELECT * FROM public.get_admin_portfolio_summary();