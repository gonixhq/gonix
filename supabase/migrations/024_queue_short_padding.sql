-- ============================================================
-- 024_queue_short_padding.sql
-- ลด queue padding จาก 4 หลัก (A0001) → 2 หลัก (A01)
-- คนไข้ต่อวัน < 99 ไม่ต้องการ 4 หลัก
-- + เพิ่ม pad_length ใน running_numbers เพื่อให้ปรับแยกต่อ type ได้
-- Run AFTER 023_fix_timezone_defaults.sql
-- ============================================================

-- ── เพิ่ม pad_length column ──
ALTER TABLE running_numbers
  ADD COLUMN IF NOT EXISTS pad_length int NOT NULL DEFAULT 4;

-- ── ตั้ง QUEUE = 2 หลัก, type อื่นๆ keep 4 ──
UPDATE running_numbers SET pad_length = 2 WHERE number_type = 'QUEUE';

-- ── Update fn_next_number ให้ใช้ pad_length ──
CREATE OR REPLACE FUNCTION fn_next_number(
  p_clinic_id uuid,
  p_type      text,
  p_prefix    text DEFAULT NULL
) RETURNS text AS $$
DECLARE
  v_prefix  text;
  v_next    int;
  v_pad     int;
  v_date    text := to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date, 'YYYYMMDD');
BEGIN
  v_prefix := COALESCE(p_prefix, p_type || '-' || v_date || '-');

  UPDATE running_numbers
     SET last_number = CASE
           WHEN reset_period = 'daily' AND last_reset_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date THEN 1
           ELSE last_number + 1
         END,
         last_reset_date = CASE
           WHEN reset_period = 'daily' AND last_reset_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
           THEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
           ELSE last_reset_date
         END
   WHERE clinic_id = p_clinic_id AND number_type = p_type
   RETURNING last_number, pad_length INTO v_next, v_pad;

  IF NOT FOUND THEN
    INSERT INTO running_numbers(clinic_id, number_type, prefix, last_number, last_reset_date, pad_length)
    VALUES (p_clinic_id, p_type, v_prefix, 1,
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,
            CASE WHEN p_type = 'QUEUE' THEN 2 ELSE 4 END)
    RETURNING last_number, pad_length INTO v_next, v_pad;
  END IF;

  RETURN v_prefix || LPAD(v_next::text, COALESCE(v_pad, 4), '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Backfill: แปลง queue_number ของแถวเก่าจาก A0001 → A01 ──
-- ถ้าเป็น prefix + 4 หลัก ที่ขึ้นต้นด้วย "00" → ตัด "00" ออก
UPDATE queue_entries
   SET queue_number = regexp_replace(queue_number, '^([A-Z])00([0-9]{2})$', '\1\2')
 WHERE queue_number ~ '^[A-Z]00[0-9]{2}$';

-- ============================================================
-- Verification:
--   SELECT number_type, pad_length, last_number FROM running_numbers;
--   SELECT queue_number FROM queue_entries ORDER BY created_at DESC LIMIT 5;
-- ============================================================
