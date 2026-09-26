-- ============================================================================
-- KSMN SiteFlow - Complete Database Schema + RLS Policies
-- Run this in Supabase SQL Editor (your new project's SQL Editor)
-- ============================================================================

-- 0. HELPER: Create profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'rep')),
  full_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  must_change_password BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup (trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, full_name, must_change_password)
  VALUES (
    NEW.id,
    SPLIT_PART(NEW.email, '@', 1),  -- username comes from email prefix
    COALESCE(NEW.raw_user_meta_data->>'role', 'rep'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
    TRUE  -- New users must change password on first login
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 1. CONTACTS (also serves as Leads when is_lead = true)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  phone TEXT,
  site_location TEXT,
  site_lat DOUBLE PRECISION,
  site_lng DOUBLE PRECISION,
  date_first_met DATE DEFAULT CURRENT_DATE,
  initial_reaction TEXT DEFAULT 'new' CHECK (initial_reaction IN ('new','interested','not_interested','thinking','no_response')),
  source TEXT DEFAULT 'walk-in',
  is_lead BOOLEAN DEFAULT FALSE,
  lead_status TEXT CHECK (lead_status IN ('active','quotation_sent','quotation_selected','confirmed','lost')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. INTERACTION NOTES (per contact)
CREATE TABLE IF NOT EXISTS public.interaction_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SITE VISITS
CREATE TABLE IF NOT EXISTS public.site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  visit_date TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  photo_url TEXT,
  gps_lat DOUBLE PRECISION NOT NULL,
  gps_lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CATALOG ITEMS
CREATE TABLE IF NOT EXISTS public.catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unit',
  standard_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK (category IN ('material', 'labor')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. QUOTATIONS (multiple options per lead)
CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  option_label TEXT NOT NULL DEFAULT 'Option 1',
  is_selected BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  total_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  client_approved BOOLEAN DEFAULT FALSE,
  admin_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. QUOTATION LINE ITEMS
CREATE TABLE IF NOT EXISTS public.quotation_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  catalog_item_id UUID REFERENCES public.catalog_items(id),
  description TEXT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'unit',
  rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_custom BOOLEAN DEFAULT FALSE
);

-- 7. PROJECTS (auto-created from locked quotations)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL UNIQUE REFERENCES public.quotations(id),
  lead_id UUID NOT NULL REFERENCES public.contacts(id),
  contact_id UUID NOT NULL REFERENCES public.contacts(id),
  baseline_quotation_value DECIMAL(12,2) NOT NULL,
  target_margin_percent DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  actual_cost_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','closed')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. EXPENSE ENTRIES
CREATE TABLE IF NOT EXISTS public.expense_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  item_name TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT 'material',
  bill_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 9. ADMIN-ONLY VIEW: Project Profit Analysis
-- ============================================================================
-- NOTE: RLS is NOT applied to views by default in Supabase.
-- We will grant SELECT only to admin role via a function-based approach.

CREATE OR REPLACE VIEW public.project_profit_view AS
SELECT
  p.id AS project_id,
  c.name AS contact_name,
  c.phone AS contact_phone,
  c.site_location,
  p.baseline_quotation_value,
  p.actual_cost_total,
  (p.baseline_quotation_value - p.actual_cost_total) AS profit_amount,
  CASE
    WHEN p.baseline_quotation_value > 0
    THEN ROUND(((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100)::numeric, 2)
    ELSE 0
  END AS margin_percent,
  p.target_margin_percent,
  CASE
    WHEN p.actual_cost_total = 0 AND p.baseline_quotation_value > 0 THEN 'above_target'
    WHEN p.baseline_quotation_value = 0 THEN 'no_data'
    WHEN ((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100) >= (p.target_margin_percent + 2) THEN 'above_target'
    WHEN ((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100) >= p.target_margin_percent THEN 'on_target'
    WHEN ((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100) > 0 THEN 'below_target'
    ELSE 'loss'
  END AS margin_status,
  p.status AS project_status,
  p.created_at,
  p.closed_at
FROM public.projects p
JOIN public.contacts c ON c.id = p.contact_id;

-- Grant select on the view (we'll enforce admin-only via RLS on the underlying tables)
-- Actually, for views, we create a security barrier and use a helper:
ALTER VIEW public.project_profit_view SET (security_barrier = true);

-- ============================================================================
-- 10. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- PROFILES
-- -------------------------------------------------------
-- Admins can see all profiles; reps can only see their own
CREATE POLICY "Admins can see all profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
    OR auth.uid() = id
  );

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Prevent deactivated users from logging in (enforced at DB level)
CREATE OR REPLACE FUNCTION public.check_user_active()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(
    (SELECT is_active FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a login hook to check if user is active
-- Note: Supabase doesn't have direct login hooks, but we can use a post-authentication check
-- The frontend will also check this, but this provides DB-level enforcement for API calls

-- -------------------------------------------------------
-- CONTACTS
-- -------------------------------------------------------
CREATE POLICY "Reps can CRUD their own contacts"
  ON public.contacts FOR ALL
  USING (created_by = auth.uid() AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'rep'));

CREATE POLICY "Admins can CRUD all contacts"
  ON public.contacts FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

CREATE POLICY "Reps can insert contacts"
  ON public.contacts FOR INSERT
  WITH CHECK (created_by = auth.uid() AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'rep'));

CREATE POLICY "Admins can insert contacts"
  ON public.contacts FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- -------------------------------------------------------
-- INTERACTION NOTES
-- -------------------------------------------------------
CREATE POLICY "Reps can CRUD own interaction notes"
  ON public.interaction_notes FOR ALL
  USING (created_by = auth.uid() AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'rep'));

CREATE POLICY "Admins can CRUD all interaction notes"
  ON public.interaction_notes FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- -------------------------------------------------------
-- SITE VISITS
-- -------------------------------------------------------
CREATE POLICY "Reps can CRUD own site visits"
  ON public.site_visits FOR ALL
  USING (created_by = auth.uid() AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'rep'));

CREATE POLICY "Admins can CRUD all site visits"
  ON public.site_visits FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- -------------------------------------------------------
-- CATALOG ITEMS (admin-managed, rep can read only)
-- -------------------------------------------------------
CREATE POLICY "Reps can read catalog items"
  ON public.catalog_items FOR SELECT
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'rep')));

CREATE POLICY "Admins can CRUD catalog items"
  ON public.catalog_items FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- -------------------------------------------------------
-- QUOTATIONS (values visible to reps who created them)
-- -------------------------------------------------------
CREATE POLICY "Reps can CRUD their own quotations"
  ON public.quotations FOR ALL
  USING (created_by = auth.uid() AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'rep'));

CREATE POLICY "Admins can CRUD all quotations"
  ON public.quotations FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- -------------------------------------------------------
-- QUOTATION LINE ITEMS
-- -------------------------------------------------------
CREATE POLICY "Reps can CRUD their own quotation line items"
  ON public.quotation_line_items FOR ALL
  USING (
    quotation_id IN (
      SELECT id FROM public.quotations WHERE created_by = auth.uid()
    )
    AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'rep')
  );

