-- ════════════════════════════════════════════════════════════
-- 054: Online Result Portal — ให้คนไข้เช็คผลเองด้วย Verify Code + เบอร์ 4 ตัวท้าย
-- ════════════════════════════════════════════════════════════
-- ใช้ security-definer function แทนการเปิด RLS อ่าน (กันอ่านข้อมูลมั่ว):
--   - get_anon_result(code, phone4) → คืนผล "เฉพาะ" เคสที่ code + เบอร์ 4 ตัวท้ายตรง
--   - request_anon_followup(code, phone4) → คนไข้ขอนัดหมายพบแพทย์ (set flag)
-- ════════════════════════════════════════════════════════════

ALTER TABLE anon_cases
    ADD COLUMN IF NOT EXISTS followup_requested boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS followup_at        timestamptz;

COMMENT ON COLUMN anon_cases.followup_requested IS 'ผู้รับบริการขอนัดหมายพบแพทย์ผ่านหน้าเช็คผลออนไลน์';

-- ── อ่านผล (verify ด้วย code + เบอร์ 4 ตัวท้าย) ──
CREATE OR REPLACE FUNCTION get_anon_result(p_code text, p_phone4 text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v anon_cases;
    v_tests jsonb;
    v_clinic record;
BEGIN
    SELECT * INTO v FROM anon_cases
     WHERE verify_code = upper(trim(p_code))
     LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;

    IF coalesce(v.contact_phone, '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_phone');
    END IF;
    IF right(regexp_replace(v.contact_phone, '\D', '', 'g'), 4) <> p_phone4 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'verify_failed');
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'test_name', t.test_name,
        'item_type', t.item_type,
        'result_status', t.result_status,
        'result_value', t.result_value
    ) ORDER BY t.created_at), '[]'::jsonb)
    INTO v_tests
    FROM anon_case_tests t WHERE t.case_id = v.id;

    SELECT clinic_name, phone INTO v_clinic FROM tenants WHERE id = v.clinic_id;

    RETURN jsonb_build_object(
        'ok', true,
        'code', v.verify_code,
        'status', v.status,
        'case_date', v.case_date,
        'result_appt_date', v.result_appt_date,
        'paid', v.paid,
        'followup_requested', v.followup_requested,
        'clinic_name', v_clinic.clinic_name,
        'clinic_phone', v_clinic.phone,
        'tests', v_tests
    );
END;
$$;

-- ── ขอนัดหมายพบแพทย์ ──
CREATE OR REPLACE FUNCTION request_anon_followup(p_code text, p_phone4 text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v anon_cases;
BEGIN
    SELECT * INTO v FROM anon_cases WHERE verify_code = upper(trim(p_code)) LIMIT 1;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
    IF coalesce(v.contact_phone, '') = '' OR right(regexp_replace(v.contact_phone, '\D', '', 'g'), 4) <> p_phone4 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'verify_failed');
    END IF;

    UPDATE anon_cases SET followup_requested = true, followup_at = now() WHERE id = v.id;
    RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION get_anon_result(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION request_anon_followup(text, text) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT get_anon_result('3A8RVS', '4993');
-- ════════════════════════════════════════════════════════════
