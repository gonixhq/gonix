-- ════════════════════════════════════════════════════════════
-- 061: Revenue Segmentation — ติดแท็กแผนก (medical/aesthetic/product)
-- ════════════════════════════════════════════════════════════
-- ติดแท็กที่ "แหล่งที่มา" (บริการ/ยา/แพ็กเกจ) แล้ว denormalize ลง invoice_items
-- ตอนคิดเงิน → รายงานแยกแผนกย้อนหลังแม่นยำ
--   medical   = การแพทย์ / โรคทั่วไป
--   aesthetic = ความงาม / หัตถการ
--   product   = ขายของ / ยา-ผลิตภัณฑ์
-- ════════════════════════════════════════════════════════════

ALTER TABLE service_catalog  ADD COLUMN IF NOT EXISTS segment text;
ALTER TABLE inventory        ADD COLUMN IF NOT EXISTS segment text;
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS segment text;
ALTER TABLE invoice_items    ADD COLUMN IF NOT EXISTS segment text;

CREATE INDEX IF NOT EXISTS idx_invoice_items_segment ON invoice_items (clinic_id, segment);

-- ตั้ง default เริ่มต้นให้ยา/เวชภัณฑ์ในคลังเป็น "ขายของ" (product) — ปรับทีหลังได้
UPDATE inventory SET segment = 'product' WHERE segment IS NULL AND category IN ('drug', 'supply');
