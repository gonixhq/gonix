-- ════════════════════════════════════════════════════════════
-- 161: บิลค้างจ่าย / เจ้าหนี้ (ขยายจาก lab_vendor_bills ของ mig 160)
-- ════════════════════════════════════════════════════════════
--   • vendor_bills.bill_type: lab (แล็บภายนอก) · supplier (บริษัทยา/เวชภัณฑ์) · expense (ค่าใช้จ่ายคลินิก)
--   • รายงานกำไร: lab/supplier = ต้นทุนนับแล้วตอนขาย/ใช้ของ → ไม่นับซ้ำ
--                 expense = นับตามเดือนของบิล (in_pl) · ถ้าตั้งไว้ในต้นทุนคงที่แล้ว → in_pl = false
--   • vendors = ทะเบียนผู้ขาย (เครดิตกี่วัน เลขผู้เสียภาษี เบอร์) → เติมวันครบกำหนดให้อัตโนมัติ
--   • stock_card.vendor_bill_id = ผูกการรับของเข้าสต๊อกกับใบแจ้งหนี้บริษัทยา → เทียบยอด
-- ════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS lab_vendor_bills RENAME TO vendor_bills;
ALTER INDEX IF EXISTS idx_lab_vendor_bills_clinic RENAME TO idx_vendor_bills_clinic;

ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS bill_type text NOT NULL DEFAULT 'lab';
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS in_pl boolean NOT NULL DEFAULT true;
ALTER TABLE vendor_bills ADD COLUMN IF NOT EXISTS paid_ref text;
ALTER TABLE vendor_bills DROP CONSTRAINT IF EXISTS vendor_bills_type_chk;
ALTER TABLE vendor_bills ADD CONSTRAINT vendor_bills_type_chk CHECK (bill_type IN ('lab','supplier','expense'));
CREATE INDEX IF NOT EXISTS idx_vendor_bills_open ON vendor_bills (clinic_id, due_date) WHERE paid_at IS NULL;
COMMENT ON COLUMN vendor_bills.in_pl IS 'expense: นับเข้ารายงานกำไรตามเดือนของบิล (false = มีในต้นทุนคงที่แล้ว)';

DROP POLICY IF EXISTS lab_vendor_bills_select ON vendor_bills;
DROP POLICY IF EXISTS lab_vendor_bills_write ON vendor_bills;
DROP POLICY IF EXISTS vendor_bills_select ON vendor_bills;
CREATE POLICY vendor_bills_select ON vendor_bills FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS vendor_bills_write ON vendor_bills;
CREATE POLICY vendor_bills_write ON vendor_bills FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')));

-- ── ทะเบียนผู้ขาย ──
CREATE TABLE IF NOT EXISTS vendors (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name         text NOT NULL,
    vendor_type  text NOT NULL DEFAULT 'supplier' CHECK (vendor_type IN ('lab','supplier','expense')),
    credit_days  integer NOT NULL DEFAULT 30 CHECK (credit_days >= 0),
    bill_day     integer CHECK (bill_day BETWEEN 1 AND 31),   -- วันที่ใบแจ้งหนี้มา (เช่น 5)
    tax_id       text,
    phone        text,
    note         text,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, name)
);
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendors_select ON vendors;
CREATE POLICY vendors_select ON vendors FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS vendors_write ON vendors;
CREATE POLICY vendors_write ON vendors FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')));

-- ผู้ขายจากบิลแล็บเดิม + ชื่อแล็บในเมนู
INSERT INTO vendors (clinic_id, name, vendor_type, credit_days, bill_day)
SELECT DISTINCT clinic_id, vendor, 'lab', 30, 5 FROM vendor_bills WHERE vendor IS NOT NULL
ON CONFLICT (clinic_id, name) DO NOTHING;
INSERT INTO vendors (clinic_id, name, vendor_type, credit_days, bill_day)
SELECT DISTINCT clinic_id, lab_vendor, 'lab', 30, 5 FROM service_catalog WHERE COALESCE(trim(lab_vendor), '') <> ''
ON CONFLICT (clinic_id, name) DO NOTHING;
-- ผู้ขายยาจากช่อง supplier ในคลัง
INSERT INTO vendors (clinic_id, name, vendor_type)
SELECT DISTINCT clinic_id, trim(supplier), 'supplier' FROM inventory WHERE COALESCE(trim(supplier), '') <> ''
ON CONFLICT (clinic_id, name) DO NOTHING;

