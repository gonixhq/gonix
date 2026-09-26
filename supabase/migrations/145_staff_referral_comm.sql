-- ════════════════════════════════════════════════════════════
-- 145: สเปกการเงิน เฟส 2D — คอมแนะนำ (พนักงานพาลูกค้ามา)
-- ════════════════════════════════════════════════════════════
--   • staff_referrals: ลูกค้า 1 คน มีผู้แนะนำที่ใช้งานได้คนเดียว · บันทึกได้เฉพาะวันลงทะเบียนครั้งแรก (ห้ามย้อนหลัง)
--     หรือวันที่ตามลูกค้าที่หายไปเกิน 12 เดือนกลับมา · ลูกค้าเดิม (ยังมาอยู่) ไม่นับ
--   • ไม่มาเกิน ref_lapse_months (12) → ผู้แนะนำหลุดอัตโนมัติ · พนักงานลาออก (staff.resigned_on) → สิ้นสุดสิทธิ์
--   • snapshot ตอนออกบิล: invoice_headers.ref_staff_id · invoice_items.ref_comm_mode/value (เฉพาะ segment ความงาม)
--     อัตรา: ตั้งรายเมนูได้ (pct / fixed ต่อบรรทัด / per_unit ต่อหน่วย / none) · ไม่ตั้ง = ref_comm_pct (3%) ของยอดสุทธิ
--   • v_commission_summary: + ref_comm (role 'referral') คิดตามเงินที่รับจริงรายเดือน
-- ════════════════════════════════════════════════════════════

