-- ════════════════════════════════════════════════════════════
-- 123: DF ต่อหัตถการ (เคสละกี่บาท) — เพิ่ม DF ที่ service_catalog + รวมเข้า commission
-- ════════════════════════════════════════════════════════════
-- เดิม: DF อยู่ที่ inventory (ต่อหน่วยยา) เท่านั้น
-- ใหม่: หัตถการ/บริการ (service_catalog) มี DF ต่อเคส (หมอ/พยาบาล/ผู้ช่วย)
--   → v_commission_summary รวม DF จากทั้ง "ยา(ต่อหน่วย)" + "หัตถการ(ต่อเคส)"
--   ผู้รับ DF อ้างจาก visit: doctor_id / nurse_id / assistant_id (เหมือนฝั่งยา)
-- ════════════════════════════════════════════════════════════

-- ── 1. เพิ่ม DF ต่อเคส ที่ service_catalog + โหมด (บาท/เปอร์เซ็นต์) ──
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS df_doctor    numeric DEFAULT 0;
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS df_nurse     numeric DEFAULT 0;
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS df_assistant numeric DEFAULT 0;
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS df_mode      text DEFAULT 'baht';   -- 'baht' | 'percent'
COMMENT ON COLUMN service_catalog.df_doctor    IS 'ค่ามือหมอต่อเคส (บาท หรือ % ตาม df_mode)';
COMMENT ON COLUMN service_catalog.df_nurse     IS 'ค่ามือพยาบาลต่อเคส';
COMMENT ON COLUMN service_catalog.df_assistant IS 'ค่ามือผู้ช่วยต่อเคส';
COMMENT ON COLUMN service_catalog.df_mode      IS 'วิธีคิด DF: baht=บาทต่อเคส×จำนวน · percent=% ของราคาเต็ม(line_total)';

-- ── 2. ปรับ view ให้รวม DF จากหัตถการด้วย ──
DROP VIEW IF EXISTS v_commission_summary;

