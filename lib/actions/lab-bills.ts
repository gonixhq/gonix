"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// บิลแล็บภายนอก (mig 160): ยอดที่ระบบคาด (ต้นทุนส่งแล็บ × รายการที่ส่ง) เทียบใบแจ้งหนี้จริง + ติดตามจ่าย

export interface LabSentRow { id: string; date: string; source: "visit" | "anon"; ref: string; name: string; vendor: string; cost: number }
export interface LabBillRow {
    id: string; vendor: string; period_month: string; invoice_no: string | null; bill_date: string; due_date: string;
    amount: number; paid_at: string | null; paid_method: string | null; note: string | null;
}
export interface LabVendorSummary { vendor: string; count: number; expected: number; billed: number; missingCost: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const NO_VENDOR = "(ไม่ระบุแล็บ)";

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id, role").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("ไม่พบคลินิก");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string, canManage: ["owner", "admin"].includes(String(profile.role)) };
}

function monthRange(month: string) {
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return { from: `${month}-01T00:00:00+07:00`, to: `${next}-01T00:00:00+07:00` };
}

export async function getLabBills(month: string): Promise<{
    sent: LabSentRow[]; summary: LabVendorSummary[]; bills: LabBillRow[]; openBills: LabBillRow[]; canManage: boolean;
} | { error: string }> {
    try {
        if (!/^\d{4}-\d{2}$/.test(month)) return { error: "เดือนไม่ถูกต้อง" };
        const { supabase, clinicId, canManage } = await ctx();
        const { from, to } = monthRange(month);

        // เฉพาะเมนูประเภทแล็บภายนอก (ส่งออก) — แล็บในคลินิกไม่มีบิลจากแล็บ
        const { data: labSvcs } = await supabase.from("service_catalog").select("id").eq("clinic_id", clinicId).eq("item_type", "lab_external");
        const extIds = new Set((labSvcs || []).map(s => s.id as string));

        const [{ data: los }, { data: anon }, { data: bills }, { data: open }] = await Promise.all([
            supabase.from("lab_orders").select("id, vn, lab_name, lab_type, service_id, cost, lab_vendor, status, created_at")
                .eq("clinic_id", clinicId).gte("created_at", from).lt("created_at", to).or("lab_type.is.null,lab_type.neq.package").order("created_at"),
            supabase.from("anon_case_tests").select("id, test_name, service_id, cost, lab_vendor, created_at, anon_cases!inner(clinic_id, case_code, status)")
                .eq("anon_cases.clinic_id", clinicId).gte("created_at", from).lt("created_at", to).order("created_at"),
            supabase.from("lab_vendor_bills").select("*").eq("clinic_id", clinicId).eq("period_month", month).order("bill_date"),
            supabase.from("lab_vendor_bills").select("*").eq("clinic_id", clinicId).is("paid_at", null).order("due_date"),
        ]);

        const sent: LabSentRow[] = [];
        for (const o of los || []) {
            if (String(o.status || "") === "cancelled" || !o.service_id || !extIds.has(o.service_id as string)) continue;
            sent.push({ id: o.id, date: String(o.created_at).slice(0, 10), source: "visit", ref: o.vn as string, name: o.lab_name as string,
                vendor: (o.lab_vendor as string) || NO_VENDOR, cost: Number(o.cost || 0) });
        }
        for (const t of anon || []) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ac: any = Array.isArray(t.anon_cases) ? t.anon_cases[0] : t.anon_cases;
            if (String(ac?.status || "") === "cancelled" || !t.service_id || !extIds.has(t.service_id as string)) continue;
            sent.push({ id: t.id, date: String(t.created_at).slice(0, 10), source: "anon", ref: String(ac?.case_code || "นิรนาม"), name: t.test_name as string,
                vendor: (t.lab_vendor as string) || NO_VENDOR, cost: Number(t.cost || 0) });
        }
        sent.sort((a, b) => a.date.localeCompare(b.date));

        const toBill = (b: Record<string, unknown>): LabBillRow => ({
            id: b.id as string, vendor: b.vendor as string, period_month: b.period_month as string, invoice_no: (b.invoice_no as string) || null,
            bill_date: b.bill_date as string, due_date: b.due_date as string, amount: Number(b.amount || 0),
            paid_at: (b.paid_at as string) || null, paid_method: (b.paid_method as string) || null, note: (b.note as string) || null,
        });
        const billRows = (bills || []).map(toBill);

        const map = new Map<string, LabVendorSummary>();
        const get = (v: string) => { if (!map.has(v)) map.set(v, { vendor: v, count: 0, expected: 0, billed: 0, missingCost: 0 }); return map.get(v)!; };
        for (const s of sent) { const g = get(s.vendor); g.count++; g.expected = r2(g.expected + s.cost); if (!s.cost) g.missingCost++; }
        for (const b of billRows) { const g = get(b.vendor); g.billed = r2(g.billed + b.amount); }

        return { sent, summary: [...map.values()].sort((a, b) => b.expected - a.expected), bills: billRows, openBills: (open || []).map(toBill), canManage };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
    }
}

export async function saveLabBill(input: {
    id?: string; vendor: string; period_month: string; invoice_no?: string; bill_date: string; due_date: string; amount: number; note?: string;
}) {
    try {
        const { supabase, clinicId, userId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        if (!input.vendor.trim()) return { ok: false, error: "ระบุชื่อแล็บ" };
        if (!/^\d{4}-\d{2}$/.test(input.period_month)) return { ok: false, error: "เดือนไม่ถูกต้อง" };
        if (!(Number(input.amount) >= 0)) return { ok: false, error: "ยอดไม่ถูกต้อง" };
        const row = {
            vendor: input.vendor.trim(), period_month: input.period_month, invoice_no: input.invoice_no?.trim() || null,
            bill_date: input.bill_date, due_date: input.due_date, amount: r2(Number(input.amount)), note: input.note?.trim() || null,
        };
        const { error } = input.id
            ? await supabase.from("lab_vendor_bills").update(row).eq("id", input.id).eq("clinic_id", clinicId)
            : await supabase.from("lab_vendor_bills").insert({ ...row, clinic_id: clinicId, created_by: userId });
        if (error) return { ok: false, error: error.message };
        revalidatePath("/dashboard/finance/lab-bills");
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
    }
}

export async function markLabBillPaid(id: string, paidAt: string | null, method?: string) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const { error } = await supabase.from("lab_vendor_bills").update({ paid_at: paidAt, paid_method: paidAt ? (method || "transfer") : null })
            .eq("id", id).eq("clinic_id", clinicId);
        if (error) return { ok: false, error: error.message };
        revalidatePath("/dashboard/finance/lab-bills");
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "ไม่สำเร็จ" };
    }
}

export async function deleteLabBill(id: string) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const { error } = await supabase.from("lab_vendor_bills").delete().eq("id", id).eq("clinic_id", clinicId);
        if (error) return { ok: false, error: error.message };
        revalidatePath("/dashboard/finance/lab-bills");
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "ไม่สำเร็จ" };
    }
}

/** คิดต้นทุนแล็บย้อนหลังของเดือน (หลังตั้งราคาทุนในเมนูครั้งแรก) */
export async function backfillLabCost(month: string) {
    try {
        const { supabase, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const { data, error } = await supabase.rpc("fn_backfill_lab_cost", { p_month: month });
        if (error) return { ok: false, error: error.message };
        revalidatePath("/dashboard/finance/lab-bills");
        return { ok: true, count: Number(data || 0) };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "ไม่สำเร็จ" };
    }
}
