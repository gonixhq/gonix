-- ════════════════════════════════════════════════════════════
-- 041: เพิ่มข้อมูลติดต่อคลินิกใน tenants (สำหรับหน้า Settings + ใบพิมพ์)
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   หน้า Settings + ใบเสร็จ/OPD/บัตรผู้ป่วย ต้องใช้ข้อมูลคลินิกจริง
--   เลิก hard-code "ธนเวช คลินิก..." ในโค้ด → ดึงจาก tenants แทน
-- ════════════════════════════════════════════════════════════

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS phone           text,
    ADD COLUMN IF NOT EXISTS license_number  text,   -- เลขที่ใบอนุญาตสถานพยาบาล
    ADD COLUMN IF NOT EXISTS address_detail  text;    -- ที่อยู่เต็มสำหรับหัวกระดาษ

COMMENT ON COLUMN tenants.phone IS 'เบอร์โทรคลินิก (แสดงบนใบเสร็จ/เอกสาร)';
COMMENT ON COLUMN tenants.license_number IS 'เลขที่ใบอนุญาตสถานพยาบาล';
COMMENT ON COLUMN tenants.address_detail IS 'ที่อยู่เต็มของคลินิก (หัวกระดาษเอกสาร)';

-- ── Seed ข้อมูล Tanavej Clinic (ถ้ายังว่าง) ──
UPDATE tenants
   SET phone = COALESCE(phone, '093-987-4559 / 053-111215'),
       address_detail = COALESCE(address_detail, '108/27 หมู่ 1 ต.สันพระเนตร อ.สันทราย จ.เชียงใหม่ 50210'),
       tax_id = COALESCE(tax_id, '0505569001439')
 WHERE clinic_code = 'TANAVEJ';

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT clinic_name, phone, license_number, address_detail, tax_id FROM tenants;
-- ════════════════════════════════════════════════════════════
