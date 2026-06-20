-- ════════════════════════════════════════════════════════════
-- 045: ประเภทค่าจ้างพนักงาน (รายชั่วโมง / เงินเดือน)
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   - pay_type = 'hourly'  → ค่าจ้าง = ชั่วโมงทำงาน × hourly_rate (เดิม)
--   - pay_type = 'monthly' → ค่าจ้าง = monthly_salary (เหมาจ่ายคงที่/เดือน ไม่ขึ้นกับชั่วโมง)
--   - ทั้งสองแบบยังบวก DF/commission รวมเป็นยอดสุทธิเหมือนเดิม
-- ════════════════════════════════════════════════════════════

ALTER TABLE staff
    ADD COLUMN IF NOT EXISTS pay_type       text DEFAULT 'hourly',
    ADD COLUMN IF NOT EXISTS monthly_salary numeric(12,2) DEFAULT 0;

COMMENT ON COLUMN staff.pay_type IS 'ประเภทค่าจ้าง: hourly (รายชั่วโมง) | monthly (เงินเดือน)';
COMMENT ON COLUMN staff.monthly_salary IS 'เงินเดือน (บาท) — ใช้เมื่อ pay_type = monthly';

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT p.full_name, s.pay_type, s.hourly_rate, s.monthly_salary
--     FROM staff s JOIN profiles p ON p.id = s.profile_id;
-- ════════════════════════════════════════════════════════════
