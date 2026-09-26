-- ════════════════════════════════════════════════════════════
-- 140: สเปกการเงิน ธนเวช+ เฟส 1 — ฐานอัตรา (tenant setting + วันเริ่มใช้) + ค่าธรรมเนียมบัตร MDR
-- ════════════════════════════════════════════════════════════
-- หลักการ:
--   • ทุกอัตราเก็บเป็นค่าตั้งค่าต่อคลินิก มีวันเริ่มใช้ (effective_from) ไม่ฝังในโค้ด
--   • ตอนรับเงิน snapshot อัตราที่ใช้จริงลงแถว payment → เปลี่ยนอัตราวันนี้ บิลเก่าคิดเหมือนเดิม
--   • ค่าธรรมเนียม = ยอดรูด × MDR + VAT 7% ของค่าธรรมเนียม (ต้นทุนจริงเมื่อคลินิกยกเว้น VAT)
--   • ธนาคารผู้ออกบัตร = กสิกร → ใช้ mdr_kbank ก่อนเสมอ ไม่ว่าประเภทบัตรใด
--   • ไม่มี surcharge — ไม่เรียกเก็บค่าธรรมเนียมเพิ่มจากลูกค้า
-- ════════════════════════════════════════════════════════════

-- ── 1. ตารางอัตรา (key/value + วันเริ่มใช้) — ใช้ต่อในเฟส 2-5 (DF %, ค่าชั่วโมง, เกณฑ์มาร์จิ้น ฯลฯ) ──
CREATE TABLE IF NOT EXISTS finance_rates (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rate_key       text NOT NULL,
    rate_value     numeric NOT NULL,
    effective_from date NOT NULL,
    note           text,
    created_by     uuid,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, rate_key, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_finance_rates_lookup ON finance_rates (clinic_id, rate_key, effective_from DESC);

ALTER TABLE finance_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_rates_select ON finance_rates;
CREATE POLICY finance_rates_select ON finance_rates FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS finance_rates_write ON finance_rates;
CREATE POLICY finance_rates_write ON finance_rates FOR ALL TO authenticated
    USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')))
    WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND role::text IN ('owner','admin')));

-- อัตราที่มีผล ณ วันที่ (ล่าสุดที่ effective_from ≤ วันนั้น) — null = ยังไม่ตั้ง
CREATE OR REPLACE FUNCTION fn_finance_rate(p_clinic uuid, p_key text, p_date date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT rate_value FROM finance_rates
     WHERE clinic_id = p_clinic AND rate_key = p_key AND effective_from <= p_date
     ORDER BY effective_from DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION fn_finance_rate(uuid, text, date) TO authenticated;

-- ค่าเริ่มต้น (ตามสเปก) — seed ให้ทุกคลินิก + คลินิกใหม่อัตโนมัติ (แก้ได้ในหน้าตั้งค่า)
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
        ('vat_enabled', 0)
      ) AS d(k, v)
    ON CONFLICT (clinic_id, rate_key, effective_from) DO NOTHING
$$;

SELECT fn_seed_finance_rates(id) FROM tenants;

CREATE OR REPLACE FUNCTION fn_tenant_seed_finance_rates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM fn_seed_finance_rates(NEW.id);
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_tenant_seed_finance_rates ON tenants;
CREATE TRIGGER trg_tenant_seed_finance_rates AFTER INSERT ON tenants
    FOR EACH ROW EXECUTE FUNCTION fn_tenant_seed_finance_rates();

-- ── 2. payment_logs: รายละเอียดบัตร + snapshot ค่าธรรมเนียม ──
ALTER TABLE payment_logs
    ADD COLUMN IF NOT EXISTS card_type text,
    ADD COLUMN IF NOT EXISTS card_issuer text,
    ADD COLUMN IF NOT EXISTS installment_months int,
    ADD COLUMN IF NOT EXISTS mdr_rate_pct numeric(6,4),
    ADD COLUMN IF NOT EXISTS card_fee numeric(12,2),
    ADD COLUMN IF NOT EXISTS card_fee_vat numeric(12,2),
    ADD COLUMN IF NOT EXISTS refund_of_payment_id uuid REFERENCES payment_logs(id);

ALTER TABLE payment_logs DROP CONSTRAINT IF EXISTS payment_logs_card_type_chk;
ALTER TABLE payment_logs ADD CONSTRAINT payment_logs_card_type_chk CHECK (card_type IS NULL OR card_type IN
    ('debit_domestic','credit_domestic','credit_domestic_premium','foreign','foreign_premium','unspecified'));
ALTER TABLE payment_logs DROP CONSTRAINT IF EXISTS payment_logs_card_issuer_chk;
ALTER TABLE payment_logs ADD CONSTRAINT payment_logs_card_issuer_chk CHECK (card_issuer IS NULL OR card_issuer IN ('kbank','other'));
ALTER TABLE payment_logs DROP CONSTRAINT IF EXISTS payment_logs_installment_chk;
ALTER TABLE payment_logs ADD CONSTRAINT payment_logs_installment_chk CHECK (installment_months IS NULL OR installment_months IN (3,6,10));

-- ── 3. Trigger คิดค่าธรรมเนียมอัตโนมัติ (ทุก write path: checkout / รับชำระเพิ่ม / แก้วิธีชำระ / พรีออเดอร์ ฯลฯ) ──
CREATE OR REPLACE FUNCTION fn_payment_card_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_date date;
    v_key  text;
    v_rate numeric;
    v_vat  numeric;
