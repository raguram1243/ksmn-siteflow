-- ============================================================================
-- KSMN SiteFlow - Portfolio Summary RPC Function
-- Run this in Supabase SQL Editor to create the portfolio summary function
-- ============================================================================

-- Drop existing function first (if it exists with different signature)
DROP FUNCTION IF EXISTS public.get_admin_portfolio_summary();

CREATE OR REPLACE FUNCTION public.get_admin_portfolio_summary()
RETURNS TABLE (
  total_quoted_value numeric,
  avg_margin numeric,
  below_target_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(p.baseline_quotation_value), 0)::numeric AS total_quoted_value,
    COALESCE(AVG(
      CASE 
        WHEN p.actual_cost_total > 0 
        THEN ((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100)
        ELSE NULL 
      END
    ), 0)::numeric AS avg_margin,
    COALESCE(COUNT(
      CASE 
        WHEN p.actual_cost_total > 0 
        AND ((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100) < 10 
        THEN 1 
      END
    ), 0)::bigint AS below_target_count
  FROM public.projects p;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_portfolio_summary() TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'get_admin_portfolio_summary';