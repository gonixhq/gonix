-- ════════════════════════════════════════════════════════════
-- 120: แยก "ราคาขาย(ก้อน)" ออกจาก "จำนวนที่ฉีด(ยูนิต)" — vial billing
-- ════════════════════════════════════════════════════════════
-- ร้านขายของฉีดเป็น "ก้อน" ไม่ใช่ต่อยูนิต:
--   Botox 50u=5,000 · Filler 1cc=X · HIFU 300shot=Y (โปรแต่ละเดือนราคาไม่เท่า)
-- → visit_injections.qty = จำนวนจริง (ตัดสต๊อก vial) · sale_price = ราคาก้อน (คิดเงิน)
--   บิล: qty=จำนวน · line_total=sale_price · unit_price=sale_price/qty (คำนวณ ไม่ต้องคิดต่อยูนิตเอง)
-- ════════════════════════════════════════════════════════════

ALTER TABLE visit_injections ADD COLUMN IF NOT EXISTS sale_price numeric;
COMMENT ON COLUMN visit_injections.sale_price IS 'ราคาขายก้อน (บาท) ของการฉีดครั้งนี้ — null = ให้เคาน์เตอร์ใส่ตอนคิดเงิน';
