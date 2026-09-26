-- ============================================================================
-- KSMN SiteFlow - Fix: Expense visibility, cost recalculation, permissions
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. DROP existing RLS policy for expense_entries that scopes rep to only their own
DROP POLICY IF EXISTS "Expenses select" ON public.expense_entries;
DROP POLICY IF EXISTS "Reps can CRUD own expense entries" ON public.expense_entries;

-- 2. Recreate SELECT policy: admin sees all, rep sees expenses on their projects
CREATE POLICY "Expenses select" ON public.expense_entries FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.contacts c ON c.id = p.contact_id
      WHERE c.created_by = auth.uid()
    )
  );

-- 3. INSERT policy: both admin and rep can insert (created_by must match)
DROP POLICY IF EXISTS "Expenses insert" ON public.expense_entries;
CREATE POLICY "Expenses insert" ON public.expense_entries FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- 4. DELETE policy: only admin can delete
DROP POLICY IF EXISTS "Expenses delete" ON public.expense_entries;
DROP POLICY IF EXISTS "Reps can CRUD own expense entries" ON public.expense_entries;
CREATE POLICY "Expenses delete" ON public.expense_entries FOR DELETE
  USING (public.current_user_role() = 'admin');

-- 5. UPDATE policy: only admin can update
DROP POLICY IF EXISTS "Expenses update" ON public.expense_entries;
CREATE POLICY "Expenses update" ON public.expense_entries FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- ============================================================================
-- 6. DB TRIGGER: Auto-recalculate project cost when expense entries change
-- ============================================================================

-- Drop the existing RPC approach - we'll keep the function but add a trigger too
CREATE OR REPLACE FUNCTION public.recalculate_project_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Recalculate actual_cost_total for the affected project
  UPDATE public.projects
  SET actual_cost_total = (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.expense_entries
    WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_expense_cost_update ON public.expense_entries;

-- Create trigger: fires on INSERT, UPDATE, or DELETE of expense entries
CREATE TRIGGER trg_expense_cost_update
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_project_cost();

-- ============================================================================
-- 7. Re-grant permissions for the new function
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.recalculate_project_cost() TO authenticated;

-- ============================================================================
-- 8. VERIFICATION - Check policies
-- ============================================================================
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'expense_entries'
ORDER BY cmd;