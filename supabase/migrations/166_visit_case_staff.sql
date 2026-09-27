-- ════════════════════════════════════════════════════════════
-- 166: ที่มาของเคส "พนักงานแนะนำ" → ระบุพนักงาน (เลือกจากในระบบ)
-- ════════════════════════════════════════════════════════════
--   visits.case_staff_id = พนักงานที่แนะนำ/พาลูกค้ามา (รายงานการตลาด)
--   ถ้าเข้าเงื่อนไข (ลูกค้าใหม่วันนี้ / หายไปเกินรอบ) แอปจะผูก staff_referrals ให้ด้วย → นับคอมแนะนำตามกติกาเดิม
ALTER TABLE visits ADD COLUMN IF NOT EXISTS case_staff_id uuid REFERENCES staff(id);
CREATE INDEX IF NOT EXISTS idx_visits_case_staff ON visits (clinic_id, case_staff_id) WHERE case_staff_id IS NOT NULL;
