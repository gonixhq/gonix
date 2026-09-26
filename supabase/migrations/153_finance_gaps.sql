-- ════════════════════════════════════════════════════════════
-- 153: ปิดช่องว่างสเปกการเงิน (ข้อ 3–7)
-- ════════════════════════════════════════════════════════════
--  3) ขายหัตถการแบบคอร์ส (N ครั้ง) จากเมนูบริการ → สร้างคอร์สค้างใช้อัตโนมัติ (patient_packages.service_id)
--  4) ผ่าตัดที่สถานพยาบาลอื่น = ติ๊กรายบรรทัดตอนคิดเงิน → นับคอมทีม team_offsite_pct (40%)
--  5) คืนเงิน → หักคอม/DF "เดือนถัดไป" · ยอดติดลบยกไปเดือนต่อ (compensation_payouts.df_carry)
--  6) คอมแนะนำ: ลูกค้าจากโฆษณา/ออนไลน์/เซลล์/เพื่อนแนะนำ ไม่นับ (ที่มาของเคส ใหม่: staff, ads)
--  7) บันทึกยาที่ใช้จริงต่อครั้งที่ตัดคอส (package_usage_items)
-- ════════════════════════════════════════════════════════════

-- ═══ 3) คอร์สจากเมนูบริการ ═══
ALTER TABLE patient_packages ALTER COLUMN package_id DROP NOT NULL;
ALTER TABLE patient_packages ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES service_catalog(id);
ALTER TABLE patient_packages DROP CONSTRAINT IF EXISTS patient_packages_source_chk;
ALTER TABLE patient_packages ADD CONSTRAINT patient_packages_source_chk CHECK (package_id IS NOT NULL OR service_id IS NOT NULL);

-- ค่ามือตอนตัดคอส: คอสจากเมนูบริการ ใช้อัตราค่ามือของเมนู (บาท หรือ % ของมูลค่าต่อครั้ง)
CREATE OR REPLACE FUNCTION public.fn_package_usage_hand_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r_main numeric; r_asst numeric; v_mode text; v_val numeric;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.hand_main_staff_id IS NOT DISTINCT FROM OLD.hand_main_staff_id
       AND NEW.hand_asst_staff_id IS NOT DISTINCT FROM OLD.hand_asst_staff_id THEN
        NEW.hand_fee_main := OLD.hand_fee_main; NEW.hand_fee_asst := OLD.hand_fee_asst;
        RETURN NEW;
    END IF;
    IF (NEW.hand_main_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = NEW.hand_main_staff_id AND s.clinic_id = NEW.clinic_id))
       OR (NEW.hand_asst_staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = NEW.hand_asst_staff_id AND s.clinic_id = NEW.clinic_id)) THEN
        RAISE EXCEPTION 'ผู้ปฏิบัติ/ผู้ช่วยไม่ถูกต้อง';
    END IF;
    SELECT CASE WHEN pp.service_id IS NOT NULL THEN COALESCE(sc.df_nurse, 0) ELSE COALESCE(sp.hand_fee_main, 0) END,
           CASE WHEN pp.service_id IS NOT NULL THEN NULLIF(sc.df_assistant, 0) ELSE sp.hand_fee_asst END,
           CASE WHEN pp.service_id IS NOT NULL THEN COALESCE(sc.df_mode, 'baht') ELSE 'baht' END,
           COALESCE(pp.net_price, pp.paid_amount) / NULLIF(pp.total_sessions, 0)
      INTO r_main, r_asst, v_mode, v_val
      FROM patient_packages pp
      LEFT JOIN service_packages sp ON sp.id = pp.package_id
      LEFT JOIN service_catalog sc ON sc.id = pp.service_id
     WHERE pp.id = NEW.patient_package_id;
    IF v_mode = 'percent' THEN
        r_main := ROUND(COALESCE(v_val, 0) * COALESCE(r_main, 0) / 100, 2);
        r_asst := CASE WHEN r_asst IS NULL THEN NULL ELSE ROUND(COALESCE(v_val, 0) * r_asst / 100, 2) END;
    END IF;
    r_main := COALESCE(r_main, 0);
    NEW.hand_fee_main := CASE WHEN NEW.hand_main_staff_id IS NOT NULL THEN r_main END;
    NEW.hand_fee_asst := CASE WHEN NEW.hand_asst_staff_id IS NOT NULL THEN ROUND(COALESCE(NULLIF(r_asst, 0), r_main * 0.5), 2) END;
    RETURN NEW;
