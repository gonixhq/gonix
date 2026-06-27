-- ════════════════════════════════════════════════════════════
-- 084: RLS policies สำหรับตาราง affiliate/marketing (แก้บั๊ก insert ถูกบล็อก)
-- ════════════════════════════════════════════════════════════
-- ตาราง affiliates มี RLS เปิดอยู่ใน prod แต่ไม่มี policy → insert/select ถูกบล็อก
-- (mig 073/077-082 ลืมใส่ policy) เพิ่ม policy clinic-scoped ตาม pattern mig 044
-- ใช้ FOR ALL (ครอบ select/insert/update/delete) · idempotent ด้วย DROP IF EXISTS
-- ════════════════════════════════════════════════════════════

-- helper macro (เขียนซ้ำต่อ table เพราะ SQL ไม่มี loop ใน DDL ง่ายๆ)

-- affiliates
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliates_clinic ON affiliates;
CREATE POLICY affiliates_clinic ON affiliates FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- affiliate_payouts
ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliate_payouts_clinic ON affiliate_payouts;
CREATE POLICY affiliate_payouts_clinic ON affiliate_payouts FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- affiliate_rate_tiers
ALTER TABLE affiliate_rate_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliate_rate_tiers_clinic ON affiliate_rate_tiers;
CREATE POLICY affiliate_rate_tiers_clinic ON affiliate_rate_tiers FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- affiliate_rate_audit
ALTER TABLE affiliate_rate_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliate_rate_audit_clinic ON affiliate_rate_audit;
CREATE POLICY affiliate_rate_audit_clinic ON affiliate_rate_audit FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- affiliate_month_locks
ALTER TABLE affiliate_month_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliate_month_locks_clinic ON affiliate_month_locks;
CREATE POLICY affiliate_month_locks_clinic ON affiliate_month_locks FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- affiliate_invoice_splits
ALTER TABLE affiliate_invoice_splits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliate_invoice_splits_clinic ON affiliate_invoice_splits;
CREATE POLICY affiliate_invoice_splits_clinic ON affiliate_invoice_splits FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- affiliate_attribution_log
ALTER TABLE affiliate_attribution_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliate_attribution_log_clinic ON affiliate_attribution_log;
CREATE POLICY affiliate_attribution_log_clinic ON affiliate_attribution_log FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- affiliate_line_notify_log
ALTER TABLE affiliate_line_notify_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliate_line_notify_log_clinic ON affiliate_line_notify_log;
CREATE POLICY affiliate_line_notify_log_clinic ON affiliate_line_notify_log FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- marketing_ad_spend
ALTER TABLE marketing_ad_spend ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_ad_spend_clinic ON marketing_ad_spend;
CREATE POLICY marketing_ad_spend_clinic ON marketing_ad_spend FOR ALL
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ════════════════════════════════════════════════════════════
-- RPC: ผูก LINE ของเซลล์จาก webhook (anon context — ผ่าน RLS ไม่ได้)
-- SECURITY DEFINER bypass RLS เหมือน link_line_account ของผู้ป่วย
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION link_affiliate_line(p_code text, p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id   uuid;
    v_name text;
BEGIN
    SELECT id, name INTO v_id, v_name
      FROM affiliates
     WHERE line_link_code = p_code
     LIMIT 1;
    IF v_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;
    UPDATE affiliates
       SET line_user_id = p_uid, line_link_code = NULL
     WHERE id = v_id;
    RETURN jsonb_build_object('ok', true, 'name', v_name);
END;
$$;

GRANT EXECUTE ON FUNCTION link_affiliate_line(text, text) TO anon, authenticated;
