-- ============================================================================
-- PROFIT & MARGIN: switch to cash basis
--
--   Profit   = Total Received (approved payments) - Actual Cost
--   Margin % = Profit / Total Received * 100
--
-- The quotation value (adjusted if set, else baseline) is now reference-only
-- and still drives the Outstanding Balance (quotation - received).
--
-- Run this once in the Supabase SQL editor. It replaces:
--   project_profit_view / get_project_profit_view()
--   get_admin_portfolio_summary()
--   get_total_profit()
--   get_monthly_margin_trend()
-- Keep the logic in sync with src/lib/profit.ts.
-- ============================================================================

-- 1. PROFIT VIEW -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_project_profit_view();
DROP VIEW IF EXISTS public.project_profit_view;

CREATE VIEW public.project_profit_view AS
SELECT
  s.project_id,
  s.contact_name,
  s.contact_phone,
  s.site_location,
  s.baseline_quotation_value,
  s.adjusted_quotation_value,
  s.effective_quotation_value,
  s.actual_cost_total,
  s.total_received,
  (s.total_received - s.actual_cost_total) AS profit_amount,
  CASE
    WHEN s.total_received > 0
    THEN ROUND(((s.total_received - s.actual_cost_total) / s.total_received * 100)::numeric, 2)
    ELSE 0
  END AS margin_percent,
  s.target_margin_percent,
  CASE
    WHEN s.total_received <= 0 AND s.actual_cost_total <= 0 THEN 'no_data'
    WHEN s.total_received <= 0 THEN 'loss'
    WHEN ((s.total_received - s.actual_cost_total) / s.total_received * 100) >= (s.target_margin_percent + 2) THEN 'above_target'
    WHEN ((s.total_received - s.actual_cost_total) / s.total_received * 100) >= s.target_margin_percent THEN 'on_target'
    WHEN ((s.total_received - s.actual_cost_total) / s.total_received * 100) > 0 THEN 'below_target'
    ELSE 'loss'
  END AS margin_status,
  s.project_status,
  s.created_at,
  s.closed_at
FROM (
  SELECT
    p.id AS project_id,
    c.name AS contact_name,
    c.phone AS contact_phone,
    c.site_location,
    p.baseline_quotation_value,
    p.adjusted_quotation_value,
    COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) AS effective_quotation_value,
    p.actual_cost_total,
    COALESCE((
      SELECT SUM(pp.amount) FROM public.project_payments pp
      WHERE pp.project_id = p.id AND pp.status = 'approved'
    ), 0) AS total_received,
    p.target_margin_percent,
    p.status AS project_status,
    p.created_at,
    p.closed_at
  FROM public.projects p
  JOIN public.contacts c ON c.id = p.contact_id
) s;

ALTER VIEW public.project_profit_view SET (security_barrier = true);
-- Views bypass RLS, so nobody may read this directly. It is reachable only
-- through the admin-checked SECURITY DEFINER functions below.
REVOKE ALL ON public.project_profit_view FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_project_profit_view()
RETURNS SETOF public.project_profit_view
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.project_profit_view
  WHERE public.current_user_role() = 'admin'
$$;

REVOKE ALL ON FUNCTION public.get_project_profit_view() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_profit_view() TO authenticated;

-- 2. PORTFOLIO SUMMARY (dashboard tiles) -------------------------------------
-- Covers ALL projects. Avg margin ignores projects with nothing received
-- (margin undefined). Below target = 'below_target' or 'loss'.
DROP FUNCTION IF EXISTS public.get_admin_portfolio_summary() CASCADE;

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
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE v.project_status = 'in_progress')::bigint,
    COALESCE(SUM(v.effective_quotation_value), 0)::numeric,
    COALESCE(AVG(v.margin_percent) FILTER (WHERE v.total_received > 0), 0)::numeric,
    COUNT(*) FILTER (WHERE v.margin_status IN ('below_target', 'loss'))::bigint,
    COUNT(*)::bigint
  FROM public.project_profit_view v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_portfolio_summary() TO authenticated;

-- 3. TOTAL PROFIT (dashboard financial summary) ------------------------------
-- total_revenue now means total RECEIVED. All projects, not only closed ones.
DROP FUNCTION IF EXISTS public.get_total_profit();

CREATE OR REPLACE FUNCTION public.get_total_profit()
RETURNS TABLE (
  total_profit NUMERIC,
  total_revenue NUMERIC,
  total_cost NUMERIC,
  closed_project_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(v.total_received - v.actual_cost_total), 0),
    COALESCE(SUM(v.total_received), 0),
    COALESCE(SUM(v.actual_cost_total), 0),
    COUNT(*) FILTER (WHERE v.project_status = 'closed')
  FROM public.project_profit_view v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_profit() TO authenticated;

-- 4. MARGIN TREND (6 months, bucketed by close month) ------------------------
CREATE OR REPLACE FUNCTION public.get_monthly_margin_trend()
RETURNS TABLE (
  month TEXT,
  margin NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    to_char(date_trunc('month', v.closed_at), 'Mon') AS month,
    ROUND(AVG(v.margin_percent)::numeric, 2) AS margin
  FROM public.project_profit_view v
  WHERE v.closed_at IS NOT NULL
    AND v.total_received > 0
    AND v.closed_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
  GROUP BY date_trunc('month', v.closed_at)
  ORDER BY date_trunc('month', v.closed_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_margin_trend() TO authenticated;
