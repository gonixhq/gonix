-- ════════════════════════════════════════════════════════════
-- 049: คลินิกนิรนาม — Vital Signs (คัดกรองโดยเจ้าหน้าที่หน้าเคาน์เตอร์)
-- ════════════════════════════════════════════════════════════
-- แยกบทบาท: เจ้าหน้าที่ = เปิดเคส + บันทึก vital signs เท่านั้น
--           แพทย์ (anon.clinical) = เห็นข้อมูลความเสี่ยง/แบบประเมิน + สั่งตรวจ
-- เก็บ vitals เป็น jsonb: { weight, height, bp_sys, bp_dia, pulse, temp, rr, spo2, note }
-- ════════════════════════════════════════════════════════════

ALTER TABLE anon_cases
    ADD COLUMN IF NOT EXISTS vitals     jsonb,
    ADD COLUMN IF NOT EXISTS vitals_at  timestamptz,
    ADD COLUMN IF NOT EXISTS vitals_by  uuid REFERENCES profiles(id);

COMMENT ON COLUMN anon_cases.vitals IS 'สัญญาณชีพจากการคัดกรอง (เจ้าหน้าที่บันทึก)';
