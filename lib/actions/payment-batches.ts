"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyOwners, notifyProfileIds } from "@/lib/line-notify";

// ใบเตรียมจ่าย (mig 164): รวมหลายบิลของผู้ขายเดียวกัน → อนุมัติ → จ่ายครั้งเดียว (บิลทุกใบ paid ตาม)

export type BatchStatus = "prepared" | "approved" | "paid" | "cancelled";
export interface BatchBill { id: string; invoice_no: string | null; bill_date: string; due_date: string; amount: number; wht_amount: number; net_pay: number; note: string | null; bill_type: string }
export interface BatchRow {
    id: string; batch_no: string; kind: "vendor" | "reimburse"; vendor: string; status: BatchStatus; total: number; wht_total: number; net_total: number; pay_date: string | null; note: string | null;
    prepared_by: string | null; prepared_at: string; approved_by: string | null; approved_at: string | null; paid_at: string | null; paid_method: string | null; paid_ref: string | null;
    bills: BatchBill[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const PATH = "/dashboard/finance/payables";

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id, role, full_name").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("ไม่พบคลินิก");
    const role = String(profile.role);
    return {
        supabase, userId: user.id, clinicId: profile.clinic_id as string, name: (profile.full_name as string) || "",
        canPrepare: ["owner", "admin", "accountant"].includes(role), canApprove: ["owner", "admin"].includes(role),
    };
}
const fail = (e: unknown, msg = "ไม่สำเร็จ") => ({ ok: false as const, error: e instanceof Error ? e.message : msg });

export async function listBatches(): Promise<{ batches: BatchRow[]; canPrepare: boolean; canApprove: boolean } | { error: string }> {
    try {
        const { supabase, clinicId, canPrepare, canApprove } = await ctx();
        const since = new Date(Date.now() - 120 * 86400000).toISOString();
        const { data: bs } = await supabase.from("payment_batches").select("*").eq("clinic_id", clinicId)
            .or(`status.in.(prepared,approved),prepared_at.gte.${since}`).order("prepared_at", { ascending: false }).limit(100);
        const ids = (bs || []).map(b => b.id as string);
        const [{ data: bills }, { data: people }] = await Promise.all([
            ids.length ? supabase.from("vendor_bills").select("id, batch_id, invoice_no, bill_date, due_date, amount, wht_amount, note, bill_type").in("batch_id", ids).order("bill_date") : Promise.resolve({ data: [] }),
            supabase.from("profiles").select("id, full_name").eq("clinic_id", clinicId),
        ]);
        const nm = new Map((people || []).map(p => [p.id as string, p.full_name as string]));
        const byBatch = new Map<string, BatchBill[]>();
        for (const b of (bills || []) as Record<string, unknown>[]) {
            const k = b.batch_id as string;
            if (!byBatch.has(k)) byBatch.set(k, []);
            byBatch.get(k)!.push({ id: b.id as string, invoice_no: (b.invoice_no as string) || null, bill_date: b.bill_date as string, due_date: b.due_date as string,
                amount: Number(b.amount || 0), wht_amount: Number(b.wht_amount || 0), net_pay: r2(Number(b.amount || 0) - Number(b.wht_amount || 0)), note: (b.note as string) || null, bill_type: b.bill_type as string });
        }
        return {
            canPrepare, canApprove,
            batches: (bs || []).map(b => ({
                id: b.id, batch_no: b.batch_no, kind: (b.kind || "vendor") as BatchRow["kind"], vendor: b.vendor, status: b.status, total: Number(b.total), wht_total: Number(b.wht_total), net_total: Number(b.net_total),
                pay_date: b.pay_date || null, note: b.note || null, prepared_by: nm.get(b.prepared_by) || null, prepared_at: b.prepared_at,
                approved_by: nm.get(b.approved_by) || null, approved_at: b.approved_at || null, paid_at: b.paid_at || null, paid_method: b.paid_method || null, paid_ref: b.paid_ref || null,
                bills: byBatch.get(b.id) || [],
            })),
        };
    } catch (e) { return { error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }; }
}

async function recompute(supabase: Awaited<ReturnType<typeof createClient>>, batchId: string) {
    const [{ data: bills }, { data: bt }] = await Promise.all([
        supabase.from("vendor_bills").select("amount, wht_amount").eq("batch_id", batchId),
        supabase.from("payment_batches").select("kind").eq("id", batchId).maybeSingle(),
    ]);
    // คืนเงินสำรองจ่าย = คืนเท่าที่คนนั้นจ่ายจริง (ยอดหลังหัก ณ ที่จ่าย) · ไม่หักซ้ำ
    const reimb = bt?.kind === "reimburse";
    const total = r2((bills || []).reduce((s, b) => s + Number(b.amount || 0) - (reimb ? Number(b.wht_amount || 0) : 0), 0));
    const wht = reimb ? 0 : r2((bills || []).reduce((s, b) => s + Number(b.wht_amount || 0), 0));
    await supabase.from("payment_batches").update({ total, wht_total: wht, net_total: r2(total - wht) }).eq("id", batchId);
    return { total, wht, net: r2(total - wht), count: (bills || []).length };
}

/** สร้างใบเตรียมจ่ายจากบิลที่เลือก (ผู้ขายเดียวกัน · ยังไม่จ่าย · ยังไม่อยู่ในใบอื่น) */
export async function createBatch(billIds: string[], opts?: { pay_date?: string; note?: string }) {
    try {
        const { supabase, clinicId, userId, name, canPrepare, canApprove } = await ctx();
        if (!canPrepare) return { ok: false, error: "ไม่มีสิทธิ์เตรียมจ่าย" };
        if (!billIds.length) return { ok: false, error: "ยังไม่ได้เลือกบิล" };
        const { data: bills } = await supabase.from("vendor_bills").select("id, vendor, paid_at, batch_id").eq("clinic_id", clinicId).in("id", billIds);
        if (!bills || bills.length !== billIds.length) return { ok: false, error: "ไม่พบบิลบางใบ" };
        const vendors = new Set(bills.map(b => b.vendor));
        if (vendors.size > 1) return { ok: false, error: "เลือกได้เฉพาะบิลของผู้ขายเดียวกัน" };
        if (bills.some(b => b.paid_at)) return { ok: false, error: "มีบิลที่จ่ายแล้ว" };
        const inBatch = bills.filter(b => b.batch_id).map(b => b.batch_id as string);
        if (inBatch.length) {
            const { data: act } = await supabase.from("payment_batches").select("id").in("id", inBatch).in("status", ["prepared", "approved"]);
            if (act?.length) return { ok: false, error: "มีบิลอยู่ในใบเตรียมจ่ายอื่นแล้ว" };
        }
        const now = new Date(Date.now() + 7 * 3600000);
        const prefix = `PS${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        const { count } = await supabase.from("payment_batches").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).like("batch_no", `${prefix}%`);
        const vendor = [...vendors][0] as string;
        let batchId = "", batchNo = "";
        for (let i = 1; i <= 5 && !batchId; i++) {
            batchNo = `${prefix}-${String((count || 0) + i).padStart(3, "0")}`;
            const { data, error } = await supabase.from("payment_batches").insert({
                clinic_id: clinicId, batch_no: batchNo, vendor, prepared_by: userId, pay_date: opts?.pay_date || null, note: opts?.note?.trim() || null,
            }).select("id").single();
            if (data) batchId = data.id as string;
            else if (error && error.code !== "23505") return { ok: false, error: error.message };
        }
        if (!batchId) return { ok: false, error: "สร้างเลขที่ไม่สำเร็จ ลองใหม่" };
        const { error: uErr } = await supabase.from("vendor_bills").update({ batch_id: batchId }).in("id", billIds).eq("clinic_id", clinicId);
        if (uErr) { await supabase.from("payment_batches").delete().eq("id", batchId); return { ok: false, error: uErr.message }; }
        const t = await recompute(supabase, batchId);
        if (!canApprove) {
            await notifyOwners(supabase, clinicId, `📋 ใบเตรียมจ่าย ${batchNo} รออนุมัติ\nจ่ายให้: ${vendor} (${t.count} บิล)\nยอดโอน ฿${t.net.toLocaleString()}\nโดย ${name}\nเปิดดู: การเงิน → ค่าใช้จ่าย → เตรียมจ่าย`);
        }
        revalidatePath(PATH);
        return { ok: true, id: batchId, batch_no: batchNo };
    } catch (e) { return fail(e); }
}

export async function removeBillFromBatch(batchId: string, billId: string) {
    try {
        const { supabase, clinicId, canPrepare } = await ctx();
        if (!canPrepare) return { ok: false, error: "ไม่มีสิทธิ์" };
        const { data: b } = await supabase.from("payment_batches").select("status").eq("id", batchId).eq("clinic_id", clinicId).maybeSingle();
        if (!b || b.status !== "prepared") return { ok: false, error: "แก้ได้เฉพาะใบที่ยังไม่อนุมัติ" };
        await supabase.from("vendor_bills").update({ batch_id: null }).eq("id", billId).eq("batch_id", batchId);
        const t = await recompute(supabase, batchId);
        if (t.count === 0) await supabase.from("payment_batches").update({ status: "cancelled" }).eq("id", batchId);
        revalidatePath(PATH);
        return { ok: true };
    } catch (e) { return fail(e); }
}

export async function approveBatch(batchId: string) {
    try {
        const { supabase, clinicId, userId, canApprove } = await ctx();
        if (!canApprove) return { ok: false, error: "อนุมัติได้เฉพาะเจ้าของ/ผู้จัดการ" };
        const { data: b } = await supabase.from("payment_batches").select("status, batch_no, prepared_by, net_total").eq("id", batchId).eq("clinic_id", clinicId).maybeSingle();
        if (!b || b.status !== "prepared") return { ok: false, error: "ใบนี้ไม่อยู่ในสถานะรออนุมัติ" };
        const { error } = await supabase.from("payment_batches").update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() }).eq("id", batchId);
        if (error) return { ok: false, error: error.message };
        if (b.prepared_by && b.prepared_by !== userId) await notifyProfileIds(supabase, [b.prepared_by as string], `✅ ใบเตรียมจ่าย ${b.batch_no} อนุมัติแล้ว — ยอดโอน ฿${Number(b.net_total).toLocaleString()}`);
        revalidatePath(PATH);
        return { ok: true };
    } catch (e) { return fail(e); }
}

/** จ่ายใบเตรียมจ่าย → บิลทุกใบในใบนี้ = ชำระแล้ว */
export async function payBatch(batchId: string, p: { date: string; method: string; ref?: string }) {
    try {
        const { supabase, clinicId, canPrepare, canApprove } = await ctx();
        if (!canPrepare) return { ok: false, error: "ไม่มีสิทธิ์" };
        const { data: b } = await supabase.from("payment_batches").select("status, kind").eq("id", batchId).eq("clinic_id", clinicId).maybeSingle();
        if (!b || !["prepared", "approved"].includes(String(b.status))) return { ok: false, error: "ใบนี้จ่ายไม่ได้" };
        if (b.status === "prepared" && !canApprove) return { ok: false, error: "ต้องให้เจ้าของ/ผู้จัดการอนุมัติก่อนจ่าย" };
        const pay = { paid_at: p.date, paid_method: p.method || "transfer", paid_ref: p.ref?.trim() || null };
        const { error } = await supabase.from("payment_batches").update({ status: "paid", ...pay }).eq("id", batchId);
        if (error) return { ok: false, error: error.message };
        if (b.kind === "reimburse") {
            await supabase.from("vendor_bills").update({ reimburse_status: "reimbursed", reimbursed_at: p.date }).eq("batch_id", batchId).eq("clinic_id", clinicId).eq("reimburse_status", "pending");
        } else {
            await supabase.from("vendor_bills").update(pay).eq("batch_id", batchId).eq("clinic_id", clinicId).is("paid_at", null);
        }
        revalidatePath(PATH);
        return { ok: true };
    } catch (e) { return fail(e); }
}

export async function cancelBatch(batchId: string) {
    try {
        const { supabase, clinicId, canPrepare } = await ctx();
        if (!canPrepare) return { ok: false, error: "ไม่มีสิทธิ์" };
        const { data: b } = await supabase.from("payment_batches").select("status").eq("id", batchId).eq("clinic_id", clinicId).maybeSingle();
        if (!b || b.status === "paid") return { ok: false, error: "ยกเลิกใบที่จ่ายแล้วไม่ได้ (ยกเลิกจ่ายที่บิลแทน)" };
        await supabase.from("vendor_bills").update({ batch_id: null }).eq("batch_id", batchId).eq("clinic_id", clinicId);
        const { error } = await supabase.from("payment_batches").update({ status: "cancelled" }).eq("id", batchId);
        if (error) return { ok: false, error: error.message };
        revalidatePath(PATH);
        return { ok: true };
    } catch (e) { return fail(e); }
}

/** ใบคืนเงินสำรองจ่าย: รวมบิลที่คนเดียวกันสำรองจ่าย (รอคืน) → อนุมัติ → จ่ายคืนครั้งเดียว */
export async function createReimbursement(billIds: string[], opts?: { note?: string }) {
    try {
        const { supabase, clinicId, userId, name, canPrepare, canApprove } = await ctx();
        if (!canPrepare) return { ok: false, error: "ไม่มีสิทธิ์เตรียมจ่าย" };
        if (!billIds.length) return { ok: false, error: "ยังไม่ได้เลือกบิล" };
        const { data: bills } = await supabase.from("vendor_bills").select("id, advanced_by, reimburse_status, batch_id").eq("clinic_id", clinicId).in("id", billIds);
        if (!bills || bills.length !== billIds.length) return { ok: false, error: "ไม่พบบิลบางใบ" };
        if (bills.some(b => b.reimburse_status !== "pending")) return { ok: false, error: "มีบิลที่ไม่ได้อยู่ในสถานะรอคืนเงิน" };
        const who = new Set(bills.map(b => b.advanced_by));
        if (who.size > 1) return { ok: false, error: "เลือกได้เฉพาะบิลที่คนเดียวกันสำรองจ่าย" };
        const inBatch = bills.filter(b => b.batch_id).map(b => b.batch_id as string);
        if (inBatch.length) {
            const { data: act } = await supabase.from("payment_batches").select("id").in("id", inBatch).in("status", ["prepared", "approved"]);
            if (act?.length) return { ok: false, error: "มีบิลอยู่ในใบคืนเงินอื่นแล้ว" };
        }
        const payee = [...who][0] as string;
        const { data: person } = await supabase.from("profiles").select("full_name").eq("id", payee).maybeSingle();
        const payeeName = (person?.full_name as string) || "พนักงาน";
        const now = new Date(Date.now() + 7 * 3600000);
        const prefix = `RB${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        const { count } = await supabase.from("payment_batches").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).like("batch_no", `${prefix}%`);
        let batchId = "", batchNo = "";
        for (let i = 1; i <= 5 && !batchId; i++) {
            batchNo = `${prefix}-${String((count || 0) + i).padStart(3, "0")}`;
            const { data, error } = await supabase.from("payment_batches").insert({
                clinic_id: clinicId, batch_no: batchNo, kind: "reimburse", vendor: payeeName, payee_profile: payee, prepared_by: userId, note: opts?.note?.trim() || "คืนเงินสำรองจ่าย",
            }).select("id").single();
            if (data) batchId = data.id as string;
            else if (error && error.code !== "23505") return { ok: false, error: error.message };
        }
        if (!batchId) return { ok: false, error: "สร้างเลขที่ไม่สำเร็จ ลองใหม่" };
        const { error: uErr } = await supabase.from("vendor_bills").update({ batch_id: batchId }).in("id", billIds).eq("clinic_id", clinicId);
        if (uErr) { await supabase.from("payment_batches").delete().eq("id", batchId); return { ok: false, error: uErr.message }; }
        const t = await recompute(supabase, batchId);
        if (!canApprove) await notifyOwners(supabase, clinicId, `💸 ใบคืนเงินสำรองจ่าย ${batchNo} รออนุมัติ\nคืนให้: ${payeeName} (${t.count} บิล) ฿${t.net.toLocaleString()}\nโดย ${name}`);
        revalidatePath(PATH);
        return { ok: true, id: batchId, batch_no: batchNo };
    } catch (e) { return fail(e); }
}
