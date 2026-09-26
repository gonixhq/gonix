-- ════════════════════════════════════════════════════════════
-- 144: สเปกการเงิน เฟส 2C (ต่อ) — ค่ามือตอนตัดคอส (จ่ายต่อครั้งที่ทำจริง)
-- ════════════════════════════════════════════════════════════
--   • service_packages.hand_fee_main / hand_fee_asst = ค่ามือต่อครั้ง (บาท) · ผู้ช่วยว่าง = ครึ่งหนึ่งของหลัก
--   • package_usages: ผู้ปฏิบัติหลัก/ผู้ช่วย + snapshot ค่ามือ (trigger คิดตอนบันทึก / เปลี่ยนคน)
--   • v_commission_summary: + pkg_hand_main / pkg_hand_asst (นับเดือนที่ใช้คอส)
-- ════════════════════════════════════════════════════════════

ALTER TABLE service_packages
    ADD COLUMN IF NOT EXISTS hand_fee_main numeric(12,2),
    ADD COLUMN IF NOT EXISTS hand_fee_asst numeric(12,2);
ALTER TABLE package_usages
    ADD COLUMN IF NOT EXISTS hand_main_staff_id uuid REFERENCES staff(id),
    ADD COLUMN IF NOT EXISTS hand_asst_staff_id uuid REFERENCES staff(id),
    ADD COLUMN IF NOT EXISTS hand_fee_main numeric(12,2),
    ADD COLUMN IF NOT EXISTS hand_fee_asst numeric(12,2);
ALTER TABLE package_usages DROP CONSTRAINT IF EXISTS package_usages_hand_diff_chk;
ALTER TABLE package_usages ADD CONSTRAINT package_usages_hand_diff_chk
    CHECK (hand_main_staff_id IS NULL OR hand_asst_staff_id IS NULL OR hand_main_staff_id <> hand_asst_staff_id);

CREATE OR REPLACE FUNCTION public.fn_package_usage_hand_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r_main numeric; r_asst numeric;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.hand_main_staff_id IS NOT DISTINCT FROM OLD.hand_main_staff_id
       AND NEW.hand_asst_staff_id IS NOT DISTINCT FROM OLD.hand_asst_staff_id THEN
        NEW.hand_fee_main := OLD.hand_fee_main; NEW.hand_fee_asst := OLD.hand_fee_asst;
        RETURN NEW;
    END IF;
    -- พนักงานต้องอยู่คลินิกเดียวกัน
    IF (NEW.hand_main_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = NEW.hand_main_staff_id AND s.clinic_id = NEW.clinic_id))
       OR (NEW.hand_asst_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = NEW.hand_asst_staff_id AND s.clinic_id = NEW.clinic_id)) THEN
        RAISE EXCEPTION 'ผู้ปฏิบัติ/ผู้ช่วยไม่ถูกต้อง';
    END IF;
    SELECT COALESCE(sp.hand_fee_main, 0), sp.hand_fee_asst INTO r_main, r_asst
      FROM patient_packages pp JOIN service_packages sp ON sp.id = pp.package_id
     WHERE pp.id = NEW.patient_package_id;
    r_main := COALESCE(r_main, 0);
    NEW.hand_fee_main := CASE WHEN NEW.hand_main_staff_id IS NOT NULL THEN r_main END;
    NEW.hand_fee_asst := CASE WHEN NEW.hand_asst_staff_id IS NOT NULL THEN ROUND(COALESCE(NULLIF(r_asst, 0), r_main * 0.5), 2) END;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_package_usage_hand_fee ON package_usages;
