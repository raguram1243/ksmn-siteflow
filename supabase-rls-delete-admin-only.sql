-- ============================================================================
-- KSMN SiteFlow - Tighten DELETE RLS to Admin-Only for sensitive tables
-- ============================================================================
-- Currently, contacts, site_visits, and quotations allow the creator (rep)
-- to delete their own records. This is too permissive for these record types.
-- 
-- This migration restricts DELETE to admin only for:
--   - contacts (and by extension leads, since leads are contacts with is_lead=true)
--   - site_visits
--   - quotations
-- 
-- Other tables (expense_entries, interaction_notes) retain their existing
-- policies where reps can delete their own records.
-- ============================================================================

-- -------------------------------------------------------
-- CONTACTS: DELETE restricted to admin only
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Contacts delete" ON public.contacts;
CREATE POLICY "Contacts delete"
  ON public.contacts FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- SITE VISITS: DELETE restricted to admin only
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Site visits delete" ON public.site_visits;
CREATE POLICY "Site visits delete"
  ON public.site_visits FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- QUOTATIONS: DELETE restricted to admin only
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Quotations delete" ON public.quotations;
CREATE POLICY "Quotations delete"
  ON public.quotations FOR DELETE
  USING (public.current_user_role() = 'admin');

-- -------------------------------------------------------
-- QUOTATION LINE ITEMS: DELETE restricted to admin only
-- (cascading from quotations)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Quotation line items delete" ON public.quotation_line_items;
CREATE POLICY "Quotation line items delete"
  ON public.quotation_line_items FOR DELETE
  USING (public.current_user_role() = 'admin');

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these queries to confirm the policies are in place:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('contacts', 'site_visits', 'quotations', 'quotation_line_items')
-- ORDER BY tablename, cmd;