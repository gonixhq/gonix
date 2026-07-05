-- ════════════════════════════════════════════════════════════
-- 099: คอสตัดสต๊อกวัสดุต่อการใช้ 1 ครั้ง (เช่น HIFU shot)
-- ════════════════════════════════════════════════════════════
-- service_packages.consume_item_id + consume_qty_per_session:
--   คอสนี้ใช้ครั้งละกี่หน่วยของสินค้าตัวไหน (เช่น 300 shot ต่อครั้ง)
--   ตัดตอน usePackageSession (ตัดครั้ง) — FEFO
-- (บริการเดี่ยวใช้ service_catalog.inventory_item_id + consume_qty เดิม mig 052)
-- ════════════════════════════════════════════════════════════

ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS consume_item_id          uuid REFERENCES inventory(id) ON DELETE SET NULL;
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS consume_qty_per_session  numeric;

COMMENT ON COLUMN service_packages.consume_item_id IS 'สินค้าในคลังที่ตัดต่อการใช้ 1 ครั้ง (NULL = ไม่ตัด)';
COMMENT ON COLUMN service_packages.consume_qty_per_session IS 'จำนวนที่ตัดต่อการใช้ 1 ครั้ง (เช่น shot ต่อครั้ง)';
