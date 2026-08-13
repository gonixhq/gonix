-- 131_lab_order_sample_type.sql
-- Sample Type ต่อรายการ Lab (ห้องตรวจแพทย์) — ใช้แยกใบผลตามชนิดตัวอย่าง
ALTER TABLE lab_orders
    ADD COLUMN IF NOT EXISTS sample_type text;

COMMENT ON COLUMN lab_orders.sample_type IS 'ชนิดตัวอย่างของรายการตรวจนี้ (เช่น Clotted blood / Urine) — ใช้แยกใบผล';
