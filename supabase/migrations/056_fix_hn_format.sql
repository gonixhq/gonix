-- ════════════════════════════════════════════════════════════
-- 056: แก้ format HN ให้สั้น (re-apply จาก 008 — เผื่อ DB จริงยังเป็นของเก่า)
-- ════════════════════════════════════════════════════════════
-- เดิม HN ออกมาเป็น HN-20260620-0007 (ยาว) เพราะฟังก์ชันบน DB ยังเป็นเวอร์ชันเก่า
-- ใหม่: HN + 2 หลักปี พ.ศ. + 4 หลักลำดับ → เช่น HN690008 (สั้น)
--      ประเภทอื่น (VN ฯลฯ) คงรูปแบบเดิม
-- ════════════════════════════════════════════════════════════

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
  -- HN: ใช้ปี พ.ศ. 2 หลัก + ลำดับ 4 หลัก (HN690008)
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

-- prefix ของ HN ใน running_numbers (ฟังก์ชันไม่ใช้แล้ว แต่ตั้งให้ตรง)
UPDATE running_numbers SET prefix = 'HN' WHERE number_type = 'HN';

-- ════════════════════════════════════════════════════════════
-- (ทางเลือก) แปลง HN เก่าแบบยาวให้เป็นแบบสั้น — รันเฉพาะถ้าต้องการ
-- ⚠️ HN ถูกใช้อ้างอิงในหลายตาราง (visits/invoices ฯลฯ) — ปกติไม่ควรแก้ของเก่า
-- UPDATE patients
--   SET hn = 'HN' || LPAD(((EXTRACT(YEAR FROM CURRENT_DATE)+543)%100)::text,2,'0')
--            || LPAD(SUBSTRING(hn FROM '(\d+)$')::text, 4, '0')
--   WHERE hn LIKE 'HN-%';
-- ════════════════════════════════════════════════════════════
