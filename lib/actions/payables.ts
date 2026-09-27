"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BILL_TYPE_LABEL, DOC_TYPE_LABEL, expenseCategoryLabel, type BillType } from "@/lib/payables";

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
    doc_type: string; vat_mode: "none" | "excl" | "incl"; subtotal: number; vat_amount: number; wht_pct: number; wht_amount: number; net_pay: number;
    attachments: BillAttachment[]; original_filed: boolean; original_ref: string | null; sent_to_accountant_at: string | null;
    lines: BillLine[]; discount: number;
}
export interface BillAttachment { path: string; name: string; size?: number; type?: string }
export interface BillLine { description: string; category: string | null; qty: number; unit_price: number; amount?: number }
export interface ReceiptRow { id: string; date: string; item_name: string; qty: number; unit: string | null; total_cost: number; vendor_bill_id: string | null; supplier: string | null }
export interface VendorRow { id: string; name: string; vendor_type: BillType; credit_days: number; bill_day: number | null; tax_id: string | null; phone: string | null; note: string | null; is_active: boolean; address: string | null; branch: string | null }

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
        doc_type: (b.doc_type as string) || "invoice", vat_mode: ((b.vat_mode as string) || "none") as BillRow["vat_mode"],
        subtotal: Number(b.subtotal ?? b.amount ?? 0), vat_amount: Number(b.vat_amount || 0), wht_pct: Number(b.wht_pct || 0), wht_amount: Number(b.wht_amount || 0),
        net_pay: r2(Number(b.amount || 0) - Number(b.wht_amount || 0)),
        attachments: Array.isArray(b.attachments) ? (b.attachments as BillAttachment[]) : [], original_filed: !!b.original_filed,
        original_ref: (b.original_ref as string) || null, sent_to_accountant_at: (b.sent_to_accountant_at as string) || null,
        lines: Array.isArray(b.lines) ? (b.lines as BillLine[]) : [], discount: Number(b.discount || 0),
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
                tax_id: v.tax_id || null, phone: v.phone || null, note: v.note || null, is_active: v.is_active !== false, address: v.address || null, branch: v.branch || null })),
            canManage,
        };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
    }
}

