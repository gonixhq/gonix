-- ════════════════════════════════════════════════════════════
-- 108: แก้ link_line_account — patients ไม่มีคอลัมน์ id (PK คือ hn)
-- ════════════════════════════════════════════════════════════
-- เดิม: UPDATE patients ... WHERE id = v.id
--       patients.hn คือ primary key จริง ไม่มีคอลัมน์ id เลย
--       ทำให้ UPDATE ล้มเหลวทุกครั้ง (error หลุดไปโผล่เป็น "ระบบขัดข้อง"
--       ที่ lib/actions/line-link.ts เพราะ .rpc() คืน error แบบไม่เจาะจง)
-- ใหม่: ระบุแถวด้วย clinic_id + hn ที่ query มาแล้วแทน
-- ════════════════════════════════════════════════════════════

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
     WHERE clinic_id = v.clinic_id AND hn = v.hn;

    RETURN jsonb_build_object('ok', true, 'name', trim(coalesce(v.first_name,'') || ' ' || coalesce(v.last_name,'')));
END;
$$;

GRANT EXECUTE ON FUNCTION link_line_account(uuid, text, text, text, text) TO anon, authenticated;
