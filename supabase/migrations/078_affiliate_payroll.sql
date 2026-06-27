-- ════════════════════════════════════════════════════════════
-- 078: Affiliate Payroll-like — เอกสารแนบ + รอบปิดยอด + 50 ทวิ + ประวัติ
-- ════════════════════════════════════════════════════════════
-- M12: ทำให้ affiliate มีรอบจ่ายเหมือน payroll พนักงาน
--   - เก็บไฟล์สำเนาบัตร ปชช. + หน้าบัญชี (storage path ใน bucket clinic-assets)
--   - ปิดยอดทั้งเดือน (lock) → จ่ายรายคน → ออกใบ 50 ทวิ
-- ════════════════════════════════════════════════════════════

-- เอกสารแนบต่อ affiliate (เก็บ storage path)
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS id_card_path   text;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS bank_book_path text;

-- affiliate_payouts.status: 'closed' (ปิดยอด รอจ่าย) | 'paid' (จ่ายแล้ว)
-- (คอลัมน์ status มีอยู่แล้ว default 'paid' — เพิ่มความหมายใหม่เฉยๆ)
-- เพิ่ม updated ตอนเปลี่ยนสถานะ
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS closed_at  timestamptz;
ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS closed_by  uuid REFERENCES profiles(id);

-- ล็อกทั้งเดือน (ปิดยอดทั้งเดือน) — กันยอดเปลี่ยนหลังปิด
CREATE TABLE IF NOT EXISTS affiliate_month_locks (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_month  text NOT NULL,                 -- YYYY-MM
    locked_by     uuid REFERENCES profiles(id),
    locked_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_month_locks_clinic
    ON affiliate_month_locks (clinic_id, period_month);
