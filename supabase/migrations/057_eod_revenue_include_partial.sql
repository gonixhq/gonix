-- ════════════════════════════════════════════════════════════
-- 057: ปิดยอด — นับรายได้ที่ "ชำระจริง" (paid_amount) รวมมัดจำ/partial
-- ════════════════════════════════════════════════════════════
-- เดิม: snapshot รายได้ = SUM(total_amount) เฉพาะ invoice status='paid'
--       → เงินมัดจำ (status='partial') ตกหล่นทั้งก้อน + ใช้ยอดเต็มแทนยอดที่รับจริง
-- ใหม่: snapshot รายได้ = SUM(paid_amount) ของทุก invoice วันนั้น
--       ยกเว้น voided/refunded → ตรงกับนิยามหน้ารายงาน (reports.ts)
-- (เปลี่ยนเฉพาะส่วนคำนวณรายได้ ส่วนอื่นเหมือน migration 032)
-- ════════════════════════════════════════════════════════════

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

    -- รายได้: ยอดที่ชำระจริง (paid_amount) ของทุก invoice วันนั้น รวมมัดจำ/partial
    --         ยกเว้น voided/refunded → ตรงกับหน้ารายงาน
    -- หมายเหตุ: ยอดคลินิกนิรนามถูกบวกเพิ่มตอนอ่าน (ไม่อยู่ใน invoice_headers)
    SELECT COALESCE(SUM(paid_amount), 0)
      INTO v_total_revenue
      FROM invoice_headers
     WHERE clinic_id = p_clinic_id
       AND invoice_date = p_close_date
       AND status NOT IN ('voided', 'refunded');

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
