-- ════════════════════════════════════════════════════════════
-- 109: เพิ่มความปลอดภัย link_line_account (P09 / finding #2)
-- ════════════════════════════════════════════════════════════
-- ปิด 3 ช่องโหว่ (mirror สิ่งที่ mig 102 ทำกับ get_anon_result):
--   (1) HN-enumeration — เดิม error ต่างกัน (not_found vs verify_failed)
--       → ยิงสุ่มแยกได้ว่า "HN ไหนมีตัวตน" → รวมเป็น verify_failed อันเดียว
--   (2) Brute-force — เดิมยิงไม่จำกัด → rate limit ต่อ IP (ล็อกเมื่อผิดถี่)
--   (3) HN ไม่ normalize — เดิม upper+trim แต่ไม่รับ prefix "HN"
--       → รับทั้ง "690011", "hn690011", "HN690011" (strip prefix ทั้งสองฝั่ง)
-- เพิ่ม param p_ip (server action ส่ง client IP มาให้)
-- ════════════════════════════════════════════════════════════

-- ── ตารางนับความพยายาม (เข้าถึงเฉพาะผ่าน security-definer function) ──
CREATE TABLE IF NOT EXISTS line_link_rl (
    ip           text PRIMARY KEY,
    fail_count   int NOT NULL DEFAULT 0,
    window_start timestamptz NOT NULL DEFAULT now(),
    locked_until timestamptz
);
-- เปิด RLS ไม่มี policy = client เข้าตรงไม่ได้ (security-definer bypass RLS ได้)
ALTER TABLE line_link_rl ENABLE ROW LEVEL SECURITY;

-- ── ลบ signature เดิม (5 args) เพื่อบังคับให้ทุก caller ส่ง IP ──
DROP FUNCTION IF EXISTS link_line_account(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION link_line_account(
    p_clinic uuid, p_line_uid text, p_display text, p_hn text, p_phone4 text,
    p_ip text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v patients;
    v_ip text := coalesce(nullif(trim(p_ip), ''), 'unknown');
    v_ws timestamptz;
    v_lock timestamptz;
    c_max_fail constant int := 8;
    c_window   constant interval := interval '10 minutes';
    c_lock     constant interval := interval '15 minutes';
BEGIN
    -- ── rate-limit gate ──
    INSERT INTO line_link_rl(ip) VALUES (v_ip) ON CONFLICT (ip) DO NOTHING;
    SELECT window_start, locked_until INTO v_ws, v_lock FROM line_link_rl WHERE ip = v_ip;
    IF v_lock IS NOT NULL AND v_lock > now() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
    END IF;
    IF now() - v_ws > c_window THEN
        UPDATE line_link_rl SET fail_count = 0, window_start = now(), locked_until = NULL WHERE ip = v_ip;
    END IF;

    -- ── ค้นหาผู้ป่วย: normalize HN (strip prefix "HN" ทั้งสองฝั่ง + trim + upper) ──
    SELECT * INTO v FROM patients
     WHERE clinic_id = p_clinic
       AND upper(regexp_replace(trim(hn),   '^HN', '', 'i'))
         = upper(regexp_replace(trim(p_hn), '^HN', '', 'i'))
     LIMIT 1;

    -- ── verify (ล้มเหลวทุกกรณีตอบเหมือนกัน — กัน enumerate) ──
    IF NOT FOUND
       OR coalesce(v.phone, '') = ''
       OR right(regexp_replace(v.phone, '\D', '', 'g'), 4) <> p_phone4 THEN
        UPDATE line_link_rl
           SET fail_count   = fail_count + 1,
               locked_until = CASE WHEN fail_count + 1 >= c_max_fail THEN now() + c_lock ELSE locked_until END
         WHERE ip = v_ip;
        RETURN jsonb_build_object('ok', false, 'error', 'verify_failed');
    END IF;

    -- ── สำเร็จ → รีเซ็ตตัวนับ + ผูกบัญชี ──
    UPDATE line_link_rl SET fail_count = 0, window_start = now(), locked_until = NULL WHERE ip = v_ip;

    UPDATE patients
       SET line_user_id = p_line_uid, line_display_name = p_display, line_linked_at = now()
     WHERE clinic_id = v.clinic_id AND hn = v.hn;

    RETURN jsonb_build_object('ok', true, 'name', trim(coalesce(v.first_name,'') || ' ' || coalesce(v.last_name,'')));
END;
$$;

GRANT EXECUTE ON FUNCTION link_line_account(uuid, text, text, text, text, text) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT link_line_account('<clinic>','Uxxx','ชื่อ','ไม่มีจริง','0000','1.2.3.4'); -- → verify_failed
--   SELECT link_line_account('<clinic>','Uxxx','ชื่อ','690011','4993','1.2.3.4');    -- ถ้ามี HN690011 เบอร์ลงท้าย 4993 → ok
--   -- ยิงผิด 8 ครั้งจาก IP เดิม → rate_limited (ล็อก 15 นาที)
-- ════════════════════════════════════════════════════════════
