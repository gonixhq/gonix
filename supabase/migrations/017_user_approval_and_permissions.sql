-- ============================================================
-- 017_user_approval_and_permissions.sql
-- Phase 1 of staff approval + permission management:
--   1) clinic_code on tenants (for signup lookup)
--   2) approval_status + requested_role on profiles
--   3) role_permissions table (per-clinic role overrides)
--   4) Update handle_new_user trigger
-- Run AFTER 016_seed_tanavej_branches.sql
-- ============================================================

-- ── Approval Status ENUM ──
DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 1. tenants.clinic_code (รหัสคลินิก ใช้ตอนพนักงาน signup)
-- ────────────────────────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS clinic_code text;

-- Unique index (case-insensitive)
DROP INDEX IF EXISTS idx_tenants_clinic_code;
CREATE UNIQUE INDEX idx_tenants_clinic_code ON tenants(upper(clinic_code))
  WHERE clinic_code IS NOT NULL;

-- Seed Tanavej's code
UPDATE tenants
   SET clinic_code = 'TANAVEJ'
 WHERE id = '11111111-1111-1111-1111-111111111111'
   AND clinic_code IS NULL;

-- ────────────────────────────────────────────────────────────
-- 2. profiles — approval fields
-- ────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approval_status approval_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS requested_role staff_role,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

-- Existing profiles ทั้งหมด → set เป็น approved (กันไม่ให้ user เดิมโดน lock out)
UPDATE profiles SET approval_status = 'approved' WHERE approval_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_profiles_approval ON profiles(clinic_id, approval_status);

-- ────────────────────────────────────────────────────────────
-- 3. role_permissions — per-clinic per-role permission overrides
--    UI default = ทุก permission allowed ตามตาราง catalog (ใน code)
--    Row นี้เก็บเฉพาะ override (เช่น cashier ไม่ให้ดู visits)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_permissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role              staff_role NOT NULL,
  permission_key    text NOT NULL,                       -- เช่น 'patients.view','finance.collect'
  is_allowed        bool NOT NULL DEFAULT true,
  updated_by        uuid REFERENCES profiles(id),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (clinic_id, role, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_perms_clinic ON role_permissions(clinic_id, role);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions: clinic isolation" ON role_permissions;
CREATE POLICY "role_permissions: clinic isolation"
  ON role_permissions
  FOR ALL
  TO authenticated
  USING (clinic_id = public.my_clinic_id())
  WITH CHECK (clinic_id = public.my_clinic_id());

DROP TRIGGER IF EXISTS role_permissions_set_updated_at ON role_permissions;
CREATE TRIGGER role_permissions_set_updated_at
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 4. Update handle_new_user trigger
--    - Look up clinic by clinic_code (case-insensitive)
--    - Set approval_status = pending
--    - Save requested_role
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id      uuid;
  v_clinic_code    text;
  v_requested_role staff_role;
  v_full_name      text;
BEGIN
  v_clinic_code    := NEW.raw_user_meta_data->>'clinic_code';
  v_requested_role := COALESCE(
    (NEW.raw_user_meta_data->>'requested_role')::staff_role,
    'nurse'
  );
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);

  -- Look up tenant by clinic_code (case-insensitive)
  IF v_clinic_code IS NOT NULL AND length(trim(v_clinic_code)) > 0 THEN
    SELECT id INTO v_clinic_id
      FROM tenants
     WHERE upper(clinic_code) = upper(trim(v_clinic_code))
     LIMIT 1;
  END IF;

  -- Fallback: clinic_id ใน metadata (legacy / direct admin add)
  IF v_clinic_id IS NULL THEN
    v_clinic_id := (NEW.raw_user_meta_data->>'clinic_id')::uuid;
  END IF;

  -- ถ้ายังไม่มี clinic_id → ไม่สร้าง profile (จะต้องไปแก้ผ่าน SQL ภายหลัง)
  IF v_clinic_id IS NULL THEN
    RAISE NOTICE 'handle_new_user: skip profile for % (no clinic_code/clinic_id)', NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (
    id, clinic_id, role, full_name,
    approval_status, requested_role
  )
  VALUES (
    NEW.id,
    v_clinic_id,
    v_requested_role,            -- ตั้งเป็น role ที่ขอไว้ก่อน (จะมีผลตอน approve)
    v_full_name,
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

-- ────────────────────────────────────────────────────────────
-- 5. Helper function: check current user approval
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.my_approval_status()
RETURNS approval_status LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT approval_status FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- Verification (รันหลัง migrate):
--   -- 1) Tanavej มี clinic_code = TANAVEJ
--   SELECT id, clinic_name, clinic_code FROM tenants;
--
--   -- 2) profiles มี columns ใหม่ครบ + existing user = approved
--   SELECT id, full_name, role, approval_status, requested_role
--     FROM profiles;
--
--   -- 3) role_permissions ตารางมี (ว่าง ตอนนี้)
--   SELECT count(*) FROM role_permissions;
--
--   -- 4) Helper function ทำงาน (รันตอน login เข้าระบบแล้ว)
--   SELECT public.my_approval_status();
-- ============================================================

-- ✅ 017 done — Phase 1 schema พร้อมแล้ว
--    Next: Phase 2 (Signup page) — ส่ง clinic_code + requested_role + full_name ผ่าน auth metadata
