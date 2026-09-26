-- Add user management fields to profiles table
-- Run this in Supabase SQL Editor to fix the 500 error

-- Add is_active column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add must_change_password column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- Update the trigger to set must_change_password for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, full_name, must_change_password)
  VALUES (
    NEW.id,
    SPLIT_PART(NEW.email, '@', 1),
    COALESCE(NEW.raw_user_meta_data->>'role', 'rep'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
    TRUE  -- New users must change password on first login
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Success message
SELECT 'User management fields added successfully!' as message;