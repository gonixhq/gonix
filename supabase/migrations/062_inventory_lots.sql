-- ════════════════════════════════════════════════════════════
-- 062: Lot tracking — หลายล็อตต่อรายการ (lot_no + expiry/lot) + FEFO
-- ════════════════════════════════════════════════════════════
-- แต่ละล็อตมีเลขล็อต + วันหมดอายุ + จำนวนคงเหลือของตัวเอง
-- inventory.expiry_date จะถูก sync = วันหมดอายุของล็อตที่ใกล้หมดสุด (ที่ยังมีของ)
-- การตัดสต๊อกแบบ FEFO (ล็อตหมดอายุก่อน=ตัดก่อน) ทำในเฟสถัดไป
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS inventory_lots (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    item_id       uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    lot_no        text,
    expiry_date   date,
    qty_received  numeric NOT NULL DEFAULT 0,
    qty_remaining numeric NOT NULL DEFAULT 0,
    cost_per_unit numeric DEFAULT 0,
    received_at   timestamptz DEFAULT now(),
    note          text,
    created_by    uuid REFERENCES staff(id),
    created_at    timestamptz DEFAULT now()
);

-- FEFO order: เรียงตามวันหมดอายุ (null=ท้ายสุด) เฉพาะล็อตที่ยังมีของ
CREATE INDEX IF NOT EXISTS idx_lots_item_fefo ON inventory_lots (item_id, expiry_date) WHERE qty_remaining > 0;
CREATE INDEX IF NOT EXISTS idx_lots_clinic_expiry ON inventory_lots (clinic_id, expiry_date);

-- ฟังก์ชัน sync inventory.expiry_date = ล็อตที่ใกล้หมดสุด (ที่ยังมีของ)
CREATE OR REPLACE FUNCTION fn_sync_item_expiry(p_item_id uuid) RETURNS void AS $$
BEGIN
    UPDATE inventory i
       SET expiry_date = (
            SELECT MIN(l.expiry_date) FROM inventory_lots l
             WHERE l.item_id = p_item_id AND l.qty_remaining > 0 AND l.expiry_date IS NOT NULL
           )
     WHERE i.id = p_item_id;
END;
$$ LANGUAGE plpgsql;
