"use server";

import { gatePermission } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { readAll, shiftDate, validDate } from '@/lib/finance-range';
import { buildProfitReport } from '@/lib/profit-report';

/** ภาพรวมทั้งคลินิก ไม่ปันส่วนค่าใช้จ่ายส่วนกลางโดยเดาแผนก */
export async function getProfitReport(start: string, end: string) {
    await gatePermission('reports.view');
    if (validDate(start, '') !== start || validDate(end, '') !== end || !start || !end || start > end) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
    const db = await createClient();
    const {data: {user}} = await db.auth.getUser();
    if (!user) throw new Error('Unauthorized');
    const {data: profile, error} = await db.from('profiles').select('clinic_id').eq('id',user.id).single();
    if (error || !profile?.clinic_id) throw new Error('Clinic not found');
    const clinic = profile.clinic_id;
    const from = `${start}T00:00:00+07:00`, until = `${shiftDate(end,1)}T00:00:00+07:00`;
    const [invoices, items, anon, expenses, payments] = await Promise.all([
        readAll((a,b) => db.from('invoice_headers').select('id,total_amount,status').eq('clinic_id',clinic).gte('invoice_date',start).lte('invoice_date',end).order('id').range(a,b)),
        readAll((a,b) => db.from('invoice_items').select('inv_id,item_type,cogs_amount,df_amount,invoice_headers!inner(invoice_date,clinic_id)').eq('clinic_id',clinic).eq('invoice_headers.clinic_id',clinic).gte('invoice_headers.invoice_date',start).lte('invoice_headers.invoice_date',end).order('id').range(a,b)),
        readAll((a,b) => db.from('anon_cases').select('total_amount').eq('clinic_id',clinic).eq('paid',true).gte('paid_at',from).lt('paid_at',until).order('id').range(a,b)),
        readAll((a,b) => db.from('expenses').select('category,amount').eq('clinic_id',clinic).gte('expense_date',start).lte('expense_date',end).order('id').range(a,b)),
        readAll((a,b) => db.from('payment_logs').select('amount,invoice_headers!inner(status,clinic_id)').eq('clinic_id',clinic).eq('invoice_headers.clinic_id',clinic).neq('invoice_headers.status','voided').gte('paid_at',from).lt('paid_at',until).order('id').range(a,b)),
    ]);
    return buildProfitReport(invoices,items,anon,expenses,payments);
}
