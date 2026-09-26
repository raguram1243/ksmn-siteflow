-- ============================================================================
-- KSMN SiteFlow - RPC Functions for the frontend
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Recalculate project actual cost total from expense entries
CREATE OR REPLACE FUNCTION public.update_project_cost(p_project_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.projects
  SET actual_cost_total = (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.expense_entries
    WHERE project_id = p_project_id
  ),
  updated_at = NOW()
  WHERE id = p_project_id;
END;
$$;

-- Get all projects with profit data (admin only, enforced by RLS on underlying tables)
CREATE OR REPLACE FUNCTION public.get_admin_portfolio_summary()
RETURNS TABLE (
  total_projects BIGINT,
  active_projects BIGINT,
  total_quoted_value DECIMAL,
  total_cost DECIMAL,
  avg_margin DECIMAL,
  below_target_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'in_progress')::BIGINT,
    COALESCE(SUM(baseline_quotation_value), 0),
    COALESCE(SUM(actual_cost_total), 0),
    CASE
      WHEN SUM(baseline_quotation_value) > 0
      THEN ROUND((SUM(baseline_quotation_value) - SUM(actual_cost_total)) / SUM(baseline_quotation_value) * 100, 2)
      ELSE 0
    END,
    COUNT(*) FILTER (
      WHERE status != 'closed'
      AND baseline_quotation_value > 0
      AND ((baseline_quotation_value - actual_cost_total) / baseline_quotation_value * 100) < target_margin_percent
    )::BIGINT
  FROM public.projects
  WHERE public.current_user_role() = 'admin';
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_project_cost TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_portfolio_summary TO authenticated;