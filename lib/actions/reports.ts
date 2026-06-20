"use server";

import { createClient } from "@/lib/supabase/server";
import { getAnonRevenue } from "./anonymous";

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles")
        .select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, clinicId: profile.clinic_id as string };
}

export interface ReportSummary {
    // Revenue
    totalRevenue: number;          // ยอดที่ชำระจริง (paid + partial paid_amount)
    totalBilled: number;           // ยอดที่ออกบิลทั้งหมด
    outstanding: number;           // ค้างชำระ
    invoiceCount: number;
    paidCount: number;
    partialCount: number;
    voidedCount: number;
    refundedCount: number;

    // Visits
    totalVisits: number;
    completedVisits: number;
    cancelledVisits: number;

    // Patients
    newPatients: number;

    // Breakdowns
    revenueByDay: { date: string; amount: number }[];
    revenueByMethod: { method: string; amount: number; count: number }[];
    salesByType: { type: string; amount: number; count: number }[];
    topItems: { name: string; qty: number; amount: number; type: string }[];
    revenueByCategory: { category: string; amount: number; count: number }[];
}

export interface OutstandingInvoice {
    id: string;
    hn: string;
    patient_name: string;
    invoice_date: string;
    total_amount: number;
    paid_amount: number;
    balance: number;
    status: string;
}