END $$;

-- ต้นทุนวัสดุตอนตัดคอส: คอสจากเมนูบริการ = สูตรหัตถการของเมนู (ยาที่ใช้เพิ่มบวกจากแอปภายหลัง)
CREATE OR REPLACE FUNCTION public.fn_package_usage_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.cost_material IS NOT NULL THEN RETURN NEW; END IF;
    SELECT ROUND(CASE WHEN pp.service_id IS NOT NULL THEN public.fn_service_material_cost(pp.service_id)
                 ELSE COALESCE(sp.material_cost_per_session, 0) + COALESCE(public.fn_inv_use_cost(sp.consume_item_id, sp.consume_qty_per_session), 0) END, 2)
      INTO NEW.cost_material
      FROM patient_packages pp LEFT JOIN service_packages sp ON sp.id = pp.package_id
     WHERE pp.id = NEW.patient_package_id;
    RETURN NEW;
END $$;

CREATE OR REPLACE VIEW v_package_liability WITH (security_invoker = true) AS
WITH c AS (
    SELECT pp.*, sp.category AS sp_category,
        CASE WHEN pp.service_id IS NOT NULL THEN
            public.fn_service_material_cost(pp.service_id)
            + CASE WHEN COALESCE(sc.df_mode, 'baht') = 'percent'
                   THEN COALESCE(pp.net_price, pp.paid_amount) / NULLIF(pp.total_sessions, 0) * (COALESCE(sc.df_nurse, 0) + COALESCE(sc.df_assistant, 0)) / 100
                   ELSE COALESCE(sc.df_nurse, 0) + COALESCE(sc.df_assistant, 0) END
        ELSE COALESCE(sp.material_cost_per_session, 0)
            + COALESCE(inv.cost_price, 0) * COALESCE(sp.consume_qty_per_session, 0)
            + COALESCE(sp.hand_fee_main, 0) + COALESCE(sp.hand_fee_asst, 0) END AS cps
    FROM patient_packages pp
    LEFT JOIN service_packages sp ON sp.id = pp.package_id
    LEFT JOIN inventory inv ON inv.id = sp.consume_item_id
    LEFT JOIN service_catalog sc ON sc.id = pp.service_id
)
SELECT
    c.id, c.clinic_id, c.hn, c.package_id, c.package_name, c.sp_category AS category,
    c.total_sessions, c.used_sessions, GREATEST(c.total_sessions - c.used_sessions, 0) AS remaining_sessions,
    c.paid_amount, COALESCE(c.net_price, c.paid_amount) AS sale_price,
    c.purchased_at, c.expires_at, c.status, c.invoice_id,
    (c.expires_at < now()) AS is_expired,
    GREATEST(0, EXTRACT(day FROM c.expires_at - now())::int) AS days_remaining,
    ROUND(COALESCE(c.net_price, c.paid_amount) / NULLIF(c.total_sessions, 0), 2) AS value_per_session,
    ROUND(c.cps, 2) AS cost_per_session,
    ROUND(COALESCE(c.net_price, c.paid_amount) / NULLIF(c.total_sessions, 0) * GREATEST(c.total_sessions - c.used_sessions, 0), 2) AS remaining_value,
    ROUND(c.cps * GREATEST(c.total_sessions - c.used_sessions, 0), 2) AS remaining_cost,
    CASE
        WHEN c.status IN ('refunded','cancelled') THEN 'closed'
        WHEN c.total_sessions - c.used_sessions <= 0 OR c.status = 'completed' THEN 'done'
        WHEN c.status = 'expired' OR c.expires_at < now() THEN 'expired_unused'
        ELSE 'outstanding'
    END AS liability_state,
    c.service_id
