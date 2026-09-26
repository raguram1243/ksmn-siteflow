-- ============================================================================
-- KSMN SiteFlow - Update RLS Policies
-- Open SELECT to all roles, restrict UPDATE/DELETE to admin only
-- ============================================================================
-- Date: 2026-01-24
-- Purpose: Change data visibility and permissions across all tables
-- ============================================================================

-- ============================================================================
-- SUMMARY OF CHANGES
-- ============================================================================
-- 
-- TABLE-BY-TABLE CHANGES:
--
-- 1. PROFILES:
--    - SELECT: Already open to admin + own profile ✓
--    - UPDATE: Changed to admin only (was: admin OR own profile)
--
-- 2. CONTACTS:
--    - SELECT: Changed to admin + ALL reps (was: admin OR created_by = auth.uid())
--    - INSERT: Unchanged (admin OR created_by = auth.uid())
--    - UPDATE: Changed to admin only (was: admin OR created_by = auth.uid())
--    - DELETE: Changed to admin only (was: admin OR created_by = auth.uid())
--
-- 3. INTERACTION_NOTES:
--    - SELECT: Changed to admin + ALL reps (was: admin OR created_by = auth.uid())
--    - INSERT: Unchanged (admin OR created_by = auth.uid())
--    - UPDATE: Changed to admin only (was: admin OR created_by = auth.uid())
--    - DELETE: Changed to admin only (was: admin OR created_by = auth.uid())
--
-- 4. SITE_VISITS:
--    - SELECT: Changed to admin + ALL reps (was: admin OR created_by = auth.uid())
--    - INSERT: Unchanged (admin OR created_by = auth.uid())
--    - UPDATE: Changed to admin only (was: admin OR created_by = auth.uid())
--    - DELETE: Changed to admin only (was: admin OR created_by = auth.uid())
--
-- 5. CATALOG_ITEMS:
--    - No changes (already admin-only for write, public read) ✓
--
-- 6. QUOTATIONS:
--    - SELECT: Changed to admin + ALL reps (was: admin OR created_by = auth.uid())
--    - INSERT: Unchanged (admin OR created_by = auth.uid())
--    - UPDATE: Changed to admin only (was: admin OR created_by = auth.uid())
--    - DELETE: Changed to admin only (was: admin OR created_by = auth.uid())
--
-- 7. QUOTATION_LINE_ITEMS:
--    - SELECT: Changed to admin + ALL reps (was: admin OR from their quotations)
--    - INSERT: Unchanged (admin OR from their quotations)
--    - UPDATE: Changed to admin only (was: admin OR from their quotations)
--    - DELETE: Changed to admin only (was: admin OR from their quotations)
--
-- 8. PROJECTS:
--    - SELECT: Changed to admin + ALL reps (was: admin OR from their leads)
--    - INSERT: Unchanged (admin only) ✓
--    - UPDATE: Already admin only ✓
--    - DELETE: Already admin only ✓
--
-- 9. EXPENSE_ENTRIES:
--    - SELECT: Changed to admin + ALL reps (was: admin OR created_by = auth.uid())
--    - INSERT: Unchanged (admin OR created_by = auth.uid())
--    - UPDATE: Changed to admin only (was: admin OR created_by = auth.uid())
--    - DELETE: Changed to admin only (was: admin OR created_by = auth.uid())
--
-- 10. PROJECT_PAYMENTS:
--     - SELECT: Changed to admin + ALL reps (was: admin OR from their projects)
--     - INSERT: Unchanged (admin OR from their projects)
--     - UPDATE: Changed to admin only (was: admin OR from their projects)
--     - DELETE: Changed to admin only (was: admin OR from their projects)
--
-- UNCHANGED (admin-only):
-- - quotation_adjustments (already admin-only)
-- - project_profit_view (already admin-only via function)
-- ============================================================================

-- Drop existing policies
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

-- Drop project_payments policies if they exist
DROP POLICY IF EXISTS "Project payments select" ON public.project_payments;
DROP POLICY IF EXISTS "Project payments insert" ON public.project_payments;
DROP POLICY IF EXISTS "Project payments update" ON public.project_payments;
DROP POLICY IF EXISTS "Project payments delete" ON public.project_payments;

-- ============================================================================
-- NEW POLICIES
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

-- UPDATE: Admin only (reps cannot edit any profile, including their own)
CREATE POLICY "Profiles update"
  ON public.profiles FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- CONTACTS
-- -------------------------------------------------------
-- SELECT: Both admin and reps can see ALL contacts
CREATE POLICY "Contacts select"
  ON public.contacts FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'rep')
  );

-- INSERT: Both admin and reps can create (reps only their own)
CREATE POLICY "Contacts insert"
  ON public.contacts FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

