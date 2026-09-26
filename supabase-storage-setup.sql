-- ============================================================================
-- Create photos storage bucket for site visit photos
-- Run this in Supabase SQL Editor after running the main schema
-- ============================================================================

-- Insert the bucket (if not already created via UI)
INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES ('photos', 'photos', true, false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to photos bucket
CREATE POLICY "Authenticated users can upload photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'photos'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to read photos
CREATE POLICY "Authenticated users can read photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'photos'
    AND auth.role() = 'authenticated'
  );

-- Admin can delete photos
CREATE POLICY "Admins can delete photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'photos'
    AND auth.role() = 'authenticated'
    AND (SELECT public.current_user_role() = 'admin')
  );