-- ════════════════════════════════════════════════════════════
-- 052: ผูกรายการบริการ ↔ kit ในคลัง (ตัด stock ตอนรับชำระเงิน)
-- ════════════════════════════════════════════════════════════
-- - service_catalog.inventory_item_id + consume_qty:
--     บริการตรวจ 1 รายการ ใช้ kit ตัวไหนในคลัง กี่ชิ้นต่อครั้ง
-- - anon_cases.stock_deducted:
--     กันตัด stock ซ้ำ (ตัดครั้งเดียวตอนชำระ, คืนถ้ายกเลิกชำระ)
-- ════════════════════════════════════════════════════════════

ALTER TABLE service_catalog
    ADD COLUMN IF NOT EXISTS inventory_item_id uuid REFERENCES inventory(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS consume_qty       numeric DEFAULT 1;

COMMENT ON COLUMN service_catalog.inventory_item_id IS 'kit/วัสดุในคลังที่บริการนี้ตัด stock (NULL = ไม่ตัด)';
COMMENT ON COLUMN service_catalog.consume_qty IS 'จำนวนที่ตัดต่อการตรวจ 1 ครั้ง';

ALTER TABLE anon_cases
    ADD COLUMN IF NOT EXISTS stock_deducted boolean DEFAULT false;

COMMENT ON COLUMN anon_cases.stock_deducted IS 'ตัด stock kit ไปแล้วหรือยัง (กันตัดซ้ำ)';
