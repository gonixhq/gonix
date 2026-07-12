-- ════════════════════════════════════════════════════════════
-- 104: ปิด tenants_allow_insert (public INSERT) — ปิดช่องสร้างคลินิกมั่วผ่าน API
-- ════════════════════════════════════════════════════════════
-- ปัญหา: policy `tenants_allow_insert` roles={public} → ใครก็ได้ (แม้ anon)
--        INSERT แถวใน tenants ผ่าน Supabase API ตรง = spam คลินิกลง DB
-- ตรวจแล้ว: ไม่มีโค้ด app/lib ไหน insert tenants เลย (grep = 0)
--        tenant สร้างผ่าน migration seed เท่านั้น (006/007) ซึ่งรันเป็น
--        service/superuser → bypass RLS อยู่แล้ว ไม่ต้องพึ่ง policy นี้
--        (policy นี้ถูกสร้างผ่าน dashboard ไม่ผ่าน migration — drift)
-- ปลอดภัยที่จะ drop: การ onboard คลินิกใหม่ในอนาคตให้ทำผ่าน service-role/migration
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS tenants_allow_insert ON tenants;

-- ════════════════════════════════════════════════════════════
-- Verification: ไม่ควรเหลือ policy INSERT บน tenants ที่ให้ public/anon
--   SELECT policyname, cmd, roles::text FROM pg_policies
--    WHERE tablename='tenants' ORDER BY policyname;
-- ════════════════════════════════════════════════════════════
