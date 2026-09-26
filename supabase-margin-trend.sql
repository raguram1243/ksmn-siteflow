-- ============================================================================
-- MARGIN TREND (Admin Dashboard)
-- Average margin % for closed projects over the last 6 months.
-- Powers <MarginTrendChart /> via: supabase.rpc('get_monthly_margin_trend')
--
-- Apply this file in the Supabase SQL editor. Until it is applied the chart
-- gracefully falls back to its "No historical data yet" empty state.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_monthly_margin_trend()
RETURNS TABLE (
  month TEXT,
  margin NUMERIC
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
    to_char(p.closed_month, 'Mon') AS month,
    ROUND(AVG(
      CASE
        WHEN COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) > 0 THEN
          (COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) - p.actual_cost_total)
          / COALESCE(p.adjusted_quotation_value, p.baseline_quotation_value) * 100
        ELSE 0
      END
    )::numeric, 2) AS margin
  FROM (
    SELECT
      p2.actual_cost_total,
      p2.baseline_quotation_value,
      p2.adjusted_quotation_value,
      date_trunc('month', p2.closed_at) AS closed_month
    FROM public.projects p2
    WHERE p2.closed_at IS NOT NULL
      AND p2.closed_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
  ) p
  GROUP BY p.closed_month
  ORDER BY p.closed_month;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_margin_trend() TO authenticated;