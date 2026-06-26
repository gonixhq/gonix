-- ════════════════════════════════════════════════════════════
-- 071: Payroll Deductions — หักภาษี ณ ที่จ่าย / ประกันสังคม / อื่นๆ
-- ════════════════════════════════════════════════════════════
-- ตั้งค่าต่อพนักงานว่าหักอะไรบ้าง + เก็บ snapshot รายการหักตอนจ่าย
-- WHT 3% (แพทย์/ฟรีแลนซ์) · ปกส. 5% เพดานหัก 750/เดือน (พนักงานประจำ)
-- ════════════════════════════════════════════════════════════

ALTER TABLE staff ADD COLUMN IF NOT EXISTS wht_enabled boolean DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS sso_enabled boolean DEFAULT false;
COMMENT ON COLUMN staff.wht_enabled IS 'หักภาษี ณ ที่จ่าย 3% (แพทย์/ฟรีแลนซ์)';
COMMENT ON COLUMN staff.sso_enabled IS 'หักประกันสังคม 5% เพดาน 750 (พนักงานประจำ)';

ALTER TABLE compensation_payouts ADD COLUMN IF NOT EXISTS wht_amount       numeric NOT NULL DEFAULT 0;
ALTER TABLE compensation_payouts ADD COLUMN IF NOT EXISTS sso_amount       numeric NOT NULL DEFAULT 0;
ALTER TABLE compensation_payouts ADD COLUMN IF NOT EXISTS other_deduction  numeric NOT NULL DEFAULT 0;
ALTER TABLE compensation_payouts ADD COLUMN IF NOT EXISTS net_amount       numeric NOT NULL DEFAULT 0;
