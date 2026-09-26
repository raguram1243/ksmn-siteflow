-- ============================================================================
-- Add bill_no column to expense_entries table for bill capture feature
-- Run this in Supabase SQL Editor
-- ============================================================================

ALTER TABLE public.expense_entries ADD COLUMN IF NOT EXISTS bill_no TEXT;