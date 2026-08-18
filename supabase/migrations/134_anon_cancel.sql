-- 134_anon_cancel.sql
-- ยกเลิกเคสนิรนาม (ไม่ลบ) — status='cancelled' + บันทึกวันเวลา/เหตุผล/ผู้ยกเลิก
ALTER TABLE anon_cases
    ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz,
    ADD COLUMN IF NOT EXISTS cancel_reason text,
    ADD COLUMN IF NOT EXISTS cancelled_by  uuid REFERENCES profiles(id);

COMMENT ON COLUMN anon_cases.cancel_reason IS 'เหตุผลที่ยกเลิกเคส (status=cancelled)';
