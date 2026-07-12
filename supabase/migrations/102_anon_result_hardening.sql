-- ════════════════════════════════════════════════════════════
-- 102: เพิ่มความปลอดภัยหน้าเช็คผลนิรนาม (/result)
-- ════════════════════════════════════════════════════════════
-- ปิด 2 ช่องโหว่:
--   (1) Enumeration — เดิม error ต่างกัน (not_found/no_phone/verify_failed)
--       ทำให้ยิงสุ่มแยกได้ว่า "รหัสไหนมีตัวตน" → รวมเป็น verify_failed อันเดียว
--   (2) Brute-force — เดิมยิงไม่จำกัด → เพิ่ม rate limit ต่อ IP (ล็อกเมื่อผิดถี่)
-- เพิ่ม param p_ip ให้ทั้ง 2 ฟังก์ชัน (เรียกจาก server action พร้อม client IP)
-- ════════════════════════════════════════════════════════════

-- ── ตารางนับความพยายาม (เข้าถึงเฉพาะผ่าน security-definer function) ──
CREATE TABLE IF NOT EXISTS anon_result_rl (
    ip           text PRIMARY KEY,
    fail_count   int NOT NULL DEFAULT 0,
    window_start timestamptz NOT NULL DEFAULT now(),
    locked_until timestamptz
);
-- เปิด RLS โดยไม่มี policy = client เข้าถึงตรงไม่ได้ (security-definer function bypass RLS ได้)
ALTER TABLE anon_result_rl ENABLE ROW LEVEL SECURITY;

-- ── ลบ signature เดิม (2 args) เพื่อบังคับให้ทุก caller ส่ง IP ──
DROP FUNCTION IF EXISTS get_anon_result(text, text);
DROP FUNCTION IF EXISTS request_anon_followup(text, text);

-- ── อ่านผล: verify code + เบอร์ 4 ตัวท้าย (error เหมือนกันหมด + rate limit) ──
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

    -- ── verify (ล้มเหลวทุกกรณีตอบเหมือนกัน — กัน enumerate) ──
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

    -- ── สำเร็จ → รีเซ็ตตัวนับ ──
    UPDATE anon_result_rl SET fail_count = 0, window_start = now(), locked_until = NULL WHERE ip = v_ip;

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

-- ── ขอนัดหมายพบแพทย์ (rate limit + error เหมือนกันหมด) ──
CREATE OR REPLACE FUNCTION request_anon_followup(p_code text, p_phone4 text, p_ip text DEFAULT 'unknown')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v anon_cases;
    v_ip text := coalesce(nullif(trim(p_ip), ''), 'unknown');
    v_ws timestamptz;
    v_lock timestamptz;
    c_max_fail constant int := 8;
    c_window   constant interval := interval '10 minutes';
    c_lock     constant interval := interval '15 minutes';
BEGIN
    INSERT INTO anon_result_rl(ip) VALUES (v_ip) ON CONFLICT (ip) DO NOTHING;
    SELECT window_start, locked_until INTO v_ws, v_lock FROM anon_result_rl WHERE ip = v_ip;
    IF v_lock IS NOT NULL AND v_lock > now() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
    END IF;
    IF now() - v_ws > c_window THEN
        UPDATE anon_result_rl SET fail_count = 0, window_start = now(), locked_until = NULL WHERE ip = v_ip;
    END IF;

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
    UPDATE anon_cases SET followup_requested = true, followup_at = now() WHERE id = v.id;
    RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION get_anon_result(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION request_anon_followup(text, text, text) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT get_anon_result('WRONG1', '0000', '1.2.3.4');   -- → verify_failed
--   -- ยิงผิด 8 ครั้งจาก IP เดิม → rate_limited (ล็อก 15 นาที)
-- ════════════════════════════════════════════════════════════
