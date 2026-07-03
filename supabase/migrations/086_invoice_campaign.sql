-- ════════════════════════════════════════════════════════════
-- 086: M3 Campaign/Promo — เก็บชื่อแคมเปญ/โค้ดโปรฯ ต่อบิล
-- ════════════════════════════════════════════════════════════
-- ใช้แท็กบิลว่ามาจากแคมเปญ/โปรโมชันไหน → รายงานแยกยอดตามแคมเปญ
-- (invoice_headers มี RLS อยู่แล้ว — แค่เพิ่มคอลัมน์)
-- ════════════════════════════════════════════════════════════

ALTER TABLE invoice_headers ADD COLUMN IF NOT EXISTS campaign text;

CREATE INDEX IF NOT EXISTS idx_invoice_headers_campaign
    ON invoice_headers (clinic_id, campaign) WHERE campaign IS NOT NULL;
