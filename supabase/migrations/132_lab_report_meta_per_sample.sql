-- 132_lab_report_meta_per_sample.sql
-- หัวใบรายงานผลแยกตาม Sample Type (แบบ CMF: LAB No./เวลาเก็บ-รับ/ผู้รายงาน/ผู้อนุมัติ ต่อชนิดตัวอย่าง)
-- เก็บเป็น JSONB map: { "<sample_type>": { lab_no, collected_at, received_at, comment,
--   reported_by_name, reported_by_license, reported_at, approved_by_name, approved_by_license, approved_at } }
-- ฟิลด์เดิม (mig 128/129) ยังใช้เป็น fallback เมื่อ sample type นั้นยังไม่มี meta

ALTER TABLE anon_cases
    ADD COLUMN IF NOT EXISTS lab_report_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE visits
    ADD COLUMN IF NOT EXISTS lab_report_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN anon_cases.lab_report_meta IS 'หัวใบรายงานผลต่อ Sample Type (JSONB map)';
COMMENT ON COLUMN visits.lab_report_meta IS 'หัวใบรายงานผลต่อ Sample Type (JSONB map)';