-- UPDATE: Admin only
CREATE POLICY "Contacts update"
  ON public.contacts FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- DELETE: Admin only
CREATE POLICY "Contacts delete"
  ON public.contacts FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- INTERACTION NOTES
-- -------------------------------------------------------
-- SELECT: Both admin and reps can see ALL interaction notes
CREATE POLICY "Interaction notes select"
  ON public.interaction_notes FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'rep')
  );

-- INSERT: Both admin and reps can create (reps only their own)
CREATE POLICY "Interaction notes insert"
  ON public.interaction_notes FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

-- UPDATE: Admin only
CREATE POLICY "Interaction notes update"
  ON public.interaction_notes FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- DELETE: Admin only
CREATE POLICY "Interaction notes delete"
  ON public.interaction_notes FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- SITE VISITS
-- -------------------------------------------------------
-- SELECT: Both admin and reps can see ALL site visits
CREATE POLICY "Site visits select"
  ON public.site_visits FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'rep')
  );

-- INSERT: Both admin and reps can create (reps only their own)
CREATE POLICY "Site visits insert"
  ON public.site_visits FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

-- UPDATE: Admin only
CREATE POLICY "Site visits update"
  ON public.site_visits FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- DELETE: Admin only
CREATE POLICY "Site visits delete"
  ON public.site_visits FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- QUOTATIONS
-- -------------------------------------------------------
-- SELECT: Both admin and reps can see ALL quotations
CREATE POLICY "Quotations select"
  ON public.quotations FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'rep')
  );

-- INSERT: Both admin and reps can create (reps only their own)
CREATE POLICY "Quotations insert"
  ON public.quotations FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

-- UPDATE: Admin only
CREATE POLICY "Quotations update"
  ON public.quotations FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- DELETE: Admin only
CREATE POLICY "Quotations delete"
  ON public.quotations FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- QUOTATION LINE ITEMS
-- -------------------------------------------------------
-- SELECT: Both admin and reps can see ALL quotation line items
CREATE POLICY "Quotation line items select"
  ON public.quotation_line_items FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'rep')
  );

-- INSERT: Both admin and reps can create (reps only from their quotations)
CREATE POLICY "Quotation line items insert"
  ON public.quotation_line_items FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR quotation_id IN (
      SELECT id FROM public.quotations WHERE created_by = auth.uid()
    )
  );

-- UPDATE: Admin only
CREATE POLICY "Quotation line items update"
  ON public.quotation_line_items FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- DELETE: Admin only
CREATE POLICY "Quotation line items delete"
  ON public.quotation_line_items FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- PROJECTS
-- -------------------------------------------------------
-- SELECT: Both admin and reps can see ALL projects
CREATE POLICY "Projects select"
  ON public.projects FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'rep')
  );

-- INSERT: Admin only (projects are created when locking quotations)
CREATE POLICY "Projects insert"
  ON public.projects FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

-- UPDATE: Admin only
CREATE POLICY "Projects update"
  ON public.projects FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- DELETE: Admin only
CREATE POLICY "Projects delete"
  ON public.projects FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- EXPENSE ENTRIES
-- -------------------------------------------------------
-- SELECT: Both admin and reps can see ALL expense entries
CREATE POLICY "Expense entries select"
  ON public.expense_entries FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'rep')
  );

-- INSERT: Both admin and reps can create (reps only their own)
CREATE POLICY "Expense entries insert"
  ON public.expense_entries FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR created_by = auth.uid()
  );

-- UPDATE: Admin only
CREATE POLICY "Expense entries update"
  ON public.expense_entries FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- DELETE: Admin only
CREATE POLICY "Expense entries delete"
  ON public.expense_entries FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- PROJECT PAYMENTS
-- -------------------------------------------------------
-- SELECT: Both admin and reps can see ALL payments
CREATE POLICY "Project payments select"
  ON public.project_payments FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'rep')
  );

-- INSERT: Both admin and reps can create (reps only for their projects)
CREATE POLICY "Project payments insert"
  ON public.project_payments FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.quotations q ON p.quotation_id = q.id
      WHERE q.created_by = auth.uid()
    )
  );

-- UPDATE: Admin only
CREATE POLICY "Project payments update"
  ON public.project_payments FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- DELETE: Admin only
CREATE POLICY "Project payments delete"
  ON public.project_payments FOR DELETE
  USING (public.current_user_role() = 'admin');

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these queries to verify the policies:
-- 
-- SELECT tablename, policyname, permissive, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN (
--   'profiles', 'contacts', 'interaction_notes', 'site_visits',
--   'catalog_items', 'quotations', 'quotation_line_items', 'projects',
--   'expense_entries', 'project_payments'
-- )
-- ORDER BY tablename, cmd;
-- ============================================================================