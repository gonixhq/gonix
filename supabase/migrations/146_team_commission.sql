-- ════════════════════════════════════════════════════════════
-- 146: สเปกการเงิน เฟส 2E — คอมทีม (ขั้นบันได 1–3% ของรายได้ความงามทั้งเดือน)
-- ════════════════════════════════════════════════════════════
--   • ฐาน = เงินที่รับจริงในเดือน (หลังส่วนลด) เฉพาะรายการความงาม × % นับเข้าคอมทีม ของรายการ
--     (ผ่าตัดที่สถานพยาบาลอื่น = 40%) · คืนเงิน = ติดลบเดือนที่คืน
--   • ขั้น: team_comm_tier_sets (มีวันเริ่มใช้) → กองกลาง = ฐาน × %
--   • แบ่งตามคะแนน = น้ำหนักตำแหน่ง (finance_rates team_w_*) × วันมาทำงาน (staff_time_logs)
--     ไม่รวมกรรมการ/ผู้ถือหุ้น (team_position='excluded') · นับเฉพาะวันหลังพ้นทดลองงาน (probation_end)
--   • อนุมัติรายเดือน → snapshot team_comm_months/shares → เข้าหน้าค่าตอบแทน
-- ════════════════════════════════════════════════════════════

-- ── น้ำหนักตำแหน่ง (tenant setting) ──
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
        ('ref_lapse_months', 12),
        ('team_w_nurse', 2),
        ('team_w_marketing', 2),
        ('team_w_assistant', 1),
        ('team_w_front', 1),
        ('team_w_general', 0.5)
      ) AS d(k, v)
    ON CONFLICT (clinic_id, rate_key, effective_from) DO NOTHING
$$;
SELECT fn_seed_finance_rates(id) FROM tenants;

-- ── ตำแหน่งในคอมทีม + วันพ้นทดลองงาน ──
ALTER TABLE staff ADD COLUMN IF NOT EXISTS team_position text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS probation_end date;
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_team_position_chk;
ALTER TABLE staff ADD CONSTRAINT staff_team_position_chk
    CHECK (team_position IS NULL OR team_position IN ('nurse','marketing','assistant','front','general','excluded'));
COMMENT ON COLUMN staff.team_position IS 'คอมทีม: nurse=พยาบาลวิชาชีพ marketing=การตลาด assistant=ผู้ช่วยพยาบาล front=ต้อนรับ/ธุรการ general=แม่บ้าน/ทั่วไป excluded=กรรมการ/ผู้ถือหุ้น · null=ยังไม่ตั้ง (ไม่นับ)';
COMMENT ON COLUMN staff.probation_end IS 'วันสุดท้ายของทดลองงาน — นับวันทำงานคอมทีมเฉพาะวันหลังจากนี้ · null = ไม่มี/พ้นแล้ว';

-- ── % นับเข้าคอมทีมรายเมนู (null = 100) ──
ALTER TABLE service_catalog  ADD COLUMN IF NOT EXISTS team_count_pct numeric(5,2);
ALTER TABLE inventory        ADD COLUMN IF NOT EXISTS team_count_pct numeric(5,2);
ALTER TABLE service_packages ADD COLUMN IF NOT EXISTS team_count_pct numeric(5,2);
ALTER TABLE invoice_items    ADD COLUMN IF NOT EXISTS team_pct numeric(5,2);

CREATE OR REPLACE FUNCTION public.fn_invoice_item_team_pct() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pct numeric; v_seg text; v_clinic uuid;
BEGIN
    SELECT clinic_id INTO v_clinic FROM invoice_headers WHERE id = NEW.inv_id;
    SELECT sc.team_count_pct, sc.segment INTO v_pct, v_seg
      FROM service_catalog sc WHERE sc.id::text = NEW.item_ref_id::text AND sc.clinic_id = v_clinic;
    IF NOT FOUND THEN
        SELECT i.team_count_pct, i.segment INTO v_pct, v_seg
          FROM inventory i WHERE i.id::text = NEW.item_ref_id::text AND i.clinic_id = v_clinic;
        IF NOT FOUND THEN
            SELECT sp.team_count_pct, sp.segment INTO v_pct, v_seg
              FROM service_packages sp WHERE sp.id::text = NEW.item_ref_id::text AND sp.clinic_id = v_clinic;
        END IF;
    END IF;
    NEW.team_pct := CASE WHEN COALESCE(NEW.segment, v_seg, '') = 'aesthetic' THEN COALESCE(v_pct, 100) ELSE 0 END;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoice_item_team_pct ON invoice_items;
