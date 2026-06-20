-- ============================================================
-- 021_fix_handle_new_user_phone.sql
-- Fix: handle_new_user trigger ลืม insert phone จาก signup metadata
-- 1) Backfill phone จาก auth.users metadata ของ user เก่า
-- 2) Update trigger ให้ insert phone ครั้งหน้า
-- Run AFTER 020_fix_staff_activity_log_insert.sql
-- ============================================================

-- ── 1. Backfill phones ที่หายไป ──
UPDATE profiles p
   SET phone = u.raw_user_meta_data->>'phone'
  FROM auth.users u
 WHERE p.id = u.id
   AND p.phone IS NULL
   AND u.raw_user_meta_data->>'phone' IS NOT NULL
   AND length(u.raw_user_meta_data->>'phone') > 0;

-- ── 2. Update trigger function ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id      uuid;
  v_clinic_code    text;
  v_requested_role staff_role;
  v_full_name      text;
  v_phone          text;
BEGIN
  v_clinic_code    := NEW.raw_user_meta_data->>'clinic_code';
  v_requested_role := COALESCE(
    (NEW.raw_user_meta_data->>'requested_role')::staff_role,
    'nurse'
  );
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_phone     := NULLIF(NEW.raw_user_meta_data->>'phone', '');

  -- Look up tenant by clinic_code (case-insensitive)
  IF v_clinic_code IS NOT NULL AND length(trim(v_clinic_code)) > 0 THEN
    SELECT id INTO v_clinic_id
      FROM tenants
     WHERE upper(clinic_code) = upper(trim(v_clinic_code))
     LIMIT 1;
  END IF;

  -- Fallback: clinic_id ใน metadata
  IF v_clinic_id IS NULL THEN
    v_clinic_id := (NEW.raw_user_meta_data->>'clinic_id')::uuid;
  END IF;

  IF v_clinic_id IS NULL THEN
    RAISE NOTICE 'handle_new_user: skip profile for % (no clinic_code/clinic_id)', NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (
    id, clinic_id, role, full_name, phone,
    approval_status, requested_role
  )
  VALUES (
    NEW.id,
    v_clinic_id,
    v_requested_role,
    v_full_name,
    v_phone,
    'pending',
    v_requested_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Verification:
--   SELECT u.email, u.raw_user_meta_data->>'phone' AS meta_phone, p.phone AS profile_phone
--     FROM auth.users u JOIN profiles p ON p.id = u.id
--    ORDER BY u.created_at DESC LIMIT 10;
-- ============================================================
