-- ════════════════════════════════════════════════════════════
-- 115: field เฉพาะเวชภัณฑ์ฉีด (P02 — Wave 3 vial model B)
-- ════════════════════════════════════════════════════════════
-- สำหรับ deduction_type = 'injectable_vial':
--   brand               — แบรนด์ (เช่น Allergan, Galderma) — free-select
--   model_variant       — รุ่น (เช่น Voluma, Volbella) — free-select
--   capacity_unit_label — หน่วยความจุ (unit / shot / ml) — ป้ายกำกับ units_per_pack
-- (ความจุต่อหน่วยใหญ่ใช้ units_per_pack เดิม — ไม่เพิ่มคอลัมน์ซ้ำ)
-- ════════════════════════════════════════════════════════════

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS brand               text;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS model_variant       text;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS capacity_unit_label text;

COMMENT ON COLUMN inventory.brand               IS 'แบรนด์เวชภัณฑ์ฉีด (free-select)';
COMMENT ON COLUMN inventory.model_variant       IS 'รุ่น/variant (เช่น Voluma/Volbella)';
COMMENT ON COLUMN inventory.capacity_unit_label IS 'หน่วยความจุ: unit | shot | ml (ป้าย units_per_pack)';
