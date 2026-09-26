-- Update foreign keys to ON DELETE SET NULL
-- This preserves historical data when users are deleted

-- Drop existing foreign key constraints and recreate with ON DELETE SET NULL

-- Contacts
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_created_by_fkey;
ALTER TABLE public.contacts 
  ADD CONSTRAINT contacts_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Interaction Notes
ALTER TABLE public.interaction_notes DROP CONSTRAINT IF EXISTS interaction_notes_created_by_fkey;
ALTER TABLE public.interaction_notes 
  ADD CONSTRAINT interaction_notes_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Site Visits
ALTER TABLE public.site_visits DROP CONSTRAINT IF EXISTS site_visits_created_by_fkey;
ALTER TABLE public.site_visits 
  ADD CONSTRAINT site_visits_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Catalog Items
ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_created_by_fkey;
ALTER TABLE public.catalog_items 
  ADD CONSTRAINT catalog_items_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Quotations
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_created_by_fkey;
ALTER TABLE public.quotations 
  ADD CONSTRAINT quotations_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Expense Entries
ALTER TABLE public.expense_entries DROP CONSTRAINT IF EXISTS expense_entries_created_by_fkey;
ALTER TABLE public.expense_entries 
  ADD CONSTRAINT expense_entries_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Projects (closed_by)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_closed_by_fkey;
ALTER TABLE public.projects 
  ADD CONSTRAINT projects_closed_by_fkey 
  FOREIGN KEY (closed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Success message
SELECT 'Foreign keys updated to ON DELETE SET NULL. Historical data will be preserved when users are deleted.' as message;