-- ============================================================
-- 020_fix_staff_activity_log_insert.sql
-- Fix: allow owner/admin to INSERT into staff_activity_log
--   (server actions use user JWT, not service role — so RLS applies)
-- Run AFTER 019_staff_activity_log.sql
-- ============================================================

DROP POLICY IF EXISTS "staff_activity_log: admin can insert" ON staff_activity_log;
CREATE POLICY "staff_activity_log: admin can insert"
  ON staff_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = public.my_clinic_id()
    AND public.my_role() IN ('owner', 'admin')
    AND actor_id = auth.uid()                   -- ห้ามแอบใส่ actor_id ของคนอื่น
  );

-- ============================================================
-- Verification:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'staff_activity_log';
--   -- ควรเห็น 2 rows: admin can view (SELECT) + admin can insert (INSERT)
-- ============================================================
