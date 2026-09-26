-- ============================================================================
-- KSMN SiteFlow - Fix RLS Infinite Recursion
-- ============================================================================
-- The problem: All policies used SELECT id FROM public.profiles WHERE role = 'admin'
-- which triggers the profiles RLS policy again → infinite loop.
-- 
-- The fix: Read the role directly from the JWT token's user_metadata.
-- Supabase stores raw_user_meta_data in the JWT, including the "role" field.
-- ============================================================================

-- Drop ALL existing policies (they all had the same recursive pattern)
DROP POLICY IF EXISTS "Admins can see all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Reps can CRUD their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can CRUD all contacts" ON public.contacts;
DROP POLICY IF EXISTS "Reps can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Reps can CRUD own interaction notes" ON public.interaction_notes;
DROP POLICY IF EXISTS "Admins can CRUD all interaction notes" ON public.interaction_notes;
DROP POLICY IF EXISTS "Reps can CRUD own site visits" ON public.site_visits;
DROP POLICY IF EXISTS "Admins can CRUD all site visits" ON public.site_visits;
DROP POLICY IF EXISTS "Reps can read catalog items" ON public.catalog_items;
DROP POLICY IF EXISTS "Admins can CRUD catalog items" ON public.catalog_items;
DROP POLICY IF EXISTS "Reps can CRUD their own quotations" ON public.quotations;
DROP POLICY IF EXISTS "Admins can CRUD all quotations" ON public.quotations;
DROP POLICY IF EXISTS "Reps can CRUD their own quotation line items" ON public.quotation_line_items;
DROP POLICY IF EXISTS "Admins can CRUD all quotation line items" ON public.quotation_line_items;
DROP POLICY IF EXISTS "Reps can read projects from their leads" ON public.projects;
DROP POLICY IF EXISTS "Admins can CRUD all projects" ON public.projects;
DROP POLICY IF EXISTS "Reps can CRUD own expense entries" ON public.expense_entries;
DROP POLICY IF EXISTS "Admins can CRUD all expense entries" ON public.expense_entries;

-- Also drop the is_admin function and profit view function (recreate below)
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.get_project_profit_view();

-- ============================================================================
-- HELPER FUNCTION: Get the current user's role from JWT metadata
-- This avoids querying the profiles table (which causes recursion)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', 'rep')
$$;

-- ============================================================================
-- RECREATED POLICIES (using JWT metadata instead of profiles table lookup)
-- ============================================================================

-- -------------------------------------------------------
-- PROFILES
-- -------------------------------------------------------
-- Admins can see all profiles; users always see their own
CREATE POLICY "Profiles select"
  ON public.profiles FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR auth.uid() = id
  );

CREATE POLICY "Profiles update own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- -------------------------------------------------------
-- CONTACTS
-- -------------------------------------------------------
CREATE POLICY "Contacts select"
  ON public.contacts FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Contacts insert"
  ON public.contacts FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Contacts update"
  ON public.contacts FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Contacts delete"
  ON public.contacts FOR DELETE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

-- -------------------------------------------------------
-- INTERACTION NOTES
-- -------------------------------------------------------
CREATE POLICY "Interaction notes select"
  ON public.interaction_notes FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Interaction notes insert"
  ON public.interaction_notes FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Interaction notes update"
  ON public.interaction_notes FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Interaction notes delete"
  ON public.interaction_notes FOR DELETE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

-- -------------------------------------------------------
-- SITE VISITS
-- -------------------------------------------------------
CREATE POLICY "Site visits select"
  ON public.site_visits FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Site visits insert"
  ON public.site_visits FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Site visits update"
  ON public.site_visits FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Site visits delete"
  ON public.site_visits FOR DELETE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

-- -------------------------------------------------------
-- CATALOG ITEMS (everyone can read, only admin can modify)
-- -------------------------------------------------------
CREATE POLICY "Catalog items select"
  ON public.catalog_items FOR SELECT
  USING (true);

CREATE POLICY "Catalog items insert"
  ON public.catalog_items FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Catalog items update"
  ON public.catalog_items FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "Catalog items delete"
  ON public.catalog_items FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- QUOTATIONS (values visible to rep who created them)
-- -------------------------------------------------------
CREATE POLICY "Quotations select"
  ON public.quotations FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Quotations insert"
  ON public.quotations FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Quotations update"
  ON public.quotations FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Quotations delete"
  ON public.quotations FOR DELETE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

-- -------------------------------------------------------
-- QUOTATION LINE ITEMS
-- -------------------------------------------------------
CREATE POLICY "Quotation line items select"
  ON public.quotation_line_items FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR quotation_id IN (
      SELECT id FROM public.quotations WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Quotation line items insert"
  ON public.quotation_line_items FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR quotation_id IN (
      SELECT id FROM public.quotations WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Quotation line items update"
  ON public.quotation_line_items FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR quotation_id IN (
      SELECT id FROM public.quotations WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Quotation line items delete"
  ON public.quotation_line_items FOR DELETE
  USING (
    public.current_user_role() = 'admin'
    OR quotation_id IN (
      SELECT id FROM public.quotations WHERE created_by = auth.uid()
    )
  );

-- -------------------------------------------------------
-- PROJECTS
-- -------------------------------------------------------
CREATE POLICY "Projects select"
  ON public.projects FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR lead_id IN (
      SELECT id FROM public.contacts WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Projects insert"
  ON public.projects FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Projects update"
  ON public.projects FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "Projects delete"
  ON public.projects FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- EXPENSE ENTRIES
-- -------------------------------------------------------
CREATE POLICY "Expense entries select"
  ON public.expense_entries FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Expense entries insert"
  ON public.expense_entries FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Expense entries update"
  ON public.expense_entries FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

CREATE POLICY "Expense entries delete"
  ON public.expense_entries FOR DELETE
  USING (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

-- ============================================================================
-- ADMIN-ONLY ACCESS: Use JWT role check instead of profiles table query
-- ============================================================================
-- Revoke direct access to profit view from all roles
REVOKE ALL ON public.project_profit_view FROM PUBLIC;
REVOKE ALL ON public.project_profit_view FROM authenticated;

-- Create a function that only returns data for admins
CREATE OR REPLACE FUNCTION public.get_project_profit_view()
RETURNS SETOF public.project_profit_view
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT * FROM public.project_profit_view
  WHERE public.current_user_role() = 'admin'
$$;

-- Grant execute to authenticated users (the function itself enforces admin-only)
REVOKE ALL ON FUNCTION public.get_project_profit_view() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_profit_view() TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES (run these to confirm no recursion)
-- ============================================================================
-- SELECT public.current_user_role();  -- Should return the role from JWT
-- SELECT * FROM public.profiles LIMIT 5;  -- Should work without recursion