-- ════════════════════════════════════════════════════════════
-- 080: M16 แจ้งเตือนยอดเซลล์ผ่าน LINE
-- ════════════════════════════════════════════════════════════
-- เซลล์ภายนอกไม่ควร login เข้าระบบหลัง → แจ้งยอดผ่าน LINE แทน
--   line_user_id   = userId ของเซลล์ (ผูกผ่านการส่ง "รหัสผูก" เข้า OA)
--   line_link_code = รหัสผูกชั่วคราว (ใช้ครั้งเดียว)
-- ════════════════════════════════════════════════════════════

ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS line_user_id   text;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS line_link_code text;

-- index ช่วยหา affiliate จากรหัสผูก (ตอน webhook รับข้อความ)
CREATE INDEX IF NOT EXISTS idx_affiliates_link_code
    ON affiliates (clinic_id, line_link_code) WHERE line_link_code IS NOT NULL;

-- log การส่งแจ้งเตือน (กันส่งซ้ำ + ตรวจย้อนหลัง)
CREATE TABLE IF NOT EXISTS affiliate_line_notify_log (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    affiliate_id  uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    period_month  text NOT NULL,
    sent_by       uuid REFERENCES profiles(id),
    ok            boolean NOT NULL DEFAULT true,
    error         text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_line_notify_aff
    ON affiliate_line_notify_log (affiliate_id, created_at DESC);
