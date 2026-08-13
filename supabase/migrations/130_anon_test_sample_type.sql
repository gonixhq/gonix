-- 130_anon_test_sample_type.sql
-- Sample Type ต่อรายการตรวจ (คลินิกนิรนาม) — ใช้แยกใบผลตามชนิดตัวอย่าง
ALTER TABLE anon_case_tests
    ADD COLUMN IF NOT EXISTS sample_type text;

COMMENT ON COLUMN anon_case_tests.sample_type IS 'ชนิดตัวอย่างของรายการตรวจนี้ (เช่น Clotted blood / Urine) — ใช้แยกใบผล';