FROM c;

-- ═══ 7) ยาที่ใช้จริงต่อครั้ง ═══
CREATE TABLE IF NOT EXISTS package_usage_items (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    usage_id          uuid NOT NULL REFERENCES package_usages(id) ON DELETE CASCADE,
    inventory_item_id uuid NOT NULL REFERENCES inventory(id),
    qty               numeric NOT NULL CHECK (qty > 0),
    unit_cost         numeric(12,4) NOT NULL DEFAULT 0,
    cost              numeric(12,2) NOT NULL DEFAULT 0,
    is_default        boolean NOT NULL DEFAULT false,   -- มาจากสูตร/ค่าตั้งของคอส (ไม่ใช่ที่เพิ่มเอง)
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_package_usage_items_usage ON package_usage_items (usage_id);
ALTER TABLE package_usage_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS package_usage_items_clinic ON package_usage_items;
CREATE POLICY package_usage_items_clinic ON package_usage_items FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ═══ 4) ผ่าตัดที่สถานพยาบาลอื่น (รายบรรทัด) ═══
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS team_offsite boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.fn_invoice_item_team_pct() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pct numeric; v_seg text; v_clinic uuid; v_date date;
BEGIN
    SELECT clinic_id, invoice_date INTO v_clinic, v_date FROM invoice_headers WHERE id = NEW.inv_id;
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
    IF COALESCE(NEW.segment, v_seg, '') <> 'aesthetic' THEN NEW.team_pct := 0; RETURN NEW; END IF;
    IF NEW.team_offsite THEN
        NEW.team_pct := COALESCE(public.fn_finance_rate(v_clinic, 'team_offsite_pct', v_date), 40);
    ELSE
        NEW.team_pct := COALESCE(v_pct, 100);
    END IF;
    RETURN NEW;
END $$;

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
        ('team_w_general', 0.5),
        ('margin_threshold_pct', 35),
        ('team_offsite_pct', 40)
      ) AS d(k, v)
    ON CONFLICT (clinic_id, rate_key, effective_from) DO NOTHING
$$;
SELECT fn_seed_finance_rates(id) FROM tenants;

