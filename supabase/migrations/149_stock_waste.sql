-- ════════════════════════════════════════════════════════════
-- 149: สเปกการเงิน เฟส 4B — ยาทิ้ง / หมดอายุ / เสียหาย + ขวดที่เปิดค้าง
-- ════════════════════════════════════════════════════════════
--   • stock_waste: บันทึกทุกครั้ง (วันที่ ยา จำนวน เหตุผล ผู้บันทึก) · มูลค่า = ราคาทุน ณ วันทิ้ง (snapshot)
--     หักสต๊อก + stock_card (WASTE) · แสดงเป็นบรรทัดแยกในรายงานรายเดือน
--   • inventory.opened_shelf_hours = อยู่ได้กี่ชั่วโมงหลังเปิด/ผสม (เช่น โบทูลินัม) → เตือนขวดเปิดค้างใกล้เสีย
--   • fn_waste_vial: ทิ้งจาก vial ที่ระบุ (ล็อกแถว กันตัดชน)
-- ════════════════════════════════════════════════════════════

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS opened_shelf_hours numeric;
COMMENT ON COLUMN inventory.opened_shelf_hours IS 'อายุหลังเปิด/ผสม (ชั่วโมง) — ขวดเปิดค้างเกินนี้ควรทิ้ง · null = ไม่กำหนด';

CREATE TABLE IF NOT EXISTS stock_waste (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    item_id      uuid NOT NULL REFERENCES inventory(id),
    lot_id       uuid REFERENCES inventory_lots(id),
    vial_id      uuid REFERENCES inventory_vials(id),
    qty          numeric NOT NULL CHECK (qty > 0),
    unit         text,
    unit_cost    numeric(12,4) NOT NULL DEFAULT 0,
    value        numeric(12,2) NOT NULL DEFAULT 0,
    reason       text NOT NULL CHECK (reason IN ('mixed_leftover','expired','damaged','other')),
    note         text,
    wasted_on    date NOT NULL,
    recorded_by  uuid REFERENCES staff(id),
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_waste_month ON stock_waste (clinic_id, wasted_on);
ALTER TABLE stock_waste ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_waste_clinic ON stock_waste;
CREATE POLICY stock_waste_clinic ON stock_waste FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ── ทิ้งจาก vial ที่ระบุ ──
CREATE OR REPLACE FUNCTION public.fn_waste_vial(p_vial uuid, p_qty numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v record;
BEGIN
    SELECT * INTO v FROM inventory_vials WHERE id = p_vial
       AND clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบขวดนี้'; END IF;
    IF v.status = 'depleted' THEN RAISE EXCEPTION 'ขวดนี้ใช้หมดแล้ว'; END IF;
    IF p_qty <= 0 OR p_qty > v.capacity_remaining THEN
        RAISE EXCEPTION 'จำนวนที่ทิ้งเกินคงเหลือในขวด (เหลือ %)', v.capacity_remaining;
    END IF;
    UPDATE inventory_vials SET
        capacity_remaining = capacity_remaining - p_qty,
        status = CASE WHEN capacity_remaining - p_qty = 0 THEN 'depleted' WHEN status = 'unopened' THEN 'open' ELSE status END,
        opened_at = COALESCE(opened_at, now())
     WHERE id = p_vial;
    PERFORM fn_sync_vial_stock(v.item_id);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_waste_vial(uuid, numeric) TO authenticated;
