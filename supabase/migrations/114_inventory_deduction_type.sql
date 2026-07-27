-- ════════════════════════════════════════════════════════════
-- 114: ประเภทการตัดสต๊อก (P01 — Wave 3 คลังความงาม / vial model B)
-- ════════════════════════════════════════════════════════════
-- เพิ่ม inventory.deduction_type = ตัวเลือกหลักว่า "ของชิ้นนี้ตัดสต๊อกแบบไหน"
--   • injectable_vial     — เวชภัณฑ์ฉีด เปิด vial แล้วแบ่งใช้ (track lot/vial) [model B]
--   • unit_piece          — นับชิ้นตรง ตัดทีละชิ้นตอนใช้
--   • consumable_periodic — วัสดุสิ้นเปลือง ไม่ตัดต่อเคส นับเป็นรอบ (ใช้ track_group + stock-count เดิม)
--
-- ⚠️ P01 = แค่เพิ่ม field + column + conditional UI · ยังไม่แตะ logic ตัดสต๊อก
--    (logic vial model B ทำใน P03/P04) — ของเดิม (stock_qty/lots/FEFO/service-kit) ทำงานเหมือนเดิม
-- reconcile: field นี้เป็นตัวสลับหลัก · track_group (mig 097) ย้ายไปอยู่ใต้ consumable_periodic
--            · units_per_pack ใช้ต่อ (injectable_vial = ยูนิต/ขวด)
-- ════════════════════════════════════════════════════════════

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS deduction_type text
    CHECK (deduction_type IS NULL OR deduction_type IN ('injectable_vial', 'unit_piece', 'consumable_periodic'));

COMMENT ON COLUMN inventory.deduction_type IS 'วิธีตัดสต๊อก: injectable_vial (เปิด vial แบ่งใช้) | unit_piece (นับชิ้น) | consumable_periodic (นับรอบ)';

-- backfill แบบเดา (ปรับเองภายหลังได้): มี track_group → สิ้นเปลือง · มี units_per_pack → ฉีด · ที่เหลือ → นับชิ้น
UPDATE inventory SET deduction_type =
    CASE
        WHEN track_group IS NOT NULL              THEN 'consumable_periodic'
        WHEN units_per_pack IS NOT NULL           THEN 'injectable_vial'
        ELSE 'unit_piece'
    END
WHERE deduction_type IS NULL;

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT deduction_type, count(*) FROM inventory GROUP BY deduction_type;
-- ════════════════════════════════════════════════════════════
