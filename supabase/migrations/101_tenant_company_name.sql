-- ════════════════════════════════════════════════════════════
-- 101: เพิ่มชื่อนิติบุคคล (company_name) ใน tenants
-- ════════════════════════════════════════════════════════════
-- ใช้แสดงบรรทัดที่ 2 บนหัวกระดาษเอกสาร (ใบรับรองแพทย์ ฯลฯ)
--   บรรทัด 1 = clinic_name + clinic_name_en (ชื่อคลินิก)
--   บรรทัด 2 = company_name (ชื่อบริษัท/นิติบุคคล)
-- ════════════════════════════════════════════════════════════

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_name text;
COMMENT ON COLUMN tenants.company_name IS 'ชื่อนิติบุคคล/บริษัท (หัวกระดาษเอกสาร บรรทัดที่ 2)';

-- ── Seed ข้อมูล Tanavej Clinic ──
UPDATE tenants
   SET company_name   = COALESCE(company_name, 'บริษัท ธนเวช เมดิคอล จำกัด (สำนักงานใหญ่)'),
       clinic_name    = 'ธนเวชคลินิกเวชกรรม',
       clinic_name_en = 'Tanavej Clinic'
 WHERE clinic_code = 'TANAVEJ';

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT clinic_name, clinic_name_en, company_name FROM tenants;
-- ════════════════════════════════════════════════════════════
