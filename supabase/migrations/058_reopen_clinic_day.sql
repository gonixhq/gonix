-- ════════════════════════════════════════════════════════════
-- 058: ยกเลิกการปิดยอด (เปิดวันใหม่) — แก้กรณีปิดผิด/ปิดก่อนยอดครบ
-- ════════════════════════════════════════════════════════════
-- ลบ record การปิดยอดของวันนั้น + คืนค่า counter (VN/QUEUE) จาก snapshot
-- ที่เก็บไว้ตอนปิด → ทำให้กลับมา "ยังไม่ปิด" แล้วปิดใหม่ได้ (snapshot ใหม่)
-- ใช้ GREATEST กันกรณีมี visit ใหม่เกิดหลังปิด (ไม่ดึง counter ถอยหลัง)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_reopen_clinic_day(
    p_clinic_id  uuid,
    p_close_date date
) RETURNS void AS $$
DECLARE
    v_vn_last    int;
    v_queue_last int;
BEGIN
    SELECT vn_last_number, queue_last_number
      INTO v_vn_last, v_queue_last
      FROM clinic_day_closes
     WHERE clinic_id = p_clinic_id AND close_date = p_close_date;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_CLOSED';
    END IF;

    -- คืนค่า counter จาก snapshot (เลขที่ออกไปแล้วเดินต่อจากเดิม)
    UPDATE running_numbers
       SET last_number = GREATEST(last_number, COALESCE(v_vn_last, 0))
     WHERE clinic_id = p_clinic_id AND number_type = 'VN';

    UPDATE running_numbers
       SET last_number = GREATEST(last_number, COALESCE(v_queue_last, 0))
     WHERE clinic_id = p_clinic_id AND number_type = 'QUEUE';

    -- ลบ record การปิดยอด → กลับสู่สถานะ "ยังไม่ปิด"
    DELETE FROM clinic_day_closes
     WHERE clinic_id = p_clinic_id AND close_date = p_close_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_reopen_clinic_day IS 'ยกเลิกการปิดยอดของวัน + คืนค่า counter จาก snapshot. Raises NOT_CLOSED ถ้าวันนั้นยังไม่ได้ปิด';