-- ── ผูกการรับของเข้ากับใบแจ้งหนี้ ──
ALTER TABLE stock_card ADD COLUMN IF NOT EXISTS vendor_bill_id uuid REFERENCES vendor_bills(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_card_vendor_bill ON stock_card (vendor_bill_id) WHERE vendor_bill_id IS NOT NULL;

-- ── รายงานรายเดือน: + ค่าใช้จ่ายตามบิล (expense, in_pl) ──
CREATE OR REPLACE FUNCTION public.fn_monthly_finance_metrics(p_clinic uuid, p_from date, p_to date)
RETURNS TABLE (period_month text, metric text, amount numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH bounds AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Asia/Bangkok') AS s, ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Bangkok') AS e
),
lines AS (
    SELECT ii.id, ii.inv_id, ii.item_type, COALESCE(ii.segment, 'medical') AS segment,
        (COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) AS after_disc,
        SUM(COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) OVER (PARTITION BY ii.inv_id) AS inv_after
    FROM invoice_items ii
    JOIN invoice_headers ih ON ih.id = ii.inv_id
    WHERE ih.clinic_id = p_clinic AND ih.status::text <> 'voided'
),
received AS (
    SELECT to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM') AS pm, l.item_type, l.segment,
           l.after_disc * pl.amount / NULLIF(l.inv_after, 0) AS amt
      FROM lines l JOIN payment_logs pl ON pl.inv_id = l.inv_id, bounds b
     WHERE pl.paid_at >= b.s AND pl.paid_at < b.e AND l.inv_after > 0
),
uses AS (
    SELECT to_char((pu.used_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM') AS pm, COALESCE(sp.segment, 'aesthetic') AS segment,
           COALESCE(pp.net_price, pp.paid_amount) / NULLIF(pp.total_sessions, 0) AS val, pu.cost_material
      FROM package_usages pu
      JOIN patient_packages pp ON pp.id = pu.patient_package_id
      LEFT JOIN service_packages sp ON sp.id = pp.package_id, bounds b
     WHERE pu.clinic_id = p_clinic AND pu.used_at >= b.s AND pu.used_at < b.e
)
SELECT pm, 'rev_' || CASE WHEN segment = 'aesthetic' THEN 'aesthetic' ELSE 'medical' END, ROUND(SUM(amt), 2)
  FROM received WHERE item_type <> 'package' GROUP BY 1, 2
UNION ALL
SELECT pm, 'course_cash', ROUND(SUM(amt), 2) FROM received WHERE item_type = 'package' GROUP BY 1
UNION ALL
SELECT pm, 'course_use_' || CASE WHEN segment = 'aesthetic' THEN 'aesthetic' ELSE 'medical' END, ROUND(SUM(val), 2) FROM uses GROUP BY 1, 2
UNION ALL
SELECT pm, 'material', ROUND(SUM(COALESCE(cost_material, 0)), 2) FROM uses GROUP BY 1
UNION ALL
-- คอสหมดอายุในเดือน (ยังเหลือครั้ง) → รายได้
SELECT to_char((pp.expires_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM'),
       'breakage_' || CASE WHEN COALESCE(sp.segment, 'aesthetic') = 'aesthetic' THEN 'aesthetic' ELSE 'medical' END,
       ROUND(SUM(COALESCE(pp.net_price, pp.paid_amount) / NULLIF(pp.total_sessions, 0) * (pp.total_sessions - pp.used_sessions)), 2)
  FROM patient_packages pp LEFT JOIN service_packages sp ON sp.id = pp.package_id, bounds b
 WHERE pp.clinic_id = p_clinic AND pp.status NOT IN ('refunded', 'cancelled', 'completed')
   AND pp.total_sessions > pp.used_sessions AND pp.expires_at >= b.s AND pp.expires_at < b.e AND pp.expires_at < now()
 GROUP BY 1, 2
UNION ALL
-- คลินิกนิรนาม (เวชกรรม)
SELECT to_char((ac.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM'), 'rev_medical', ROUND(SUM(ac.total_amount), 2)
  FROM anon_cases ac, bounds b
 WHERE ac.clinic_id = p_clinic AND ac.paid AND ac.paid_at >= b.s AND ac.paid_at < b.e GROUP BY 1
UNION ALL
-- ต้นทุนยา/วัสดุตามบิล (วันลงบัญชี)
SELECT to_char(ih.invoice_date, 'YYYY-MM'), 'material', ROUND(SUM(COALESCE(ii.cost_material, 0)), 2)
  FROM invoice_items ii JOIN invoice_headers ih ON ih.id = ii.inv_id
 WHERE ih.clinic_id = p_clinic AND ih.status::text NOT IN ('voided', 'refunded') AND ih.invoice_date BETWEEN p_from AND p_to
 GROUP BY 1
UNION ALL
-- ค่ามือเคสรีวิว → การตลาด
SELECT to_char(ih.invoice_date, 'YYYY-MM'), 'review_hand', ROUND(SUM(COALESCE(ii.hand_fee_main, 0) + COALESCE(ii.hand_fee_asst, 0)), 2)
  FROM invoice_items ii JOIN invoice_headers ih ON ih.id = ii.inv_id
 WHERE ih.clinic_id = p_clinic AND ih.bill_type = 'review' AND ih.status::text NOT IN ('voided', 'refunded') AND ih.invoice_date BETWEEN p_from AND p_to
 GROUP BY 1
UNION ALL
-- ค่าธรรมเนียมบัตร (VAT ของค่าธรรมเนียม = ต้นทุน ถ้าคลินิกไม่ได้จด VAT)
SELECT to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM'), 'card_fee',
       ROUND(SUM(COALESCE(pl.card_fee, 0) + CASE WHEN COALESCE(public.fn_finance_rate(p_clinic, 'vat_enabled', (pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date), 0) = 1 THEN 0 ELSE COALESCE(pl.card_fee_vat, 0) END), 2)
  FROM payment_logs pl JOIN invoice_headers ih ON ih.id = pl.inv_id, bounds b
 WHERE ih.clinic_id = p_clinic AND ih.status::text <> 'voided' AND pl.paid_at >= b.s AND pl.paid_at < b.e AND pl.amount > 0
 GROUP BY 1
UNION ALL
-- ค่าธรรมเนียมบัตรคลินิกนิรนาม (mig 152)
SELECT to_char((ac.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM'), 'card_fee',
       ROUND(SUM(COALESCE(ac.card_fee, 0) + CASE WHEN COALESCE(public.fn_finance_rate(p_clinic, 'vat_enabled', (ac.paid_at AT TIME ZONE 'Asia/Bangkok')::date), 0) = 1 THEN 0 ELSE COALESCE(ac.card_fee_vat, 0) END), 2)
  FROM anon_cases ac, bounds b
 WHERE ac.clinic_id = p_clinic AND ac.paid AND ac.payment_method = 'credit_card' AND ac.paid_at >= b.s AND ac.paid_at < b.e
 GROUP BY 1
UNION ALL
SELECT to_char(w.wasted_on, 'YYYY-MM'), 'waste', ROUND(SUM(w.value), 2)
  FROM stock_waste w WHERE w.clinic_id = p_clinic AND w.wasted_on BETWEEN p_from AND p_to GROUP BY 1
UNION ALL
SELECT m.period_month, 'ad_spend', ROUND(SUM(m.amount), 2)
  FROM marketing_ad_spend m WHERE m.clinic_id = p_clinic AND m.period_month BETWEEN to_char(p_from, 'YYYY-MM') AND to_char(p_to, 'YYYY-MM') GROUP BY 1
UNION ALL
SELECT to_char(x.expense_date, 'YYYY-MM'), 'petty_cash', ROUND(SUM(x.amount), 2)
  FROM expenses x WHERE x.clinic_id = p_clinic AND x.expense_date BETWEEN p_from AND p_to GROUP BY 1
UNION ALL
-- ต้นทุนส่งแล็บ คลินิกนิรนาม (mig 160)
SELECT to_char((ac.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM'), 'material', ROUND(SUM(COALESCE(t.cost, 0)), 2)
  FROM anon_case_tests t JOIN anon_cases ac ON ac.id = t.case_id, bounds b
 WHERE ac.clinic_id = p_clinic AND ac.paid AND ac.paid_at >= b.s AND ac.paid_at < b.e GROUP BY 1
UNION ALL
-- ค่าใช้จ่ายตามบิล (mig 161) · หมวดการตลาดแยก
SELECT vb.period_month, CASE WHEN vb.category = 'marketing' THEN 'bill_marketing' ELSE 'bill_expense' END, ROUND(SUM(vb.amount), 2)
  FROM vendor_bills vb
 WHERE vb.clinic_id = p_clinic AND vb.bill_type = 'expense' AND vb.in_pl
   AND vb.period_month BETWEEN to_char(p_from, 'YYYY-MM') AND to_char(p_to, 'YYYY-MM')
 GROUP BY 1, 2
$$;
GRANT EXECUTE ON FUNCTION public.fn_monthly_finance_metrics(uuid, date, date) TO authenticated;
