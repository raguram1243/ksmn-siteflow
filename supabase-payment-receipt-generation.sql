-- Payment Receipt Generation Migration
-- Run this in Supabase SQL Editor

-- 1. Add receipt fields to project_payments table
ALTER TABLE project_payments 
  ADD COLUMN IF NOT EXISTS receipt_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- 2. Create sequence for receipt numbering (continuously incrementing)
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;

-- 3. Create function to generate receipt number
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TEXT AS $$
DECLARE
  next_val BIGINT;
  receipt_num TEXT;
BEGIN
  next_val := nextval('receipt_number_seq');
  receipt_num := 'KSMN-' || EXTRACT(YEAR FROM CURRENT_DATE) || '-' || LPAD(next_val::TEXT, 4, '0');
  RETURN receipt_num;
END;
$$ LANGUAGE plpgsql;

-- 4. Create function to generate receipt PDF (placeholder for edge function integration)
-- This function will be called by the edge function to get the next receipt number
CREATE OR REPLACE FUNCTION get_next_receipt_number()
RETURNS TEXT AS $$
BEGIN
  RETURN generate_receipt_number();
END;
$$ LANGUAGE plpgsql;

-- 5. Backfill receipt numbers for existing approved payments without receipt numbers
DO $$
DECLARE
  payment RECORD;
  receipt_num TEXT;
BEGIN
  FOR payment IN 
    SELECT id FROM project_payments 
    WHERE status = 'approved' 
    AND receipt_number IS NULL 
    ORDER BY date, id
  LOOP
    receipt_num := generate_receipt_number();
    UPDATE project_payments 
    SET receipt_number = receipt_num 
    WHERE id = payment.id;
  END LOOP;
END $$;

-- 6. Create index for faster receipt number lookups
CREATE INDEX IF NOT EXISTS idx_project_payments_receipt_number ON project_payments(receipt_number);

-- 7. Grant necessary permissions
GRANT USAGE, SELECT ON SEQUENCE receipt_number_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE receipt_number_seq TO service_role;