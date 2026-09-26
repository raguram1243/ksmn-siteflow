-- ============================================================================
-- Security Hardening
-- Run this in Supabase SQL Editor
-- ============================================================================
-- Based on the live check run on 2026-09-15. Fixes:
--   1. Roles were read from JWT user_metadata, which every user can edit
--      (supabase.auth.updateUser({ data: { role: 'admin' } })). Roles now come
--      from public.profiles only.
--   2. Missing role defaulted to 'rep', so logged-out (anon key) requests passed
--      the "admin or rep" read policies. Anonymous and deactivated users now get
--      no rows from any business table.
--   3. Users could update their own profile row, including role/is_active.
--      Non-admins may now only change must_change_password.
--   4. New users took their role from user-editable signup metadata. The role
--      now comes from app_metadata (settable only by the service role).
--   5. Admin dashboard functions without an admin check are now admin-only.
--   6. project_profit_view could be read directly (views bypass RLS).
--
-- IMPORTANT: deploy the updated create-user edge function together with this
-- file, otherwise new users created from User Management would all become 'rep'.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Role helpers: read role from profiles, active users only
--    (every existing policy calls these, so all policies are fixed at once)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active IS TRUE
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active IS TRUE
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_current_user_role() = 'admin', FALSE)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'admin', FALSE)
$$;

CREATE OR REPLACE FUNCTION public.check_user_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = auth.uid()), FALSE)
$$;


-- ----------------------------------------------------------------------------
-- 2. Block anonymous + deactivated users on every business table.
--    RESTRICTIVE policies are AND-ed with the existing (permissive) ones, so
--    this closes the gap regardless of how the older policies are written.
--    profiles is excluded so a deactivated user can still read their own row
--    (the app uses it to show "account deactivated" and sign them out).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_items', 'contacts', 'expense_entries', 'expense_line_items',
    'global_settings', 'interaction_notes', 'project_payments', 'projects',
    'quotation_adjustments', 'quotation_line_items', 'quotations', 'site_visits'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Require active user" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Require active user" ON public.%I AS RESTRICTIVE FOR ALL
         USING ((SELECT public.check_user_active()))
         WITH CHECK ((SELECT public.check_user_active()))', t);
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- 3. Profiles: non-admins can only change must_change_password on their own row
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() is NULL for SQL Editor / service role (edge functions): trusted
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'must_change_password') IS DISTINCT FROM (to_jsonb(OLD) - 'must_change_password') THEN
    RAISE EXCEPTION 'Only an admin can change profile details';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_changes_trigger ON public.profiles;
CREATE TRIGGER guard_profile_changes_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_changes();


-- ----------------------------------------------------------------------------
-- 4. New users: role comes from app_metadata (service role only), never from
--    user-editable signup metadata
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_role TEXT := NEW.raw_app_meta_data ->> 'role';
BEGIN
  IF new_role IS NULL OR new_role NOT IN ('admin', 'rep') THEN
    new_role := 'rep';
  END IF;

  INSERT INTO public.profiles (id, username, role, full_name, must_change_password)
  VALUES (
    NEW.id,
    SPLIT_PART(NEW.email, '@', 1),
    new_role,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', SPLIT_PART(NEW.email, '@', 1)),
    TRUE  -- New users must change password on first login
  );
  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 5. Admin dashboard functions: admin only
-- ----------------------------------------------------------------------------
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
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

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

CREATE OR REPLACE FUNCTION public.get_conversion_funnel()
RETURNS TABLE (
  total_contacts BIGINT,
  total_leads BIGINT,
  quotations_sent BIGINT,
  confirmed BIGINT
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
    COUNT(*)::BIGINT AS total_contacts,
    COUNT(*) FILTER (WHERE c.is_lead = true)::BIGINT AS total_leads,
    COUNT(*) FILTER (WHERE c.lead_status IN ('quotation_sent', 'quotation_selected', 'confirmed'))::BIGINT AS quotations_sent,
    COUNT(*) FILTER (WHERE c.lead_status = 'confirmed')::BIGINT AS confirmed
  FROM public.contacts c;
END;
$$;

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
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

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

CREATE OR REPLACE FUNCTION public.get_pending_approvals()
RETURNS TABLE (
  id UUID,
  lead_id UUID,
  contact_name TEXT,
  option_label TEXT,
  total_value NUMERIC,
  created_at TIMESTAMPTZ
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

-- The live version still returns "contact_id", which is ambiguous inside the
-- body and does not match the dashboard (it reads out_contact_id). Return type
-- changes, so it must be dropped first.
DROP FUNCTION IF EXISTS public.get_overdue_followups(INTEGER);
CREATE FUNCTION public.get_overdue_followups(days_threshold INTEGER DEFAULT 14)
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
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

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

CREATE OR REPLACE FUNCTION public.get_rep_activity()
RETURNS TABLE (
  rep_id UUID,
  rep_name TEXT,
  visits_today BIGINT,
  visits_this_week BIGINT
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
    p.id AS rep_id,
    p.full_name AS rep_name,
    COUNT(sv.id) FILTER (WHERE sv.visit_date >= CURRENT_DATE)::BIGINT AS visits_today,
    COUNT(sv.id) FILTER (WHERE sv.visit_date >= DATE_TRUNC('week', CURRENT_DATE))::BIGINT AS visits_this_week
  FROM public.profiles p
  LEFT JOIN public.site_visits sv ON sv.created_by = p.id
  WHERE p.role = 'rep'
  GROUP BY p.id, p.full_name
  ORDER BY p.full_name;
END;
$$;

-- The live version's parameter is "setting_key" but the dashboard sends
-- p_setting_key. Parameter name changes, so it must be dropped first.
DROP FUNCTION IF EXISTS public.get_global_setting(TEXT);
CREATE FUNCTION public.get_global_setting(p_setting_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN (SELECT gs.setting_value FROM public.global_settings gs WHERE gs.setting_key = p_setting_key);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_overdue_followups(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_setting(TEXT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 6. Profit view: only reachable through get_project_profit_view() (admin only)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.project_profit_view FROM anon, authenticated;


-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 'restrictive policies' AS check_name, COUNT(*)::TEXT AS result
FROM pg_policies WHERE schemaname = 'public' AND policyname = 'Require active user'
UNION ALL
SELECT 'profile guard trigger', COUNT(*)::TEXT
FROM information_schema.triggers WHERE trigger_name = 'guard_profile_changes_trigger'
UNION ALL
SELECT 'active admins', COUNT(*)::TEXT
FROM public.profiles WHERE role = 'admin' AND is_active IS TRUE;
