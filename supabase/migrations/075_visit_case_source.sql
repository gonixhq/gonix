-- ════════════════════════════════════════════════════════════
-- 075: Attribution ต่อ Visit — "ที่มาของเคส" (บังคับคีย์ตอนเปิด visit)
-- ════════════════════════════════════════════════════════════
-- walk_in / line / affiliate (ระบุเซลล์) / referral (โค้ดลูกค้าแนะนำ)
-- ล็อกตอนเปิด — กันโยกค่าคอมย้อนหลัง
-- ════════════════════════════════════════════════════════════

ALTER TABLE visits ADD COLUMN IF NOT EXISTS case_source       text;          -- walk_in | line | affiliate | referral
ALTER TABLE visits ADD COLUMN IF NOT EXISTS case_affiliate_id uuid REFERENCES affiliates(id);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS case_referral_code text;

COMMENT ON COLUMN visits.case_source IS 'ที่มาของเคส: walk_in/line/affiliate/referral (บังคับคีย์ตอนเปิด)';
