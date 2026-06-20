-- ════════════════════════════════════════════════════════════
-- 053: เปลี่ยน inventory.dosage_form จาก ENUM → text
-- ════════════════════════════════════════════════════════════
-- เหตุผล: ฟอร์มมีตัวเลือก "อื่นๆ (พิมพ์เอง)" แต่คอลัมน์เป็น enum
--   (tablets/capsule/.../other) ทำให้ค่าที่พิมพ์เอง เช่น "ชุด (kit)"
--   บันทึกไม่ได้ — เปลี่ยนเป็น text เพื่อรองรับการพิมพ์เอง
--   (label_type เป็น text อยู่แล้ว — ให้สอดคล้องกัน)
-- ════════════════════════════════════════════════════════════

ALTER TABLE inventory
    ALTER COLUMN dosage_form TYPE text USING dosage_form::text;

COMMENT ON COLUMN inventory.dosage_form IS 'รูปแบบยา/วัสดุ — preset หรือพิมพ์เอง (text)';
