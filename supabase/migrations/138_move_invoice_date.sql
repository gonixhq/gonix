-- ════════════════════════════════════════════════════════════
-- 138: เครื่องมือ "ย้ายวันลงบัญชี" ของบิลที่จ่ายแล้ว (owner/admin เท่านั้น)
-- ════════════════════════════════════════════════════════════
-- ย้าย invoice_date + bill_date + payment_logs.paid_at พร้อมกันแบบ atomic
--   → ยอดรวม EOD (invoice_date) + breakdown เงินสด/โอน (paid_at) ย้ายตรงกันทั้งคู่
-- ล็อก: เฉพาะ owner/admin · ห้ามวันอนาคต · ทั้งวันเดิม+วันใหม่ต้อง "ยังไม่ปิดยอด" · เก็บ audit
-- หมายเหตุ: การย้ายนี้ย้ายรายได้/คอมมิชชั่น/รายงานของบิลไปวันใหม่ (ตั้งใจ)
-- ════════════════════════════════════════════════════════════

-- 1) ผ่อน trigger bill_date immutable — อนุญาตแก้ bill_date เฉพาะเมื่อมาจาก RPC นี้
--    (RPC ตั้ง GUC gonix.allow_bill_date_change='1' ในทรานแซกชันเดียว) · write path อื่นยังบล็อกเหมือนเดิม
CREATE OR REPLACE FUNCTION fn_bill_date_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.bill_date IS DISTINCT FROM OLD.bill_date
       AND coalesce(current_setting('gonix.allow_bill_date_change', true), '') <> '1' THEN
        RAISE EXCEPTION 'BILL_DATE_IMMUTABLE: bill_date แก้ไม่ได้หลังสร้างใบเสร็จ (กำหนดได้เฉพาะตอนออกบิล หรือย้ายวันผ่านเครื่องมือ owner/admin)';
    END IF;
    RETURN NEW;
END $$;

-- 2) RPC ย้ายวันลงบัญชี — SECURITY DEFINER + guard ครบ
CREATE OR REPLACE FUNCTION fn_move_invoice_date(p_inv_id text, p_new_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role   text;
    v_clinic uuid;
    v_user_clinic uuid;
    v_old    date;
    v_status text;
    v_today  date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
    -- role: owner/admin เท่านั้น
    SELECT role::text, clinic_id INTO v_role, v_user_clinic FROM profiles WHERE id = auth.uid();
    IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ย้ายวันลงบัญชีได้เฉพาะเจ้าของ/ผู้จัดการ (owner/admin)');
    END IF;

    SELECT clinic_id, invoice_date, status INTO v_clinic, v_old, v_status
    FROM invoice_headers WHERE id = p_inv_id;
    IF v_clinic IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ไม่พบใบเสร็จ');
    END IF;
    IF v_clinic <> v_user_clinic THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ไม่มีสิทธิ์กับใบเสร็จนี้');
    END IF;
    IF v_status IN ('voided', 'refunded') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ใบเสร็จนี้ปิดแล้ว (void/refund) แก้วันไม่ได้');
    END IF;
    IF p_new_date > v_today THEN
        RETURN jsonb_build_object('ok', false, 'error', 'วันที่ต้องไม่เกินวันนี้ (ห้ามลงวันอนาคต)');
    END IF;
    IF p_new_date = v_old THEN
        RETURN jsonb_build_object('ok', true);
    END IF;
    IF EXISTS (SELECT 1 FROM clinic_day_closes WHERE clinic_id = v_clinic AND close_date = v_old) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'วันเดิม (' || v_old || ') ปิดยอดแล้ว — ต้อง reopen ก่อน');
    END IF;
    IF EXISTS (SELECT 1 FROM clinic_day_closes WHERE clinic_id = v_clinic AND close_date = p_new_date) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'วันใหม่ (' || p_new_date || ') ปิดยอดแล้ว — ต้อง reopen ก่อน');
    END IF;

    -- อนุญาตแก้ bill_date เฉพาะในทรานแซกชันนี้
    PERFORM set_config('gonix.allow_bill_date_change', '1', true);

    UPDATE invoice_headers
       SET invoice_date = p_new_date, bill_date = p_new_date, updated_at = now()
     WHERE id = p_inv_id;

    -- ย้าย paid_at ไปวันใหม่ (คงเวลานาฬิกาแบบเวลาไทย) → breakdown เงินสด/โอน ย้ายตาม
    UPDATE payment_logs
       SET paid_at = ((p_new_date::text || ' ' || to_char((paid_at AT TIME ZONE 'Asia/Bangkok'), 'HH24:MI:SS'))::timestamp AT TIME ZONE 'Asia/Bangkok')
     WHERE inv_id = p_inv_id;

    PERFORM set_config('gonix.allow_bill_date_change', '0', true);

    INSERT INTO audit_logs (clinic_id, table_name, record_id, action, old_data, new_data, performed_by)
    VALUES (v_clinic, 'invoice_headers', p_inv_id, 'invoice_date_change',
            jsonb_build_object('invoice_date', v_old),
            jsonb_build_object('invoice_date', p_new_date, 'reason', 'ย้ายวันลงบัญชี: ' || v_old || ' → ' || p_new_date),
            auth.uid());

    RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION fn_move_invoice_date(text, date) TO authenticated;
