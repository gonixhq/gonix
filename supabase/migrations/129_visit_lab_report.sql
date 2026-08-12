-- 129_visit_lab_report.sql
-- ฟิลด์ใบรายงานผล Laboratory Report สำหรับ visit (ห้องตรวจแพทย์)
-- ผลตรวจแต่ละรายการเก็บใน lab_orders (มีอยู่แล้ว); ส่วนหัวรายงานเก็บบน visits (1 รายงาน/visit)
-- prefix lab_ กันชนกับคอลัมน์เดิม

ALTER TABLE visits
    ADD COLUMN IF NOT EXISTS lab_no                  text,          -- LAB No.
    ADD COLUMN IF NOT EXISTS lab_sample_type         text,          -- ชนิดตัวอย่าง
    ADD COLUMN IF NOT EXISTS lab_collected_at        timestamptz,   -- วันเวลาเก็บตัวอย่าง
    ADD COLUMN IF NOT EXISTS lab_received_at         timestamptz,   -- วันเวลารับตัวอย่าง
    ADD COLUMN IF NOT EXISTS lab_comment             text,          -- หมายเหตุในรายงาน
    ADD COLUMN IF NOT EXISTS lab_reported_by_name    text,          -- ผู้รายงานผล
    ADD COLUMN IF NOT EXISTS lab_reported_by_license text,          -- เลขใบประกอบ/MT ผู้รายงาน
    ADD COLUMN IF NOT EXISTS lab_reported_at         timestamptz,   -- วันเวลารายงานผล
    ADD COLUMN IF NOT EXISTS lab_approved_by_name    text,          -- ผู้ตรวจสอบ/อนุมัติ
    ADD COLUMN IF NOT EXISTS lab_approved_by_license text,          -- เลขใบประกอบ/MT ผู้อนุมัติ
    ADD COLUMN IF NOT EXISTS lab_approved_at         timestamptz;   -- วันเวลาอนุมัติ

COMMENT ON COLUMN visits.lab_no IS 'เลขที่แล็บบนใบรายงานผล (Laboratory Report) ของ visit';
