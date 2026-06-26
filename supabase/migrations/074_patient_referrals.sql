-- ════════════════════════════════════════════════════════════
-- 074: Patient Referral — ลูกค้าเก่าแนะนำลูกค้าใหม่
-- ════════════════════════════════════════════════════════════
-- ผู้ป่วยแต่ละคนมี referral_code ของตัวเอง · เมื่อลูกค้าใหม่ใช้รหัส →
-- บันทึกความสัมพันธ์ + รางวัล "รอเลือก" (เงิน/ส่วนลด/แต้ม)
-- ════════════════════════════════════════════════════════════

ALTER TABLE patients ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_referral_code
    ON patients (clinic_id, referral_code) WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS patient_referrals (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    referrer_hn   text NOT NULL REFERENCES patients(hn),  -- ผู้แนะนำ
    referred_hn   text NOT NULL REFERENCES patients(hn),  -- คนที่ถูกแนะนำ (ลูกค้าใหม่)
    reward_status text NOT NULL DEFAULT 'pending',        -- pending | cash | discount | points | cancelled
    reward_amount numeric(10,2) NOT NULL DEFAULT 0,       -- เงิน/ส่วนลด (บาท)
    reward_points int NOT NULL DEFAULT 0,                 -- แต้ม (ถ้าเลือกแต้ม)
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    claimed_at    timestamptz,
    claimed_by    uuid REFERENCES profiles(id),
    UNIQUE (clinic_id, referred_hn)                       -- ถูกแนะนำได้ครั้งเดียว
);

CREATE INDEX IF NOT EXISTS idx_patient_referrals_referrer ON patient_referrals (referrer_hn);