BEGIN
    -- ไม่ใช่บัตร หรือเป็นแถวคืนเงิน → ไม่มีค่าธรรมเนียม ล้างฟิลด์บัตร
    IF NEW.payment_method::text <> 'credit_card' OR NEW.amount <= 0 THEN
        IF NEW.payment_method::text <> 'credit_card' THEN
            NEW.card_type := NULL; NEW.card_issuer := NULL; NEW.installment_months := NULL;
        END IF;
        NEW.mdr_rate_pct := NULL; NEW.card_fee := NULL; NEW.card_fee_vat := NULL;
        RETURN NEW;
    END IF;

    -- แก้แถวเดิมโดยไม่แตะข้อมูลบัตร/ยอด → คง snapshot เดิม (เปลี่ยนอัตราภายหลัง บิลเก่าไม่เปลี่ยน)
    IF TG_OP = 'UPDATE' AND OLD.mdr_rate_pct IS NOT NULL
       AND NEW.payment_method = OLD.payment_method AND NEW.amount = OLD.amount
       AND coalesce(NEW.card_type,'') = coalesce(OLD.card_type,'')
       AND coalesce(NEW.card_issuer,'') = coalesce(OLD.card_issuer,'') THEN
        NEW.mdr_rate_pct := OLD.mdr_rate_pct; NEW.card_fee := OLD.card_fee; NEW.card_fee_vat := OLD.card_fee_vat;
        RETURN NEW;
    END IF;

    NEW.card_type := coalesce(NEW.card_type, 'unspecified');
    IF NEW.card_issuer IS DISTINCT FROM 'kbank' THEN NEW.installment_months := NULL; END IF;  -- ผ่อนได้เฉพาะบัตรกสิกร
    v_date := (coalesce(NEW.paid_at, now()) AT TIME ZONE 'Asia/Bangkok')::date;
    v_key := CASE
        WHEN NEW.card_issuer = 'kbank' THEN 'mdr_kbank'
        WHEN NEW.card_type = 'debit_domestic' THEN 'mdr_debit_domestic'
        WHEN NEW.card_type = 'credit_domestic_premium' THEN 'mdr_credit_domestic_premium'
        WHEN NEW.card_type = 'foreign' THEN 'mdr_foreign'
        WHEN NEW.card_type = 'foreign_premium' THEN 'mdr_foreign_premium'
        ELSE 'mdr_credit_domestic' END;
    v_rate := fn_finance_rate(NEW.clinic_id, v_key, v_date);
    v_vat  := coalesce(fn_finance_rate(NEW.clinic_id, 'card_fee_vat_pct', v_date), 7);
    IF v_rate IS NULL THEN
        NEW.mdr_rate_pct := NULL; NEW.card_fee := NULL; NEW.card_fee_vat := NULL;
    ELSE
        NEW.mdr_rate_pct := v_rate;
        NEW.card_fee     := round(NEW.amount * v_rate / 100, 2);
        NEW.card_fee_vat := round(NEW.amount * v_rate / 100 * v_vat / 100, 2);
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payment_card_fee ON payment_logs;
CREATE TRIGGER trg_payment_card_fee BEFORE INSERT OR UPDATE ON payment_logs
    FOR EACH ROW EXECUTE FUNCTION fn_payment_card_fee();

-- ── 4. Backfill บิลบัตรเก่า → "ไม่ระบุประเภท" + ค่าธรรมเนียมโดยประมาณ (อัตราเครดิตในประเทศ) ──
UPDATE payment_logs SET card_type = 'unspecified'
 WHERE payment_method::text = 'credit_card' AND amount > 0 AND card_type IS NULL;

-- ── 5. checkout รับข้อมูลบัตรต่อแถว payment (คงตรรกะเดิมจาก 138_checkout_split_payments ทุกอย่าง) ──
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
    insert into public.invoice_headers(id,clinic_id,branch_id,vn,hn,invoice_date,bill_date,subtotal,discount_amount,total_amount,paid_amount,status,campaign_id,campaign)
    values(inv_id,actor.clinic_id,v.branch_id,v.vn,v.hn,posting_date,printed_date,gross,discount,net,paid,
        (case when paid = net then 'paid' when paid > 0 then 'partial' else 'issued' end)::public.invoice_status,
        nullif(p_invoice->>'campaign_id','')::uuid,p_invoice->>'campaign');
    for row_data in select value from jsonb_array_elements(p_items) loop
        if (row_data->>'qty')::numeric <= 0 or (row_data->>'unit_price')::numeric < 0 or (row_data->>'line_total')::numeric < 0 then raise exception 'รายการใบเสร็จไม่ถูกต้อง'; end if;
        insert into public.invoice_items(inv_id,clinic_id,item_type,item_ref_id,item_name,qty,unit_price,line_total,discount_amount,segment)
        values(inv_id,actor.clinic_id,row_data->>'item_type',nullif(row_data->>'item_ref_id',''),row_data->>'item_name',
            (row_data->>'qty')::numeric,(row_data->>'unit_price')::numeric,(row_data->>'line_total')::numeric,
            coalesce((row_data->>'discount_amount')::numeric,0),row_data->>'segment') returning id into item_id;
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
