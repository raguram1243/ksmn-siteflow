-- ============================================================================
-- KSMN SiteFlow - Admin-Only Aggregate Stats RPC Functions
-- These functions enforce admin-only access at the database level
-- using the existing is_admin() SECURITY DEFINER pattern.
-- ============================================================================

-- 1. ADMIN COLLECTION SUMMARY
-- Total Collected vs Total Outstanding across ALL projects
CREATE OR REPLACE FUNCTION public.get_admin_collection_summary()
RETURNS TABLE (
  total_collected NUMERIC,
  total_outstanding NUMERIC,
  total_quotation_value NUMERIC,
  project_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(total_received), 0) AS total_collected,
    COALESCE(SUM(outstanding), 0) AS total_outstanding,
    COALESCE(SUM(effective_value), 0) AS total_quotation_value,
    COUNT(*) AS project_count
  FROM (
    SELECT
      COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) AS effective_value,
      COALESCE((
        SELECT SUM(amount) FROM public.project_payments pp WHERE pp.project_id = p.id
      ), 0) AS total_received,
      (COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) -
       COALESCE((
         SELECT SUM(amount) FROM public.project_payments pp WHERE pp.project_id = p.id
       ), 0)) AS outstanding
    FROM public.projects p
  ) sub;
END;
$$;

-- 2. OVERDUE COLLECTIONS LIST
-- All projects with outstanding > 0, sorted by outstanding amount (highest first)
-- Uses days since project creation (confirmation) as the duration metric
CREATE OR REPLACE FUNCTION public.get_overdue_collections()
RETURNS TABLE (
  project_id UUID,
  contact_name TEXT,
  contact_phone TEXT,
  site_location TEXT,
  quotation_value NUMERIC,
  total_received NUMERIC,
  outstanding NUMERIC,
  days_outstanding BIGINT,
  project_status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS project_id,
    c.name AS contact_name,
    c.phone AS contact_phone,
    c.site_location,
    COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) AS quotation_value,
    COALESCE((
      SELECT SUM(amount) FROM public.project_payments pp WHERE pp.project_id = p.id
    ), 0) AS total_received,
    (COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) -
     COALESCE((
       SELECT SUM(amount) FROM public.project_payments pp WHERE pp.project_id = p.id
     ), 0)) AS outstanding,
    EXTRACT(DAY FROM (NOW() - p.created_at))::BIGINT AS days_outstanding,
    p.status AS project_status,
    p.created_at
  FROM public.projects p
  JOIN public.contacts c ON c.id = p.contact_id
  WHERE (COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) -
         COALESCE((
           SELECT SUM(amount) FROM public.project_payments pp WHERE pp.project_id = p.id
         ), 0)) > 0
  ORDER BY outstanding DESC, days_outstanding DESC;
END;
$$;

-- 3. AVERAGE PROJECT DURATION
-- Average days from project creation (confirmation) to closure, for completed/closed projects only
CREATE OR REPLACE FUNCTION public.get_average_project_duration()
RETURNS TABLE (
  avg_duration_days NUMERIC,
  completed_count BIGINT,
  total_duration_days NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    ROUND(AVG(EXTRACT(EPOCH FROM (p.closed_at - p.created_at)) / 86400)::numeric, 2) AS avg_duration_days,
    COUNT(*) AS completed_count,
    COALESCE(SUM(EXTRACT(EPOCH FROM (p.closed_at - p.created_at)) / 86400), 0) AS total_duration_days
  FROM public.projects p
  WHERE p.status = 'closed' AND p.closed_at IS NOT NULL;
END;
$$;

-- 4. TOTAL PROFIT
-- Cumulative lifetime profit = sum of (Adjusted Quotation Value - Actual Cost)
-- across all completed/closed projects only
CREATE OR REPLACE FUNCTION public.get_total_profit()
RETURNS TABLE (
  total_profit NUMERIC,
  total_revenue NUMERIC,
  total_cost NUMERIC,
  closed_project_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) - p.actual_cost_total), 0) AS total_profit,
    COALESCE(SUM(COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value)), 0) AS total_revenue,
    COALESCE(SUM(p.actual_cost_total), 0) AS total_cost,
    COUNT(*) AS closed_project_count
  FROM public.projects p
  WHERE p.status = 'closed';
END;
$$;

-- 5. EXPENSE MONTHLY COMPARISON
-- This Month vs Last Month total expenses
CREATE OR REPLACE FUNCTION public.get_expense_monthly_comparison()
RETURNS TABLE (
  this_month_total NUMERIC,
  last_month_total NUMERIC,
  this_month_count BIGINT,
  last_month_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN e.date >= DATE_TRUNC('month', NOW()) THEN e.amount ELSE 0 END), 0) AS this_month_total,
    COALESCE(SUM(CASE WHEN e.date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                      AND e.date < DATE_TRUNC('month', Now()) THEN e.amount ELSE 0 END), 0) AS last_month_total,
    COUNT(CASE WHEN e.date >= DATE_TRUNC('month', Now()) THEN 1 END) AS this_month_count,
    COUNT(CASE WHEN e.date >= DATE_TRUNC('month', Now() - INTERVAL '1 month')
               AND e.date < DATE_TRUNC('month', Now()) THEN 1 END) AS last_month_count
  FROM public.expense_entries e;