-- checkout: รับ team_offsite ต่อบรรทัด (คงตรรกะเดิมจาก 143 ทุกอย่าง)
create or replace function public.create_checkout_invoice(p_invoice jsonb, p_items jsonb, p_payments jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
    actor public.profiles%rowtype;
    v public.visits%rowtype;
    allowed boolean;
    inv_id text := p_invoice->>'id';
    posting_date date := (now() at time zone 'Asia/Bangkok')::date;
    printed_date date := coalesce((p_invoice->>'bill_date')::date, posting_date);
    net numeric := (p_invoice->>'total')::numeric;
    gross numeric := (p_invoice->>'subtotal')::numeric;
    discount numeric := (p_invoice->>'discount')::numeric;
    paid numeric := 0;
    row_data jsonb;
    amount numeric;
    item_id uuid;
    item_ids jsonb := '[]'::jsonb;
    seen text[] := '{}';
    df_rate numeric;
    performer uuid;
    v_bill_type text := coalesce(nullif(p_invoice->>'bill_type',''), 'normal');
    hand_main uuid;
    hand_asst uuid;
    r_main numeric;
    r_asst numeric;
    r_mode text;
    fee_main numeric;
    fee_asst numeric;
    mult numeric;
begin
    select * into actor from public.profiles where id = auth.uid();
    if not found or actor.approval_status::text <> 'approved' or actor.is_active is not true then
        raise exception 'ไม่มีสิทธิ์รับชำระเงิน';
    end if;
    select is_allowed into allowed from public.role_permissions where clinic_id = actor.clinic_id and role = actor.role and permission_key = 'finance.collect';
    if not coalesce(allowed, actor.role::text in ('owner','admin','receptionist','accountant')) then raise exception 'ไม่มีสิทธิ์รับชำระเงิน'; end if;
    select * into v from public.visits where vn = p_invoice->>'vn' and clinic_id = actor.clinic_id for update;
    if not found or v.status::text in ('cancelled','completed') then raise exception 'ไม่พบ Visit ที่เปิดรับชำระ'; end if;
    if exists(select 1 from public.invoice_headers where vn = v.vn and clinic_id = actor.clinic_id and status::text not in ('voided','refunded')) then raise exception 'Visit นี้มีใบเสร็จแล้ว กรุณาเปิดใบเสร็จเดิม'; end if;
    if exists(select 1 from public.clinic_day_closes where clinic_id = actor.clinic_id and close_date = posting_date) then raise exception 'วันนี้ปิดยอดแล้ว'; end if;
    if printed_date > posting_date or (printed_date < posting_date and actor.role::text not in ('owner','admin')) then raise exception 'ไม่มีสิทธิ์ใช้วันที่ใบเสร็จนี้'; end if;
    if net is null or gross is null or discount is null or net < 0 or gross < 0 or discount < 0
       or net > 999999999.99 or gross > 999999999.99 or discount > gross
       or net <> round(net,2) or gross <> round(gross,2) or discount <> round(discount,2)
       or net <> gross - discount then raise exception 'ยอดใบเสร็จไม่ถูกต้อง'; end if;
    if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) > 3 then raise exception 'ช่องทางรับเงินไม่ถูกต้อง'; end if;
    for row_data in select value from jsonb_array_elements(p_payments) loop
        if row_data->>'method' is null or row_data->>'method' not in ('cash','transfer','credit_card') or row_data->>'method' = any(seen) then raise exception 'ช่องทางรับเงินไม่ถูกต้องหรือซ้ำ'; end if;
        seen := array_append(seen, row_data->>'method');
        amount := (row_data->>'amount')::numeric;
        if amount is null or amount <= 0 or amount > 999999999.99 or amount <> round(amount,2) or length(coalesce(row_data->>'reference','')) > 200 then raise exception 'จำนวนเงินหรือเลขอ้างอิงไม่ถูกต้อง'; end if;
        if row_data->>'method' = 'credit_card' then
            if coalesce(row_data->>'card_type','') not in ('debit_domestic','credit_domestic','credit_domestic_premium','foreign','foreign_premium') then raise exception 'กรุณาเลือกประเภทบัตร'; end if;
            if coalesce(row_data->>'card_issuer','other') not in ('kbank','other') then raise exception 'ธนาคารผู้ออกบัตรไม่ถูกต้อง'; end if;
            if nullif(row_data->>'installment_months','') is not null and (row_data->>'installment_months')::int not in (3,6,10) then raise exception 'จำนวนงวดผ่อนไม่ถูกต้อง'; end if;
        end if;
        paid := paid + amount;
    end loop;
    if paid > net then raise exception 'ยอดรับเกินยอดสุทธิ'; end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'ไม่มีรายการในใบเสร็จ'; end if;
    if (select sum((value->>'line_total')::numeric) from jsonb_array_elements(p_items)) <> gross then raise exception 'ยอดรายการไม่ตรงกับยอดรวม'; end if;
    for row_data in select value from jsonb_array_elements(p_items) loop
        if nullif(row_data->>'performer_staff_id','') is not null and not exists(
            select 1 from public.staff s join public.profiles p on p.id = s.profile_id
            where s.id = (row_data->>'performer_staff_id')::uuid and s.clinic_id = actor.clinic_id
              and p.role::text in ('doctor','dentist','owner')) then raise exception 'แพทย์ผู้ทำไม่ถูกต้อง'; end if;
    end loop;
    df_rate := public.fn_finance_rate(actor.clinic_id, 'df_doctor_pct', posting_date);
    if v_bill_type not in ('normal','review','free_fix') then raise exception 'ประเภทบิลไม่ถูกต้อง'; end if;
    mult := case when v_bill_type = 'free_fix' then 0.5 else 1 end;   -- แก้ไขฟรี = ค่ามือกึ่งหนึ่ง · เคสรีวิว = เต็ม
    for row_data in select value from jsonb_array_elements(p_items) loop
        if (nullif(row_data->>'hand_main_staff_id','') is not null and not exists(select 1 from public.staff s where s.id = (row_data->>'hand_main_staff_id')::uuid and s.clinic_id = actor.clinic_id))
           or (nullif(row_data->>'hand_asst_staff_id','') is not null and not exists(select 1 from public.staff s where s.id = (row_data->>'hand_asst_staff_id')::uuid and s.clinic_id = actor.clinic_id))
        then raise exception 'ผู้ปฏิบัติ/ผู้ช่วยไม่ถูกต้อง'; end if;
        if nullif(row_data->>'hand_main_staff_id','') is not null and row_data->>'hand_main_staff_id' = row_data->>'hand_asst_staff_id' then raise exception 'ผู้ปฏิบัติหลักกับผู้ช่วยต้องเป็นคนละคน'; end if;
    end loop;
    insert into public.invoice_headers(id,clinic_id,branch_id,vn,hn,invoice_date,bill_date,subtotal,discount_amount,total_amount,paid_amount,status,campaign_id,campaign,df_scheme,hand_scheme,bill_type)
    values(inv_id,actor.clinic_id,v.branch_id,v.vn,v.hn,posting_date,printed_date,gross,discount,net,paid,
        (case when paid = net then 'paid' when paid > 0 then 'partial' else 'issued' end)::public.invoice_status,
        nullif(p_invoice->>'campaign_id','')::uuid,p_invoice->>'campaign','pct','line',v_bill_type);
    for row_data in select value from jsonb_array_elements(p_items) loop
        if (row_data->>'qty')::numeric <= 0 or (row_data->>'unit_price')::numeric < 0 or (row_data->>'line_total')::numeric < 0 then raise exception 'รายการใบเสร็จไม่ถูกต้อง'; end if;
        performer := nullif(row_data->>'performer_staff_id','')::uuid;
        hand_main := nullif(row_data->>'hand_main_staff_id','')::uuid;
        hand_asst := nullif(row_data->>'hand_asst_staff_id','')::uuid;
        r_main := null; r_asst := null; r_mode := 'baht'; fee_main := null; fee_asst := null;
        if hand_main is not null or hand_asst is not null then
            select sc.df_nurse, sc.df_assistant, coalesce(sc.df_mode,'baht') into r_main, r_asst, r_mode
              from public.service_catalog sc where sc.id::text = row_data->>'item_ref_id' and sc.clinic_id = actor.clinic_id;
            if not found then
                select inv.df_nurse, inv.df_assistant into r_main, r_asst
                  from public.inventory inv where inv.id::text = row_data->>'item_ref_id';
                r_mode := 'baht';
            end if;
            r_main := coalesce(r_main, 0); r_asst := coalesce(r_asst, 0);
            if hand_main is not null then
                fee_main := round(mult * case when r_mode = 'percent' then (row_data->>'line_total')::numeric * r_main / 100 else r_main * (row_data->>'qty')::numeric end, 2);
            end if;
            if hand_asst is not null then
                -- ผู้ช่วย: ใช้อัตรา "ผู้ช่วย" ของเมนู ถ้าไม่ตั้ง = กึ่งหนึ่งของอัตราหลัก
                fee_asst := round(mult * case
                    when r_asst > 0 and r_mode = 'percent' then (row_data->>'line_total')::numeric * r_asst / 100
                    when r_asst > 0 then r_asst * (row_data->>'qty')::numeric
                    when r_mode = 'percent' then (row_data->>'line_total')::numeric * r_main / 100 * 0.5
                    else r_main * (row_data->>'qty')::numeric * 0.5 end, 2);
            end if;
        end if;
        insert into public.invoice_items(inv_id,clinic_id,item_type,item_ref_id,item_name,qty,unit_price,line_total,discount_amount,segment,performer_staff_id,df_pct,hand_main_staff_id,hand_asst_staff_id,hand_fee_main,hand_fee_asst,team_offsite)
        values(inv_id,actor.clinic_id,row_data->>'item_type',nullif(row_data->>'item_ref_id',''),row_data->>'item_name',
            (row_data->>'qty')::numeric,(row_data->>'unit_price')::numeric,(row_data->>'line_total')::numeric,
            coalesce((row_data->>'discount_amount')::numeric,0),row_data->>'segment',
            performer, case when performer is not null then df_rate end,
            hand_main, hand_asst, fee_main, fee_asst, coalesce((row_data->>'team_offsite')::boolean, false)) returning id into item_id;
        item_ids := item_ids || jsonb_build_array(item_id);
    end loop;
    for row_data in select value from jsonb_array_elements(p_payments) loop
        insert into public.payment_logs(inv_id,clinic_id,branch_id,payment_method,amount,transaction_ref,note,card_type,card_issuer,installment_months)
        values(inv_id,actor.clinic_id,v.branch_id,(row_data->>'method')::public.payment_method,(row_data->>'amount')::numeric,
            nullif(btrim(row_data->>'reference'),''),case when paid < net then 'มัดจำ — ค้าง ' || (net-paid)::text || ' บาท' else null end,
            case when row_data->>'method' = 'credit_card' then row_data->>'card_type' end,
            case when row_data->>'method' = 'credit_card' then coalesce(row_data->>'card_issuer','other') end,
            case when row_data->>'method' = 'credit_card' then nullif(row_data->>'installment_months','')::int end);
    end loop;
    return jsonb_build_object('inv_id',inv_id,'item_ids',item_ids,'paid',paid);
