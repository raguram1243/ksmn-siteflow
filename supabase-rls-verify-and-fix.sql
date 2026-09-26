-- ============================================================================
-- KSMN SiteFlow - Verify & Re-apply RLS Policies
-- Run this entire file in Supabase SQL Editor
-- ============================================================================

-- 1. First check if the helper function exists
SELECT 'current_user_role function exists:' AS check_name, 
       EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'current_user_role') AS result;

-- 2. If not, create it
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', 'rep')
$$;

-- 3. Drop ALL existing policies to ensure clean slate
DROP POLICY IF EXISTS "Profiles select" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update own" ON public.profiles;
DROP POLICY IF EXISTS "Contacts select" ON public.contacts;
DROP POLICY IF EXISTS "Contacts insert" ON public.contacts;
DROP POLICY IF EXISTS "Contacts update" ON public.contacts;
DROP POLICY IF EXISTS "Contacts delete" ON public.contacts;
DROP POLICY IF EXISTS "Interaction notes select" ON public.interaction_notes;
DROP POLICY IF EXISTS "Interaction notes insert" ON public.interaction_notes;
DROP POLICY IF EXISTS "Interaction notes update" ON public.interaction_notes;
DROP POLICY IF EXISTS "Interaction notes delete" ON public.interaction_notes;
DROP POLICY IF EXISTS "Site visits select" ON public.site_visits;
DROP POLICY IF EXISTS "Site visits insert" ON public.site_visits;
DROP POLICY IF EXISTS "Site visits update" ON public.site_visits;
DROP POLICY IF EXISTS "Site visits delete" ON public.site_visits;
DROP POLICY IF EXISTS "Catalog items select" ON public.catalog_items;
DROP POLICY IF EXISTS "Catalog items insert" ON public.catalog_items;
DROP POLICY IF EXISTS "Catalog items update" ON public.catalog_items;
DROP POLICY IF EXISTS "Catalog items delete" ON public.catalog_items;
DROP POLICY IF EXISTS "Quotations select" ON public.quotations;
DROP POLICY IF EXISTS "Quotations insert" ON public.quotations;
DROP POLICY IF EXISTS "Quotations update" ON public.quotations;
DROP POLICY IF EXISTS "Quotations delete" ON public.quotations;
DROP POLICY IF EXISTS "Quotation line items select" ON public.quotation_line_items;
DROP POLICY IF EXISTS "Quotation line items insert" ON public.quotation_line_items;
DROP POLICY IF EXISTS "Quotation line items update" ON public.quotation_line_items;
DROP POLICY IF EXISTS "Quotation line items delete" ON public.quotation_line_items;
DROP POLICY IF EXISTS "Projects select" ON public.projects;
DROP POLICY IF EXISTS "Projects insert" ON public.projects;
DROP POLICY IF EXISTS "Projects update" ON public.projects;
DROP POLICY IF EXISTS "Projects delete" ON public.projects;
DROP POLICY IF EXISTS "Expense entries select" ON public.expense_entries;
DROP POLICY IF EXISTS "Expense entries insert" ON public.expense_entries;
DROP POLICY IF EXISTS "Expense entries update" ON public.expense_entries;
DROP POLICY IF EXISTS "Expense entries delete" ON public.expense_entries;

-- 4. Disable and re-enable RLS to ensure it's active
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visits DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_line_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_entries DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RECREATE ALL POLICIES
-- Rule: Admin (from JWT role) can see everything.
-- Rule: Rep can only see their own records.
-- ============================================================================

-- -------------------------------------------------------
-- PROFILES
-- -------------------------------------------------------
CREATE POLICY "Profiles select" ON public.profiles FOR SELECT
  USING (public.current_user_role() = 'admin' OR auth.uid() = id);

CREATE POLICY "Profiles update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- -------------------------------------------------------
-- CONTACTS
-- -------------------------------------------------------
CREATE POLICY "Contacts select" ON public.contacts FOR SELECT
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

CREATE POLICY "Contacts insert" ON public.contacts FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Contacts update" ON public.contacts FOR UPDATE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

CREATE POLICY "Contacts delete" ON public.contacts FOR DELETE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

-- -------------------------------------------------------
-- INTERACTION NOTES
-- -------------------------------------------------------
CREATE POLICY "Int notes select" ON public.interaction_notes FOR SELECT
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

