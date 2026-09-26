-- ============================================================================
-- Cleanup Script - Drop existing policies before applying new ones
-- Run this FIRST before running supabase-rls-update-open-select-admin-only-write.sql
-- ============================================================================

-- Drop all policies that might exist from previous runs
DROP POLICY IF EXISTS "Profiles update" ON public.profiles;

DROP POLICY IF EXISTS "Contacts select" ON public.contacts;
DROP POLICY IF EXISTS "Contacts update" ON public.contacts;
DROP POLICY IF EXISTS "Contacts delete" ON public.contacts;

DROP POLICY IF EXISTS "Interaction notes select" ON public.interaction_notes;
DROP POLICY IF EXISTS "Interaction notes update" ON public.interaction_notes;
DROP POLICY IF EXISTS "Interaction notes delete" ON public.interaction_notes;

DROP POLICY IF EXISTS "Site visits select" ON public.site_visits;
DROP POLICY IF EXISTS "Site visits update" ON public.site_visits;
DROP POLICY IF EXISTS "Site visits delete" ON public.site_visits;

DROP POLICY IF EXISTS "Quotations select" ON public.quotations;
DROP POLICY IF EXISTS "Quotations update" ON public.quotations;
DROP POLICY IF EXISTS "Quotations delete" ON public.quotations;

DROP POLICY IF EXISTS "Quotation line items select" ON public.quotation_line_items;
DROP POLICY IF EXISTS "Quotation line items update" ON public.quotation_line_items;
DROP POLICY IF EXISTS "Quotation line items delete" ON public.quotation_line_items;

DROP POLICY IF EXISTS "Projects select" ON public.projects;

DROP POLICY IF EXISTS "Expense entries select" ON public.expense_entries;
DROP POLICY IF EXISTS "Expense entries update" ON public.expense_entries;
DROP POLICY IF EXISTS "Expense entries delete" ON public.expense_entries;

DROP POLICY IF EXISTS "Project payments select" ON public.project_payments;
DROP POLICY IF EXISTS "Project payments update" ON public.project_payments;
DROP POLICY IF EXISTS "Project payments delete" ON public.project_payments;

-- Verify cleanup
SELECT 'Cleanup complete. Policies dropped successfully.' as status;