end;
$$;
revoke all on function public.create_checkout_invoice(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.create_checkout_invoice(jsonb,jsonb,jsonb) to authenticated;

-- ═══ 5) คืนเงิน → หักเดือนถัดไป + ยกยอดติดลบ ═══
ALTER TABLE compensation_payouts ADD COLUMN IF NOT EXISTS df_carry numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN compensation_payouts.df_carry IS 'คอม/DF ติดลบ (จากคืนเงิน) ที่ยกไปหักเดือนถัดไป — ≤ 0';

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
        to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date + CASE WHEN pl.amount < 0 THEN interval '1 month' ELSE interval '0' END, 'YYYY-MM') AS period_month, ih.clinic_id,
        l.id::text AS item_id, l.item_name, l.qty,
        l.df_pct AS df_rate,
        ROUND(SUM(l.after_line_disc * l.df_pct / 100.0 * pl.amount / NULLIF(l.inv_after_line_disc, 0)), 2) AS commission_amount,
        ih.id AS inv_id, ih.invoice_date, ih.vn
    FROM pct_lines l
    JOIN invoice_headers ih ON ih.id = l.inv_id
    JOIN payment_logs pl ON pl.inv_id = ih.id
    WHERE ih.df_scheme = 'pct' AND ih.status::text <> 'voided'
      AND l.performer_staff_id IS NOT NULL AND COALESCE(l.df_pct, 0) > 0 AND l.inv_after_line_disc > 0
    GROUP BY l.performer_staff_id, to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date + CASE WHEN pl.amount < 0 THEN interval '1 month' ELSE interval '0' END, 'YYYY-MM'), ih.clinic_id,
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
        to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date + CASE WHEN pl.amount < 0 THEN interval '1 month' ELSE interval '0' END, 'YYYY-MM') AS period_month, ih.clinic_id,
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
    GROUP BY ih.ref_staff_id, to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date + CASE WHEN pl.amount < 0 THEN interval '1 month' ELSE interval '0' END, 'YYYY-MM'), ih.clinic_id,
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

