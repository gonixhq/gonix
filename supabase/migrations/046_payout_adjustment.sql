-- ════════════════════════════════════════════════════════════
-- 046: ช่องปรับยอด (adjustment) ในการจ่ายค่าตอบแทน
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   - ไม่หักขาด/สายอัตโนมัติ — แอดมินกรอก "ปรับยอด" เอง (+/−) ตอนปิดยอด
--   - total_amount ที่บันทึก = ค่าจ้าง + DF + adjustment (ยอดจ่ายจริง)
-- ════════════════════════════════════════════════════════════

ALTER TABLE compensation_payouts
    ADD COLUMN IF NOT EXISTS adjustment numeric(12,2) DEFAULT 0;

COMMENT ON COLUMN compensation_payouts.adjustment IS 'ปรับยอด +/- (เช่น หักขาดงาน) ที่แอดมินกรอกตอนจ่าย';

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT period_month, staff_id, time_pay, df_amount, adjustment, total_amount
--     FROM compensation_payouts ORDER BY period_month DESC;
-- ════════════════════════════════════════════════════════════
