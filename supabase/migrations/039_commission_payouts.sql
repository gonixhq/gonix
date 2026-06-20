-- ════════════════════════════════════════════════════════════
-- 039: ระบบบันทึกการจ่ายค่า DF / Commission ของหมอ พยาบาล ผู้ช่วย
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   - คำนวณค่า DF on-the-fly จาก invoice_items × inventory.df_doctor/nurse/assistant
--   - ใช้ table นี้เก็บประวัติว่าจ่ายงวดไหนแล้ว
--   - 1 row = 1 staff, 1 period (เดือน), 1 ยอดรวมที่จ่าย
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS commission_payouts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id        uuid NOT NULL REFERENCES staff(id),
    role            text NOT NULL,                  -- doctor / nurse / assistant / sales
    period_month    text NOT NULL,                  -- YYYY-MM format
    amount          numeric(12,2) NOT NULL,
    paid_at         timestamptz NOT NULL DEFAULT now(),
    paid_by         uuid REFERENCES profiles(id),
    payment_method  text DEFAULT 'cash',            -- cash / transfer / payroll
    transaction_ref text,
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (clinic_id, staff_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_commission_payouts_clinic_period
    ON commission_payouts (clinic_id, period_month);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_staff
    ON commission_payouts (staff_id, period_month);

COMMENT ON TABLE commission_payouts IS 'ประวัติการจ่ายค่า DF/Commission ของพนักงาน — 1 row = 1 staff 1 เดือน';
COMMENT ON COLUMN commission_payouts.period_month IS 'รูปแบบ YYYY-MM เช่น 2026-06';
COMMENT ON COLUMN commission_payouts.role IS 'doctor / nurse / assistant / sales / other';

-- ── RLS ──
ALTER TABLE commission_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_payouts_isolation ON commission_payouts;
CREATE POLICY commission_payouts_isolation ON commission_payouts
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ════════════════════════════════════════════════════════════
-- View: รวม DF ที่คำนวณได้จาก invoice_items × inventory ของแต่ละ staff
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_commission_summary AS
WITH doctor_df AS (
    SELECT
        v.doctor_id AS staff_id,
        'doctor' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month,
        ih.clinic_id,
        ii.id AS item_id,
        ii.item_name,
        ii.qty,
        COALESCE(inv.df_doctor, 0) AS df_rate,
        (COALESCE(inv.df_doctor, 0) * ii.qty) AS commission_amount,
        ih.id AS inv_id,
        ih.invoice_date,
        v.vn
    FROM invoice_items ii
    JOIN invoice_headers ih ON ih.id = ii.inv_id
    JOIN visits v ON v.vn = ih.vn
    LEFT JOIN inventory inv ON inv.id = ii.item_ref_id
    WHERE ih.status = 'paid'
      AND v.doctor_id IS NOT NULL
      AND COALESCE(inv.df_doctor, 0) > 0
),
nurse_df AS (
    SELECT
        v.nurse_id AS staff_id,
        'nurse' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month,
        ih.clinic_id,
        ii.id AS item_id,
        ii.item_name,
        ii.qty,
        COALESCE(inv.df_nurse, 0) AS df_rate,
        (COALESCE(inv.df_nurse, 0) * ii.qty) AS commission_amount,
        ih.id AS inv_id,
        ih.invoice_date,
        v.vn
    FROM invoice_items ii
    JOIN invoice_headers ih ON ih.id = ii.inv_id
    JOIN visits v ON v.vn = ih.vn
    LEFT JOIN inventory inv ON inv.id = ii.item_ref_id
    WHERE ih.status = 'paid'
      AND v.nurse_id IS NOT NULL
      AND COALESCE(inv.df_nurse, 0) > 0
)
SELECT * FROM doctor_df
UNION ALL
SELECT * FROM nurse_df;

COMMENT ON VIEW v_commission_summary IS 'รวม DF ที่ staff ได้รับจาก invoice — group by staff_id + period_month';
