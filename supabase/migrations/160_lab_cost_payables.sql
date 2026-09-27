-- ════════════════════════════════════════════════════════════
-- 160: ต้นทุนส่งแล็บภายนอก + บิลแล็บค้างจ่าย (เจ้าหนี้)
-- ════════════════════════════════════════════════════════════
--   • service_catalog.lab_cost / lab_vendor = ค่าที่แล็บเก็บเรา ต่อ 1 รายการ + ชื่อแล็บ
--   • lab_orders.service_id / cost = snapshot ตอนสั่งตรวจ (ราคาทุน ณ วันนั้น)
--   • anon_case_tests.cost = snapshot เช่นกัน (คลินิกนิรนาม)
--   • ต้นทุนแล็บเข้า invoice_items.cost_material → รายงานกำไร/ต้นทุนหัตถการ
--   • lab_vendor_bills = ใบแจ้งหนี้จากแล็บ (มาทุกวันที่ 5 · เครดิต 30 วัน) → เทียบยอดที่ระบบคาด + ติดตามจ่าย
--     (จ่ายบิลแล็บ ไม่ต้องลงเงินสดย่อยซ้ำ — ต้นทุนนับแล้วตอนขาย)
-- ════════════════════════════════════════════════════════════

ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS lab_cost numeric(12,2);
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS lab_vendor text;
COMMENT ON COLUMN service_catalog.lab_cost IS 'ต้นทุนส่งแล็บภายนอกต่อรายการ (บาท)';
COMMENT ON COLUMN service_catalog.lab_vendor IS 'ชื่อแล็บภายนอกที่ส่งตรวจ';

ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES service_catalog(id) ON DELETE SET NULL;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS cost numeric(12,2);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS lab_vendor text;
ALTER TABLE anon_case_tests ADD COLUMN IF NOT EXISTS cost numeric(12,2);
ALTER TABLE anon_case_tests ADD COLUMN IF NOT EXISTS lab_vendor text;

-- ต้นทุนวัสดุมาตรฐานของเมนู = kit + สูตร + ค่าส่งแล็บ
CREATE OR REPLACE FUNCTION public.fn_service_material_cost(p_service uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT public.fn_inv_use_cost(sc.inventory_item_id, COALESCE(sc.consume_qty, 1))
                       FROM service_catalog sc WHERE sc.id = p_service AND sc.inventory_item_id IS NOT NULL), 0)
         + COALESCE((SELECT SUM(public.fn_inv_use_cost(r.inventory_item_id, r.qty)) FROM service_recipes r WHERE r.service_id = p_service), 0)
         + COALESCE((SELECT sc.lab_cost FROM service_catalog sc WHERE sc.id = p_service), 0)
$$;

-- snapshot ตอนสั่งแล็บ: หาเมนูจากชื่อ (ถ้าไม่ได้ส่ง service_id) → ต้นทุน + แล็บ
CREATE OR REPLACE FUNCTION public.fn_lab_order_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF COALESCE(NEW.lab_type, '') = 'package' THEN NEW.cost := COALESCE(NEW.cost, 0); RETURN NEW; END IF;
    IF NEW.service_id IS NULL THEN
        SELECT sc.id INTO NEW.service_id FROM service_catalog sc
         WHERE sc.clinic_id = NEW.clinic_id AND sc.service_name = NEW.lab_name
         ORDER BY sc.is_active DESC NULLS LAST LIMIT 1;
    END IF;
    IF NEW.service_id IS NOT NULL THEN
        IF NEW.cost IS NULL THEN NEW.cost := ROUND(public.fn_service_material_cost(NEW.service_id), 2); END IF;
        IF NEW.lab_vendor IS NULL THEN SELECT sc.lab_vendor INTO NEW.lab_vendor FROM service_catalog sc WHERE sc.id = NEW.service_id; END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lab_order_cost ON lab_orders;
CREATE TRIGGER trg_lab_order_cost BEFORE INSERT ON lab_orders FOR EACH ROW EXECUTE FUNCTION public.fn_lab_order_cost();

CREATE OR REPLACE FUNCTION public.fn_anon_test_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.service_id IS NOT NULL THEN
        IF NEW.cost IS NULL THEN NEW.cost := ROUND(public.fn_service_material_cost(NEW.service_id), 2); END IF;
        IF NEW.lab_vendor IS NULL THEN SELECT sc.lab_vendor INTO NEW.lab_vendor FROM service_catalog sc WHERE sc.id = NEW.service_id; END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_anon_test_cost ON anon_case_tests;
CREATE TRIGGER trg_anon_test_cost BEFORE INSERT ON anon_case_tests FOR EACH ROW EXECUTE FUNCTION public.fn_anon_test_cost();

