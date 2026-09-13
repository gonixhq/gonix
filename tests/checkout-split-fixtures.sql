begin;
create temp table profiles(id uuid,clinic_id uuid,approval_status text,is_active boolean,role text);
create temp table visits(vn text,hn text,clinic_id uuid,branch_id uuid,status text);
create temp table role_permissions(clinic_id uuid,role text,permission_key text,is_allowed boolean);
create temp table clinic_day_closes(clinic_id uuid,close_date date);
create temp table invoice_headers(id text primary key,clinic_id uuid,branch_id uuid,vn text,hn text,invoice_date date,bill_date date,subtotal numeric,discount_amount numeric,total_amount numeric,paid_amount numeric,status public.invoice_status,campaign_id uuid,campaign text);
create temp table invoice_items(id uuid default gen_random_uuid(),inv_id text,clinic_id uuid,item_type text,item_ref_id text,item_name text,qty numeric,unit_price numeric,line_total numeric,discount_amount numeric,segment text);
create temp table payment_logs(inv_id text,clinic_id uuid,branch_id uuid,payment_method public.payment_method,amount numeric,transaction_ref text,note text);
insert into profiles values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','approved',true,'owner');
insert into visits values('TEST-SPLIT','TEST-HN','00000000-0000-0000-0000-000000000002',null,'waiting_payment');
-- FUNCTION_UNDER_TEST
do $$ declare result jsonb; begin
 result:=pg_temp.test_checkout_invoice('{"id":"TEST-INV","vn":"TEST-SPLIT","subtotal":5000,"discount":0,"total":5000}', '[{"item_type":"service","item_name":"test","qty":1,"unit_price":5000,"line_total":5000}]', '[{"method":"cash","amount":500},{"method":"transfer","amount":1500,"reference":"TEST"}]');
 if (select paid_amount from invoice_headers where id='TEST-INV') <> 2000 or (select status::text from invoice_headers where id='TEST-INV') <> 'partial' or (select sum(amount) from payment_logs) <> 2000 or (select count(*) from payment_logs) <> 2 then raise exception 'split deposit regression'; end if;
 begin
 perform pg_temp.test_checkout_invoice('{"id":"TEST-DUP","vn":"TEST-SPLIT","subtotal":5000,"discount":0,"total":5000}', '[{"item_type":"service","item_name":"test","qty":1,"unit_price":5000,"line_total":5000}]', '[]');
 raise exception 'duplicate accepted';
 exception when others then if SQLERRM = 'duplicate accepted' then raise; end if; end;
end $$;
delete from payment_logs; delete from invoice_items; delete from invoice_headers;
-- ทำให้ payment insert ล้ม เพื่อยืนยันว่าหัวบิลและรายการ rollback พร้อมกัน
alter table payment_logs add constraint test_reject_transfer check (payment_method <> 'transfer');
do $$ begin
 begin
 perform pg_temp.test_checkout_invoice('{"id":"TEST-FAIL","vn":"TEST-SPLIT","subtotal":5000,"discount":0,"total":5000}', '[{"item_type":"service","item_name":"test","qty":1,"unit_price":5000,"line_total":5000}]', '[{"method":"cash","amount":500},{"method":"transfer","amount":1500}]');
 raise exception 'failure expected';
 exception when check_violation then null; end;
 if exists(select 1 from invoice_headers) or exists(select 1 from invoice_items) or exists(select 1 from payment_logs) then raise exception 'atomic rollback failed'; end if;
end $$;
select 'PASS: split deposit, duplicate prevention, atomic failure rollback (temporary fixtures only)' as result;
rollback;
