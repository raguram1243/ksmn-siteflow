-- ============================================================================
-- Payment Approval Workflow
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Add status and rejection_reason to project_payments
ALTER TABLE public.project_payments 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 2. Backfill existing payments to 'approved'
UPDATE public.project_payments SET status = 'approved' WHERE status IS NULL;

-- 3. Create function to automatically set status based on creator role
CREATE OR REPLACE FUNCTION public.set_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the creator is a rep
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.created_by AND role = 'rep') THEN
    NEW.status = 'pending';
  ELSE
    NEW.status = 'approved';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger to auto-set status on insert
DROP TRIGGER IF EXISTS set_payment_status_trigger ON public.project_payments;
CREATE TRIGGER set_payment_status_trigger
  BEFORE INSERT ON public.project_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_payment_status();

-- 5. Update RLS policies to allow admins to see all payment statuses
DROP POLICY IF EXISTS "Admins can CRUD all project payments" ON public.project_payments;
CREATE POLICY "Admins can CRUD all project payments"
  ON public.project_payments FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- Reps can only see their own payments (all statuses)
DROP POLICY IF EXISTS "Reps can CRUD their own project payments" ON public.project_payments;
CREATE POLICY "Reps can view their own project payments"
  ON public.project_payments FOR SELECT
  USING (created_by = auth.uid() AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'rep'));

CREATE POLICY "Reps can insert their own project payments"
  ON public.project_payments FOR INSERT
  WITH CHECK (created_by = auth.uid() AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'rep'));

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_project_payments_status ON public.project_payments(status);
CREATE INDEX IF NOT EXISTS idx_project_payments_created_by ON public.project_payments(created_by);