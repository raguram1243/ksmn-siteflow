-- ============================================================================
-- KSMN SiteFlow - Complete Data Cleanup Script
-- WARNING: This will DELETE ALL business data while preserving user accounts
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: Delete project_payments (child of projects)
-- ============================================================================
DELETE FROM public.project_payments;

-- ============================================================================
-- STEP 2: Delete quotation_adjustments (child of projects)
-- ============================================================================
DELETE FROM public.quotation_adjustments;

-- ============================================================================
-- STEP 3: Delete expense_entries (child of projects)
-- ============================================================================
DELETE FROM public.expense_entries;

-- ============================================================================
-- STEP 4: Delete projects (parent - references quotations, contacts)
-- ============================================================================
DELETE FROM public.projects;

-- ============================================================================
-- STEP 5: Delete quotation_line_items (child of quotations)
-- ============================================================================
DELETE FROM public.quotation_line_items;

-- ============================================================================
-- STEP 6: Delete quotations (parent - includes attachment files)
-- ============================================================================
DELETE FROM public.quotations;

-- ============================================================================
-- STEP 7: Delete site_visits (child of contacts - includes photo files)
-- ============================================================================
DELETE FROM public.site_visits;

-- ============================================================================
-- STEP 8: Delete interaction_notes (child of contacts)
-- ============================================================================
DELETE FROM public.interaction_notes;

-- ============================================================================
-- STEP 9: Delete contacts (parent - this also deletes leads since leads ARE contacts)
-- ============================================================================
DELETE FROM public.contacts;

-- ============================================================================
-- STEP 10: Delete catalog_items (standalone - materials and labor entries)
-- ============================================================================
DELETE FROM public.catalog_items;

-- ============================================================================
-- VERIFICATION: Confirm all tables are empty
-- ============================================================================

SELECT 'contacts' as table_name, COUNT(*) as count FROM public.contacts
UNION ALL
SELECT 'site_visits', COUNT(*) FROM public.site_visits
UNION ALL
SELECT 'quotations', COUNT(*) FROM public.quotations
UNION ALL
SELECT 'projects', COUNT(*) FROM public.projects
UNION ALL
SELECT 'expense_entries', COUNT(*) FROM public.expense_entries
UNION ALL
SELECT 'project_payments', COUNT(*) FROM public.project_payments
UNION ALL
SELECT 'catalog_items', COUNT(*) FROM public.catalog_items
UNION ALL
SELECT 'interaction_notes', COUNT(*) FROM public.interaction_notes
UNION ALL
SELECT 'quotation_adjustments', COUNT(*) FROM public.quotation_adjustments;

-- ============================================================================
-- CONFIRM: User accounts are preserved
-- ============================================================================

SELECT 'profiles' as table_name, COUNT(*) as count FROM public.profiles
UNION ALL
SELECT 'auth_users', COUNT(*) FROM auth.users;

-- ============================================================================
-- EXPECTED RESULTS:
-- - All business tables should show count = 0
-- - profiles table should show count = 2 (or however many users you have)
-- - auth.users should show the same count as profiles
-- ============================================================================