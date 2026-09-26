-- Expense Line Items and Quotation Enhancement Migration
-- Run this in Supabase SQL Editor

-- 1. Create expense_line_items table
CREATE TABLE IF NOT EXISTS expense_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expense_entries(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_expense_line_items_expense_id ON expense_line_items(expense_id);

-- Enable RLS
ALTER TABLE expense_line_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Everyone can view expense line items
CREATE POLICY "Allow read access to expense line items" ON expense_line_items
  FOR SELECT USING (true);

-- RLS Policy: Admins can insert/update/delete expense line items
CREATE POLICY "Allow admin write access to expense line items" ON expense_line_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 2. Add notes column to quotation_line_items (with empty string default for backward compatibility)
ALTER TABLE quotation_line_items 
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- 3. Add new cost columns to quotations table (with 0 default for backward compatibility)
ALTER TABLE quotations 
  ADD COLUMN IF NOT EXISTS mechanized_tool_cost DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS masking_kit_cost DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;

-- 4. Create function to calculate quotation total with new fields
CREATE OR REPLACE FUNCTION calculate_quotation_total(p_quotation_id UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
  line_items_total DECIMAL(10,2);
  extra_costs DECIMAL(10,2);
  discount DECIMAL(10,2);
  final_total DECIMAL(10,2);
BEGIN
  -- Sum of line items
  SELECT COALESCE(SUM(amount), 0) INTO line_items_total
  FROM quotation_line_items
  WHERE quotation_id = p_quotation_id;

  -- Get extra costs and discount (with NULL safety)
  SELECT 
    COALESCE(mechanized_tool_cost, 0) + COALESCE(masking_kit_cost, 0),
    COALESCE(discount_amount, 0)
  INTO extra_costs, discount
  FROM quotations
  WHERE id = p_quotation_id;

  -- Calculate final total
  final_total := line_items_total + extra_costs - discount;

  RETURN final_total;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger to auto-update quotation total when line items change
CREATE OR REPLACE FUNCTION update_quotation_total_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE quotations
    SET total_value = calculate_quotation_total(NEW.quotation_id)
    WHERE id = NEW.quotation_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE quotations
    SET total_value = calculate_quotation_total(OLD.quotation_id)
    WHERE id = OLD.quotation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_quotation_total ON quotation_line_items;

-- Create trigger
CREATE TRIGGER trigger_update_quotation_total
  AFTER INSERT OR UPDATE OR DELETE ON quotation_line_items
  FOR EACH ROW EXECUTE FUNCTION update_quotation_total_trigger();

-- 6. Update existing quotations to have proper totals (recalculate all)
DO $$
DECLARE
  q RECORD;
BEGIN
  FOR q IN SELECT id FROM quotations LOOP
    UPDATE quotations
    SET total_value = calculate_quotation_total(q.id)
    WHERE id = q.id;
  END LOOP;
END $$;

-- 7. Grant necessary permissions
GRANT ALL ON expense_line_items TO authenticated;
GRANT ALL ON expense_line_items TO service_role;