-- ════════════════════════════════════════════════════════════
-- 143: สเปกการเงิน เฟส 2C — ค่ามือรายบรรทัด (ผู้ปฏิบัติหลัก/ผู้ช่วย) + ประเภทบิล
-- ════════════════════════════════════════════════════════════
--   • invoice_headers.bill_type: normal | review (เคสรีวิว — ค่ามือเต็ม, นับเป็นต้นทุนการตลาด) | free_fix (แก้ไขฟรี — ค่ามือกึ่งหนึ่ง)
--   • invoice_items.hand_main_staff_id / hand_asst_staff_id + hand_fee_main / hand_fee_asst (snapshot ตอนออกบิล)
--   • อัตรา: ผู้ปฏิบัติหลัก = df_nurse ของเมนู/คลังยา · ผู้ช่วย = df_assistant (ไม่ตั้ง = ครึ่งหนึ่งของอัตราหลัก)
--   • ค่ามือนับตามวันที่ทำ (invoice_date) ไม่รอรับเงิน · บิลยกเลิก/คืนเงิน ไม่นับ
--   • บิลใหม่ (hand_scheme='line') เลิกใช้ค่ามือแบบเดิมที่ผูกพยาบาล/ผู้ช่วยทั้ง visit
-- ════════════════════════════════════════════════════════════

ALTER TABLE invoice_headers
    ADD COLUMN IF NOT EXISTS bill_type text NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS hand_scheme text;
ALTER TABLE invoice_headers DROP CONSTRAINT IF EXISTS invoice_headers_bill_type_chk;
ALTER TABLE invoice_headers ADD CONSTRAINT invoice_headers_bill_type_chk CHECK (bill_type IN ('normal','review','free_fix'));
ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS hand_main_staff_id uuid REFERENCES staff(id),
    ADD COLUMN IF NOT EXISTS hand_asst_staff_id uuid REFERENCES staff(id),
    ADD COLUMN IF NOT EXISTS hand_fee_main numeric(12,2),
    ADD COLUMN IF NOT EXISTS hand_fee_asst numeric(12,2);

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
        insert into public.invoice_items(inv_id,clinic_id,item_type,item_ref_id,item_name,qty,unit_price,line_total,discount_amount,segment,performer_staff_id,df_pct,hand_main_staff_id,hand_asst_staff_id,hand_fee_main,hand_fee_asst)
        values(inv_id,actor.clinic_id,row_data->>'item_type',nullif(row_data->>'item_ref_id',''),row_data->>'item_name',
            (row_data->>'qty')::numeric,(row_data->>'unit_price')::numeric,(row_data->>'line_total')::numeric,
            coalesce((row_data->>'discount_amount')::numeric,0),row_data->>'segment',
            performer, case when performer is not null then df_rate end,
            hand_main, hand_asst, fee_main, fee_asst) returning id into item_id;
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
UNION ALL SELECT * FROM hand_asst;

COMMENT ON VIEW v_commission_summary IS 'รวม DF/Commission: แบบเดิม + เซลล์คอส + DF แพทย์ % รายบรรทัด + ค่ามือรายบรรทัด (หลัก/ผู้ช่วย)';
