-- ════════════════════════════════════════════════════════════
-- 122: ประเภทหัตถการ/ชนิดของฉีด (product_type) — แยกออกจาก segment (รายได้)
-- ════════════════════════════════════════════════════════════
-- ปัญหา: recorder ความงามดึงทุก injectable_vial → ยาฉีดโรคทั่วไปโผล่ด้วย
-- แก้ 2 ชั้น:
--   (1) segment = กรอง "ฝั่งไหน" (recorder โชว์เฉพาะ segment='aesthetic') — โค้ดฝั่ง app
--   (2) product_type (คอลัมน์นี้) = "คืออะไร" → จุดฉีด dropdown ตามชนิด + รายงานแยกประเภท
-- ค่า: botox | filler | skinbooster | biostimulator | meso | fat_dissolve | weight_loss | iv_drip | other
--   (null = ไม่ระบุ · ไม่ผูก CHECK ให้ยืดหยุ่นเพิ่มชนิดใหม่ได้)
-- ════════════════════════════════════════════════════════════

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS product_type text;
COMMENT ON COLUMN inventory.product_type IS
  'ประเภทหัตถการของฉีด: botox|filler|skinbooster|biostimulator|meso|fat_dissolve|weight_loss|iv_drip|other (null=ไม่ระบุ) — แยกจาก segment(รายได้)';
