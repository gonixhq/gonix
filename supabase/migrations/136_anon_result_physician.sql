-- 136_anon_result_physician.sql
-- เพิ่ม physician (แพทย์ผู้ตรวจของคลินิก) ในผลลัพธ์ get_anon_result → ใบ PDF ฝั่งคนไข้ (/result)
-- ดึงจาก staff+profiles ที่มี license_number (role doctor/dentist/owner) — คง logic เดิมทุกอย่าง

CREATE OR REPLACE FUNCTION get_anon_result(p_code text, p_phone4 text, p_ip text DEFAULT 'unknown')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v anon_cases;
    v_tests jsonb;
    v_clinic record;
    v_doc record;
    v_ip text := coalesce(nullif(trim(p_ip), ''), 'unknown');
    v_ws timestamptz;
    v_lock timestamptz;
    c_max_fail constant int := 8;
    c_window   constant interval := interval '10 minutes';
    c_lock     constant interval := interval '15 minutes';
BEGIN
    -- ── rate-limit gate ──
    INSERT INTO anon_result_rl(ip) VALUES (v_ip) ON CONFLICT (ip) DO NOTHING;
    SELECT window_start, locked_until INTO v_ws, v_lock FROM anon_result_rl WHERE ip = v_ip;
    IF v_lock IS NOT NULL AND v_lock > now() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
    END IF;
    IF now() - v_ws > c_window THEN
        UPDATE anon_result_rl SET fail_count = 0, window_start = now(), locked_until = NULL WHERE ip = v_ip;
    END IF;

    -- ── verify ──
    SELECT * INTO v FROM anon_cases WHERE verify_code = upper(trim(p_code)) LIMIT 1;
    IF NOT FOUND
       OR coalesce(v.contact_phone, '') = ''
       OR right(regexp_replace(v.contact_phone, '\D', '', 'g'), 4) <> p_phone4 THEN
        UPDATE anon_result_rl
           SET fail_count   = fail_count + 1,
               locked_until = CASE WHEN fail_count + 1 >= c_max_fail THEN now() + c_lock ELSE locked_until END
         WHERE ip = v_ip;
        RETURN jsonb_build_object('ok', false, 'error', 'verify_failed');
    END IF;

    UPDATE anon_result_rl SET fail_count = 0, window_start = now(), locked_until = NULL WHERE ip = v_ip;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'test_name', t.test_name,
        'item_type', t.item_type,
        'result_status', t.result_status,
        'result_value', t.result_value,
        'result_note', t.result_note,
        'sample_type', t.sample_type
    ) ORDER BY t.created_at), '[]'::jsonb)
    INTO v_tests
    FROM anon_case_tests t WHERE t.case_id = v.id;

    SELECT clinic_name, clinic_name_en, company_name, company_name_en,
           address_detail, phone, license_number, tax_id, logo_url
      INTO v_clinic FROM tenants WHERE id = v.clinic_id;

    -- แพทย์ผู้ตรวจของคลินิก (มี license)
    SELECT p.full_name, p.full_name_en, s.license_number
      INTO v_doc
      FROM staff s JOIN profiles p ON p.id = s.profile_id
     WHERE s.clinic_id = v.clinic_id
       AND s.license_number IS NOT NULL
       AND p.role IN ('doctor', 'dentist', 'owner')
     LIMIT 1;

    RETURN jsonb_build_object(
        'ok', true,
        'code', v.verify_code,
        'status', v.status,
        'case_date', v.case_date,
        'result_appt_date', v.result_appt_date,
        'paid', v.paid,
        'followup_requested', v.followup_requested,
        'sex', v.sex,
        'age', v.age,
        'lab_no', v.lab_no,
        'sample_type', v.sample_type,
        'collected_at', v.collected_at,
        'received_at', v.received_at,
        'lab_comment', v.lab_comment,
        'reported_by_name', v.reported_by_name,
        'reported_by_license', v.reported_by_license,
        'reported_at', v.reported_at,
        'approved_by_name', v.approved_by_name,
        'approved_by_license', v.approved_by_license,
        'approved_at', v.approved_at,
        'lab_report_meta', coalesce(v.lab_report_meta, '{}'::jsonb),
        'physician_name', coalesce(v_doc.full_name_en, v_doc.full_name),
        'physician_license', v_doc.license_number,
        'clinic_name', v_clinic.clinic_name,
        'clinic_name_en', v_clinic.clinic_name_en,
        'company_name', v_clinic.company_name,
        'company_name_en', v_clinic.company_name_en,
        'address_detail', v_clinic.address_detail,
        'clinic_phone', v_clinic.phone,
        'license_number', v_clinic.license_number,
        'tax_id', v_clinic.tax_id,
        'logo_url', v_clinic.logo_url,
        'tests', v_tests
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_anon_result(text, text, text) TO anon, authenticated;
