-- ════════════════════════════════════════════════════════════
-- 116: ตาราง vial ราย-ขวด (P03 — Wave 3 vial model B: เปิดแล้วแบ่งใช้)
-- ════════════════════════════════════════════════════════════
-- โมเดล B: เวชภัณฑ์ฉีด 1 ขวด/ตลับ/หลอด = 1 แถว มีสถานะเปิด-ปิด
--   • รับเข้า 3 ขวด → 3 แถว (status=unopened)
--   • ใช้งาน: เปิดขวดที่เปิดค้างอยู่ (แบ่งจนหมด) ก่อนเปิดขวดใหม่ (FEFO วันหมดอายุใกล้สุด)
--   • capacity_remaining ถึง 0 → status=depleted
--
-- ⚠️ P03 = schema + RLS เท่านั้น · ยังไม่ wire UI / logic ตัด (ทำ P04/P06)
-- reconcile: ใช้เฉพาะ item ที่ deduction_type='injectable_vial'
--   ระบบเดิม (inventory_lots bulk / stock_qty / FEFO) คงไว้สำหรับ pill/supply
--   stock_qty ของ item ฉีด = ผลรวม capacity_remaining ของ vial ที่ยังไม่ depleted (sync ใน P04)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS inventory_vials (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    item_id            uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,

    lot_number         text,
    expiry_date        date,

    capacity_total     numeric NOT NULL CHECK (capacity_total > 0),          -- เช่น 100 (u/ขวด)
    capacity_remaining numeric NOT NULL CHECK (capacity_remaining >= 0),     -- เหลือกี่ยูนิตในขวดนี้

    status             text NOT NULL DEFAULT 'unopened'
                       CHECK (status IN ('unopened', 'open', 'depleted')),
    opened_at          timestamptz,                                          -- เวลาที่เปิดขวด (null = ยังไม่เปิด)

    received_at        timestamptz NOT NULL DEFAULT now(),
    created_by         uuid,
    note               text,

    -- กันข้อมูลเพี้ยน: เหลือห้ามเกินความจุ · depleted ต้องเหลือ 0
    CONSTRAINT vial_remaining_le_total CHECK (capacity_remaining <= capacity_total),
    CONSTRAINT vial_depleted_zero      CHECK (status <> 'depleted' OR capacity_remaining = 0)
);

-- หา vial ที่เปิดค้าง/ยังไม่เปิด เร็วๆ (deduction logic P04) + FEFO วันหมดอายุ
CREATE INDEX IF NOT EXISTS idx_vials_item_open
    ON inventory_vials (item_id, status, opened_at)  WHERE status <> 'depleted';
CREATE INDEX IF NOT EXISTS idx_vials_item_fefo
    ON inventory_vials (item_id, expiry_date)         WHERE status = 'unopened';
CREATE INDEX IF NOT EXISTS idx_vials_clinic
    ON inventory_vials (clinic_id, received_at);

CREATE INDEX IF NOT EXISTS idx_vials_lot
    ON inventory_vials (item_id, lot_number);   -- recall: หาคนไข้ที่ได้จาก lot นี้ (ผ่าน usage P06)

-- ── RLS (clinic-scoped, เขียนใน migration ตั้งแต่ต้น — ไม่ให้ drift) ──
ALTER TABLE inventory_vials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_vials_clinic ON inventory_vials;
CREATE POLICY inventory_vials_clinic ON inventory_vials FOR ALL TO authenticated
    USING      (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ════════════════════════════════════════════════════════════
-- Verification:
--   \d inventory_vials
--   SELECT count(*) FROM inventory_vials;   -- 0 (ยังไม่ wire รับเข้า)
--   -- ตรวจ RLS:
--   SELECT relrowsecurity FROM pg_class WHERE relname='inventory_vials';  -- t
-- ════════════════════════════════════════════════════════════