export async function saveBill(input: {
    id?: string; bill_type: BillType; vendor: string; period_month: string; invoice_no?: string; bill_date: string; due_date: string;
    amount: number; category?: string | null; in_pl?: boolean; note?: string;
    doc_type?: string; vat_mode?: "none" | "excl" | "incl"; wht_pct?: number; original_filed?: boolean; original_ref?: string;
    vendor_tax_id?: string | null; vendor_branch?: string | null; vendor_address?: string | null;   // จากสแกน AI
    lines?: BillLine[]; discount?: number;   // mig 163 — มีรายการ = amount คำนวณจากรายการ − ส่วนลด
}): Promise<{ ok: boolean; error?: string; id?: string }> {
    try {
        const { supabase, clinicId, userId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const vendor = input.vendor.trim();
        if (!vendor) return { ok: false, error: "ระบุชื่อผู้ขาย/เจ้าหนี้" };
        if (!/^\d{4}-\d{2}$/.test(input.period_month)) return { ok: false, error: "เดือนไม่ถูกต้อง" };
        const lines = (input.lines || [])
            .map(l => ({ description: String(l.description || "").trim(), category: l.category || null, qty: Number(l.qty) || 0, unit_price: Number(l.unit_price) || 0 }))
            .filter(l => l.description || l.unit_price)
            .map(l => ({ ...l, amount: r2(l.qty * l.unit_price) }));
        const discount = Math.max(0, r2(Number(input.discount) || 0));
        if (lines.length) input = { ...input, amount: r2(lines.reduce((t, l) => t + l.amount, 0) - discount) };
        if (!(Number(input.amount) >= 0)) return { ok: false, error: "ยอดไม่ถูกต้อง (ส่วนลดมากกว่ายอดรวม?)" };
        const topCat = lines.length ? [...lines].sort((a, b) => b.amount - a.amount)[0].category : null;
        if (!input.bill_date || !input.due_date) return { ok: false, error: "ระบุวันที่" };
        // amount ที่กรอก: none/incl = ยอดรวม · excl = ยอดก่อน VAT
        const vm = input.vat_mode || "none", base = r2(Number(input.amount));
        const subtotal = vm === "incl" ? r2(base / 1.07) : base;
        const vat = vm === "excl" ? r2(base * 0.07) : vm === "incl" ? r2(base - subtotal) : 0;
        const total = r2(subtotal + vat);
        const whtPct = Math.max(0, Math.min(15, Number(input.wht_pct) || 0));
        const row = {
            doc_type: input.doc_type || "invoice", vat_mode: vm, subtotal, vat_amount: vat, wht_pct: whtPct, wht_amount: r2(subtotal * whtPct / 100),
            original_filed: !!input.original_filed, original_ref: input.original_ref?.trim() || null,
            bill_type: input.bill_type, vendor, period_month: input.period_month, invoice_no: input.invoice_no?.trim() || null,
            bill_date: input.bill_date, due_date: input.due_date, amount: total,
            category: input.bill_type === "expense" ? (topCat || input.category || "other") : null,
            lines, discount: lines.length ? discount : 0,
            in_pl: input.bill_type === "expense" ? input.in_pl !== false : true, note: input.note?.trim() || null,
        };
        let id = input.id;
        if (id) {
            const { error } = await supabase.from("vendor_bills").update(row).eq("id", id).eq("clinic_id", clinicId);
            if (error) return { ok: false, error: error.message };
        } else {
            const { data, error } = await supabase.from("vendor_bills").insert({ ...row, clinic_id: clinicId, created_by: userId }).select("id").single();
            if (error) return { ok: false, error: error.message };
            id = data.id as string;
        }
        // ผู้ขายใหม่ → เพิ่มในทะเบียน (เครดิต = วันครบกำหนด − วันที่บิล)
        const days = Math.max(0, Math.round((new Date(input.due_date).getTime() - new Date(input.bill_date).getTime()) / 86400000));
        await supabase.from("vendors").upsert({ clinic_id: clinicId, name: vendor, vendor_type: input.bill_type, credit_days: days,
            tax_id: input.vendor_tax_id || null, branch: input.vendor_branch || null, address: input.vendor_address || null },
            { onConflict: "clinic_id,name", ignoreDuplicates: true });
        // ผู้ขายเดิมที่ยังไม่มีเลขผู้เสียภาษี/ที่อยู่ → เติมจากเอกสาร
        if (input.vendor_tax_id || input.vendor_address || input.vendor_branch) {
            const { data: v } = await supabase.from("vendors").select("id, tax_id, address, branch").eq("clinic_id", clinicId).eq("name", vendor).maybeSingle();
            const patch: Record<string, string> = {};
            if (v && !v.tax_id && input.vendor_tax_id) patch.tax_id = input.vendor_tax_id;
            if (v && !v.address && input.vendor_address) patch.address = input.vendor_address;
            if (v && !v.branch && input.vendor_branch) patch.branch = input.vendor_branch;
            if (v && Object.keys(patch).length) await supabase.from("vendors").update(patch).eq("id", v.id);
        }
        revalidatePath("/dashboard/finance/payables");
        return { ok: true, id };
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

export async function saveVendor(input: { id?: string; name: string; vendor_type: BillType; credit_days: number; bill_day?: number | null; tax_id?: string; phone?: string; note?: string; is_active?: boolean; address?: string; branch?: string }) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        if (!input.name.trim()) return { ok: false, error: "ระบุชื่อ" };
        const row = {
            name: input.name.trim(), vendor_type: input.vendor_type, credit_days: Math.max(0, Math.floor(Number(input.credit_days) || 0)),
            bill_day: input.bill_day && input.bill_day >= 1 && input.bill_day <= 31 ? Math.floor(input.bill_day) : null,
            tax_id: input.tax_id?.trim() || null, phone: input.phone?.trim() || null, note: input.note?.trim() || null, is_active: input.is_active !== false,
            address: input.address?.trim() || null, branch: input.branch?.trim() || null,
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

// ── เอกสารแนบ / ต้นฉบับ / ส่งสำนักงานบัญชี (mig 162) ──
const ATT_MIME = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);
const ATT_MAX = 10 * 1024 * 1024;

export async function uploadBillAttachment(formData: FormData) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const billId = String(formData.get("bill_id") || "");
        const file = formData.get("file") as File | null;
        if (!billId || !file || file.size === 0) return { ok: false, error: "ไม่พบไฟล์" };
        if (file.size > ATT_MAX) return { ok: false, error: "ไฟล์ใหญ่เกิน 10MB" };
        if (!ATT_MIME.has(file.type)) return { ok: false, error: `ชนิดไฟล์ไม่รองรับ (${file.type || "?"})` };
        const { data: bill } = await supabase.from("vendor_bills").select("attachments").eq("id", billId).eq("clinic_id", clinicId).maybeSingle();
        if (!bill) return { ok: false, error: "ไม่พบบิล" };
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const path = `${clinicId}/vendor-bills/${billId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("clinic-assets").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
        if (upErr) return { ok: false, error: `อัปโหลดไม่สำเร็จ: ${upErr.message}` };
        const list = [...((bill.attachments as BillAttachment[]) || []), { path, name: file.name, size: file.size, type: file.type }];
        const { error } = await supabase.from("vendor_bills").update({ attachments: list }).eq("id", billId).eq("clinic_id", clinicId);
        if (error) { await supabase.storage.from("clinic-assets").remove([path]); return { ok: false, error: error.message }; }
        revalidatePath("/dashboard/finance/payables");
        return { ok: true };
    } catch (e) { return fail(e, "อัปโหลดไม่สำเร็จ"); }
}

export async function deleteBillAttachment(billId: string, path: string) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        if (!path.startsWith(`${clinicId}/vendor-bills/${billId}/`)) return { ok: false, error: "ไฟล์ไม่ถูกต้อง" };
        const { data: bill } = await supabase.from("vendor_bills").select("attachments").eq("id", billId).eq("clinic_id", clinicId).maybeSingle();
        if (!bill) return { ok: false, error: "ไม่พบบิล" };
        await supabase.storage.from("clinic-assets").remove([path]);
        const list = ((bill.attachments as BillAttachment[]) || []).filter(a => a.path !== path);
        await supabase.from("vendor_bills").update({ attachments: list }).eq("id", billId).eq("clinic_id", clinicId);
        revalidatePath("/dashboard/finance/payables");
        return { ok: true };
    } catch (e) { return fail(e); }
}

/** ลิงก์ดูไฟล์ (หมดอายุ 1 ชม.) */
export async function getBillAttachmentUrl(path: string): Promise<{ ok: boolean; url?: string; error?: string }> {
    try {
        const { supabase, clinicId } = await ctx();
        if (!path.startsWith(`${clinicId}/vendor-bills/`)) return { ok: false, error: "ไฟล์ไม่ถูกต้อง" };
        const { data, error } = await supabase.storage.from("clinic-assets").createSignedUrl(path, 3600);
        if (error || !data) return { ok: false, error: error?.message || "เปิดไฟล์ไม่ได้" };
        return { ok: true, url: data.signedUrl };
    } catch (e) { return fail(e); }
}

/** ทำเครื่องหมาย ส่งสำนักงานบัญชีแล้ว / ยกเลิก */
export async function markBillsSent(ids: string[], sent = true) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        if (!ids.length) return { ok: false, error: "ไม่ได้เลือกบิล" };
        const { error } = await supabase.from("vendor_bills").update({ sent_to_accountant_at: sent ? new Date().toISOString() : null }).in("id", ids).eq("clinic_id", clinicId);
        if (error) return { ok: false, error: error.message };
        revalidatePath("/dashboard/finance/payables");
        return { ok: true };
    } catch (e) { return fail(e); }
}

/** ไฟล์ส่งสำนักงานบัญชี (CSV เปิดด้วย Excel) — บิลทุกประเภทของเดือน + ลิงก์รูปเอกสาร (หมดอายุ 7 วัน) */
export async function exportBillsForAccountant(month: string): Promise<{ ok: boolean; csv?: string; count?: number; error?: string }> {
    try {
        if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "เดือนไม่ถูกต้อง" };
        const { supabase, clinicId } = await ctx();
        const [{ data: bills }, { data: vend }] = await Promise.all([
            supabase.from("vendor_bills").select("*").eq("clinic_id", clinicId).eq("period_month", month).order("bill_date"),
            supabase.from("vendors").select("name, tax_id, branch").eq("clinic_id", clinicId),
        ]);
        const vmap = new Map((vend || []).map(v => [v.name as string, v]));
        const esc = (v: unknown) => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
        const head = ["วันที่เอกสาร", "เลขที่", "ประเภทเอกสาร", "ผู้ขาย", "เลขผู้เสียภาษี", "สาขา", "ประเภท", "หมวด", "ก่อน VAT", "VAT", "รวม", "หัก ณ ที่จ่าย %", "หัก ณ ที่จ่าย", "ยอดจ่ายจริง", "ครบกำหนด", "จ่ายวันที่", "วิธีจ่าย", "อ้างอิงจ่าย", "ต้นฉบับ", "หมายเหตุ", "ไฟล์แนบ"];
        const lines = [head.join(",")];
        for (const b of bills || []) {
            const row = toBill(b);
            const v = vmap.get(row.vendor);
            const links: string[] = [];
            for (const a of row.attachments) {
                const { data } = await supabase.storage.from("clinic-assets").createSignedUrl(a.path, 7 * 86400);
                if (data?.signedUrl) links.push(data.signedUrl);
            }
            lines.push([row.bill_date, row.invoice_no, DOC_TYPE_LABEL[row.doc_type] || row.doc_type, row.vendor, v?.tax_id, v?.branch, BILL_TYPE_LABEL[row.bill_type],
                row.bill_type === "expense" ? expenseCategoryLabel(row.category) : "", row.subtotal, row.vat_amount, row.amount, row.wht_pct || "", row.wht_amount || "", row.net_pay,
                row.due_date, row.paid_at, row.paid_method, row.paid_ref, row.original_filed ? `เก็บแล้ว ${row.original_ref || ""}`.trim() : "ยังไม่เก็บ", row.note, links.join("\n")].map(esc).join(","));
        }
        return { ok: true, csv: "﻿" + lines.join("\r\n"), count: (bills || []).length };
    } catch (e) { return fail(e); }
}