COMMENT ON VIEW v_commission_summary IS 'รวม DF/Commission · ยอดคืนเงิน (payment ติดลบ) ลงเดือนถัดจากเดือนที่คืน';

-- ═══ 6) คอมแนะนำ: ตรวจที่มาของเคส ═══
ALTER TABLE staff_referrals DROP CONSTRAINT IF EXISTS staff_referrals_end_reason_check;
ALTER TABLE staff_referrals ADD CONSTRAINT staff_referrals_end_reason_check
    CHECK (end_reason IS NULL OR end_reason IN ('lapsed','staff_left','cancelled','not_eligible'));
COMMENT ON COLUMN visits.case_source IS 'ที่มาของเคส: walk_in/staff(พนักงานพามา)/line/ads(โฆษณา-ออนไลน์)/affiliate/referral';

CREATE OR REPLACE FUNCTION public.fn_invoice_ref_staff() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_last date; v_lapse int; v_act date; v_src text;
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
    -- ลูกค้าจากโฆษณา/ออนไลน์/เซลล์ฟรีแลนซ์/เพื่อนแนะนำ ไม่นับเป็นลูกค้าที่พนักงานพามา (ดูจาก visit แรกหลังลงชื่อ)
    SELECT v.case_source INTO v_src FROM visits v
     WHERE v.clinic_id = NEW.clinic_id AND v.hn = NEW.hn AND v.visit_date >= r.started_on
     ORDER BY v.visit_date, v.created_at LIMIT 1;
    IF v_src IN ('line','ads','affiliate','referral') THEN
        UPDATE staff_referrals SET ended_on = r.started_on, end_reason = 'not_eligible',
               note = trim(COALESCE(note || ' · ', '') || 'ที่มาของเคส: ' || v_src) WHERE id = r.id;
        RETURN NEW;
    END IF;
    NEW.ref_staff_id := r.staff_id;
    NEW.ref_referral_id := r.id;
    RETURN NEW;
