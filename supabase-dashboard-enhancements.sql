-- ============================================================================
-- DEPRECATED — DO NOT RUN THIS FILE AGAIN
-- The get_overdue_followups and get_global_setting definitions in this file
-- are the OLD ambiguous-column versions. They have been superseded by
-- supabase-fix-ambiguous-columns.sql. Re-running this file will reintroduce
-- the "column reference is ambiguous" bug. If you need to re-apply schema
-- changes from this file, extract only the functions you need and skip
-- get_overdue_followups / get_global_setting.
-- ============================================================================

-- ============================================================================
-- Dashboard Enhancements - Fix RPC + Add Global Settings
-- ============================================================================

-- 1. Create global_settings table
CREATE TABLE IF NOT EXISTS public.global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default target margin (10%)
INSERT INTO public.global_settings (setting_key, setting_value)
VALUES ('default_target_margin', '10.00')
ON CONFLICT (setting_key) DO NOTHING;

-- 2. Drop and recreate the portfolio summary RPC with per-definition calculations
DROP FUNCTION IF EXISTS public.get_admin_portfolio_summary();

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
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- Active Projects = count of in_progress only
    COUNT(*) FILTER (WHERE p.status = 'in_progress')::bigint AS active_projects,
    -- Total Quoted Value = sum of baseline across ALL projects (in_progress + completed/closed)
    COALESCE(SUM(p.baseline_quotation_value), 0)::numeric AS total_quoted_value,
    -- Avg Margin = average across ONLY completed/closed projects (backward-looking)
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

-- 3. Create function to get global setting
CREATE OR REPLACE FUNCTION public.get_global_setting(setting_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    (SELECT setting_value FROM public.global_settings WHERE setting_key = $1),
    NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_global_setting(TEXT) TO authenticated;

-- 4. Create function to update global setting (admin only)
CREATE OR REPLACE FUNCTION public.update_global_setting(setting_key TEXT, setting_value TEXT)
RETURNS VOID AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Only admins can update global settings';
  END IF;

  UPDATE public.global_settings
  SET setting_value = $2, updated_at = NOW()
  WHERE setting_key = $1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_global_setting(TEXT, TEXT) TO authenticated;

-- 5. Create function to get conversion funnel stats
CREATE OR REPLACE FUNCTION public.get_conversion_funnel()
RETURNS TABLE (
  total_contacts bigint,
  total_leads bigint,
  quotations_sent bigint,
  confirmed bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::bigint AS total_contacts,
    COUNT(*) FILTER (WHERE is_lead = true)::bigint AS total_leads,
    COUNT(*) FILTER (WHERE lead_status IN ('quotation_sent', 'quotation_selected', 'confirmed'))::bigint AS quotations_sent,
    COUNT(*) FILTER (WHERE lead_status = 'confirmed')::bigint AS confirmed
  FROM public.contacts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversion_funnel() TO authenticated;

-- 6. Create function to get month-over-month comparison
CREATE OR REPLACE FUNCTION public.get_monthly_comparison()
RETURNS TABLE (
  this_month_contacts bigint,
  last_month_contacts bigint,
  this_month_confirmed bigint,
  last_month_confirmed bigint,
  this_month_value numeric,
  last_month_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE date_first_met >= DATE_TRUNC('month', CURRENT_DATE))::bigint AS this_month_contacts,
    COUNT(*) FILTER (WHERE date_first_met >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') 
                     AND date_first_met < DATE_TRUNC('month', CURRENT_DATE))::bigint AS last_month_contacts,
     COUNT(*) FILTER (WHERE lead_status = 'confirmed' 
                      AND c.updated_at >= DATE_TRUNC('month', CURRENT_DATE))::bigint AS this_month_confirmed,
     COUNT(*) FILTER (WHERE lead_status = 'confirmed' 
                      AND c.updated_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                      AND c.updated_at < DATE_TRUNC('month', CURRENT_DATE))::bigint AS last_month_confirmed,
    COALESCE(SUM(p.baseline_quotation_value) FILTER (WHERE p.created_at >= DATE_TRUNC('month', CURRENT_DATE)), 0)::numeric AS this_month_value,
    COALESCE(SUM(p.baseline_quotation_value) FILTER (WHERE p.created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                     AND p.created_at < DATE_TRUNC('month', CURRENT_DATE)), 0)::numeric AS last_month_value
  FROM public.contacts c
  LEFT JOIN public.projects p ON p.lead_id = c.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_comparison() TO authenticated;

-- 7. Create function to get pending approvals
CREATE OR REPLACE FUNCTION public.get_pending_approvals()
RETURNS TABLE (
  id UUID,
  lead_id UUID,
  contact_name TEXT,
  option_label TEXT,
  total_value numeric,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    q.lead_id,
    c.name AS contact_name,
    q.option_label,
    q.total_value,
    q.created_at
  FROM public.quotations q
  JOIN public.contacts c ON c.id = q.lead_id
  WHERE q.client_approved = true 
  AND q.admin_locked = false
  AND q.is_archived = false
  ORDER BY q.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_approvals() TO authenticated;

-- 8. Create function to get overdue follow-ups
CREATE OR REPLACE FUNCTION public.get_overdue_followups(days_threshold INTEGER DEFAULT 14)
RETURNS TABLE (
  contact_id UUID,
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
    c.id AS contact_id,
    c.name,
    c.phone,
    c.site_location,
    COALESCE(
      (SELECT MAX(created_at) FROM public.interaction_notes WHERE contact_id = c.id),
      c.created_at
    ) AS last_activity,
    EXTRACT(DAY FROM (NOW() - COALESCE(
      (SELECT MAX(created_at) FROM public.interaction_notes WHERE contact_id = c.id),
      c.created_at
    )))::INTEGER AS days_since_contact
  FROM public.contacts c
  WHERE EXTRACT(DAY FROM (NOW() - COALESCE(
      (SELECT MAX(created_at) FROM public.interaction_notes WHERE contact_id = c.id),
      c.created_at
    ))) >= days_threshold
  ORDER BY last_activity ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_overdue_followups(INTEGER) TO authenticated;

-- 9. Create function to get rep activity stats
CREATE OR REPLACE FUNCTION public.get_rep_activity()
RETURNS TABLE (
  rep_id UUID,
  rep_name TEXT,
  visits_today bigint,
  visits_this_week bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS rep_id,
    p.full_name AS rep_name,
    COUNT(*) FILTER (WHERE sv.visit_date >= CURRENT_DATE)::bigint AS visits_today,
    COUNT(*) FILTER (WHERE sv.visit_date >= DATE_TRUNC('week', CURRENT_DATE))::bigint AS visits_this_week
  FROM public.profiles p
  LEFT JOIN public.site_visits sv ON sv.created_by = p.id
  WHERE p.role = 'rep'
  GROUP BY p.id, p.full_name
  ORDER BY p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rep_activity() TO authenticated;

-- Success message
SELECT 'Dashboard enhancements complete!' as message;