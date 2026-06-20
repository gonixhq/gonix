-- ════════════════════════════════════════════════════════════
-- 044: ปิดยอด/อนุมัติการจ่ายค่าตอบแทนรายเดือน
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   - บันทึกว่า "จ่ายค่าตอบแทนของพนักงานคนนี้ เดือนนี้แล้ว" (snapshot ยอด ณ ตอนจ่าย)
--   - กันจ่ายซ้ำ (unique ต่อ staff/เดือน) + เก็บประวัติว่าใครจ่าย เมื่อไหร่
--   - คล้าย commission_payouts แต่เป็นค่าตอบแทนรวม (เวลา + DF)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compensation_payouts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id        uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    period_month    date NOT NULL,              -- YYYY-MM-01
    time_pay        numeric NOT NULL DEFAULT 0, -- ค่าตอบแทนตามเวลา (snapshot)
    df_amount       numeric NOT NULL DEFAULT 0, -- ค่า DF/commission (snapshot)
    total_amount    numeric NOT NULL DEFAULT 0, -- รวมสุทธิ (snapshot)
    payment_method  text DEFAULT 'transfer',    -- cash | transfer | payroll
    note            text,
    paid_at         timestamptz DEFAULT now(),
    paid_by         uuid REFERENCES profiles(id),
    created_at      timestamptz DEFAULT now(),
    UNIQUE (clinic_id, staff_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_comp_payouts_clinic_month ON compensation_payouts (clinic_id, period_month);

COMMENT ON TABLE compensation_payouts IS 'บันทึกการจ่ายค่าตอบแทนรายเดือน (เวลา+DF) กันจ่ายซ้ำ + ประวัติ';

ALTER TABLE compensation_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comp_payouts_select ON compensation_payouts;
CREATE POLICY comp_payouts_select ON compensation_payouts
    FOR SELECT USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS comp_payouts_insert ON compensation_payouts;
CREATE POLICY comp_payouts_insert ON compensation_payouts
    FOR INSERT WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS comp_payouts_update ON compensation_payouts;
CREATE POLICY comp_payouts_update ON compensation_payouts
    FOR UPDATE USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS comp_payouts_delete ON compensation_payouts;
CREATE POLICY comp_payouts_delete ON compensation_payouts
    FOR DELETE USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ════════════════════════════════════════════════════════════
-- Verification:
--   SELECT cp.period_month, p.full_name, cp.total_amount, cp.paid_at
--     FROM compensation_payouts cp
--     JOIN staff s ON s.id = cp.staff_id JOIN profiles p ON p.id = s.profile_id
--    ORDER BY cp.period_month DESC;
-- ════════════════════════════════════════════════════════════
