-- ════════════════════════════════════════════════════════════
-- 032: ระบบปิดยอดประจำวัน (End of Day Close)
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   1. เก็บ snapshot การปิดยอดแต่ละวันใน clinic_day_closes
--   2. เปลี่ยน fn_next_number ให้ใช้ reset_period='manual' สำหรับ QUEUE/VN
--      (ไม่ auto-reset ตามวันที่ — รอ EOD เท่านั้น)
--   3. เพิ่ม fn_close_clinic_day() function สำหรับปิดยอด+reset
-- ════════════════════════════════════════════════════════════

-- ── ตาราง clinic_day_closes ──
CREATE TABLE IF NOT EXISTS clinic_day_closes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    close_date      date NOT NULL,
    closed_at       timestamptz NOT NULL DEFAULT now(),
    closed_by       uuid REFERENCES profiles(id),

    -- Summary
    total_visits            int NOT NULL DEFAULT 0,
    total_visits_completed  int NOT NULL DEFAULT 0,
    total_visits_cancelled  int NOT NULL DEFAULT 0,
    total_revenue           numeric(12,2) NOT NULL DEFAULT 0,

    -- Counter snapshots (ก่อน reset)
    vn_last_number      int,
    queue_last_number   int,

    notes text,

    UNIQUE (clinic_id, close_date)
);

CREATE INDEX IF NOT EXISTS idx_clinic_day_closes_clinic_date
    ON clinic_day_closes (clinic_id, close_date DESC);

COMMENT ON TABLE clinic_day_closes IS 'บันทึกการปิดยอดประจำวันของแต่ละคลินิก — snapshot สรุปยอด + reset running numbers';
COMMENT ON COLUMN clinic_day_closes.close_date IS 'วันที่ของยอดที่ปิด (ไม่จำเป็นต้องตรงกับ closed_at)';
COMMENT ON COLUMN clinic_day_closes.vn_last_number IS 'ค่า running number VN ก่อน reset';
COMMENT ON COLUMN clinic_day_closes.queue_last_number IS 'ค่า running number QUEUE ก่อน reset';

