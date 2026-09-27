-- ════════════════════════════════════════════════════════════
-- 167: ปรับหน้าซักประวัติ
-- ════════════════════════════════════════════════════════════
--   • visits.dtx / lmp_date — เดิมกรอกได้แต่ไม่ถูกบันทึก
--   • visits.pre_screening — คำถามคัดกรองก่อนหัตถการความงาม (ตั้งครรภ์/ให้นม/ยาละลายลิ่มเลือด/แพ้ยาชา ฯลฯ)
--   • patients.nkda / no_chronic — "ถามแล้ว ไม่มี" แยกจาก "ยังไม่ได้ถาม"
--   • vital_signs.dtx
-- ════════════════════════════════════════════════════════════
ALTER TABLE visits ADD COLUMN IF NOT EXISTS dtx numeric(5,1);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS lmp_date date;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS pre_screening jsonb;
COMMENT ON COLUMN visits.pre_screening IS 'คัดกรองก่อนหัตถการ {pregnant, breastfeeding, anticoagulant, anesthetic_allergy, local_infection, keloid, autoimmune, last_treatment, none_confirmed}';

ALTER TABLE vital_signs ADD COLUMN IF NOT EXISTS dtx numeric(5,1);

ALTER TABLE patients ADD COLUMN IF NOT EXISTS nkda boolean NOT NULL DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS no_chronic boolean NOT NULL DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS history_reviewed_at timestamptz;
COMMENT ON COLUMN patients.nkda IS 'ยืนยันแล้วว่าไม่มีประวัติแพ้ (No Known Drug Allergy)';
