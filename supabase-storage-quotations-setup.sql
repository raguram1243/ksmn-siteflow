-- ============================================================================
-- Create quotations storage bucket for quotation attachments
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Insert the bucket (if not already created via UI)
INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES ('quotations', 'quotations', true, false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to quotations bucket
CREATE POLICY "Authenticated users can upload quotations"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'quotations'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to read quotations
CREATE POLICY "Authenticated users can read quotations"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'quotations'
    AND auth.role() = 'authenticated'
  );

-- Admin can delete quotations attachments
CREATE POLICY "Admins can delete quotations"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'quotations'
    AND auth.role() = 'authenticated'
    AND (SELECT public.current_user_role() = 'admin')
  );