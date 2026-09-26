-- ============================================================================
-- Payment Collection + Quotation Adjustment Schema
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Add adjusted_quotation_value to projects (defaults to baseline)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS adjusted_quotation_value DECIMAL(12,2);
UPDATE public.projects SET adjusted_quotation_value = baseline_quotation_value WHERE adjusted_quotation_value IS NULL;

-- 2. Create project_payments table
CREATE TABLE IF NOT EXISTS public.project_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'bank_transfer')),
  receipt_url TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create quotation_adjustments table (admin-only history)
CREATE TABLE IF NOT EXISTS public.quotation_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  old_value DECIMAL(12,2) NOT NULL,
  new_value DECIMAL(12,2) NOT NULL,
  reason TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.project_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_adjustments ENABLE ROW LEVEL SECURITY;

-- PROJECT PAYMENTS: Both rep and admin can CRUD
CREATE POLICY "Reps can CRUD their own project payments"
  ON public.project_payments FOR ALL
  USING (created_by = auth.uid() AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'rep'));

CREATE POLICY "Admins can CRUD all project payments"
  ON public.project_payments FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- QUOTATION ADJUSTMENTS: Admin-only SELECT and INSERT (rep sees zero rows)
CREATE POLICY "Admins can select quotation adjustments"
  ON public.quotation_adjustments FOR SELECT
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

CREATE POLICY "Admins can insert quotation adjustments"
  ON public.quotation_adjustments FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_project_payments_project ON public.project_payments(project_id);
CREATE INDEX IF NOT EXISTS idx_quotation_adjustments_project ON public.quotation_adjustments(project_id);