-- ════════════════════════════════════════════════════════════
-- 118: บันทึกการฉีดตอน visit + recall ราย vial (P06)
-- ════════════════════════════════════════════════════════════
-- visit_injections = หมอบันทึกฉีดแบบ structured (สินค้า/จำนวน/จุด) ตอนตรวจ
--   → ไม่ตัดสต๊อก (ตัดตอนคิดเงินตามบิล) · เป็นแหล่ง auto-fill บิล + cross-check
-- vial_usage       = ตอนคิดเงินตัด vial แล้วบันทึกว่า vn/คนไข้ ได้ vial/lot ไหน (recall)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS visit_injections (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vn          text NOT NULL REFERENCES visits(vn) ON DELETE CASCADE,
    hn          text NOT NULL,
    item_id     uuid NOT NULL REFERENCES inventory(id),
    qty         numeric NOT NULL CHECK (qty > 0),   -- จำนวนที่ฉีด (ยูนิต/shot/ml)
    unit_label  text,                               -- snapshot หน่วย (u/shot/ml)
    site        text,                               -- ตำแหน่งที่ฉีด (หน้าผาก/หางตา/ร่องแก้ม)
    doctor_id   uuid REFERENCES staff(id),
    created_by  uuid,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visit_inj_vn     ON visit_injections (vn);
CREATE INDEX IF NOT EXISTS idx_visit_inj_clinic ON visit_injections (clinic_id, created_at);

CREATE TABLE IF NOT EXISTS vial_usage (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vn          text REFERENCES visits(vn) ON DELETE SET NULL,
    hn          text,
    item_id     uuid NOT NULL REFERENCES inventory(id),
    vial_id     uuid REFERENCES inventory_vials(id),
    lot_number  text,
    qty         numeric NOT NULL,
    used_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vial_usage_vn  ON vial_usage (vn);
CREATE INDEX IF NOT EXISTS idx_vial_usage_lot ON vial_usage (item_id, lot_number);   -- recall: lot → คนไข้

-- ── RLS clinic-scoped {authenticated} ──
ALTER TABLE visit_injections ENABLE ROW LEVEL SECURITY;
ALTER TABLE vial_usage       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visit_injections_clinic ON visit_injections;
CREATE POLICY visit_injections_clinic ON visit_injections FOR ALL TO authenticated
    USING      (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS vial_usage_clinic ON vial_usage;
CREATE POLICY vial_usage_clinic ON vial_usage FOR ALL TO authenticated
    USING      (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
