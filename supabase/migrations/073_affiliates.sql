-- ════════════════════════════════════════════════════════════
-- 073: Affiliate (เซลล์ฟรีแลนซ์) — entity แยกจากพนักงาน
-- ════════════════════════════════════════════════════════════
-- ไม่ผูกตอกบัตร/ประกันสังคม · มี referral code · % คงที่ต่อคน
-- commission_type: recurring (ทุกยอดของลูกค้าที่พามา ในระยะ attribution)
--                  one_time (ครั้งเดียวตอนเปิดเคสแรก)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS affiliates (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name               text NOT NULL,
    phone              text,
    bank_account       text,
    bank_name          text,
    referral_code      text NOT NULL,
    commission_type    text NOT NULL DEFAULT 'one_time',  -- recurring | one_time
    commission_pct     numeric(5,2) NOT NULL DEFAULT 0,   -- % ของยอดขาย
    attribution_months int DEFAULT 6,                     -- อายุ attribution (recurring)
    is_active          boolean NOT NULL DEFAULT true,
    note               text,
    created_by         uuid REFERENCES profiles(id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, referral_code)
);

CREATE INDEX IF NOT EXISTS idx_affiliates_clinic ON affiliates (clinic_id, is_active);

-- ผูกผู้ป่วยกับ affiliate (attribution)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS affiliate_id          uuid REFERENCES affiliates(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS affiliate_attributed_at date;

-- การจ่ายเงิน affiliate (แยกจาก payroll พนักงาน)
CREATE TABLE IF NOT EXISTS affiliate_payouts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    affiliate_id  uuid NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    period_month  text NOT NULL,                  -- YYYY-MM
    gross_amount  numeric(12,2) NOT NULL DEFAULT 0,
    wht_amount    numeric(12,2) NOT NULL DEFAULT 0,  -- หัก ณ ที่จ่าย 3%
    net_amount    numeric(12,2) NOT NULL DEFAULT 0,
    status        text NOT NULL DEFAULT 'paid',   -- paid (มี record = จ่ายแล้ว)
    paid_at       timestamptz NOT NULL DEFAULT now(),
    paid_by       uuid REFERENCES profiles(id),
    note          text,
    UNIQUE (clinic_id, affiliate_id, period_month)
);
