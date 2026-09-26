-- ============================================================================
-- Expense Approval Workflow
-- Run this in Supabase SQL Editor
-- ============================================================================
-- Mirrors the payment approval workflow (supabase-payment-approval-workflow.sql):
--   - Expenses entered by a rep start as 'pending'; admin entries are 'approved'.
--   - Admin approves or rejects (with a reason).
--   - Only APPROVED expenses count toward project cost (actual_cost_total),
--     profit/margin, and the admin expense stats.
--
-- Security notes (based on the live policies checked on 2026-09-15):
--   - The live policy "Reps can CRUD own expense entries" lets a rep UPDATE and
--     DELETE their own rows. The guard trigger below makes sure a rep can only
--     touch their own expense while it is still pending, and can never change
--     its approval status.
--   - Admin checks inside the triggers use public.is_admin() (profiles.role),
--     not the JWT user_metadata role.
-- ============================================================================

-- 1. Approval columns (existing rows get 'approved' via the default)
ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.expense_entries DROP CONSTRAINT IF EXISTS expense_entries_status_check;
ALTER TABLE public.expense_entries
  ADD CONSTRAINT expense_entries_status_check CHECK (status IN ('pending', 'approved', 'rejected'));

-- 2. Set status on insert based on who is inserting
CREATE OR REPLACE FUNCTION public.set_expense_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid() is NULL for SQL Editor / service role: treat as trusted
  IF auth.uid() IS NULL OR public.is_admin() THEN
    NEW.status := 'approved';
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := NOW();
  ELSE
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;
  NEW.rejection_reason := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_expense_status_trigger ON public.expense_entries;
CREATE TRIGGER set_expense_status_trigger
  BEFORE INSERT ON public.expense_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_expense_status();

-- 3. Guard updates/deletes: only admins review; reps only touch their own pending rows
CREATE OR REPLACE FUNCTION public.guard_expense_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'pending' THEN
        NEW.reviewed_by := NULL;
        NEW.reviewed_at := NULL;
      ELSE
        NEW.reviewed_by := auth.uid();
        NEW.reviewed_at := NOW();
      END IF;
      IF NEW.status <> 'rejected' THEN
        NEW.rejection_reason := NULL;
      END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Non-admin from here on
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'This expense has already been reviewed and can no longer be changed';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION 'Only an admin can approve or reject expenses';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_expense_changes_trigger ON public.expense_entries;
CREATE TRIGGER guard_expense_changes_trigger
  BEFORE UPDATE OR DELETE ON public.expense_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_expense_changes();

-- 4. Project cost = approved expenses only
--    (trg_expense_cost_update already fires AFTER UPDATE, so approving/rejecting
--     recalculates the project cost automatically)
CREATE OR REPLACE FUNCTION public.recalculate_project_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.projects
  SET actual_cost_total = (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.expense_entries
    WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
      AND status = 'approved'
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_project_cost(p_project_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.projects
  SET actual_cost_total = (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.expense_entries
    WHERE project_id = p_project_id
      AND status = 'approved'
  ),
  updated_at = NOW()
  WHERE id = p_project_id;
END;
$$;

-- 5. Admin expense stats = approved expenses only
CREATE OR REPLACE FUNCTION public.get_expense_monthly_comparison()
RETURNS TABLE (
  this_month_total NUMERIC,
  last_month_total NUMERIC,
  this_month_count BIGINT,
  last_month_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN e.date >= DATE_TRUNC('month', NOW()) THEN e.amount ELSE 0 END), 0) AS this_month_total,
    COALESCE(SUM(CASE WHEN e.date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                      AND e.date < DATE_TRUNC('month', NOW()) THEN e.amount ELSE 0 END), 0) AS last_month_total,
    COUNT(CASE WHEN e.date >= DATE_TRUNC('month', NOW()) THEN 1 END) AS this_month_count,
    COUNT(CASE WHEN e.date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
               AND e.date < DATE_TRUNC('month', NOW()) THEN 1 END) AS last_month_count
  FROM public.expense_entries e
  WHERE e.status = 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_expense_category_breakdown()
RETURNS TABLE (
  category TEXT,
  total_amount NUMERIC,
  entry_count BIGINT,
  percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  grand_total NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO grand_total FROM public.expense_entries WHERE status = 'approved';

  RETURN QUERY
  SELECT
    e.category AS category,
    COALESCE(SUM(e.amount), 0) AS total_amount,
    COUNT(*) AS entry_count,
    CASE
      WHEN grand_total > 0 THEN ROUND((SUM(e.amount) / grand_total * 100)::numeric, 2)
      ELSE 0
    END AS percentage
  FROM public.expense_entries e
  WHERE e.status = 'approved'
  GROUP BY e.category
  ORDER BY total_amount DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_top_project_by_expense()
RETURNS TABLE (
  project_id UUID,
  contact_name TEXT,
  site_location TEXT,
  total_expense NUMERIC,
  expense_count BIGINT,
  project_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS project_id,
    c.name AS contact_name,
    c.site_location,
    COALESCE(SUM(e.amount), 0) AS total_expense,
    COUNT(e.id) AS expense_count,
    p.status AS project_status
  FROM public.projects p
  JOIN public.contacts c ON c.id = p.contact_id
  LEFT JOIN public.expense_entries e ON e.project_id = p.id AND e.status = 'approved'
  GROUP BY p.id, c.name, c.site_location, p.status
  ORDER BY total_expense DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_avg_expense_per_project()
RETURNS TABLE (
  avg_expense NUMERIC,
  active_project_count BIGINT,
  total_expense NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    ROUND(COALESCE(AVG(expense_totals.total_expense), 0)::numeric, 2) AS avg_expense,
    COUNT(*) AS active_project_count,
    COALESCE(SUM(expense_totals.total_expense), 0) AS total_expense
  FROM (
    SELECT
      p.id,
      COALESCE(SUM(e.amount), 0) AS total_expense
    FROM public.projects p
    LEFT JOIN public.expense_entries e ON e.project_id = p.id AND e.status = 'approved'
    WHERE p.status = 'in_progress'
    GROUP BY p.id
  ) expense_totals;
END;
$$;

-- 6. Line items: reps can add line items to their OWN PENDING expenses
--    (previously only admins could write, so rep line items were silently dropped)
DROP POLICY IF EXISTS "Reps can insert line items for own pending expenses" ON public.expense_line_items;
CREATE POLICY "Reps can insert line items for own pending expenses"
  ON public.expense_line_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expense_entries e
      WHERE e.id = expense_id
        AND e.created_by = auth.uid()
        AND e.status = 'pending'
    )
  );

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_expense_entries_status ON public.expense_entries(status);
CREATE INDEX IF NOT EXISTS idx_expense_entries_created_by ON public.expense_entries(created_by);

-- 8. Recalculate every project's cost once so it is consistent with the new rule
--    (all existing expenses are 'approved', so totals should not change)
UPDATE public.projects p
SET actual_cost_total = COALESCE((
  SELECT SUM(e.amount) FROM public.expense_entries e
  WHERE e.project_id = p.id AND e.status = 'approved'
), 0);

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT status, COUNT(*) AS expense_count, SUM(amount) AS total_amount
FROM public.expense_entries
GROUP BY status;
