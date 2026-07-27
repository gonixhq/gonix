-- ════════════════════════════════════════════════════════════
-- 113: ให้พนักงานผูก LINE รับแจ้งเตือน (P19)
-- ════════════════════════════════════════════════════════════
-- ปัญหา: ไม่มี UI ให้ staff/owner ตั้ง profiles.line_user_id → owner alert
--        (อาการแดงคนไข้) ส่งไม่ถึงใคร (P10 ขึ้น banner เตือน แต่แก้ไม่ได้)
-- วิธี (token flow — reuse LIFF เดิม /line/link?mode=staff&t=...):
--   1. staff ล็อกอิน dashboard กดปุ่ม → server ตั้ง token สุ่ม + หมดอายุ 10 นาที
--      บน profile ตัวเอง (ผ่าน RLS profiles_self)
--   2. เปิดลิงก์ในแอป LINE → LIFF ได้ ID token → ส่ง {token, idToken}
--   3. RPC (security-definer) หา profile จาก token (ยังไม่หมดอายุ)
--      + เขียน line_user_id = sub ที่ verify แล้ว → ล้าง token
-- ════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS line_link_token   text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS line_link_expires timestamptz;
CREATE INDEX IF NOT EXISTS idx_profiles_line_link_token
    ON profiles (line_link_token) WHERE line_link_token IS NOT NULL;

-- ── ผูก LINE ให้ staff จาก token (server action verify idToken แล้วส่ง sub มา) ──
CREATE OR REPLACE FUNCTION link_staff_line(p_token text, p_line_uid text, p_display text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
    IF coalesce(trim(p_token), '') = '' OR coalesce(trim(p_line_uid), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid');
    END IF;

    SELECT id INTO v_id FROM profiles
     WHERE line_link_token = p_token
       AND line_link_expires IS NOT NULL AND line_link_expires > now()
     LIMIT 1;
    IF v_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'token_invalid');
    END IF;

    UPDATE profiles
       SET line_user_id = p_line_uid,
           line_link_token = NULL, line_link_expires = NULL
     WHERE id = v_id;

    RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION link_staff_line(text, text, text) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- Verification:
--   -- staff กดผูกในตั้งค่า → token ถูกตั้ง → เปิด LIFF → RPC set line_user_id
--   SELECT id, full_name, (line_user_id IS NOT NULL) AS linked FROM profiles WHERE role IN ('owner','admin');
-- ════════════════════════════════════════════════════════════
