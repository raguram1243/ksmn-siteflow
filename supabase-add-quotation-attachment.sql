-- ============================================================================
-- Add attachment_url column to quotations table for file attachments
-- Run this in Supabase SQL Editor
-- ============================================================================

ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS attachment_url TEXT;