END $$;

-- ฐานคอมทีม: คืนเงินหักเดือนถัดไปเช่นกัน
CREATE OR REPLACE VIEW v_team_revenue_lines WITH (security_invoker = true) AS
WITH lines AS (
    SELECT ii.id, ii.inv_id, ii.item_name, ii.segment,
        COALESCE(ii.team_pct, CASE WHEN ii.segment = 'aesthetic' THEN 100 ELSE 0 END) AS team_pct,
        (COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) AS after_line_disc,
        SUM(COALESCE(ii.line_total, 0) - COALESCE(ii.discount_amount, 0)) OVER (PARTITION BY ii.inv_id) AS inv_after_line_disc
    FROM invoice_items ii
)
SELECT ih.clinic_id,
    to_char((pl.paid_at AT TIME ZONE 'Asia/Bangkok')::date + CASE WHEN pl.amount < 0 THEN interval '1 month' ELSE interval '0' END, 'YYYY-MM') AS period_month,
    ih.id AS inv_id, ih.hn, l.id AS item_id, l.item_name, l.team_pct,
    ROUND(l.after_line_disc * pl.amount / NULLIF(l.inv_after_line_disc, 0), 2) AS received,
    ROUND(l.after_line_disc * pl.amount / NULLIF(l.inv_after_line_disc, 0) * l.team_pct / 100.0, 2) AS counted
FROM lines l
JOIN invoice_headers ih ON ih.id = l.inv_id
JOIN payment_logs pl ON pl.inv_id = ih.id
WHERE ih.status::text <> 'voided' AND l.team_pct > 0 AND l.inv_after_line_disc > 0;