END;
$$;

-- 6. EXPENSE CATEGORY BREAKDOWN
-- Material / Labor / Other percentage split
CREATE OR REPLACE FUNCTION public.get_expense_category_breakdown()
RETURNS TABLE (
  category TEXT,
  total_amount NUMERIC,
  entry_count BIGINT,
  percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  grand_total NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO grand_total FROM public.expense_entries;

  RETURN QUERY
  SELECT
    e.category AS category,
    COALESCE(SUM(e.amount), 0) AS total_amount,
    COUNT(*) AS entry_count,
    CASE
      WHEN grand_total > 0 THEN ROUND((SUM(e.amount) / grand_total * 100)::numeric, 2)
      ELSE 0
    END AS percentage
  FROM public.expense_entries e
  GROUP BY e.category
  ORDER BY total_amount DESC;
END;
$$;

-- 7. TOP PROJECT BY EXPENSE
-- Which project currently has the highest total expenses logged
CREATE OR REPLACE FUNCTION public.get_top_project_by_expense()
RETURNS TABLE (
  project_id UUID,
  contact_name TEXT,
  site_location TEXT,
  total_expense NUMERIC,
  expense_count BIGINT,
  project_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS project_id,
    c.name AS contact_name,
    c.site_location,
    COALESCE(SUM(e.amount), 0) AS total_expense,
    COUNT(e.id) AS expense_count,
    p.status AS project_status
  FROM public.projects p
  JOIN public.contacts c ON c.id = p.contact_id
  LEFT JOIN public.expense_entries e ON e.project_id = p.id
  GROUP BY p.id, c.name, c.site_location, p.status
  ORDER BY total_expense DESC
  LIMIT 1;
END;
$$;

-- 8. AVERAGE EXPENSE PER PROJECT
-- Average total expense across all currently active (in_progress) projects
CREATE OR REPLACE FUNCTION public.get_avg_expense_per_project()
RETURNS TABLE (
  avg_expense NUMERIC,
  active_project_count BIGINT,
  total_expense NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    ROUND(COALESCE(AVG(expense_totals.total_expense), 0)::numeric, 2) AS avg_expense,
    COUNT(*) AS active_project_count,
    COALESCE(SUM(expense_totals.total_expense), 0) AS total_expense
  FROM (
    SELECT
      p.id,
      COALESCE(SUM(e.amount), 0) AS total_expense
    FROM public.projects p
    LEFT JOIN public.expense_entries e ON e.project_id = p.id
    WHERE p.status = 'in_progress'
    GROUP BY p.id
  ) expense_totals;
END;
$$;

-- 9. PAYMENT MONTHLY COMPARISON
-- Total Collected This Month vs All-Time Total
CREATE OR REPLACE FUNCTION public.get_payment_monthly_comparison()
RETURNS TABLE (
  this_month_collected NUMERIC,
  all_time_collected NUMERIC,
  this_month_count BIGINT,
  all_time_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN pp.date >= DATE_TRUNC('month', Now()) THEN pp.amount ELSE 0 END), 0) AS this_month_collected,
    COALESCE(SUM(pp.amount), 0) AS all_time_collected,
    COUNT(CASE WHEN pp.date >= DATE_TRUNC('month', Now()) THEN 1 END) AS this_month_count,
    COUNT(*) AS all_time_count
  FROM public.project_payments pp;
END;
$$;

-- 10. PAYMENT MODE BREAKDOWN
-- Cash / UPI / Bank Transfer split (count and amount per mode)
CREATE OR REPLACE FUNCTION public.get_payment_mode_breakdown()
RETURNS TABLE (
  payment_mode TEXT,
  total_amount NUMERIC,
  payment_count BIGINT,
  percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  grand_total NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO grand_total FROM public.project_payments;

  RETURN QUERY
  SELECT
    pp.payment_mode AS payment_mode,
    COALESCE(SUM(pp.amount), 0) AS total_amount,
    COUNT(*) AS payment_count,
    CASE
      WHEN grand_total > 0 THEN ROUND((SUM(pp.amount) / grand_total * 100)::numeric, 2)
      ELSE 0
    END AS percentage
  FROM public.project_payments pp
  GROUP BY pp.payment_mode
  ORDER BY total_amount DESC;
END;
$$;

-- Grant execute on all new functions to authenticated users
-- Access control is enforced inside each function via is_admin()
GRANT EXECUTE ON FUNCTION public.get_admin_collection_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_overdue_collections() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_average_project_duration() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_profit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expense_monthly_comparison() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expense_category_breakdown() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_project_by_expense() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_avg_expense_per_project() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_monthly_comparison() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_mode_breakdown() TO authenticated;

-- ============================================================================
-- EXPLANATION: Why "days since project creation" for overdue duration
-- ============================================================================
-- We use days since project creation (created_at) as the overdue duration metric
-- because:
-- 1. It's always available - every project has a created_at timestamp
-- 2. It represents the total time the balance has been outstanding since the
--    project was confirmed/created, which is more meaningful than "since last
--    payment" for projects that may have partial payments
-- 3. Projects with no payments at all still show a meaningful duration
-- 4. It aligns with the existing schema where created_at represents the
--    "confirmed" date (projects are created when a quotation is locked/confirmed)
-- ============================================================================
