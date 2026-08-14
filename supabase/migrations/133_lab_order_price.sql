-- 133_lab_order_price.sql
-- ราคาต่อรายการ lab (ห้องตรวจแพทย์) — ให้ไหลเข้าหน้าชำระเงิน (pharmacy checkout)
-- lab เดี่ยว: ราคา = selling_price ของ service; แพ็กเกจ: บรรทัด lab_type='package' ราคา = ราคาแพ็ก (ก้อนเดียว)
ALTER TABLE lab_orders
    ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;

COMMENT ON COLUMN lab_orders.price IS 'ราคาที่คิดเงินหน้าชำระเงิน (แพ็กเกจใช้บรรทัด lab_type=package)';
