-- ════════════════════════════════════════════════════════════
-- 155: หน่วยฟิลเลอร์ = cc (ไม่ใช่ ml)
-- ════════════════════════════════════════════════════════════
-- เวชภัณฑ์ฉีดที่ตัดสต๊อกเป็น ml → เปลี่ยนเป็น cc (ปริมาณเท่ากัน 1 ml = 1 cc ไม่ต้องแปลงตัวเลข)
UPDATE inventory SET unit = 'cc', updated_at = now()
 WHERE deduction_type = 'injectable_vial' AND lower(trim(unit)) = 'ml';
UPDATE inventory SET capacity_unit_label = 'cc', updated_at = now()
 WHERE deduction_type = 'injectable_vial' AND lower(trim(capacity_unit_label)) = 'ml';
