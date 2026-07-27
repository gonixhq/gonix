-- ════════════════════════════════════════════════════════════
-- 112: แยก LINE handle (ที่ staff พิมพ์) ออกจาก platform userId (P18)
-- ════════════════════════════════════════════════════════════
-- ปัญหา: staff พิมพ์ LINE ID ที่คนอ่านได้ (เช่น "@somchai", "gotzillx")
--        ลงช่อง patients.line_user_id ตอนลงทะเบียน
--        แต่คอลัมน์นั้นต้องเก็บ "platform userId" (U + 32 hex) ที่ LIFF ตั้งให้
--        ใช้ push แจ้งเตือน → ค่าที่ staff พิมพ์ทำให้ push ล้ม + index ชนกันได้
-- ใหม่: เพิ่ม line_id_handle เก็บ handle ที่ staff กรอก (ไว้ติดต่อ/อ้างอิง)
--       ย้ายค่าเดิมที่ไม่ใช่ platform uid ออกจาก line_user_id
--       line_user_id เหลือแค่ค่าจาก LIFF (หรือ null)
-- ════════════════════════════════════════════════════════════

ALTER TABLE patients              ADD COLUMN IF NOT EXISTS line_id_handle text;
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS line_id_handle text;
COMMENT ON COLUMN patients.line_id_handle IS 'LINE ID ที่คนอ่านได้ (staff กรอก) — ไว้ติดต่อ ไม่ใช้ push';
COMMENT ON COLUMN patients.line_user_id  IS 'LINE platform userId (U+32hex) จาก LIFF เท่านั้น — ใช้ push';

-- ── backfill: ค่าที่ไม่ใช่ platform uid (ไม่ตรง ^U[0-9a-f]{32}$) → ย้ายไป handle แล้ว null ออก ──
UPDATE patients
   SET line_id_handle = line_user_id, line_user_id = NULL
 WHERE line_user_id IS NOT NULL
   AND line_user_id !~ '^U[0-9a-f]{32}$';

UPDATE pending_registrations
   SET line_id_handle = line_user_id, line_user_id = NULL
 WHERE line_user_id IS NOT NULL
   AND line_user_id !~ '^U[0-9a-f]{32}$';

-- ── replace RPC ลงทะเบียนสาธารณะ (mig 110) — เขียน line_id_handle แทน line_user_id ──
CREATE OR REPLACE FUNCTION submit_pending_registration(
    p_clinic_code text, p_data jsonb, p_ip text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinic uuid;
    v_ip text := coalesce(nullif(trim(p_ip), ''), 'unknown');
    v_ws timestamptz;
    v_count int;
    v_lock timestamptz;
    v_id uuid;
    c_max      constant int := 5;
    c_window   constant interval := interval '10 minutes';
    c_lock     constant interval := interval '15 minutes';
BEGIN
    SELECT id INTO v_clinic FROM tenants WHERE clinic_code = upper(trim(p_clinic_code)) LIMIT 1;
    IF v_clinic IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'clinic_not_found');
    END IF;

    IF coalesce(nullif(trim(p_data->>'first_name'), ''), '') = ''
       OR coalesce(nullif(trim(p_data->>'last_name'), ''), '') = ''
       OR coalesce(nullif(trim(p_data->>'phone'), ''), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'missing_required');
    END IF;

    INSERT INTO pending_reg_rl(ip) VALUES (v_ip) ON CONFLICT (ip) DO NOTHING;
    SELECT window_start, req_count, locked_until INTO v_ws, v_count, v_lock FROM pending_reg_rl WHERE ip = v_ip;
    IF v_lock IS NOT NULL AND v_lock > now() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
    END IF;
    IF now() - v_ws > c_window THEN
        UPDATE pending_reg_rl SET req_count = 1, window_start = now(), locked_until = NULL WHERE ip = v_ip;
    ELSIF v_count + 1 > c_max THEN
        UPDATE pending_reg_rl SET req_count = req_count + 1, locked_until = now() + c_lock WHERE ip = v_ip;
        RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
    ELSE
        UPDATE pending_reg_rl SET req_count = req_count + 1 WHERE ip = v_ip;
    END IF;

    INSERT INTO pending_registrations (
        clinic_id, source, status,
        prefix, first_name, last_name, dob, gender, thai_id_card, phone, email,
        line_id_handle, blood_group, marital_status, occupation, race, nationality,
        address_detail, address_moo, subdistrict_code,
        allergy_summary, disease_summary,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
        pdpa_consent
    ) VALUES (
        v_clinic, 'online_form', 'pending',
        nullif(trim(p_data->>'prefix'), ''),
        trim(p_data->>'first_name'),
        trim(p_data->>'last_name'),
        nullif(p_data->>'dob', '')::date,
        nullif(trim(p_data->>'gender'), ''),
        nullif(trim(p_data->>'thai_id_card'), ''),
        trim(p_data->>'phone'),
        nullif(trim(p_data->>'email'), ''),
        nullif(trim(p_data->>'line_id_handle'), ''),
        nullif(trim(p_data->>'blood_group'), ''),
        nullif(trim(p_data->>'marital_status'), ''),
        nullif(trim(p_data->>'occupation'), ''),
        nullif(trim(p_data->>'race'), ''),
        nullif(trim(p_data->>'nationality'), ''),
        nullif(trim(p_data->>'address_detail'), ''),
        nullif(trim(p_data->>'address_moo'), ''),
        nullif(trim(p_data->>'subdistrict_code'), ''),
        nullif(trim(p_data->>'allergy_summary'), ''),
        nullif(trim(p_data->>'disease_summary'), ''),
        nullif(trim(p_data->>'emergency_contact_name'), ''),
        nullif(trim(p_data->>'emergency_contact_phone'), ''),
        nullif(trim(p_data->>'emergency_contact_relation'), ''),
        coalesce((p_data->>'pdpa_consent')::boolean, false)
    ) RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_pending_registration(text, jsonb, text) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT count(*) FROM patients WHERE line_user_id IS NOT NULL AND line_user_id !~ '^U[0-9a-f]{32}$';
--   -- ต้องได้ 0 (ไม่มี handle ค้างใน line_user_id แล้ว)
-- ════════════════════════════════════════════════════════════
