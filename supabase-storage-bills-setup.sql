-- ============================================================================
-- Create bills storage bucket for expense bill/receipt uploads
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Insert the bucket (if not already created via UI)
INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES ('bills', 'bills', true, false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to bills bucket
CREATE POLICY "Authenticated users can upload bills"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'bills'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to read bills
CREATE POLICY "Authenticated users can read bills"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'bills'
    AND auth.role() = 'authenticated'
  );

-- Admin can delete bills
CREATE POLICY "Admins can delete bills"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'bills'
    AND auth.role() = 'authenticated'
    AND (SELECT public.current_user_role() = 'admin')
  );