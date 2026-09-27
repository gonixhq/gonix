"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BillType } from "@/lib/payables";

// บิลค้างจ่าย / เจ้าหนี้ (mig 160-161)
//   แล็บ: เทียบยอดที่ระบบคาด (ต้นทุนส่งแล็บ × รายการที่ส่ง) กับใบแจ้งหนี้
//   บริษัทยา: เทียบยอดรับของเข้าสต๊อกที่ผูกกับใบแจ้งหนี้
//   ค่าใช้จ่าย: บันทึก + นับเข้ารายงานกำไร (in_pl)

export interface LabSentRow { id: string; date: string; source: "visit" | "anon"; ref: string; name: string; vendor: string; cost: number }
export interface LabVendorSummary { vendor: string; count: number; expected: number; billed: number; missingCost: number }
export interface BillRow {
    id: string; bill_type: BillType; vendor: string; period_month: string; invoice_no: string | null; bill_date: string; due_date: string;
    amount: number; category: string | null; in_pl: boolean; paid_at: string | null; paid_method: string | null; paid_ref: string | null; note: string | null;
    received: number;   // supplier: ยอดรับของที่ผูก
}
export interface ReceiptRow { id: string; date: string; item_name: string; qty: number; unit: string | null; total_cost: number; vendor_bill_id: string | null; supplier: string | null }
export interface VendorRow { id: string; name: string; vendor_type: BillType; credit_days: number; bill_day: number | null; tax_id: string | null; phone: string | null; note: string | null; is_active: boolean }

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
const fail = (e: unknown, msg = "ไม่สำเร็จ") => ({ ok: false as const, error: e instanceof Error ? e.message : msg });

function monthRange(month: string) {
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return { from: `${month}-01T00:00:00+07:00`, to: `${next}-01T00:00:00+07:00` };
}

function toBill(b: Record<string, unknown>, received = 0): BillRow {
    return {
        id: b.id as string, bill_type: (b.bill_type as BillType) || "lab", vendor: b.vendor as string, period_month: b.period_month as string,
        invoice_no: (b.invoice_no as string) || null, bill_date: b.bill_date as string, due_date: b.due_date as string, amount: Number(b.amount || 0),
        category: (b.category as string) || null, in_pl: b.in_pl !== false, paid_at: (b.paid_at as string) || null,
        paid_method: (b.paid_method as string) || null, paid_ref: (b.paid_ref as string) || null, note: (b.note as string) || null, received,
    };
}

