-- ============================================================
-- 008_hn_format_change.sql
-- เปลี่ยน format HN จาก HN-0006 → HN690001
-- Format: HN + 2 หลักปี พ.ศ. + 4 หลักลำดับ (ไม่มี -)
-- ============================================================
-- Run นี้ใน Supabase SQL Editor

-- ── Step 1: Update fn_next_number เฉพาะ HN ให้ใช้ปี พ.ศ. ──
CREATE OR REPLACE FUNCTION fn_next_number(
  p_clinic_id uuid,
  p_type text,
  p_prefix text DEFAULT NULL
) RETURNS text AS $$
DECLARE
  v_prefix text;
  v_next   int;
  v_date   text := to_char(CURRENT_DATE, 'YYYYMMDD');
  v_be_year text;
BEGIN
  -- For HN: use BE year format (HN + 2-digit BE year + 4-digit seq)
  IF p_type = 'HN' THEN
    v_be_year := LPAD(((EXTRACT(YEAR FROM CURRENT_DATE) + 543) % 100)::text, 2, '0');
    v_prefix := 'HN' || v_be_year;
  ELSE
    v_prefix := COALESCE(p_prefix, p_type || '-' || v_date || '-');
  END IF;

  UPDATE running_numbers
  SET last_number = CASE
        WHEN reset_period = 'daily' AND last_reset_date < CURRENT_DATE THEN 1
        ELSE last_number + 1
      END,
      last_reset_date = CASE
        WHEN reset_period = 'daily' AND last_reset_date < CURRENT_DATE
        THEN CURRENT_DATE ELSE last_reset_date END
  WHERE clinic_id = p_clinic_id AND number_type = p_type
  RETURNING last_number INTO v_next;

  IF NOT FOUND THEN
    INSERT INTO running_numbers(clinic_id, number_type, prefix, last_number, last_reset_date)
    VALUES (p_clinic_id, p_type, v_prefix, 1, CURRENT_DATE)
    RETURNING last_number INTO v_next;
  END IF;

  RETURN v_prefix || LPAD(v_next::text, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Step 2: Update running_numbers prefix (ไม่มี - แล้ว) ──
UPDATE running_numbers 
SET prefix = 'HN'
WHERE number_type = 'HN';

-- ── Step 3: Update existing patient HNs to new format ──
-- (Optional: convert HN-00001 → HN690001 etc.)
-- If you want to keep old format, skip this step.
-- UPDATE patients 
-- SET hn = 'HN69' || LPAD(SUBSTRING(hn FROM '\d+')::text, 4, '0')
-- WHERE hn LIKE 'HN-%';

-- ============================================================
-- ✅ เสร็จ! HN ใหม่จะเป็น HN690001, HN690002, ...
-- (69 = ปี พ.ศ. 2569)
-- ============================================================