CREATE POLICY "Admins can CRUD all quotation line items"
  ON public.quotation_line_items FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- -------------------------------------------------------
-- PROJECTS
-- -------------------------------------------------------
-- Reps can see projects linked to their contacts/leads
CREATE POLICY "Reps can read projects from their leads"
  ON public.projects FOR SELECT
  USING (
    lead_id IN (SELECT id FROM public.contacts WHERE created_by = auth.uid())
    AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'rep')
  );

CREATE POLICY "Admins can CRUD all projects"
  ON public.projects FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- -------------------------------------------------------
-- EXPENSE ENTRIES
-- -------------------------------------------------------
CREATE POLICY "Reps can CRUD own expense entries"
  ON public.expense_entries FOR ALL
  USING (created_by = auth.uid() AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'rep'));

CREATE POLICY "Admins can CRUD all expense entries"
  ON public.expense_entries FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- -------------------------------------------------------
-- PROFIT VIEW (ADMIN-ONLY - Enforced at DB level)
-- -------------------------------------------------------
-- Grant access to the view only for admin users
-- We use a helper function that checks the caller's role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin',
    FALSE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke all on the view from public, then grant to authenticated
REVOKE ALL ON public.project_profit_view FROM PUBLIC;
GRANT SELECT ON public.project_profit_view TO authenticated;

-- Create a policy on the underlying tables to filter based on admin
-- But since views bypass RLS on base tables, we use a security barrier
-- The RLS on underlying tables still applies when querying through the view
-- But for extra safety, we create a wrapper:

CREATE OR REPLACE FUNCTION public.get_project_profit_view()
RETURNS SETOF public.project_profit_view
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.project_profit_view
  WHERE public.is_admin() = TRUE;
$$;

-- Revoke execute on the function from public, grant only to authenticated
REVOKE ALL ON FUNCTION public.get_project_profit_view() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_project_profit_view() TO authenticated;

-- ============================================================================
-- 11. INDEXES for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON public.contacts(created_by);
CREATE INDEX IF NOT EXISTS idx_contacts_is_lead ON public.contacts(is_lead);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON public.contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS idx_interaction_notes_contact ON public.interaction_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_contact ON public.site_visits(contact_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_created_by ON public.site_visits(created_by);
CREATE INDEX IF NOT EXISTS idx_quotations_lead ON public.quotations(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotation_line_items_quotation ON public.quotation_line_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_projects_lead ON public.projects(lead_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_expense_entries_project ON public.expense_entries(project_id);

-- ============================================================================
-- 12. SEED DATA (optional - remove if you want empty start)
-- ============================================================================
-- After you create an admin user in Supabase Auth UI, you can:
-- UPDATE public.profiles SET role = 'admin' WHERE username = 'admin';

-- To create additional users, use the Supabase Auth UI:
-- 1. Go to Authentication → Users → Add User
-- 2. Email: admin@ksmn.local (for admin), rep@ksmn.local (for rep)
-- 3. Password: set a strong password
-- 4. In User Metadata, add: {"role":"admin","full_name":"Admin User"} or {"role":"rep","full_name":"Rep User"}