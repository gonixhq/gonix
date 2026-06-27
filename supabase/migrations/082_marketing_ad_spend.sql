-- ════════════════════════════════════════════════════════════
-- 082: M15 CAC — ต้นทุนต่อลูกค้าใหม่ แยกตาม Channel
-- ════════════════════════════════════════════════════════════
-- กรอกค่าโฆษณา (FB/Google/TikTok/อื่นๆ) + จำนวนลูกค้าใหม่ต่อช่องทาง รายเดือน
-- ระบบคำนวณ CAC = ค่าโฆษณา ÷ ลูกค้าใหม่ เทียบกับช่องทางเซลล์ฟรีแลนซ์ (auto)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_ad_spend (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_month   text NOT NULL,                  -- YYYY-MM
    channel        text NOT NULL,                  -- facebook | google | tiktok | other
    amount         numeric(12,2) NOT NULL DEFAULT 0,   -- ค่าโฆษณา (บาท)
    new_customers  int NOT NULL DEFAULT 0,         -- ลูกค้าใหม่จากช่องนี้ (กรอกมือ)
    note           text,
    created_by     uuid REFERENCES profiles(id),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, period_month, channel)
);

CREATE INDEX IF NOT EXISTS idx_marketing_ad_spend_month
    ON marketing_ad_spend (clinic_id, period_month);
