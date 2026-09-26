-- Fix infinite recursion in RLS policies
-- This creates a security definer function to check user role without recursion

-- Create a function to get current user's role from JWT (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
BEGIN
  -- Try to get role from JWT user_metadata first
  IF auth.jwt() ? 'user_metadata' THEN
    RETURN COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'role'),
      'rep'  -- default to rep if not found
    );
  END IF;
  
  -- Fallback: query profiles table (this runs with security definer, so no RLS)
  RETURN COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    'rep'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.get_current_user_role() = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke all existing policies on profiles
DROP POLICY IF EXISTS "Admins can see all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Recreate profiles policies WITHOUT recursion
CREATE POLICY "Admins can see all profiles"
  ON public.profiles FOR SELECT
  USING (
    public.is_current_user_admin()
    OR auth.uid() = id
  );

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Fix all other table policies to use the function instead of querying profiles
-- CONTACTS
DROP POLICY IF EXISTS "Reps can CRUD their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can CRUD all contacts" ON public.contacts;
DROP POLICY IF EXISTS "Reps can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can insert contacts" ON public.contacts;

CREATE POLICY "Reps can CRUD their own contacts"
  ON public.contacts FOR ALL
  USING (created_by = auth.uid() AND NOT public.is_current_user_admin());

CREATE POLICY "Admins can CRUD all contacts"
  ON public.contacts FOR ALL
  USING (public.is_current_user_admin());

CREATE POLICY "Reps can insert contacts"
  ON public.contacts FOR INSERT
  WITH CHECK (created_by = auth.uid() AND NOT public.is_current_user_admin());

CREATE POLICY "Admins can insert contacts"
  ON public.contacts FOR INSERT
  WITH CHECK (public.is_current_user_admin());

-- INTERACTION NOTES
DROP POLICY IF EXISTS "Reps can CRUD own interaction notes" ON public.interaction_notes;
DROP POLICY IF EXISTS "Admins can CRUD all interaction notes" ON public.interaction_notes;

CREATE POLICY "Reps can CRUD own interaction notes"
  ON public.interaction_notes FOR ALL
  USING (created_by = auth.uid() AND NOT public.is_current_user_admin());

CREATE POLICY "Admins can CRUD all interaction notes"
  ON public.interaction_notes FOR ALL
  USING (public.is_current_user_admin());

-- SITE VISITS
DROP POLICY IF EXISTS "Reps can CRUD own site visits" ON public.site_visits;
DROP POLICY IF EXISTS "Admins can CRUD all site visits" ON public.site_visits;

CREATE POLICY "Reps can CRUD own site visits"
  ON public.site_visits FOR ALL
  USING (created_by = auth.uid() AND NOT public.is_current_user_admin());

CREATE POLICY "Admins can CRUD all site visits"
  ON public.site_visits FOR ALL
  USING (public.is_current_user_admin());

-- CATALOG ITEMS
DROP POLICY IF EXISTS "Reps can read catalog items" ON public.catalog_items;
DROP POLICY IF EXISTS "Admins can CRUD catalog items" ON public.catalog_items;

CREATE POLICY "Reps can read catalog items"
  ON public.catalog_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can CRUD catalog items"
  ON public.catalog_items FOR ALL
  USING (public.is_current_user_admin());

-- QUOTATIONS
DROP POLICY IF EXISTS "Reps can CRUD their own quotations" ON public.quotations;
DROP POLICY IF EXISTS "Admins can CRUD all quotations" ON public.quotations;

CREATE POLICY "Reps can CRUD their own quotations"
  ON public.quotations FOR ALL
  USING (created_by = auth.uid() AND NOT public.is_current_user_admin());

CREATE POLICY "Admins can CRUD all quotations"
  ON public.quotations FOR ALL
  USING (public.is_current_user_admin());

-- QUOTATION LINE ITEMS
DROP POLICY IF EXISTS "Reps can CRUD their own quotation line items" ON public.quotation_line_items;
DROP POLICY IF EXISTS "Admins can CRUD all quotation line items" ON public.quotation_line_items;

CREATE POLICY "Reps can CRUD their own quotation line items"
  ON public.quotation_line_items FOR ALL
  USING (
    quotation_id IN (SELECT id FROM public.quotations WHERE created_by = auth.uid())
    AND NOT public.is_current_user_admin()
  );

CREATE POLICY "Admins can CRUD all quotation line items"
  ON public.quotation_line_items FOR ALL
  USING (public.is_current_user_admin());

-- PROJECTS
DROP POLICY IF EXISTS "Reps can read projects from their leads" ON public.projects;
DROP POLICY IF EXISTS "Admins can CRUD all projects" ON public.projects;

CREATE POLICY "Reps can read projects from their leads"
  ON public.projects FOR SELECT
  USING (
    lead_id IN (SELECT id FROM public.contacts WHERE created_by = auth.uid())
    AND NOT public.is_current_user_admin()
  );

CREATE POLICY "Admins can CRUD all projects"
  ON public.projects FOR ALL
  USING (public.is_current_user_admin());

-- EXPENSE ENTRIES
DROP POLICY IF EXISTS "Reps can CRUD own expense entries" ON public.expense_entries;
DROP POLICY IF EXISTS "Admins can CRUD all expense entries" ON public.expense_entries;

CREATE POLICY "Reps can CRUD own expense entries"
  ON public.expense_entries FOR ALL
  USING (created_by = auth.uid() AND NOT public.is_current_user_admin());

CREATE POLICY "Admins can CRUD all expense entries"
  ON public.expense_entries FOR ALL
  USING (public.is_current_user_admin());

-- Success message
SELECT 'RLS recursion fixed! All policies updated to use security definer functions.' as message;