-- snapshot ต้นทุนลงบิล: เพิ่มกรณีบรรทัดแล็บ (item_ref_id = lab_orders.id)
CREATE OR REPLACE FUNCTION public.fn_invoice_item_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ref text := NEW.item_ref_id::text; v_inv uuid; v_lab numeric;
BEGIN
    IF v_ref IS NULL OR NEW.cost_material IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.item_type = 'package' THEN NEW.cost_material := 0; RETURN NEW; END IF;   -- คอส: ต้นทุนเกิดตอนตัดใช้
    IF NEW.item_type = 'lab' THEN
        SELECT COALESCE(lo.cost, 0) INTO v_lab FROM lab_orders lo WHERE lo.id::text = v_ref;
        IF FOUND THEN NEW.cost_material := ROUND(v_lab * COALESCE(NEW.qty, 1), 2); RETURN NEW; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM service_catalog WHERE id::text = v_ref) THEN
        NEW.cost_material := ROUND(public.fn_service_material_cost(v_ref::uuid) * COALESCE(NEW.qty, 1), 2);
        RETURN NEW;
    END IF;
    SELECT id INTO v_inv FROM inventory WHERE id::text = v_ref;
    IF v_inv IS NULL THEN SELECT item_id INTO v_inv FROM drug_orders WHERE id::text = v_ref; END IF;
    IF v_inv IS NOT NULL THEN NEW.cost_material := public.fn_inv_use_cost(v_inv, NEW.qty); END IF;
    RETURN NEW;
END $$;

-- backfill: ผูกเมนูให้ใบสั่งแล็บเดิม (ต้นทุนเดิมยังว่าง จนกว่าจะตั้ง lab_cost แล้วกด "คิดต้นทุนย้อนหลัง")
UPDATE lab_orders lo SET service_id = sc.id
  FROM service_catalog sc
 WHERE lo.service_id IS NULL AND COALESCE(lo.lab_type, '') <> 'package'
   AND sc.clinic_id = lo.clinic_id AND sc.service_name = lo.lab_name;

-- คิดต้นทุนแล็บย้อนหลังของเดือนหนึ่ง (หลังตั้งราคาทุนครั้งแรก) — owner/admin
CREATE OR REPLACE FUNCTION public.fn_backfill_lab_cost(p_month text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic uuid; n integer := 0; m integer;
BEGIN
    SELECT clinic_id INTO v_clinic FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin');
    IF v_clinic IS NULL THEN RAISE EXCEPTION 'เฉพาะเจ้าของ/ผู้จัดการ'; END IF;
    UPDATE lab_orders lo SET cost = ROUND(public.fn_service_material_cost(lo.service_id), 2),
           lab_vendor = COALESCE(lo.lab_vendor, sc.lab_vendor)
      FROM service_catalog sc
     WHERE sc.id = lo.service_id AND lo.clinic_id = v_clinic AND COALESCE(lo.cost, 0) = 0
       AND to_char((lo.created_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM') = p_month;
    GET DIAGNOSTICS m = ROW_COUNT; n := n + m;
    UPDATE invoice_items ii SET cost_material = ROUND(COALESCE(lo.cost, 0) * COALESCE(ii.qty, 1), 2)
      FROM lab_orders lo
     WHERE ii.item_type = 'lab' AND ii.item_ref_id::text = lo.id::text AND lo.clinic_id = v_clinic
       AND COALESCE(ii.cost_material, 0) = 0 AND COALESCE(lo.cost, 0) > 0;
    UPDATE anon_case_tests t SET cost = ROUND(public.fn_service_material_cost(t.service_id), 2),
           lab_vendor = COALESCE(t.lab_vendor, sc.lab_vendor)
      FROM anon_cases ac, service_catalog sc
     WHERE ac.id = t.case_id AND ac.clinic_id = v_clinic AND sc.id = t.service_id AND COALESCE(t.cost, 0) = 0
       AND to_char((t.created_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM') = p_month;
    GET DIAGNOSTICS m = ROW_COUNT; n := n + m;
    RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_backfill_lab_cost(text) TO authenticated;

-- ── ใบแจ้งหนี้จากแล็บ (เจ้าหนี้) ──
CREATE TABLE IF NOT EXISTS lab_vendor_bills (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vendor        text NOT NULL,
    period_month  text NOT NULL CHECK (period_month ~ '^\d{4}-\d{2}$'),   -- งานของเดือนไหน
    invoice_no    text,
    bill_date     date NOT NULL,
    due_date      date NOT NULL,
    amount        numeric(12,2) NOT NULL CHECK (amount >= 0),
    paid_at       date,
    paid_method   text,
    note          text,
    created_by    uuid REFERENCES profiles(id),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_vendor_bills_clinic ON lab_vendor_bills (clinic_id, period_month);
ALTER TABLE lab_vendor_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_vendor_bills_select ON lab_vendor_bills;
CREATE POLICY lab_vendor_bills_select ON lab_vendor_bills FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS lab_vendor_bills_write ON lab_vendor_bills;
CREATE POLICY lab_vendor_bills_write ON lab_vendor_bills FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')));

-- รายงานรายเดือน: เพิ่มต้นทุนแล็บคลินิกนิรนาม (เคสที่จ่ายแล้ว)
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
$$;
GRANT EXECUTE ON FUNCTION public.fn_monthly_finance_metrics(uuid, date, date) TO authenticated;
