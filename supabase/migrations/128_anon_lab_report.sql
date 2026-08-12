-- 128_anon_lab_report.sql
-- ฟิลด์สำหรับใบรายงานผลตรวจแบบ Laboratory Report (ตามฟอร์มแล็บภายนอก)
-- เก็บบน anon_cases (1 รายงาน/เคส); requested date ใช้ case_date เดิม

ALTER TABLE anon_cases
    ADD COLUMN IF NOT EXISTS lab_no                text,          -- เลขที่แล็บ (LAB No.)
    ADD COLUMN IF NOT EXISTS sample_type           text,          -- ชนิดตัวอย่าง เช่น Clotted blood / Urine
    ADD COLUMN IF NOT EXISTS collected_at          timestamptz,   -- วันเวลาเก็บตัวอย่าง
    ADD COLUMN IF NOT EXISTS received_at           timestamptz,   -- วันเวลารับตัวอย่างเข้าแล็บ
    ADD COLUMN IF NOT EXISTS lab_comment           text,          -- หมายเหตุในรายงาน
    ADD COLUMN IF NOT EXISTS reported_by_name      text,          -- ผู้รายงานผล
    ADD COLUMN IF NOT EXISTS reported_by_license   text,          -- เลขใบประกอบ/MT ผู้รายงาน
    ADD COLUMN IF NOT EXISTS reported_at           timestamptz,   -- วันเวลารายงานผล
    ADD COLUMN IF NOT EXISTS approved_by_name      text,          -- ผู้ตรวจสอบ/อนุมัติ
    ADD COLUMN IF NOT EXISTS approved_by_license   text,          -- เลขใบประกอบ/MT ผู้อนุมัติ
    ADD COLUMN IF NOT EXISTS approved_at           timestamptz;   -- วันเวลาอนุมัติ

COMMENT ON COLUMN anon_cases.lab_no IS 'เลขที่แล็บบนใบรายงานผล (Laboratory Report)';