CREATE TRIGGER trg_package_usage_hand_fee BEFORE INSERT OR UPDATE ON package_usages
    FOR EACH ROW EXECUTE FUNCTION public.fn_package_usage_hand_fee();

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
    WHERE ih.status = 'paid' AND v.doctor_id IS NOT NULL AND COALESCE(inv.df_doctor, 0) > 0 AND COALESCE(ih.df_scheme, '') <> 'pct'
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
    WHERE ih.status = 'paid' AND v.nurse_id IS NOT NULL AND COALESCE(inv.df_nurse, 0) > 0 AND COALESCE(ih.hand_scheme, '') <> 'line'
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
    WHERE ih.status = 'paid' AND v.assistant_id IS NOT NULL AND COALESCE(inv.df_assistant, 0) > 0 AND COALESCE(ih.hand_scheme, '') <> 'line'
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
    WHERE ih.status = 'paid' AND v.doctor_id IS NOT NULL AND COALESCE(sc.df_doctor, 0) > 0 AND COALESCE(ih.df_scheme, '') <> 'pct'
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
    WHERE ih.status = 'paid' AND v.nurse_id IS NOT NULL AND COALESCE(sc.df_nurse, 0) > 0 AND COALESCE(ih.hand_scheme, '') <> 'line'
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
    WHERE ih.status = 'paid' AND v.assistant_id IS NOT NULL AND COALESCE(sc.df_assistant, 0) > 0 AND COALESCE(ih.hand_scheme, '') <> 'line'
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
),
-- ═══ DF แพทย์ % รายบรรทัด (เฟส 2B) — เฉพาะรายการที่ระบุแพทย์ผู้ทำ ═══
-- ฐาน = ยอดสุทธิหลังส่วนลด (ส่วนลดท้ายบิลเกลี่ยตามสัดส่วน) · คิดตามเงินที่ได้รับจริงในเดือนนั้น
-- (จ่ายบางส่วน = ตามที่จ่าย, คืนเงิน = ติดลบในเดือนที่คืน) · ไม่นับบิลที่ยกเลิก
pct_lines AS (
    SELECT ii.id, ii.inv_id, ii.item_name, ii.qty, ii.performer_staff_id, ii.df_pct,
        (COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) AS after_line_disc,
        SUM(COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) OVER (PARTITION BY ii.inv_id) AS inv_after_line_disc
    FROM invoice_items ii
),
doctor_pct AS (
    SELECT l.performer_staff_id AS staff_id, 'doctor' AS role,
        to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM') AS period_month, ih.clinic_id,
        l.id::text AS item_id, l.item_name, l.qty,
        l.df_pct AS df_rate,
        ROUND(SUM(l.after_line_disc * l.df_pct / 100.0 * pl.amount / NULLIF(l.inv_after_line_disc, 0)), 2) AS commission_amount,
        ih.id AS inv_id, ih.invoice_date, ih.vn
    FROM pct_lines l
    JOIN invoice_headers ih ON ih.id = l.inv_id
    JOIN payment_logs pl ON pl.inv_id = ih.id
    WHERE ih.df_scheme = 'pct' AND ih.status::text <> 'voided'
      AND l.performer_staff_id IS NOT NULL AND COALESCE(l.df_pct, 0) > 0 AND l.inv_after_line_disc > 0
    GROUP BY l.performer_staff_id, to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM'), ih.clinic_id,
        l.id, l.item_name, l.qty, l.df_pct, ih.id, ih.invoice_date, ih.vn
),
-- ═══ ค่ามือรายบรรทัด (เฟส 2C) — จ่ายตามครั้งที่ทำจริง (นับวันที่ทำ ไม่รอรับเงิน) · snapshot ตอนออกบิล ═══
hand_main AS (
    SELECT ii.hand_main_staff_id AS staff_id, 'nurse' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month, ih.clinic_id,
        ii.id::text AS item_id, ii.item_name, ii.qty,
        ii.hand_fee_main AS df_rate, ii.hand_fee_main AS commission_amount,
        ih.id AS inv_id, ih.invoice_date, ih.vn
    FROM invoice_items ii JOIN invoice_headers ih ON ih.id = ii.inv_id
    WHERE ih.hand_scheme = 'line' AND ih.status::text NOT IN ('voided','refunded')
      AND ii.hand_main_staff_id IS NOT NULL AND COALESCE(ii.hand_fee_main, 0) > 0
),
hand_asst AS (
    SELECT ii.hand_asst_staff_id AS staff_id, 'assistant' AS role,
        to_char(ih.invoice_date, 'YYYY-MM') AS period_month, ih.clinic_id,
        ii.id::text AS item_id, ii.item_name, ii.qty,
        ii.hand_fee_asst AS df_rate, ii.hand_fee_asst AS commission_amount,
        ih.id AS inv_id, ih.invoice_date, ih.vn
    FROM invoice_items ii JOIN invoice_headers ih ON ih.id = ii.inv_id
    WHERE ih.hand_scheme = 'line' AND ih.status::text NOT IN ('voided','refunded')
      AND ii.hand_asst_staff_id IS NOT NULL AND COALESCE(ii.hand_fee_asst, 0) > 0
),
-- ═══ ค่ามือจากการตัดคอส (เฟส 2C) — ต่อครั้งที่ทำจริง นับเดือนที่ใช้ ═══
pkg_hand_main AS (
    SELECT pu.hand_main_staff_id AS staff_id, 'nurse' AS role,
        to_char((pu.used_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM') AS period_month, pu.clinic_id,
        pu.id::text AS item_id, ('คอส: ' || pp.package_name || ' ครั้งที่ ' || pu.session_no) AS item_name, 1::numeric AS qty,
        pu.hand_fee_main AS df_rate, pu.hand_fee_main AS commission_amount,
        pp.invoice_id AS inv_id, (pu.used_at AT TIME ZONE 'Asia/Bangkok')::date AS invoice_date, pu.visit_vn AS vn
    FROM package_usages pu JOIN patient_packages pp ON pp.id = pu.patient_package_id
    WHERE pu.hand_main_staff_id IS NOT NULL AND COALESCE(pu.hand_fee_main, 0) > 0
),
pkg_hand_asst AS (
    SELECT pu.hand_asst_staff_id AS staff_id, 'assistant' AS role,
        to_char((pu.used_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM') AS period_month, pu.clinic_id,
        pu.id::text AS item_id, ('คอส: ' || pp.package_name || ' ครั้งที่ ' || pu.session_no) AS item_name, 1::numeric AS qty,
        pu.hand_fee_asst AS df_rate, pu.hand_fee_asst AS commission_amount,
        pp.invoice_id AS inv_id, (pu.used_at AT TIME ZONE 'Asia/Bangkok')::date AS invoice_date, pu.visit_vn AS vn
    FROM package_usages pu JOIN patient_packages pp ON pp.id = pu.patient_package_id
    WHERE pu.hand_asst_staff_id IS NOT NULL AND COALESCE(pu.hand_fee_asst, 0) > 0
)
SELECT * FROM doctor_df
UNION ALL SELECT * FROM nurse_df
UNION ALL SELECT * FROM assistant_df
UNION ALL SELECT * FROM doctor_svc
UNION ALL SELECT * FROM nurse_svc
UNION ALL SELECT * FROM assistant_svc
UNION ALL SELECT * FROM sales_df
UNION ALL SELECT * FROM doctor_pct
UNION ALL SELECT * FROM hand_main
UNION ALL SELECT * FROM hand_asst
UNION ALL SELECT * FROM pkg_hand_main
UNION ALL SELECT * FROM pkg_hand_asst;

COMMENT ON VIEW v_commission_summary IS 'รวม DF/Commission: แบบเดิม + เซลล์คอส + DF แพทย์ % รายบรรทัด + ค่ามือรายบรรทัด + ค่ามือตัดคอส';
