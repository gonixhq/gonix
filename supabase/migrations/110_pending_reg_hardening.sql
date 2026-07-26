-- ════════════════════════════════════════════════════════════
-- 110: ปิดช่องโหว่ลงทะเบียนสาธารณะ (P12 / finding #4)
-- ════════════════════════════════════════════════════════════
-- เดิม: หน้า /register/[clinicCode] insert เข้า pending_registrations
--       ด้วย anon key ตรงๆ · policy pending_reg_public_insert เช็คแค่
--       status='pending' ไม่ pin clinic_id → anon ยัด clinic_id ไหนก็ได้
--       (สแปมคิวคลินิกอื่นด้วยแถวที่มีเลขบัตร ปชช.) + ไม่มี rate limit
-- ใหม่: บังคับผ่าน RPC security-definer — clinic_id มาจาก clinic_code
--       (ตั้งเองไม่ได้) + rate limit ต่อ IP + whitelist field
--       แล้ว DROP policy anon insert (ปิดทางเขียนตรง)
-- ════════════════════════════════════════════════════════════

-- ── ตารางนับจำนวนคำขอต่อ IP (เข้าถึงเฉพาะผ่าน security-definer) ──
CREATE TABLE IF NOT EXISTS pending_reg_rl (
    ip           text PRIMARY KEY,
    req_count    int NOT NULL DEFAULT 0,
    window_start timestamptz NOT NULL DEFAULT now(),
    locked_until timestamptz
);
ALTER TABLE pending_reg_rl ENABLE ROW LEVEL SECURITY;

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
    c_max      constant int := 5;                     -- คำขอสูงสุดต่อหน้าต่าง
    c_window   constant interval := interval '10 minutes';
    c_lock     constant interval := interval '15 minutes';
BEGIN
    -- ── resolve clinic จาก code (ตั้ง clinic_id เองไม่ได้) ──
    SELECT id INTO v_clinic FROM tenants WHERE clinic_code = upper(trim(p_clinic_code)) LIMIT 1;
    IF v_clinic IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'clinic_not_found');
    END IF;

    -- ── required fields ──
    IF coalesce(nullif(trim(p_data->>'first_name'), ''), '') = ''
       OR coalesce(nullif(trim(p_data->>'last_name'), ''), '') = ''
       OR coalesce(nullif(trim(p_data->>'phone'), ''), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'missing_required');
    END IF;

    -- ── rate-limit gate (นับจำนวนคำขอ ไม่ใช่ fail) ──
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

    -- ── insert (clinic_id จาก server, status บังคับ pending, whitelist field) ──
    INSERT INTO pending_registrations (
        clinic_id, source, status,
        prefix, first_name, last_name, dob, gender, thai_id_card, phone, email,
        line_user_id, blood_group, marital_status, occupation, race, nationality,
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
        nullif(trim(p_data->>'line_user_id'), ''),
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

-- ── ปิดทางเขียนตรงด้วย anon key (บังคับผ่าน RPC เท่านั้น) ──
DROP POLICY IF EXISTS pending_reg_public_insert ON pending_registrations;

-- ════════════════════════════════════════════════════════════
-- Verification:
--   -- ลงทะเบียนผ่าน RPC (code ถูก) → ok:true + id
--   SELECT submit_pending_registration('<CLINIC_CODE>',
--     '{"first_name":"ทดสอบ","last_name":"ระบบ","phone":"0812345678"}'::jsonb, '1.2.3.4');
--   -- insert ตรงด้วย anon key ตอนนี้ → ถูกปฏิเสธ (ไม่มี policy insert แล้ว)
--   -- ยิงเกิน 5 ครั้ง/10 นาที จาก IP เดิม → rate_limited
-- ════════════════════════════════════════════════════════════