export async function getPayables(month: string): Promise<{
    lab: { sent: LabSentRow[]; summary: LabVendorSummary[] };
    bills: BillRow[]; openBills: BillRow[]; receipts: ReceiptRow[]; vendors: VendorRow[]; canManage: boolean;
} | { error: string }> {
    try {
        if (!/^\d{4}-\d{2}$/.test(month)) return { error: "เดือนไม่ถูกต้อง" };
        const { supabase, clinicId, canManage } = await ctx();
        const { from, to } = monthRange(month);

        const { data: labSvcs } = await supabase.from("service_catalog").select("id").eq("clinic_id", clinicId).eq("item_type", "lab_external");
        const extIds = new Set((labSvcs || []).map(s => s.id as string));

        const [{ data: los }, { data: anon }, { data: bills }, { data: open }, { data: rc }, { data: vend }] = await Promise.all([
            supabase.from("lab_orders").select("id, vn, lab_name, lab_type, service_id, cost, lab_vendor, status, created_at")
                .eq("clinic_id", clinicId).gte("created_at", from).lt("created_at", to).or("lab_type.is.null,lab_type.neq.package").order("created_at"),
            supabase.from("anon_case_tests").select("id, test_name, service_id, cost, lab_vendor, created_at, anon_cases!inner(clinic_id, case_code, status)")
                .eq("anon_cases.clinic_id", clinicId).gte("created_at", from).lt("created_at", to).order("created_at"),
            supabase.from("vendor_bills").select("*").eq("clinic_id", clinicId).eq("period_month", month).order("bill_date"),
            supabase.from("vendor_bills").select("*").eq("clinic_id", clinicId).is("paid_at", null).order("due_date"),
            supabase.from("stock_card").select("id, created_at, qty_delta, total_cost, vendor_bill_id, inventory(item_name, unit, supplier)")
                .eq("clinic_id", clinicId).eq("tx_type", "PO_RECEIVE").gte("created_at", from).lt("created_at", to).order("created_at"),
            supabase.from("vendors").select("*").eq("clinic_id", clinicId).order("vendor_type").order("name"),
        ]);

        // ── แล็บ ──
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

        // ── ยอดรับของที่ผูกบิล (ทุกเดือน — บิลอาจรวมของหลายวัน) ──
        const billIds = [...new Set([...(bills || []), ...(open || [])].filter(b => b.bill_type === "supplier").map(b => b.id as string))];
        const recvByBill = new Map<string, number>();
        if (billIds.length) {
            const { data: linked } = await supabase.from("stock_card").select("vendor_bill_id, total_cost").in("vendor_bill_id", billIds);
            for (const l of linked || []) recvByBill.set(l.vendor_bill_id as string, r2((recvByBill.get(l.vendor_bill_id as string) || 0) + Number(l.total_cost || 0)));
        }
        const billRows = (bills || []).map(b => toBill(b, recvByBill.get(b.id as string) || 0));

        const map = new Map<string, LabVendorSummary>();
        const get = (v: string) => { if (!map.has(v)) map.set(v, { vendor: v, count: 0, expected: 0, billed: 0, missingCost: 0 }); return map.get(v)!; };
        for (const s of sent) { const g = get(s.vendor); g.count++; g.expected = r2(g.expected + s.cost); if (!s.cost) g.missingCost++; }
        for (const b of billRows.filter(b => b.bill_type === "lab")) { const g = get(b.vendor); g.billed = r2(g.billed + b.amount); }

        const receipts: ReceiptRow[] = (rc || []).map(r => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const inv: any = Array.isArray(r.inventory) ? r.inventory[0] : r.inventory;
            return { id: r.id as string, date: String(r.created_at).slice(0, 10), item_name: inv?.item_name || "-", qty: Number(r.qty_delta || 0), unit: inv?.unit || null,
                total_cost: Number(r.total_cost || 0), vendor_bill_id: (r.vendor_bill_id as string) || null, supplier: inv?.supplier || null };
        });

        return {
            lab: { sent, summary: [...map.values()].sort((a, b) => b.expected - a.expected) },
            bills: billRows, openBills: (open || []).map(b => toBill(b, recvByBill.get(b.id as string) || 0)), receipts,
            vendors: (vend || []).map(v => ({ id: v.id, name: v.name, vendor_type: v.vendor_type, credit_days: Number(v.credit_days ?? 30), bill_day: v.bill_day ?? null,
                tax_id: v.tax_id || null, phone: v.phone || null, note: v.note || null, is_active: v.is_active !== false })),
            canManage,
        };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
    }
}

export async function saveBill(input: {
    id?: string; bill_type: BillType; vendor: string; period_month: string; invoice_no?: string; bill_date: string; due_date: string;
    amount: number; category?: string | null; in_pl?: boolean; note?: string;
}) {
    try {
        const { supabase, clinicId, userId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const vendor = input.vendor.trim();
        if (!vendor) return { ok: false, error: "ระบุชื่อผู้ขาย/เจ้าหนี้" };
        if (!/^\d{4}-\d{2}$/.test(input.period_month)) return { ok: false, error: "เดือนไม่ถูกต้อง" };
        if (!(Number(input.amount) >= 0)) return { ok: false, error: "ยอดไม่ถูกต้อง" };
        if (!input.bill_date || !input.due_date) return { ok: false, error: "ระบุวันที่" };
        const row = {
            bill_type: input.bill_type, vendor, period_month: input.period_month, invoice_no: input.invoice_no?.trim() || null,
            bill_date: input.bill_date, due_date: input.due_date, amount: r2(Number(input.amount)),
            category: input.bill_type === "expense" ? (input.category || "other") : null,
            in_pl: input.bill_type === "expense" ? input.in_pl !== false : true, note: input.note?.trim() || null,
        };
        const { error } = input.id
            ? await supabase.from("vendor_bills").update(row).eq("id", input.id).eq("clinic_id", clinicId)
            : await supabase.from("vendor_bills").insert({ ...row, clinic_id: clinicId, created_by: userId });
        if (error) return { ok: false, error: error.message };
        // ผู้ขายใหม่ → เพิ่มในทะเบียน (เครดิต = วันครบกำหนด − วันที่บิล)
        const days = Math.max(0, Math.round((new Date(input.due_date).getTime() - new Date(input.bill_date).getTime()) / 86400000));
        await supabase.from("vendors").upsert({ clinic_id: clinicId, name: vendor, vendor_type: input.bill_type, credit_days: days },
            { onConflict: "clinic_id,name", ignoreDuplicates: true });
        revalidatePath("/dashboard/finance/payables");
        return { ok: true };
    } catch (e) { return fail(e, "บันทึกไม่สำเร็จ"); }
}

export async function markBillPaid(id: string, paid: { date: string; method: string; ref?: string } | null) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const { error } = await supabase.from("vendor_bills").update(paid
            ? { paid_at: paid.date, paid_method: paid.method || "transfer", paid_ref: paid.ref?.trim() || null }
            : { paid_at: null, paid_method: null, paid_ref: null }).eq("id", id).eq("clinic_id", clinicId);
        if (error) return { ok: false, error: error.message };
        revalidatePath("/dashboard/finance/payables");
        return { ok: true };
    } catch (e) { return fail(e); }
}

