-- ============================================================
-- 019_staff_activity_log.sql
-- Audit trail for admin actions on staff profiles
--   (approve / reject / re-approve / change role / disable / enable)
-- Run AFTER 018_admin_profile_access.sql
-- ============================================================

-- ── ENUM: action types ──
DO $$ BEGIN
  CREATE TYPE staff_action AS ENUM (
    'approve', 'reject', 'reapprove',
    'change_role',
    'disable', 'enable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Table ──
CREATE TABLE IF NOT EXISTS staff_activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,    -- ใครทำ
  target_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,    -- ทำกับใคร
  action       staff_action NOT NULL,
  details      jsonb DEFAULT '{}'::jsonb,                          -- เก็บ from/to/reason
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_activity_clinic_date
  ON staff_activity_log(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_activity_target
  ON staff_activity_log(target_id, created_at DESC);

-- ── RLS ──
ALTER TABLE staff_activity_log ENABLE ROW LEVEL SECURITY;

-- Only owner/admin in same clinic can read
DROP POLICY IF EXISTS "staff_activity_log: admin can view" ON staff_activity_log;
CREATE POLICY "staff_activity_log: admin can view"
  ON staff_activity_log
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = public.my_clinic_id()
    AND public.my_role() IN ('owner', 'admin')
  );

-- INSERT only via service role / server actions (no client INSERT policy → blocked by default)

-- ============================================================
-- Verification:
--   SELECT count(*) FROM staff_activity_log;
--   SELECT enum_range(NULL::staff_action);
-- ============================================================

-- ✅ 019 done — audit table พร้อมแล้ว