CREATE POLICY "Int notes insert" ON public.interaction_notes FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Int notes update" ON public.interaction_notes FOR UPDATE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

CREATE POLICY "Int notes delete" ON public.interaction_notes FOR DELETE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

-- -------------------------------------------------------
-- SITE VISITS
-- -------------------------------------------------------
CREATE POLICY "Visits select" ON public.site_visits FOR SELECT
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

CREATE POLICY "Visits insert" ON public.site_visits FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Visits update" ON public.site_visits FOR UPDATE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

CREATE POLICY "Visits delete" ON public.site_visits FOR DELETE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

-- -------------------------------------------------------
-- CATALOG ITEMS
-- -------------------------------------------------------
CREATE POLICY "Catalog select" ON public.catalog_items FOR SELECT USING (true);

CREATE POLICY "Catalog insert" ON public.catalog_items FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Catalog update" ON public.catalog_items FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "Catalog delete" ON public.catalog_items FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- QUOTATIONS
-- -------------------------------------------------------
CREATE POLICY "Quotes select" ON public.quotations FOR SELECT
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

CREATE POLICY "Quotes insert" ON public.quotations FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Quotes update" ON public.quotations FOR UPDATE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

CREATE POLICY "Quotes delete" ON public.quotations FOR DELETE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

-- -------------------------------------------------------
-- QUOTATION LINE ITEMS
-- -------------------------------------------------------
CREATE POLICY "QLI select" ON public.quotation_line_items FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR quotation_id IN (SELECT id FROM public.quotations WHERE created_by = auth.uid())
  );

CREATE POLICY "QLI insert" ON public.quotation_line_items FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR quotation_id IN (SELECT id FROM public.quotations WHERE created_by = auth.uid())
  );

CREATE POLICY "QLI update" ON public.quotation_line_items FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR quotation_id IN (SELECT id FROM public.quotations WHERE created_by = auth.uid())
  );

CREATE POLICY "QLI delete" ON public.quotation_line_items FOR DELETE
  USING (
    public.current_user_role() = 'admin'
    OR quotation_id IN (SELECT id FROM public.quotations WHERE created_by = auth.uid())
  );

-- -------------------------------------------------------
-- PROJECTS
-- -------------------------------------------------------
CREATE POLICY "Projects select" ON public.projects FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR lead_id IN (SELECT id FROM public.contacts WHERE created_by = auth.uid())
  );

CREATE POLICY "Projects insert" ON public.projects FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Projects update" ON public.projects FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "Projects delete" ON public.projects FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- EXPENSE ENTRIES
-- -------------------------------------------------------
CREATE POLICY "Expenses select" ON public.expense_entries FOR SELECT
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

CREATE POLICY "Expenses insert" ON public.expense_entries FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Expenses update" ON public.expense_entries FOR UPDATE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

CREATE POLICY "Expenses delete" ON public.expense_entries FOR DELETE
  USING (public.current_user_role() = 'admin' OR created_by = auth.uid());

-- ============================================================================
-- REAPPLY PROFIT VIEW & RPC
-- ============================================================================
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.get_project_profit_view();
DROP FUNCTION IF EXISTS public.get_admin_portfolio_summary();
DROP FUNCTION IF EXISTS public.update_project_cost;

-- Fix profit view function to not depend on is_admin (use current_user_role)
CREATE OR REPLACE FUNCTION public.get_project_profit_view()
RETURNS SETOF public.project_profit_view
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT * FROM public.project_profit_view
  WHERE public.current_user_role() = 'admin'
$$;

-- Portfolio summary
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
      WHERE baseline_quotation_value > 0
      AND ((baseline_quotation_value - actual_cost_total) / baseline_quotation_value * 100) < target_margin_percent
    )::BIGINT
  FROM public.projects
  WHERE public.current_user_role() = 'admin';
$$;

-- Cost recalculation trigger
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_project_profit_view() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_portfolio_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_cost TO authenticated;

-- ============================================================================
-- VERIFICATION - Run these SELECT queries to check
-- ============================================================================
-- SELECT public.current_user_role();  -- Should return 'admin' or 'rep'
-- SELECT * FROM public.profiles;      -- Should show profiles without error
-- SELECT count(*) FROM public.contacts; -- Should show count without error

-- Check policies are active:
SELECT tablename, policyname, permissive
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('contacts','quotations','projects','expense_entries','profiles')
ORDER BY tablename, policyname;