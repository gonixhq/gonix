-- ════════════════════════════════════════════════════════════
-- 159: ราคาขายของฉีดเป็น "ก้อน" (เช่น Botox 50u = ฿5,000)
-- ════════════════════════════════════════════════════════════
--   sell_block_qty / sell_block_price = ราคาตั้งต้นต่อก้อน · sell_price (ต่อหน่วย) = คำนวณจากก้อน
--   ตอนคิดเงินยังแก้ราคาก้อนได้ตามโปร (visit_injections.sale_price / block_price)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sell_block_qty numeric;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sell_block_price numeric(12,2);
COMMENT ON COLUMN inventory.sell_block_qty IS 'ขายเป็นก้อนละกี่หน่วย (เช่น 50 unit)';
COMMENT ON COLUMN inventory.sell_block_price IS 'ราคาก้อน (บาท) — sell_price = sell_block_price / sell_block_qty';
