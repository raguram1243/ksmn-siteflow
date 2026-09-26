-- ============================================================================
-- Multi-file support for Site Visits, Quotations, and Expenses
-- 
-- Adds TEXT[] array columns alongside existing single-file columns.
-- Migrates existing single-file data into the new array columns.
-- ============================================================================

-- 1. SITE VISITS: Add photo_urls array column
ALTER TABLE public.site_visits ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';
-- Migrate existing single photo_url into the array
UPDATE public.site_visits 
SET photo_urls = ARRAY[photo_url] 
WHERE photo_url IS NOT NULL AND photo_url != '' 
AND (photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL OR photo_urls = '{}');

-- 2. EXPENSE ENTRIES: Add bill_urls array column
ALTER TABLE public.expense_entries ADD COLUMN IF NOT EXISTS bill_urls TEXT[] DEFAULT '{}';
-- Migrate existing single bill_url into the array
UPDATE public.expense_entries 
SET bill_urls = ARRAY[bill_url] 
WHERE bill_url IS NOT NULL AND bill_url != '' 
AND (bill_urls IS NULL OR array_length(bill_urls, 1) IS NULL OR bill_urls = '{}');

-- 3. QUOTATIONS: Add attachment_urls array column
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] DEFAULT '{}';
-- Migrate existing single attachment_url into the array
UPDATE public.quotations 
SET attachment_urls = ARRAY[attachment_url] 
WHERE attachment_url IS NOT NULL AND attachment_url != '' 
AND (attachment_urls IS NULL OR array_length(attachment_urls, 1) IS NULL OR attachment_urls = '{}');