/** รายงานหลัก — ตามช่วงวันที่ (YYYY-MM-DD) */
export async function getReportSummary(startDate: string, endDate: string): Promise<ReportSummary> {
    const { supabase, clinicId } = await getCtx();
    const anon = await getAnonRevenue(startDate, endDate); // รายรับคลินิกนิรนาม (รวมเข้ายอด)

    // ── Invoices ในช่วงวันที่ ──
    const { data: invoices } = await supabase
        .from("invoice_headers")
        .select("id, invoice_date, total_amount, paid_amount, status, vn")
        .eq("clinic_id", clinicId)
        .gte("invoice_date", startDate)
        .lte("invoice_date", endDate);

    const invList = invoices || [];

    let totalRevenue = 0, totalBilled = 0, outstanding = 0;
    let paidCount = 0, partialCount = 0, voidedCount = 0, refundedCount = 0;
    const revByDay: Record<string, number> = {};

    for (const inv of invList) {
        const total = Number(inv.total_amount || 0);
        const paid = Number(inv.paid_amount || 0);
        const status = inv.status;

        if (status === "voided") { voidedCount++; continue; }
        if (status === "refunded") { refundedCount++; continue; }

        totalBilled += total;
        totalRevenue += paid;
        if (paid < total) outstanding += (total - paid);

        if (status === "paid") paidCount++;
        if (status === "partial") partialCount++;

        const d = inv.invoice_date;
        revByDay[d] = (revByDay[d] || 0) + paid;
    }

    // รวมยอดนิรนาม
    totalRevenue += anon.total;
    totalBilled += anon.total;
    for (const d of anon.byDay) revByDay[d.date] = (revByDay[d.date] || 0) + d.amount;

    const revenueByDay = Object.entries(revByDay)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date));

    // ── Payment methods (จาก payment_logs ที่ paid_at อยู่ในช่วง) ──
    const startISO = new Date(`${startDate}T00:00:00+07:00`).toISOString();
    const endNext = new Date(`${endDate}T00:00:00+07:00`);
    endNext.setDate(endNext.getDate() + 1);
    const endISO = endNext.toISOString();

    const { data: payments } = await supabase
        .from("payment_logs")
        .select("payment_method, amount")
        .eq("clinic_id", clinicId)
        .gte("paid_at", startISO)
        .lt("paid_at", endISO);

    const methodMap: Record<string, { amount: number; count: number }> = {};
    for (const p of payments || []) {
        const m = p.payment_method;
        if (!methodMap[m]) methodMap[m] = { amount: 0, count: 0 };
        methodMap[m].amount += Number(p.amount || 0);
        methodMap[m].count += 1;
    }
    for (const m of anon.byMethod) {
        if (!methodMap[m.method]) methodMap[m.method] = { amount: 0, count: 0 };
        methodMap[m.method].amount += m.amount;
        methodMap[m.method].count += m.count;
    }
    const revenueByMethod = Object.entries(methodMap)
        .map(([method, v]) => ({ method, ...v }))
        .sort((a, b) => b.amount - a.amount);

    // ── Sales by item type + top items (จาก invoice_items ของ invoice ที่ไม่ void/refund) ──
    const validInvIds = invList
        .filter(i => i.status !== "voided" && i.status !== "refunded")
        .map(i => i.id);

    const salesTypeMap: Record<string, { amount: number; count: number }> = {};
    const itemMap: Record<string, { qty: number; amount: number; type: string }> = {};

    if (validInvIds.length > 0) {
        const { data: items } = await supabase
            .from("invoice_items")
            .select("item_type, item_name, qty, line_total")
            .in("inv_id", validInvIds);

        for (const it of items || []) {
            const type = it.item_type || "other";
            const amt = Number(it.line_total || 0);
            const qty = Number(it.qty || 0);
            if (!salesTypeMap[type]) salesTypeMap[type] = { amount: 0, count: 0 };
            salesTypeMap[type].amount += amt;
            salesTypeMap[type].count += 1;

            const key = it.item_name || "—";
            if (!itemMap[key]) itemMap[key] = { qty: 0, amount: 0, type };
            itemMap[key].qty += qty;
            itemMap[key].amount += amt;
        }
    }

    // รวมรายการนิรนามเข้ายอดขายตามประเภท + สินค้าขายดี
    for (const t of anon.byType) {
        if (!salesTypeMap[t.type]) salesTypeMap[t.type] = { amount: 0, count: 0 };
        salesTypeMap[t.type].amount += t.amount;
        salesTypeMap[t.type].count += t.count;
    }
    for (const it of anon.topItems) {
        if (!itemMap[it.name]) itemMap[it.name] = { qty: 0, amount: 0, type: it.type };
        itemMap[it.name].qty += it.qty;
        itemMap[it.name].amount += it.amount;
    }

    const salesByType = Object.entries(salesTypeMap)
        .map(([type, v]) => ({ type, ...v }))
        .sort((a, b) => b.amount - a.amount);

    const topItems = Object.entries(itemMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 15);

    // ── Visits ในช่วง ──
    const { data: visits } = await supabase
        .from("visits")
        .select("vn, status, service_category, visit_date")
        .eq("clinic_id", clinicId)
        .gte("visit_date", startDate)
        .lte("visit_date", endDate);

    const visitList = visits || [];
    const totalVisits = visitList.length;
    const completedVisits = visitList.filter(v => v.status === "completed").length;
    const cancelledVisits = visitList.filter(v => v.status === "cancelled").length;

    const catMap: Record<string, { amount: number; count: number }> = {};
    for (const v of visitList) {
        const c = v.service_category || "general_med";
        if (!catMap[c]) catMap[c] = { amount: 0, count: 0 };
        catMap[c].count += 1;
    }
    const revenueByCategory = Object.entries(catMap)
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.count - a.count);

    // ── New patients (first_visit_date ในช่วง) ──
    const { count: newPatients } = await supabase
        .from("patients")
        .select("hn", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .gte("first_visit_date", startDate)
        .lte("first_visit_date", endDate);

    return {
        totalRevenue,
        totalBilled,
        outstanding,
        invoiceCount: invList.length,
        paidCount,
        partialCount,
        voidedCount,
        refundedCount,
        totalVisits,
        completedVisits,
        cancelledVisits,
        newPatients: newPatients || 0,
        revenueByDay,
        revenueByMethod,
        salesByType,
        topItems,
        revenueByCategory,
    };
}

/** รายการใบเสร็จที่ค้างชำระ (partial / issued) ทั้งหมด — ไม่จำกัดช่วง */
export async function getOutstandingInvoices(): Promise<OutstandingInvoice[]> {
    const { supabase, clinicId } = await getCtx();

    const { data } = await supabase
        .from("invoice_headers")
        .select(`
            id, hn, invoice_date, total_amount, paid_amount, status,
            patients!inner(prefix, first_name, last_name)
        `)
        .eq("clinic_id", clinicId)
        .in("status", ["partial", "issued"])
        .order("invoice_date", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((inv: any) => {
        const p = Array.isArray(inv.patients) ? inv.patients[0] : inv.patients;
        const total = Number(inv.total_amount || 0);
        const paid = Number(inv.paid_amount || 0);
        return {
            id: inv.id,
            hn: inv.hn,
            patient_name: `${p?.prefix || ""}${p?.first_name || ""} ${p?.last_name || ""}`.trim(),
            invoice_date: inv.invoice_date,
            total_amount: total,
            paid_amount: paid,
            balance: total - paid,
            status: inv.status,
        };
    }).filter(i => i.balance > 0);
}
