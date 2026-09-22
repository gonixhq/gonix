-- ════════════════════════════════════════════════════════════
-- 139: กัน VN ชนกัน (duplicate key visits_pkey) ตอนสร้าง Visit
-- ════════════════════════════════════════════════════════════
-- อาการ: "Visit insert: duplicate key value violates unique constraint visits_pkey"
-- สาเหตุ: running_numbers (counter VN) ตามหลัง VN จริงของ prefix วันนี้
--         (data drift / restore / race / คร่อม timezone UTC↔Bangkok) → fn_next_number
--         คืนเลขที่มีอยู่แล้ว
-- แก้: หลังดึงเลขจาก counter ตามปกติ → ถ้าเป็น VN และเลขนั้น "≤ เลขมากสุดที่มีจริง"
--      ของ prefix วันนี้ → ขยับ counter ไปเลยตัวมากสุด (self-heal) รับประกันไม่ซ้ำ
--   • HN / QUEUE คงพฤติกรรมเดิมทุกอย่าง (คัดลอกจาก 056)
--   • serialize ด้วย row-lock ของ running_numbers อยู่แล้ว → ไม่มี race ในคลินิกเดียว
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
  v_maxseq int;
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

  -- ── กันชนเฉพาะ VN: counter ต้องมากกว่าเลขมากสุดที่มีจริงของ prefix วันนี้เสมอ ──
  IF p_type = 'VN' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(vn, '-', 3), '\D', '', 'g'), '')::int), 0)
      INTO v_maxseq
      FROM visits
     WHERE clinic_id = p_clinic_id AND vn LIKE v_prefix || '%';
    IF v_maxseq >= v_next THEN
      v_next := v_maxseq + 1;
      UPDATE running_numbers SET last_number = v_next
       WHERE clinic_id = p_clinic_id AND number_type = p_type;
    END IF;
  END IF;

  RETURN v_prefix || LPAD(v_next::text, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
