-- ============================================================================
-- Fix Payment Aggregates to Exclude Pending/Rejected Payments
-- Run this in Supabase SQL Editor
-- ============================================================================
-- This fixes the bug where Total Received and Outstanding Balance were
-- incorrectly including pending and rejected payments in their calculations.
-- Only payments with status = 'approved' should count toward totals.

-- 1. Fix get_admin_collection_summary()
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
        SELECT SUM(amount) FROM public.project_payments pp 
        WHERE pp.project_id = p.id AND pp.status = 'approved'
      ), 0) AS total_received,
      (COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) -
       COALESCE((
         SELECT SUM(amount) FROM public.project_payments pp 
         WHERE pp.project_id = p.id AND pp.status = 'approved'
       ), 0)) AS outstanding
    FROM public.projects p
  ) sub;
END;
$$;

-- 2. Fix get_overdue_collections()
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
      SELECT SUM(amount) FROM public.project_payments pp 
      WHERE pp.project_id = p.id AND pp.status = 'approved'
    ), 0) AS total_received,
    (COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) -
     COALESCE((
       SELECT SUM(amount) FROM public.project_payments pp 
       WHERE pp.project_id = p.id AND pp.status = 'approved'
     ), 0)) AS outstanding,
    EXTRACT(DAY FROM (NOW() - p.created_at))::BIGINT AS days_outstanding,
    p.status AS project_status,
    p.created_at
  FROM public.projects p
  JOIN public.contacts c ON c.id = p.contact_id
  WHERE (COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) -
         COALESCE((
           SELECT SUM(amount) FROM public.project_payments pp 
           WHERE pp.project_id = p.id AND pp.status = 'approved'
         ), 0)) > 0
  ORDER BY outstanding DESC, days_outstanding DESC;
END;
$$;

-- 3. Fix get_payment_monthly_comparison()
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
    COALESCE(SUM(CASE WHEN pp.date >= DATE_TRUNC('month', NOW()) THEN pp.amount ELSE 0 END), 0) AS this_month_collected,
    COALESCE(SUM(pp.amount), 0) AS all_time_collected,
    COUNT(CASE WHEN pp.date >= DATE_TRUNC('month', NOW()) THEN 1 END) AS this_month_count,
    COUNT(*) AS all_time_count
  FROM public.project_payments pp
  WHERE pp.status = 'approved';
END;
$$;

-- 4. Fix get_payment_mode_breakdown()
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

  SELECT COALESCE(SUM(amount), 0) INTO grand_total FROM public.project_payments WHERE status = 'approved';

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
  WHERE pp.status = 'approved'
  GROUP BY pp.payment_mode
  ORDER BY total_amount DESC;
END;
$$;