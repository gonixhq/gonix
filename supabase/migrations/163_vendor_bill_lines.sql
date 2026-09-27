-- ════════════════════════════════════════════════════════════
-- 163: บิลค่าใช้จ่ายแบบ FlowAccount — หลายรายการ + ส่วนลด
-- ════════════════════════════════════════════════════════════
--   lines = [{description, category, qty, unit_price, amount}] · discount = ส่วนลดท้ายบิล (ก่อน VAT)
--   รวมเป็นเงิน − ส่วนลด = ราคาหลังหักส่วนลด → VAT 7% (แยก/รวม) → amount (รวมทั้งสิ้น) → − หัก ณ ที่จ่าย = ยอดจ่ายจริง
--   category ของบิล = หมวดของรายการที่ยอดสูงสุด (ใช้กับรายงานกำไร)
-- ════════════════════════════════════════════════════════════
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS lines jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS discount numeric(12,2) NOT NULL DEFAULT 0;