export async function deleteBill(id: string) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const { error } = await supabase.from("vendor_bills").delete().eq("id", id).eq("clinic_id", clinicId);
        if (error) return { ok: false, error: error.message };
        revalidatePath("/dashboard/finance/payables");
        return { ok: true };
    } catch (e) { return fail(e); }
}

/** ผูก/ถอดการรับของเข้าสต๊อกกับใบแจ้งหนี้บริษัทยา */
export async function linkReceiptToBill(stockCardId: string, billId: string | null) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const { error } = await supabase.from("stock_card").update({ vendor_bill_id: billId }).eq("id", stockCardId).eq("clinic_id", clinicId).eq("tx_type", "PO_RECEIVE");
        if (error) return { ok: false, error: error.message };
        revalidatePath("/dashboard/finance/payables");
        return { ok: true };
    } catch (e) { return fail(e); }
}

/** ใบแจ้งหนี้บริษัทยาที่ยังไม่จ่าย — ให้เลือกผูกตอนรับของเข้า */
export async function getOpenSupplierBills(): Promise<{ id: string; label: string }[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("vendor_bills").select("id, vendor, invoice_no, amount, bill_date")
            .eq("clinic_id", clinicId).eq("bill_type", "supplier").is("paid_at", null).order("bill_date", { ascending: false }).limit(50);
        return (data || []).map(b => ({ id: b.id as string, label: `${b.vendor}${b.invoice_no ? ` #${b.invoice_no}` : ""} · ฿${Number(b.amount).toLocaleString()} · ${b.bill_date}` }));
    } catch { return []; }
}

export async function saveVendor(input: { id?: string; name: string; vendor_type: BillType; credit_days: number; bill_day?: number | null; tax_id?: string; phone?: string; note?: string; is_active?: boolean }) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        if (!input.name.trim()) return { ok: false, error: "ระบุชื่อ" };
        const row = {
            name: input.name.trim(), vendor_type: input.vendor_type, credit_days: Math.max(0, Math.floor(Number(input.credit_days) || 0)),
            bill_day: input.bill_day && input.bill_day >= 1 && input.bill_day <= 31 ? Math.floor(input.bill_day) : null,
            tax_id: input.tax_id?.trim() || null, phone: input.phone?.trim() || null, note: input.note?.trim() || null, is_active: input.is_active !== false,
        };
        const { error } = input.id
            ? await supabase.from("vendors").update(row).eq("id", input.id).eq("clinic_id", clinicId)
            : await supabase.from("vendors").insert({ ...row, clinic_id: clinicId });
        if (error) return { ok: false, error: error.code === "23505" ? "มีชื่อนี้แล้ว" : error.message };
        revalidatePath("/dashboard/finance/payables");
        return { ok: true };
    } catch (e) { return fail(e); }
}

/** คิดต้นทุนแล็บย้อนหลังของเดือน (หลังตั้งราคาทุนในเมนูครั้งแรก) */
export async function backfillLabCost(month: string) {
    try {
        const { supabase, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const { data, error } = await supabase.rpc("fn_backfill_lab_cost", { p_month: month });
        if (error) return { ok: false, error: error.message };
        revalidatePath("/dashboard/finance/payables");
        return { ok: true, count: Number(data || 0) };
    } catch (e) { return fail(e); }
}