CREATE OR REPLACE VIEW v_commission_summary AS
-- ═══ DF จากยา (inventory, ต่อหน่วย) ═══
WITH doctor_df AS (
    SELECT v.doctor_id AS staff_id, 'doctor' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month, ih.clinic_id,
        ii.id::text AS item_id, ii.item_name, ii.qty,
        COALESCE(inv.df_doctor, 0) AS df_rate,
        (COALESCE(inv.df_doctor, 0) * ii.qty) AS commission_amount,
        ih.id AS inv_id, ih.invoice_date, v.vn
    FROM invoice_items ii
    JOIN invoice_headers ih ON ih.id = ii.inv_id
    JOIN visits v ON v.vn = ih.vn
    LEFT JOIN inventory inv ON inv.id::text = ii.item_ref_id
    WHERE ih.status = 'paid' AND v.doctor_id IS NOT NULL AND COALESCE(inv.df_doctor, 0) > 0
),
nurse_df AS (
    SELECT v.nurse_id AS staff_id, 'nurse' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month, ih.clinic_id,
        ii.id::text AS item_id, ii.item_name, ii.qty,
        COALESCE(inv.df_nurse, 0) AS df_rate,
        (COALESCE(inv.df_nurse, 0) * ii.qty) AS commission_amount,
        ih.id AS inv_id, ih.invoice_date, v.vn
    FROM invoice_items ii
    JOIN invoice_headers ih ON ih.id = ii.inv_id
    JOIN visits v ON v.vn = ih.vn
    LEFT JOIN inventory inv ON inv.id::text = ii.item_ref_id
    WHERE ih.status = 'paid' AND v.nurse_id IS NOT NULL AND COALESCE(inv.df_nurse, 0) > 0
),
assistant_df AS (
    SELECT v.assistant_id AS staff_id, 'assistant' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month, ih.clinic_id,
        ii.id::text AS item_id, ii.item_name, ii.qty,
        COALESCE(inv.df_assistant, 0) AS df_rate,
        (COALESCE(inv.df_assistant, 0) * ii.qty) AS commission_amount,
        ih.id AS inv_id, ih.invoice_date, v.vn
    FROM invoice_items ii
    JOIN invoice_headers ih ON ih.id = ii.inv_id
    JOIN visits v ON v.vn = ih.vn
    LEFT JOIN inventory inv ON inv.id::text = ii.item_ref_id
    WHERE ih.status = 'paid' AND v.assistant_id IS NOT NULL AND COALESCE(inv.df_assistant, 0) > 0
),
-- ═══ DF จากหัตถการ (service_catalog, ต่อเคส) — item_ref_id ชี้ service_catalog ═══
doctor_svc AS (
    SELECT v.doctor_id AS staff_id, 'doctor' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month, ih.clinic_id,
        ii.id::text AS item_id, ii.item_name, ii.qty,
        COALESCE(sc.df_doctor, 0) AS df_rate,
        (CASE WHEN sc.df_mode = 'percent'
              THEN COALESCE(ii.line_total, 0) * COALESCE(sc.df_doctor, 0) / 100.0
              ELSE COALESCE(sc.df_doctor, 0) * ii.qty END) AS commission_amount,
        ih.id AS inv_id, ih.invoice_date, v.vn
    FROM invoice_items ii
    JOIN invoice_headers ih ON ih.id = ii.inv_id
    JOIN visits v ON v.vn = ih.vn
    JOIN service_catalog sc ON sc.id::text = ii.item_ref_id
    WHERE ih.status = 'paid' AND v.doctor_id IS NOT NULL AND COALESCE(sc.df_doctor, 0) > 0
),
nurse_svc AS (
    SELECT v.nurse_id AS staff_id, 'nurse' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month, ih.clinic_id,
        ii.id::text AS item_id, ii.item_name, ii.qty,
        COALESCE(sc.df_nurse, 0) AS df_rate,
        (CASE WHEN sc.df_mode = 'percent'
              THEN COALESCE(ii.line_total, 0) * COALESCE(sc.df_nurse, 0) / 100.0
              ELSE COALESCE(sc.df_nurse, 0) * ii.qty END) AS commission_amount,
        ih.id AS inv_id, ih.invoice_date, v.vn
    FROM invoice_items ii
    JOIN invoice_headers ih ON ih.id = ii.inv_id
    JOIN visits v ON v.vn = ih.vn
    JOIN service_catalog sc ON sc.id::text = ii.item_ref_id
    WHERE ih.status = 'paid' AND v.nurse_id IS NOT NULL AND COALESCE(sc.df_nurse, 0) > 0
),
assistant_svc AS (
    SELECT v.assistant_id AS staff_id, 'assistant' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month, ih.clinic_id,
        ii.id::text AS item_id, ii.item_name, ii.qty,
        COALESCE(sc.df_assistant, 0) AS df_rate,
        (CASE WHEN sc.df_mode = 'percent'
              THEN COALESCE(ii.line_total, 0) * COALESCE(sc.df_assistant, 0) / 100.0
              ELSE COALESCE(sc.df_assistant, 0) * ii.qty END) AS commission_amount,
        ih.id AS inv_id, ih.invoice_date, v.vn
    FROM invoice_items ii
    JOIN invoice_headers ih ON ih.id = ii.inv_id
    JOIN visits v ON v.vn = ih.vn
    JOIN service_catalog sc ON sc.id::text = ii.item_ref_id
    WHERE ih.status = 'paid' AND v.assistant_id IS NOT NULL AND COALESCE(sc.df_assistant, 0) > 0
),
-- ═══ Commission เซลล์คอส (% ของยอดขายคอส) ═══
sales_df AS (
    SELECT pp.created_by AS staff_id, 'sales' AS role,
        to_char(pp.purchased_at::date, 'YYYY-MM') AS period_month, pp.clinic_id,
        pp.id::text AS item_id, pp.package_name AS item_name, 1::numeric AS qty,
        sp.sales_commission_pct AS df_rate,
        (pp.paid_amount * COALESCE(sp.sales_commission_pct, 0) / 100.0) AS commission_amount,
        pp.invoice_id AS inv_id, pp.purchased_at::date AS invoice_date, NULL::text AS vn
    FROM patient_packages pp
    LEFT JOIN service_packages sp ON sp.id = pp.package_id
    WHERE pp.created_by IS NOT NULL AND pp.status IN ('active', 'completed')
      AND COALESCE(sp.sales_commission_pct, 0) > 0 AND pp.paid_amount > 0
)
SELECT * FROM doctor_df
UNION ALL SELECT * FROM nurse_df
UNION ALL SELECT * FROM assistant_df
UNION ALL SELECT * FROM doctor_svc
UNION ALL SELECT * FROM nurse_svc
UNION ALL SELECT * FROM assistant_svc
UNION ALL SELECT * FROM sales_df;

COMMENT ON VIEW v_commission_summary IS 'รวม DF/Commission: ยา(inventory ต่อหน่วย) + หัตถการ(service_catalog ต่อเคส) + เซลล์คอส(%)';
