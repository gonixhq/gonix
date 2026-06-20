-- ============================================================
-- 018_admin_profile_access.sql
-- Allow owner/admin to view + update profiles within their clinic
-- (needed for Staff Management: see pending list + approve/reject)
-- Run AFTER 017_user_approval_and_permissions.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SELECT policy — owner/admin sees all profiles in their clinic
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles: admin can view clinic" ON profiles;
CREATE POLICY "profiles: admin can view clinic"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = public.my_clinic_id()
    AND public.my_role() IN ('owner', 'admin')
  );

-- ────────────────────────────────────────────────────────────
-- UPDATE policy — owner/admin can update profiles in their clinic
--   (used by approveStaff / rejectStaff server actions)
--   WITH CHECK: ห้ามย้าย profile ข้าม clinic
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles: admin can update clinic" ON profiles;
CREATE POLICY "profiles: admin can update clinic"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = public.my_clinic_id()
    AND public.my_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    clinic_id = public.my_clinic_id()
  );

-- ============================================================
-- Verification:
--   -- ต้องเห็น 3 policies ขั้นต่ำ (profiles_self + 2 ใหม่)
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles' ORDER BY policyname;
-- ============================================================

-- ✅ 018 done — owner/admin จะมองเห็นและ approve profile คนอื่นใน clinic เดียวกันได้