CREATE TRIGGER trg_invoice_item_team_pct BEFORE INSERT ON invoice_items FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_item_team_pct();

-- ── ขั้นบันได (มีวันเริ่มใช้) ──
CREATE TABLE IF NOT EXISTS team_comm_tier_sets (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    effective_from date NOT NULL,
    tiers          jsonb NOT NULL,   -- [{ "min": 100000, "pct": 1 }, ...] เรียงน้อย→มาก
    note           text,
    created_by     uuid,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, effective_from)
);
ALTER TABLE team_comm_tier_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_comm_tier_sets_select ON team_comm_tier_sets;
CREATE POLICY team_comm_tier_sets_select ON team_comm_tier_sets FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS team_comm_tier_sets_write ON team_comm_tier_sets;
CREATE POLICY team_comm_tier_sets_write ON team_comm_tier_sets FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')));
INSERT INTO team_comm_tier_sets (clinic_id, effective_from, tiers, note)
SELECT id, DATE '2000-01-01',
       '[{"min":100000,"pct":1},{"min":150000,"pct":1.5},{"min":250000,"pct":2},{"min":400000,"pct":2.5},{"min":500000,"pct":3}]'::jsonb,
       'ค่าเริ่มต้นตามสเปก'
  FROM tenants
ON CONFLICT (clinic_id, effective_from) DO NOTHING;

-- ── รายได้ความงามที่รับจริง ต่อ payment × รายการ (เคารพ RLS) ──
CREATE OR REPLACE VIEW v_team_revenue_lines WITH (security_invoker = true) AS
WITH lines AS (
    SELECT ii.id, ii.inv_id, ii.item_name, ii.segment,
        COALESCE(ii.team_pct, CASE WHEN ii.segment = 'aesthetic' THEN 100 ELSE 0 END) AS team_pct,
        (COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) AS after_line_disc,
        SUM(COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) OVER (PARTITION BY ii.inv_id) AS inv_after_line_disc
    FROM invoice_items ii
)
SELECT ih.clinic_id,
    to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM') AS period_month,
    ih.id AS inv_id, ih.hn, l.id AS item_id, l.item_name, l.team_pct,
    ROUND(l.after_line_disc * pl.amount / NULLIF(l.inv_after_line_disc, 0), 2) AS received,
    ROUND(l.after_line_disc * pl.amount / NULLIF(l.inv_after_line_disc, 0) * l.team_pct / 100.0, 2) AS counted
FROM lines l
JOIN invoice_headers ih ON ih.id = l.inv_id
JOIN payment_logs pl ON pl.inv_id = ih.id
WHERE ih.status::text <> 'voided' AND l.team_pct > 0 AND l.inv_after_line_disc > 0;

-- ── snapshot ที่อนุมัติแล้ว ──
CREATE TABLE IF NOT EXISTS team_comm_months (
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_month  date NOT NULL,          -- YYYY-MM-01
    base_revenue  numeric(14,2) NOT NULL,
    tier_pct      numeric(5,2) NOT NULL,
    pool          numeric(14,2) NOT NULL,
    total_score   numeric(12,2) NOT NULL,
    note          text,
    approved_by   uuid REFERENCES profiles(id),
    approved_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (clinic_id, period_month)
);
CREATE TABLE IF NOT EXISTS team_comm_shares (
    clinic_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_month  date NOT NULL,
    staff_id      uuid NOT NULL REFERENCES staff(id),
    team_position text NOT NULL,
    weight        numeric(6,2) NOT NULL,
    work_days     int NOT NULL,
    score         numeric(12,2) NOT NULL,
    amount        numeric(12,2) NOT NULL,
    PRIMARY KEY (clinic_id, period_month, staff_id),
    FOREIGN KEY (clinic_id, period_month) REFERENCES team_comm_months(clinic_id, period_month) ON DELETE CASCADE
);
ALTER TABLE team_comm_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_comm_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_comm_months_select ON team_comm_months;
CREATE POLICY team_comm_months_select ON team_comm_months FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS team_comm_months_write ON team_comm_months;
CREATE POLICY team_comm_months_write ON team_comm_months FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')));
DROP POLICY IF EXISTS team_comm_shares_select ON team_comm_shares;
CREATE POLICY team_comm_shares_select ON team_comm_shares FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS team_comm_shares_write ON team_comm_shares;
CREATE POLICY team_comm_shares_write ON team_comm_shares FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')));

ALTER TABLE compensation_payouts ADD COLUMN IF NOT EXISTS team_comm_amount numeric NOT NULL DEFAULT 0;
