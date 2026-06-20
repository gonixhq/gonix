-- ════════════════════════════════════════════════════════════
-- 028: Deleted HN Log + Prevent HN Reuse
-- ════════════════════════════════════════════════════════════
-- เก็บ HN ที่ถูกลบเพื่อกัน fn_next_number สร้าง HN ซ้ำ
-- + ปรับ fn_next_number ให้ skip HN ที่อยู่ใน patients หรือ deleted_hn_log

-- ── 1. ตาราง deleted_hn_log ──
CREATE TABLE IF NOT EXISTS deleted_hn_log (
  hn                    text PRIMARY KEY,                -- HN ที่ถูกลบ
  clinic_id             uuid REFERENCES tenants(id) ON DELETE CASCADE,
  deleted_by            uuid REFERENCES profiles(id),
  deleted_at            timestamptz DEFAULT (now() AT TIME ZONE 'Asia/Bangkok'),
  original_patient_name text                              -- เพื่อ trace กลับได้
);

CREATE INDEX IF NOT EXISTS idx_deleted_hn_clinic ON deleted_hn_log(clinic_id);
CREATE INDEX IF NOT EXISTS idx_deleted_hn_deleted_at ON deleted_hn_log(deleted_at DESC);

ALTER TABLE deleted_hn_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deleted_hn_log_clinic_isolation ON deleted_hn_log;
CREATE POLICY deleted_hn_log_clinic_isolation ON deleted_hn_log
  FOR ALL
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ── 2. ปรับ fn_next_number ให้ skip HN ที่เคยใช้ (patients + deleted_hn_log) ──
CREATE OR REPLACE FUNCTION fn_next_number(
  p_clinic_id uuid,
  p_type      text,
  p_prefix    text DEFAULT NULL
) RETURNS text AS $$
DECLARE
  v_prefix    text;
  v_next      int;
  v_pad       int;
  v_date      text := to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date, 'YYYYMMDD');
  v_be_year   text;
  v_candidate text;
  v_max_loop  int := 0;
BEGIN
  -- Build prefix (HN ใช้ปี พ.ศ.)
  IF p_type = 'HN' THEN
    v_be_year := LPAD(((EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) + 543) % 100)::text, 2, '0');
    v_prefix := 'HN' || v_be_year;
  ELSE
    v_prefix := COALESCE(p_prefix, p_type || '-' || v_date || '-');
  END IF;

  -- Get or create running_numbers row + increment
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

  v_candidate := v_prefix || LPAD(v_next::text, COALESCE(v_pad, 4), '0');

  -- 🔒 ถ้าเป็น HN — ตรวจสอบว่า candidate ไม่เคยถูกใช้ (active หรือ deleted)
  IF p_type = 'HN' THEN
    WHILE (
      EXISTS (SELECT 1 FROM patients WHERE hn = v_candidate)
      OR EXISTS (SELECT 1 FROM deleted_hn_log WHERE hn = v_candidate)
    ) AND v_max_loop < 1000 LOOP
      v_max_loop := v_max_loop + 1;
      -- Increment running number
      UPDATE running_numbers
         SET last_number = last_number + 1
       WHERE clinic_id = p_clinic_id AND number_type = p_type
       RETURNING last_number INTO v_next;
      v_candidate := v_prefix || LPAD(v_next::text, COALESCE(v_pad, 4), '0');
    END LOOP;

    IF v_max_loop >= 1000 THEN
      RAISE EXCEPTION 'fn_next_number: HN exhausted after 1000 attempts (last candidate: %)', v_candidate;
    END IF;
  END IF;

  RETURN v_candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE deleted_hn_log IS 'บันทึก HN ที่เคยถูกลบ — กัน fn_next_number reuse HN เดิม';
COMMENT ON FUNCTION fn_next_number IS 'สร้าง running number; สำหรับ HN จะ skip ที่มีใน patients หรือ deleted_hn_log';

-- ════════════════════════════════════════════════════════════
-- ✅ เสร็จ! ตอนนี้:
-- 1. ลบผู้ป่วยใหม่ → server action จะ insert HN ลง deleted_hn_log
-- 2. สร้างผู้ป่วยใหม่ → fn_next_number จะ skip HN ที่อยู่ใน deleted_hn_log
-- 3. HN จะไม่มีทาง reuse ซ้ำ
-- ════════════════════════════════════════════════════════════
