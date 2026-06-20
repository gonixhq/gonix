-- ════════════════════════════════════════════════════════════
-- 055: เชื่อมบัญชี LINE ของคนไข้กับข้อมูลผู้ป่วย (HN)
-- ════════════════════════════════════════════════════════════
-- - patients.line_user_id : LINE userId ที่ผูกไว้ (ใช้ push แจ้งเตือน)
-- - RPC link_line_account  : ผูกบัญชีจากหน้า LIFF (verify ด้วย HN + เบอร์ 4 ตัวท้าย)
--   ใช้ security-definer ให้หน้า public (LIFF) เรียกได้โดยไม่เปิด RLS อ่าน patients มั่ว
-- ════════════════════════════════════════════════════════════

ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS line_user_id      text,
    ADD COLUMN IF NOT EXISTS line_display_name text,
    ADD COLUMN IF NOT EXISTS line_linked_at    timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_line_uid
    ON patients (clinic_id, line_user_id) WHERE line_user_id IS NOT NULL;

COMMENT ON COLUMN patients.line_user_id IS 'LINE userId ที่ผูกไว้ (สำหรับส่งแจ้งเตือน)';

CREATE OR REPLACE FUNCTION link_line_account(
    p_clinic uuid, p_line_uid text, p_display text, p_hn text, p_phone4 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v patients;
BEGIN
    SELECT * INTO v FROM patients
     WHERE clinic_id = p_clinic AND upper(trim(hn)) = upper(trim(p_hn))
     LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;
    IF coalesce(v.phone, '') = '' OR right(regexp_replace(v.phone, '\D', '', 'g'), 4) <> p_phone4 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'verify_failed');
    END IF;

    UPDATE patients
       SET line_user_id = p_line_uid, line_display_name = p_display, line_linked_at = now()
     WHERE id = v.id;

    RETURN jsonb_build_object('ok', true, 'name', trim(coalesce(v.first_name,'') || ' ' || coalesce(v.last_name,'')));
END;
$$;

GRANT EXECUTE ON FUNCTION link_line_account(uuid, text, text, text, text) TO anon, authenticated;
