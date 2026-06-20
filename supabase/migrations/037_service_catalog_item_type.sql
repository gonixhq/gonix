-- ════════════════════════════════════════════════════════════
-- 037: เพิ่ม item_type + note ใน service_catalog
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   เคาท์เตอร์สามารถ pre-define รายการบริการ + ราคา ไว้
--   ตอน checkout เลือกจาก preset ได้เลย — ไม่ต้องพิมพ์ทุกครั้ง
--
--   item_type ใช้ map กับ invoice_items.item_type:
--     doctor_fee / procedure / service / supply / lab_external / other
-- ════════════════════════════════════════════════════════════

ALTER TABLE service_catalog
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN service_catalog.item_type IS 'doctor_fee / procedure / service / supply / lab_external / other';
COMMENT ON COLUMN service_catalog.note IS 'หมายเหตุ/รายละเอียดเพิ่มเติม';

CREATE INDEX IF NOT EXISTS idx_service_catalog_active
  ON service_catalog (clinic_id, is_active) WHERE is_active = true;

-- ────────────────────────────────────────────────────────────
-- Optional seed: services พื้นฐานสำหรับ tanavej clinic
-- (ลบ comment ออกถ้าจะใช้)
-- ────────────────────────────────────────────────────────────
-- INSERT INTO service_catalog (clinic_id, service_code, service_name, item_type, selling_price)
-- SELECT id, 'DOC-FEE', 'ค่าตรวจรักษา (Doctor Fee)', 'doctor_fee', 500 FROM tenants WHERE name='Tanavej Clinic'
-- UNION ALL SELECT id, 'EKG', 'ตรวจคลื่นหัวใจ (EKG)', 'procedure', 800 FROM tenants WHERE name='Tanavej Clinic'
-- UNION ALL SELECT id, 'INJ', 'ฉีดยา', 'procedure', 200 FROM tenants WHERE name='Tanavej Clinic'
-- UNION ALL SELECT id, 'DRESS-S', 'ทำแผลเล็ก', 'procedure', 300 FROM tenants WHERE name='Tanavej Clinic'
-- UNION ALL SELECT id, 'DRESS-L', 'ทำแผลใหญ่', 'procedure', 600 FROM tenants WHERE name='Tanavej Clinic'
-- UNION ALL SELECT id, 'SVC-CARD', 'บัตรผู้ป่วยใหม่', 'service', 50 FROM tenants WHERE name='Tanavej Clinic';

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT service_name, item_type, selling_price FROM service_catalog WHERE is_active=true;
-- ════════════════════════════════════════════════════════════
