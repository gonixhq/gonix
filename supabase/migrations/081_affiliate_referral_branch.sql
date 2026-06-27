-- ════════════════════════════════════════════════════════════
-- 081: M17 (เผื่ออนาคต Multi-branch) — ผูก Affiliate/Referral กับสาขา
-- ════════════════════════════════════════════════════════════
-- ตอนนี้ Tanavej สาขาเดียว ยังไม่ทำ UI — แค่เตรียมคอลัมน์ branch_id (nullable)
-- เพื่อไม่ต้องแก้โครงสร้างข้อมูลทีหลังเมื่อขยายสาขา
--   branch_id = NULL → ใช้ได้ข้ามทุกสาขา (default พฤติกรรมเดิม)
--   branch_id = สาขา → ผูกกับสาขาเดียว (เปิดใช้ภายหลังเมื่อมีหลายสาขา)
-- ════════════════════════════════════════════════════════════

ALTER TABLE affiliates        ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
ALTER TABLE patient_referrals ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);

CREATE INDEX IF NOT EXISTS idx_affiliates_branch        ON affiliates (branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_referrals_branch ON patient_referrals (branch_id) WHERE branch_id IS NOT NULL;