-- ── อัตรา (tenant setting) ──
CREATE OR REPLACE FUNCTION fn_seed_finance_rates(p_clinic uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    INSERT INTO finance_rates (clinic_id, rate_key, rate_value, effective_from, note)
    SELECT p_clinic, k, v, DATE '2000-01-01', 'ค่าเริ่มต้นตามสเปก'
      FROM (VALUES
        ('mdr_debit_domestic', 0.50),
        ('mdr_credit_domestic', 1.60),
        ('mdr_credit_domestic_premium', 2.40),
        ('mdr_foreign', 2.25),
        ('mdr_foreign_premium', 3.10),
        ('mdr_kbank', 1.60),
        ('card_fee_vat_pct', 7),
        ('installment_interest_pct_month', 0.65),
        ('vat_enabled', 0),
        ('doctor_hour_rate', 750),
        ('df_doctor_pct', 7),
        ('ref_comm_pct', 3),
        ('ref_lapse_months', 12)
      ) AS d(k, v)
    ON CONFLICT (clinic_id, rate_key, effective_from) DO NOTHING
$$;
SELECT fn_seed_finance_rates(id) FROM tenants;

-- ── อัตราคอมแนะนำรายเมนู (ว่าง = % มาตรฐาน) ──
ALTER TABLE service_catalog  ADD COLUMN IF NOT EXISTS ref_comm_mode text, ADD COLUMN IF NOT EXISTS ref_comm_value numeric(12,2);
ALTER TABLE inventory        ADD COLUMN IF NOT EXISTS ref_comm_mode text, ADD COLUMN IF NOT EXISTS ref_comm_value numeric(12,2);
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS ref_comm_mode text, ADD COLUMN IF NOT EXISTS ref_comm_value numeric(12,2);
ALTER TABLE service_catalog  DROP CONSTRAINT IF EXISTS service_catalog_ref_comm_mode_chk;
ALTER TABLE service_catalog  ADD CONSTRAINT service_catalog_ref_comm_mode_chk CHECK (ref_comm_mode IS NULL OR ref_comm_mode IN ('pct','fixed','per_unit','none'));
ALTER TABLE inventory        DROP CONSTRAINT IF EXISTS inventory_ref_comm_mode_chk;
ALTER TABLE inventory        ADD CONSTRAINT inventory_ref_comm_mode_chk CHECK (ref_comm_mode IS NULL OR ref_comm_mode IN ('pct','fixed','per_unit','none'));
ALTER TABLE service_packages DROP CONSTRAINT IF EXISTS service_packages_ref_comm_mode_chk;
ALTER TABLE service_packages ADD CONSTRAINT service_packages_ref_comm_mode_chk CHECK (ref_comm_mode IS NULL OR ref_comm_mode IN ('pct','fixed','per_unit','none'));

-- ── วันลาออก (ปิดสถานะพนักงาน → บันทึกวันอัตโนมัติ) ──
ALTER TABLE staff ADD COLUMN IF NOT EXISTS resigned_on date;
CREATE OR REPLACE FUNCTION fn_staff_resigned_on() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_active IS FALSE AND COALESCE(OLD.is_active, true) IS TRUE AND NEW.resigned_on IS NULL THEN
        NEW.resigned_on := (now() AT TIME ZONE 'Asia/Bangkok')::date;
    ELSIF NEW.is_active IS TRUE AND OLD.is_active IS FALSE THEN
        NEW.resigned_on := NULL;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_staff_resigned_on ON staff;
CREATE TRIGGER trg_staff_resigned_on BEFORE UPDATE OF is_active ON staff FOR EACH ROW EXECUTE FUNCTION fn_staff_resigned_on();

-- ── ผู้แนะนำ (ประวัติ) ──
CREATE TABLE IF NOT EXISTS staff_referrals (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hn          text NOT NULL REFERENCES patients(hn),
    staff_id    uuid NOT NULL REFERENCES staff(id),
    kind        text NOT NULL DEFAULT 'new' CHECK (kind IN ('new','returning')),  -- ลูกค้าใหม่ / ตามกลับมาหลังหาย >12 เดือน
    started_on  date NOT NULL,
    ended_on    date,
    end_reason  text CHECK (end_reason IS NULL OR end_reason IN ('lapsed','staff_left','cancelled')),
    note        text,
    created_by  uuid REFERENCES profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_referrals_active ON staff_referrals (clinic_id, hn) WHERE ended_on IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_referrals_staff ON staff_referrals (staff_id);
ALTER TABLE staff_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_referrals_select ON staff_referrals;
CREATE POLICY staff_referrals_select ON staff_referrals FOR SELECT
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
-- เขียนผ่าน RPC เท่านั้น (บังคับกฎ) — ไม่มี policy insert/update/delete

ALTER TABLE invoice_headers ADD COLUMN IF NOT EXISTS ref_staff_id uuid REFERENCES staff(id);
ALTER TABLE invoice_headers ADD COLUMN IF NOT EXISTS ref_referral_id uuid REFERENCES staff_referrals(id);
ALTER TABLE invoice_items   ADD COLUMN IF NOT EXISTS ref_comm_mode text;
ALTER TABLE invoice_items   ADD COLUMN IF NOT EXISTS ref_comm_value numeric(12,2);

-- วันที่ลูกค้ามาครั้งล่าสุด "ก่อน" วันที่กำหนด
CREATE OR REPLACE FUNCTION fn_last_visit_before(p_clinic uuid, p_hn text, p_date date)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT max(visit_date) FROM visits WHERE clinic_id = p_clinic AND hn = p_hn AND visit_date < p_date
$$;

-- ── บันทึกผู้แนะนำ (บังคับกฎทั้งหมดที่ DB) ──
CREATE OR REPLACE FUNCTION public.fn_set_staff_referral(p_hn text, p_staff_id uuid, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_clinic uuid; v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
    v_pt record; v_active record; v_last date; v_lapse int; v_kind text; v_id uuid;
BEGIN
    SELECT clinic_id INTO v_clinic FROM profiles WHERE id = auth.uid();
    IF v_clinic IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์'; END IF;
    SELECT hn, created_at, first_visit_date INTO v_pt FROM patients WHERE hn = p_hn AND clinic_id = v_clinic;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบลูกค้า'; END IF;
    IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id AND clinic_id = v_clinic AND is_active) THEN
        RAISE EXCEPTION 'พนักงานผู้แนะนำไม่ถูกต้อง';
    END IF;
    v_lapse := COALESCE(public.fn_finance_rate(v_clinic, 'ref_lapse_months', v_today), 12)::int;
    v_last := public.fn_last_visit_before(v_clinic, p_hn, v_today);

    SELECT * INTO v_active FROM staff_referrals WHERE clinic_id = v_clinic AND hn = p_hn AND ended_on IS NULL;
    IF FOUND AND GREATEST(v_active.started_on, COALESCE(v_last, v_active.started_on)) >= v_today - make_interval(months => v_lapse) THEN
        RAISE EXCEPTION 'ลูกค้ารายนี้มีผู้แนะนำอยู่แล้ว (1 คนมีผู้แนะนำได้คนเดียว)';
    END IF;

    IF v_last IS NULL AND COALESCE(v_pt.first_visit_date, (v_pt.created_at AT TIME ZONE 'Asia/Bangkok')::date) >= v_today
       AND NOT EXISTS (SELECT 1 FROM staff_referrals WHERE clinic_id = v_clinic AND hn = p_hn) THEN
        v_kind := 'new';                                  -- ลงทะเบียนวันนี้ ยังไม่เคยมา
    ELSIF v_last IS NOT NULL AND v_last < v_today - make_interval(months => v_lapse) THEN
        v_kind := 'returning';                            -- หายไปเกิน 12 เดือน แล้วพนักงานตามกลับมา
    ELSE
        RAISE EXCEPTION 'บันทึกผู้แนะนำได้เฉพาะวันลงทะเบียนครั้งแรก หรือลูกค้าที่ไม่ได้มาเกิน % เดือน (ลูกค้าเดิมไม่นับ)', v_lapse;
    END IF;

    IF v_active.id IS NOT NULL THEN
        UPDATE staff_referrals SET ended_on = v_today, end_reason = 'lapsed' WHERE id = v_active.id;
    END IF;
    INSERT INTO staff_referrals (clinic_id, hn, staff_id, kind, started_on, note, created_by)
    VALUES (v_clinic, p_hn, p_staff_id, v_kind, v_today, NULLIF(trim(p_note), ''), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_set_staff_referral(text, uuid, text) TO authenticated;

-- ── ยกเลิก (บันทึกผิด) — owner/admin เท่านั้น · บิลที่ออกไปแล้วยังคงเดิม ──
CREATE OR REPLACE FUNCTION public.fn_cancel_staff_referral(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic uuid; v_role text;
BEGIN
    SELECT clinic_id, role::text INTO v_clinic, v_role FROM profiles WHERE id = auth.uid();
    IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'เฉพาะเจ้าของ/ผู้จัดการ'; END IF;
    IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'กรุณาระบุเหตุผล'; END IF;
    UPDATE staff_referrals SET ended_on = (now() AT TIME ZONE 'Asia/Bangkok')::date, end_reason = 'cancelled',
           note = trim(COALESCE(note || ' · ', '') || 'ยกเลิก: ' || p_reason)
     WHERE id = p_id AND clinic_id = v_clinic AND ended_on IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรายการที่ใช้งานอยู่'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_cancel_staff_referral(uuid, text) TO authenticated;

-- ── snapshot ผู้แนะนำลงบิล (ทุกช่องทางออกบิล) ──
CREATE OR REPLACE FUNCTION public.fn_invoice_ref_staff() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_last date; v_lapse int; v_act date;
BEGIN
    IF NEW.hn IS NULL OR NEW.ref_staff_id IS NOT NULL THEN RETURN NEW; END IF;
    SELECT sr.*, s.is_active AS staff_active INTO r
      FROM staff_referrals sr JOIN staff s ON s.id = sr.staff_id
     WHERE sr.clinic_id = NEW.clinic_id AND sr.hn = NEW.hn AND sr.ended_on IS NULL;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF NOT r.staff_active THEN
        UPDATE staff_referrals SET ended_on = NEW.invoice_date, end_reason = 'staff_left' WHERE id = r.id;
        RETURN NEW;
    END IF;
    v_lapse := COALESCE(public.fn_finance_rate(NEW.clinic_id, 'ref_lapse_months', NEW.invoice_date), 12)::int;
    v_last := public.fn_last_visit_before(NEW.clinic_id, NEW.hn, NEW.invoice_date);
    v_act := GREATEST(r.started_on, COALESCE(v_last, r.started_on));
    IF v_act < NEW.invoice_date - make_interval(months => v_lapse) THEN
        UPDATE staff_referrals SET ended_on = (v_act + make_interval(months => v_lapse))::date, end_reason = 'lapsed' WHERE id = r.id;
        RETURN NEW;
    END IF;
    NEW.ref_staff_id := r.staff_id;
    NEW.ref_referral_id := r.id;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoice_ref_staff ON invoice_headers;
CREATE TRIGGER trg_invoice_ref_staff BEFORE INSERT ON invoice_headers FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_ref_staff();

-- ── snapshot อัตราคอมแนะนำต่อรายการ (เฉพาะความงาม) ──
CREATE OR REPLACE FUNCTION public.fn_invoice_item_ref_comm() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h record; v_mode text; v_val numeric; v_seg text;
BEGIN
    SELECT ref_staff_id, invoice_date, clinic_id INTO h FROM invoice_headers WHERE id = NEW.inv_id;
    IF h.ref_staff_id IS NULL THEN RETURN NEW; END IF;
    SELECT sc.ref_comm_mode, sc.ref_comm_value, sc.segment INTO v_mode, v_val, v_seg
      FROM service_catalog sc WHERE sc.id::text = NEW.item_ref_id::text AND sc.clinic_id = h.clinic_id;
    IF NOT FOUND THEN
        SELECT i.ref_comm_mode, i.ref_comm_value, i.segment INTO v_mode, v_val, v_seg
          FROM inventory i WHERE i.id::text = NEW.item_ref_id::text AND i.clinic_id = h.clinic_id;
        IF NOT FOUND THEN
            SELECT sp.ref_comm_mode, sp.ref_comm_value, sp.segment INTO v_mode, v_val, v_seg
              FROM service_packages sp WHERE sp.id::text = NEW.item_ref_id::text AND sp.clinic_id = h.clinic_id;
        END IF;
    END IF;
    -- ไม่มีคอมแนะนำ: เวชกรรมทั่วไป ยา ตรวจ (segment อื่นที่ไม่ใช่ความงาม)
    IF COALESCE(NEW.segment, v_seg, '') <> 'aesthetic' OR v_mode = 'none' THEN RETURN NEW; END IF;
    IF v_mode IS NULL OR v_val IS NULL THEN
        v_mode := 'pct';
        v_val := public.fn_finance_rate(h.clinic_id, 'ref_comm_pct', h.invoice_date);
    END IF;
    NEW.ref_comm_mode := v_mode;
    NEW.ref_comm_value := v_val;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoice_item_ref_comm ON invoice_items;
CREATE TRIGGER trg_invoice_item_ref_comm BEFORE INSERT ON invoice_items FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_item_ref_comm();

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
),
-- ═══ คอมแนะนำ (เฟส 2D) — เฉพาะฝั่งความงาม · คิดตอนรับเงิน (ตามสัดส่วนที่จ่ายจริงในเดือนนั้น) ═══
-- คืนเงิน = ติดลบในเดือนที่คืน · พนักงานลาออก → ไม่นับเงินที่รับหลังวันลาออก
ref_lines AS (
    SELECT ii.id, ii.inv_id, ii.item_name, ii.qty, ii.ref_comm_mode, ii.ref_comm_value,
        (COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) AS after_line_disc,
        SUM(COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) OVER (PARTITION BY ii.inv_id) AS inv_after_line_disc
    FROM invoice_items ii
),
ref_comm AS (
    SELECT ih.ref_staff_id AS staff_id, 'referral' AS role,
        to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM') AS period_month, ih.clinic_id,
        l.id::text AS item_id, l.item_name, l.qty,
        l.ref_comm_value AS df_rate,
        ROUND(SUM(CASE l.ref_comm_mode
            WHEN 'pct'      THEN l.after_line_disc * l.ref_comm_value / 100.0 * pl.amount / NULLIF(l.inv_after_line_disc, 0)
            WHEN 'fixed'    THEN l.ref_comm_value * pl.amount / NULLIF(ih.total_amount, 0)
            WHEN 'per_unit' THEN l.ref_comm_value * l.qty * pl.amount / NULLIF(ih.total_amount, 0)
            ELSE 0 END), 2) AS commission_amount,
        ih.id AS inv_id, ih.invoice_date, ih.vn
    FROM ref_lines l
    JOIN invoice_headers ih ON ih.id = l.inv_id
    JOIN payment_logs pl ON pl.inv_id = ih.id
    JOIN staff s ON s.id = ih.ref_staff_id
    WHERE ih.ref_staff_id IS NOT NULL AND ih.status::text <> 'voided'
      AND l.ref_comm_mode IS NOT NULL AND COALESCE(l.ref_comm_value, 0) > 0
      AND (s.resigned_on IS NULL OR (pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date < s.resigned_on)
    GROUP BY ih.ref_staff_id, to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM'), ih.clinic_id,
        l.id, l.item_name, l.qty, l.ref_comm_value, ih.id, ih.invoice_date, ih.vn
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
UNION ALL SELECT * FROM pkg_hand_asst
UNION ALL SELECT * FROM ref_comm;

COMMENT ON VIEW v_commission_summary IS 'รวม DF/Commission: แบบเดิม + เซลล์คอส + DF แพทย์ % + ค่ามือรายบรรทัด + ค่ามือตัดคอส + คอมแนะนำ';
