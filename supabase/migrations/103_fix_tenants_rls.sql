-- ════════════════════════════════════════════════════════════
-- 103: ปิดช่องโหว่ RLS ตาราง tenants (ข้ามคลินิก + ไม่ล็อกอินก็แก้ได้)
-- ════════════════════════════════════════════════════════════
-- ปัญหา (policy ถูกแก้ผ่าน Supabase dashboard ไม่ผ่าน migration → drift จากโค้ด):
--   • tenants_update  roles={public} USING(true)  🔴 ใครก็ได้ (แม้ anon ไม่ล็อกอิน)
--                                                     UPDATE ข้อมูลคลินิกใดก็ได้
--   • tenants_read    roles={public} USING(true)  🟠 อ่านข้อมูลธุรกิจทุกคลินิกได้
-- แก้: จำกัดเฉพาะ "คลินิกของตัวเอง" (authenticated) — update เฉพาะ owner/admin
--      ใช้ pattern เดียวกับ mig 003 (id = clinic_id ของ profile ที่ล็อกอิน)
-- หมายเหตุ: หน้า public (checkin/result) อ่านชื่อคลินิกผ่าน tenants_public_read_by_code
--           (role anon) ที่คงไว้ — จึงไม่กระทบ
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS tenants_read ON tenants;
DROP POLICY IF EXISTS tenants_update ON tenants;
-- เผื่อมี policy เก่าค้างจาก mig 003
DROP POLICY IF EXISTS tenants_member_read ON tenants;
DROP POLICY IF EXISTS tenants_owner_manage ON tenants;

-- ── อ่าน: เฉพาะคลินิกของตัวเอง ──
CREATE POLICY tenants_read ON tenants
    FOR SELECT TO authenticated
    USING ( id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) );

-- ── แก้ไข: เฉพาะคลินิกตัวเอง + role owner/admin ──
CREATE POLICY tenants_update ON tenants
    FOR UPDATE TO authenticated
    USING (
        id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'admin')
    )
    WITH CHECK (
        id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
        AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'admin')
    );

-- ════════════════════════════════════════════════════════════
-- Verification (หลังรัน):
--   SELECT policyname, cmd, roles::text, qual, with_check
--     FROM pg_policies WHERE tablename='tenants' ORDER BY policyname;
--   → tenants_update ต้องเป็น roles={authenticated} + qual มีเงื่อนไข id/role
-- ════════════════════════════════════════════════════════════
