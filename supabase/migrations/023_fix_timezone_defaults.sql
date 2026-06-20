-- ============================================================
-- 023_fix_timezone_defaults.sql
-- Fix: visits.visit_time / visit_date default ใช้ UTC → ใช้ Asia/Bangkok
-- + backfill visits ที่เก่าบันทึกเวลาผิด (เป็น UTC) → +7 hours
-- Run AFTER 022_add_screening_fields.sql
-- ============================================================

-- ── Fix defaults ──
ALTER TABLE visits
  ALTER COLUMN visit_date SET DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date,
  ALTER COLUMN visit_time SET DEFAULT ((now() AT TIME ZONE 'Asia/Bangkok')::time)::timetz;

ALTER TABLE appointments
  ALTER COLUMN appt_date SET DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date;

-- ── Backfill visits ที่ visit_time น่าจะเป็น UTC (created today) ──
-- (เพิ่ม 7 ชม. ให้ visit_time ที่บันทึกเป็น UTC — เฉพาะที่ยังไม่ completed)
-- ระวัง: รันครั้งเดียวเท่านั้น ไม่งั้นจะบวก 7 ซ้ำ
-- Comment ทิ้งไว้หลังรันแล้ว ไม่ต้องรันซ้ำ
-- UPDATE visits
--    SET visit_time = (visit_time::time + interval '7 hours')::timetz
--  WHERE created_at >= NOW() - interval '1 day';

-- ============================================================
-- Verification:
--   SELECT column_name, column_default FROM information_schema.columns
--    WHERE table_name = 'visits' AND column_name IN ('visit_date','visit_time');
-- ============================================================
