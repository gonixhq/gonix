-- ════════════════════════════════════════════════════════════
-- 040: เพิ่มการรองรับ commission ของ "ผู้ช่วย" (assistant) + "เซลล์" (sales)
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   1. visits เพิ่ม assistant_id (staff.id) — ใช้สำหรับคำนวณ df_assistant
--   2. service_packages เพิ่ม sales_commission_pct — % ของราคาคอสที่ขาย
--   3. ปรับ view v_commission_summary ให้รวม 4 sources: doctor, nurse, assistant, sales
-- ════════════════════════════════════════════════════════════

-- ── เพิ่ม assistant_id ใน visits ──
ALTER TABLE visits
    ADD COLUMN IF NOT EXISTS assistant_id uuid REFERENCES staff(id);

COMMENT ON COLUMN visits.assistant_id IS 'ผู้ช่วยแพทย์ใน visit นี้ (สำหรับคำนวณ df_assistant)';

-- ── เพิ่ม sales_commission_pct ใน service_packages ──
ALTER TABLE service_packages
    ADD COLUMN IF NOT EXISTS sales_commission_pct numeric(5,2) DEFAULT 0;

COMMENT ON COLUMN service_packages.sales_commission_pct IS '% commission สำหรับเซลล์ที่ขายคอสนี้ (0-100)';

-- ── ปรับ view ให้รวม assistant + sales ──
DROP VIEW IF EXISTS v_commission_summary;

CREATE OR REPLACE VIEW v_commission_summary AS
WITH doctor_df AS (
    SELECT
        v.doctor_id AS staff_id,
        'doctor' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month,
        ih.clinic_id,
        ii.id::text AS item_id,
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
    LEFT JOIN inventory inv ON inv.id::text = ii.item_ref_id
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
        ii.id::text AS item_id,
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
    LEFT JOIN inventory inv ON inv.id::text = ii.item_ref_id
    WHERE ih.status = 'paid'
      AND v.nurse_id IS NOT NULL
      AND COALESCE(inv.df_nurse, 0) > 0
),
assistant_df AS (
    SELECT
        v.assistant_id AS staff_id,
        'assistant' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month,
        ih.clinic_id,
        ii.id::text AS item_id,
        ii.item_name,
        ii.qty,
        COALESCE(inv.df_assistant, 0) AS df_rate,
        (COALESCE(inv.df_assistant, 0) * ii.qty) AS commission_amount,
        ih.id AS inv_id,
        ih.invoice_date,
        v.vn
    FROM invoice_items ii
    JOIN invoice_headers ih ON ih.id = ii.inv_id
    JOIN visits v ON v.vn = ih.vn
    LEFT JOIN inventory inv ON inv.id::text = ii.item_ref_id
    WHERE ih.status = 'paid'
      AND v.assistant_id IS NOT NULL
      AND COALESCE(inv.df_assistant, 0) > 0
),
sales_df AS (
    -- คนขายคอส = patient_packages.created_by (staff.id)
    -- commission = paid_amount × pct/100
    SELECT
        pp.created_by AS staff_id,
        'sales' AS role,
        to_char(pp.purchased_at::date, 'YYYY-MM') AS period_month,
        pp.clinic_id,
        pp.id::text AS item_id,
        pp.package_name AS item_name,
        1::numeric AS qty,
        sp.sales_commission_pct AS df_rate,
        (pp.paid_amount * COALESCE(sp.sales_commission_pct, 0) / 100.0) AS commission_amount,
        pp.invoice_id AS inv_id,
        pp.purchased_at::date AS invoice_date,
        -- ใช้ patient_package.id แทน vn เพราะ sales ไม่ผูก visit
        NULL::text AS vn
    FROM patient_packages pp
    LEFT JOIN service_packages sp ON sp.id = pp.package_id
    WHERE pp.created_by IS NOT NULL
      AND pp.status IN ('active', 'completed')
      AND COALESCE(sp.sales_commission_pct, 0) > 0
      AND pp.paid_amount > 0
)
SELECT * FROM doctor_df
UNION ALL SELECT * FROM nurse_df
UNION ALL SELECT * FROM assistant_df
UNION ALL SELECT * FROM sales_df;

COMMENT ON VIEW v_commission_summary IS 'รวม DF/Commission จาก 4 sources: doctor, nurse, assistant, sales';
