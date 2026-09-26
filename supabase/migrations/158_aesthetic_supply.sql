-- ════════════════════════════════════════════════════════════
-- 158: ย้ายเวชภัณฑ์ฉีดเดิมเข้าหมวด "เวชภัณฑ์ความงาม" + แผนกความงาม
-- ════════════════════════════════════════════════════════════
--   • หมวดใหม่ aesthetic_supply (รหัสใหม่ขึ้นต้น AES · รหัสเดิมไม่เปลี่ยน)
--   • เวชภัณฑ์ฉีดทุกตัว → แผนก "ความงาม" (ให้นับคอมแนะนำ/คอมทีมถูก เช่น Elasty G ที่ตั้งเป็นการแพทย์ไว้)
--   ถ้ามีตัวไหนเป็นยาฉีดทางการแพทย์จริง ให้แก้กลับรายตัวในหน้าแก้ไขสินค้า
-- ════════════════════════════════════════════════════════════
UPDATE inventory SET category = 'aesthetic_supply', updated_at = now()
 WHERE deduction_type = 'injectable_vial' AND category = 'drug';
UPDATE inventory SET segment = 'aesthetic', updated_at = now()
 WHERE deduction_type = 'injectable_vial' AND COALESCE(segment, '') <> 'aesthetic';
