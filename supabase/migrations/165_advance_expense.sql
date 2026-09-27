-- ════════════════════════════════════════════════════════════
-- 165: ค่าใช้จ่ายที่พนักงาน/เจ้าของสำรองจ่ายไปก่อน (แบบ FlowAccount)
-- ════════════════════════════════════════════════════════════
--   ตอนบันทึกจ่ายบิล เลือก "ผู้จ่าย": คลินิก / พนักงานสำรองจ่าย / เจ้าของสำรองจ่าย
--     → บิล = ชำระแล้ว (ค่าใช้จ่ายเกิดตามปกติ) + มียอด "รอคืนเงินสำรองจ่าย" ให้คนนั้น
--     → เจ้าของไม่ต้องการเงินคืน → waived (ถือเป็นเงินทุนเจ้าของ)
--   คืนเงิน: ใบเตรียมจ่าย kind='reimburse' (รวมหลายบิลของคนเดียวกัน → อนุมัติ → จ่ายคืนครั้งเดียว)
-- ════════════════════════════════════════════════════════════

ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS paid_by text NOT NULL DEFAULT 'clinic';
ALTER TABLE vendor_bills DROP CONSTRAINT IF EXISTS vendor_bills_paid_by_chk;
ALTER TABLE vendor_bills ADD CONSTRAINT vendor_bills_paid_by_chk CHECK (paid_by IN ('clinic','staff','owner'));
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS advanced_by uuid REFERENCES profiles(id);
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS reimburse_status text NOT NULL DEFAULT 'none';
ALTER TABLE vendor_bills DROP CONSTRAINT IF EXISTS vendor_bills_reimburse_chk;
ALTER TABLE vendor_bills ADD CONSTRAINT vendor_bills_reimburse_chk CHECK (reimburse_status IN ('none','pending','reimbursed','waived'));
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS reimbursed_at date;
CREATE INDEX IF NOT EXISTS idx_vendor_bills_reimburse ON vendor_bills (clinic_id, advanced_by) WHERE reimburse_status = 'pending';

ALTER TABLE payment_batches ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'vendor';
ALTER TABLE payment_batches DROP CONSTRAINT IF EXISTS payment_batches_kind_chk;
ALTER TABLE payment_batches ADD CONSTRAINT payment_batches_kind_chk CHECK (kind IN ('vendor','reimburse'));
ALTER TABLE payment_batches ADD COLUMN IF NOT EXISTS payee_profile uuid REFERENCES profiles(id);