-- ── RLS ──
ALTER TABLE clinic_day_closes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_day_closes_select ON clinic_day_closes;
CREATE POLICY clinic_day_closes_select ON clinic_day_closes
    FOR SELECT USING (
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS clinic_day_closes_insert ON clinic_day_closes;
CREATE POLICY clinic_day_closes_insert ON clinic_day_closes
    FOR INSERT WITH CHECK (
        clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    );

-- ── เปลี่ยน reset_period สำหรับ QUEUE/VN เป็น 'manual' ──
-- (เก็บ types อื่นเป็น daily ไว้)
UPDATE running_numbers
   SET reset_period = 'manual'
 WHERE number_type IN ('QUEUE', 'VN');

-- ── Update fn_next_number ให้รองรับ 'manual' (ไม่ auto-reset) ──
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
             -- daily: reset ตามวันที่ (Asia/Bangkok)
             WHEN reset_period = 'daily'
              AND last_reset_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date THEN 1
             -- manual: ไม่ auto-reset (รอ EOD)
             ELSE last_number + 1
           END,
           last_reset_date = CASE
             WHEN reset_period = 'daily'
              AND last_reset_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
             THEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
             ELSE last_reset_date
           END
     WHERE clinic_id = p_clinic_id AND number_type = p_type
     RETURNING last_number, pad_length INTO v_next, v_pad;

    IF NOT FOUND THEN
        -- type ใหม่ที่ยังไม่เคยมี → default 'manual' สำหรับ QUEUE/VN, อื่นๆ 'daily'
        INSERT INTO running_numbers(clinic_id, number_type, prefix, last_number, last_reset_date, pad_length, reset_period)
        VALUES (
            p_clinic_id, p_type, v_prefix, 1,
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,
            CASE WHEN p_type = 'QUEUE' THEN 2 ELSE 4 END,
            CASE WHEN p_type IN ('QUEUE', 'VN') THEN 'manual' ELSE 'daily' END
        )
        RETURNING last_number, pad_length INTO v_next, v_pad;
    END IF;

    RETURN v_prefix || LPAD(v_next::text, COALESCE(v_pad, 4), '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── fn_close_clinic_day: ปิดยอด + reset counters (atomic) ──
CREATE OR REPLACE FUNCTION fn_close_clinic_day(
    p_clinic_id  uuid,
    p_close_date date,
    p_closed_by  uuid,
    p_notes      text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_close_id              uuid;
    v_total_visits          int;
    v_total_completed       int;
    v_total_cancelled       int;
    v_total_revenue         numeric(12,2);
    v_vn_last               int;
    v_queue_last            int;
    v_pending_count         int;
BEGIN
    -- ── 1. Block ถ้ามี visit ค้าง ──
    SELECT count(*) INTO v_pending_count
      FROM visits
     WHERE clinic_id = p_clinic_id
       AND visit_date = p_close_date
       AND status IN ('waiting', 'triaged', 'with_doctor', 'waiting_medicine', 'waiting_payment');

    IF v_pending_count > 0 THEN
        RAISE EXCEPTION 'PENDING_VISITS:%', v_pending_count;
    END IF;

    -- ── 2. Block ถ้าวันนี้ปิดไปแล้ว ──
    IF EXISTS (
        SELECT 1 FROM clinic_day_closes
         WHERE clinic_id = p_clinic_id AND close_date = p_close_date
    ) THEN
        RAISE EXCEPTION 'ALREADY_CLOSED';
    END IF;

    -- ── 3. คำนวณสรุปยอด ──
    SELECT
        count(*),
        count(*) FILTER (WHERE status = 'completed'),
        count(*) FILTER (WHERE status = 'cancelled')
      INTO v_total_visits, v_total_completed, v_total_cancelled
      FROM visits
     WHERE clinic_id = p_clinic_id
       AND visit_date = p_close_date;

    -- รายได้: รวมจาก invoice_headers ที่ paid ของวันนี้
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_total_revenue
      FROM invoice_headers
     WHERE clinic_id = p_clinic_id
       AND invoice_date = p_close_date
       AND status = 'paid';

    -- ── 4. Snapshot counters ก่อน reset ──
    SELECT last_number INTO v_vn_last
      FROM running_numbers
     WHERE clinic_id = p_clinic_id AND number_type = 'VN';

    SELECT last_number INTO v_queue_last
      FROM running_numbers
     WHERE clinic_id = p_clinic_id AND number_type = 'QUEUE';

    -- ── 5. Insert close record ──
    INSERT INTO clinic_day_closes (
        clinic_id, close_date, closed_by,
        total_visits, total_visits_completed, total_visits_cancelled,
        total_revenue, vn_last_number, queue_last_number, notes
    ) VALUES (
        p_clinic_id, p_close_date, p_closed_by,
        v_total_visits, v_total_completed, v_total_cancelled,
        v_total_revenue, COALESCE(v_vn_last, 0), COALESCE(v_queue_last, 0), p_notes
    )
    RETURNING id INTO v_close_id;

    -- ── 6. Reset counters ──
    UPDATE running_numbers
       SET last_number = 0,
           last_reset_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
     WHERE clinic_id = p_clinic_id
       AND number_type IN ('QUEUE', 'VN');

    RETURN v_close_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_close_clinic_day IS 'ปิดยอดประจำวัน + reset QUEUE/VN counters. Raises PENDING_VISITS:<count> หรือ ALREADY_CLOSED';

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT number_type, reset_period, last_number FROM running_numbers;
--   SELECT * FROM clinic_day_closes ORDER BY close_date DESC;
--   SELECT fn_close_clinic_day('<clinic_id>', CURRENT_DATE, '<user_id>', 'test');
-- ════════════════════════════════════════════════════════════
