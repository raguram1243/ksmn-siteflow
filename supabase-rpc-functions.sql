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

-- NOTE: profit/margin logic moved to supabase-profit-cash-basis.sql (cash basis:
-- profit = total received - actual cost). get_admin_portfolio_summary() was removed from this file
-- so re-running it can't restore the old quotation-based formula.

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_project_cost TO authenticated;
