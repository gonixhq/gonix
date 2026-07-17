"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";

// ── ctx + permission ──
async function ctx() {
    const supabase = await createClient();
    const { userId, clinicId, role, permissions } = await getEffectivePermissionsForUser();
    if (!userId || !clinicId) throw new Error("Unauthorized");
    return { supabase, userId, clinicId, role: role || "", perms: permissions };
}
async function staffIdOf(
    supabase: Awaited<ReturnType<typeof createClient>>, userId: string
): Promise<string | null> {
    const { data } = await supabase.from("staff").select("id").eq("profile_id", userId).maybeSingle();
    return (data?.id as string) || null;
}
type Fail = { ok: false; error: string };
type Ok<T = unknown> = { ok: true } & T;
const CHANNELS = ["line_oa", "tiktok", "facebook", "instagram", "walk_in", "phone", "other"];

// เขียน audit log (เรียกใน transaction เดียวกับ mutation)
async function auditLog(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any, clinicId: string, preOrderId: string, actorId: string, role: string,
    fromStatus: string | null, toStatus: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    opts?: { itemId?: string; reason?: string; metadata?: any }
) {
    await supabase.from("pre_order_audit_log").insert({
        clinic_id: clinicId, pre_order_id: preOrderId, item_id: opts?.itemId || null,
        from_status: fromStatus, to_status: toStatus,
        actor_id: actorId, actor_role: role || "system",
        reason: opts?.reason || null, metadata: opts?.metadata || {},
    });
}

// ════════════════ SETTINGS (P1/P2/P3) ════════════════
export interface PreOrderSettings {
    deposit_validity_days: number;
    expiry_action: string;
    max_expiry_extensions: number;
    extension_days: number;
    min_deposit_amount: number;
    expiry_warning_days: number[];
}
export async function getPreOrderSettings(): Promise<PreOrderSettings> {
    const { supabase, clinicId } = await ctx();
    const { data } = await supabase.from("pre_order_settings").select("*").eq("clinic_id", clinicId).maybeSingle();
    return {
        deposit_validity_days: data?.deposit_validity_days ?? 90,
        expiry_action: data?.expiry_action ?? "convert_to_credit",
        max_expiry_extensions: data?.max_expiry_extensions ?? 1,
        extension_days: data?.extension_days ?? 30,
        min_deposit_amount: Number(data?.min_deposit_amount ?? 500),
        expiry_warning_days: (data?.expiry_warning_days as number[]) ?? [7, 1],
    };
}
export async function updatePreOrderSettings(input: Partial<PreOrderSettings>): Promise<Ok | Fail> {
    const { supabase, clinicId, perms } = await ctx();
    if (!perms["pre_order.settings"]) return { ok: false, error: "ไม่มีสิทธิ์ตั้งค่าพรีออเดอร์" };
    const { error } = await supabase.from("pre_order_settings").upsert({
        clinic_id: clinicId, ...input, updated_at: new Date().toISOString(),
    }, { onConflict: "clinic_id" });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/dashboard/settings");
    return { ok: true };
}

// ════════════════ T1: สร้าง Draft ════════════════
export interface PreOrderItemInput { service_id: string; qty?: number; unit_price_snapshot: number; promo_ref?: string; }
export interface CreatePreOrderInput {
    hn: string; channel: string; affiliate_id?: string | null; referral_code?: string | null;
    items: PreOrderItemInput[]; note?: string; branch_id?: string | null;
}
export async function createPreOrder(input: CreatePreOrderInput): Promise<Ok<{ id: string; total: number }> | Fail> {
    const { supabase, clinicId, userId, role, perms } = await ctx();
    if (!perms["pre_order.manage"]) return { ok: false, error: "ไม่มีสิทธิ์สร้างพรีออเดอร์" };
    if (!input.hn) return { ok: false, error: "ต้องระบุผู้ป่วย (HN)" };
    if (!CHANNELS.includes(input.channel)) return { ok: false, error: "channel ไม่ถูกต้อง" };
    if (!input.items?.length) return { ok: false, error: "ต้องมีรายการอย่างน้อย 1 รายการ" };

    // ตรวจว่าบริการอยู่ในคลินิกนี้ + เทียบราคา (log ถ้าเบี่ยงเบน)
    const svcIds = input.items.map(i => i.service_id);
    const { data: svcs } = await supabase.from("service_catalog")
        .select("id, selling_price").eq("clinic_id", clinicId).in("id", svcIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceMap = new Map((svcs || []).map((s: any) => [s.id, Number(s.selling_price)]));
    for (const it of input.items) {
        if (!priceMap.has(it.service_id)) return { ok: false, error: "พบบริการที่ไม่อยู่ในคลินิก" };
    }

    const { data: po, error } = await supabase.from("pre_orders").insert({
        clinic_id: clinicId, branch_id: input.branch_id || null, hn: input.hn, status: "draft",
        channel: input.channel, affiliate_id: input.affiliate_id || null,
        referral_code: input.referral_code || null, note: input.note || null, created_by: userId,
    }).select("id").single();
    if (error || !po) return { ok: false, error: error?.message || "สร้างไม่สำเร็จ" };

    const rows = input.items.map(it => ({
        pre_order_id: po.id, service_id: it.service_id, qty: it.qty ?? 1,
        unit_price_snapshot: it.unit_price_snapshot, promo_ref: it.promo_ref || null,
    }));
    const { error: itErr } = await supabase.from("pre_order_items").insert(rows);
    if (itErr) return { ok: false, error: itErr.message };

    // ราคาเบี่ยงเบนจาก price list → เก็บใน audit (กันคีย์ผิด/ทุจริต)
    const deviations = input.items
        .filter(it => Math.abs((priceMap.get(it.service_id) || 0) - it.unit_price_snapshot) > 0.01)
        .map(it => ({ service_id: it.service_id, list: priceMap.get(it.service_id), entered: it.unit_price_snapshot }));
    const total = input.items.reduce((s, it) => s + it.unit_price_snapshot * (it.qty ?? 1), 0);
    await auditLog(supabase, clinicId, po.id, userId, role, null, "draft",
        { metadata: { action: "create", total, price_deviations: deviations } });

    revalidatePath("/dashboard/pre-orders");
    return { ok: true, id: po.id, total };
}

// helper: โหลด pre_order + เช็คคลินิก
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPO(supabase: any, clinicId: string, id: string) {
    const { data } = await supabase.from("pre_orders").select("*").eq("id", id).eq("clinic_id", clinicId).maybeSingle();
    return data;
}

// ════════════════ T2: confirm (draft→pending_deposit) ════════════════
export async function confirmPreOrder(id: string): Promise<Ok | Fail> {
    const { supabase, clinicId, userId, role, perms } = await ctx();
    if (!perms["pre_order.manage"]) return { ok: false, error: "ไม่มีสิทธิ์" };
    const po = await loadPO(supabase, clinicId, id);
    if (!po) return { ok: false, error: "ไม่พบพรีออเดอร์" };
    if (po.status !== "draft") return { ok: false, error: "สถานะไม่ถูกต้อง (ต้องเป็น draft)" };
    const { error } = await supabase.from("pre_orders").update({ status: "pending_deposit" }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await auditLog(supabase, clinicId, id, userId, role, "draft", "pending_deposit");
    revalidatePath("/dashboard/pre-orders");
    return { ok: true };
}

// ════════════════ T3: รับมัดจำ (P1/P3) ════════════════
export async function recordDeposit(
    id: string, input: { amount: number; payment_method: string; note?: string }
): Promise<Ok<{ deposit_expires_at: string; receipt_no: string | null }> | Fail> {
    const { supabase, clinicId, userId, role, perms } = await ctx();
    if (!perms["pre_order.manage"]) return { ok: false, error: "ไม่มีสิทธิ์รับมัดจำ" };
    const po = await loadPO(supabase, clinicId, id);
    if (!po) return { ok: false, error: "ไม่พบพรีออเดอร์" };
    if (po.status !== "pending_deposit") return { ok: false, error: "สถานะไม่ถูกต้อง (ต้องเป็น pending_deposit)" };

    const settings = await getPreOrderSettings();
    if (!(input.amount >= settings.min_deposit_amount)) {
        return { ok: false, error: `มัดจำต้องไม่น้อยกว่า ${settings.min_deposit_amount.toLocaleString()} บาท (DEPOSIT_BELOW_MINIMUM)` };
    }

    const expiresAt = new Date(Date.now() + settings.deposit_validity_days * 86400000).toISOString();
    // เลข receipt มัดจำ (แยกจากใบเสร็จ treatment)
    let receiptNo: string | null = null;
    try {
        const { data: rn } = await supabase.rpc("fn_next_number", { p_clinic_id: clinicId, p_type: "DEPOSIT", p_prefix: "DEP" });
        receiptNo = (rn as string) || null;
    } catch { /* ถ้า RPC ไม่มี type DEPOSIT ก็ปล่อย null */ }

    const { error: ledErr } = await supabase.from("deposit_ledger").insert({
        clinic_id: clinicId, hn: po.hn, pre_order_id: id, entry_type: "deposit_received",
        amount: input.amount, payment_method: input.payment_method, receipt_no: receiptNo,
        reason: input.note || null, created_by: userId,
    });
    if (ledErr) return { ok: false, error: ledErr.message };

    const { error } = await supabase.from("pre_orders")
        .update({ status: "pending_doctor", deposit_expires_at: expiresAt }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await auditLog(supabase, clinicId, id, userId, role, "pending_deposit", "pending_doctor",
        { metadata: { deposit: input.amount, receipt_no: receiptNo, expires_at: expiresAt } });

    revalidatePath("/dashboard/pre-orders");
    return { ok: true, deposit_expires_at: expiresAt, receipt_no: receiptNo };
}

// ════════════════ T4: ผูกนัด ════════════════
export async function schedulePreOrder(id: string, appointmentId: string): Promise<Ok | Fail> {
    const { supabase, clinicId, userId, role, perms } = await ctx();
    if (!perms["pre_order.manage"]) return { ok: false, error: "ไม่มีสิทธิ์" };
    const po = await loadPO(supabase, clinicId, id);
    if (!po) return { ok: false, error: "ไม่พบพรีออเดอร์" };
    if (po.status !== "pending_doctor") return { ok: false, error: "สถานะไม่ถูกต้อง" };
    const { error } = await supabase.from("pre_orders")
        .update({ status: "scheduled", appointment_id: appointmentId }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await auditLog(supabase, clinicId, id, userId, role, "pending_doctor", "scheduled", { metadata: { appointment_id: appointmentId } });
    revalidatePath("/dashboard/pre-orders");
    return { ok: true };
}

// ════════════════ T6: check-in ════════════════
export async function checkInPreOrder(id: string): Promise<Ok | Fail> {
    const { supabase, clinicId, userId, role, perms } = await ctx();
    if (!perms["pre_order.manage"]) return { ok: false, error: "ไม่มีสิทธิ์" };
    const po = await loadPO(supabase, clinicId, id);
    if (!po) return { ok: false, error: "ไม่พบพรีออเดอร์" };
    if (!["pending_doctor", "scheduled"].includes(po.status)) return { ok: false, error: "สถานะไม่ถูกต้อง" };
    const { error } = await supabase.from("pre_orders").update({ status: "checked_in" }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await auditLog(supabase, clinicId, id, userId, role, po.status, "checked_in");
    revalidatePath("/dashboard/pre-orders");
    return { ok: true };
}

// ════════════════ T7: หมอเปิดดู (doctor gate) ════════════════
export async function openConsult(id: string): Promise<Ok | Fail> {
    const { supabase, clinicId, userId, role, perms } = await ctx();
    if (!perms["pre_order.decide"]) return { ok: false, error: "เฉพาะแพทย์เท่านั้น (FORBIDDEN_ROLE)" };
    const po = await loadPO(supabase, clinicId, id);
    if (!po) return { ok: false, error: "ไม่พบพรีออเดอร์" };
    if (po.status !== "checked_in") return { ok: false, error: "สถานะไม่ถูกต้อง (ต้องเป็น checked_in)" };
    const { error } = await supabase.from("pre_orders").update({ status: "in_consult" }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await auditLog(supabase, clinicId, id, userId, role, "checked_in", "in_consult");
    revalidatePath("/dashboard/pre-orders");
    return { ok: true };
}

// ════════════════ T8: หมอตัดสิน (Doctor Gate — approve/reject) ════════════════
export interface ItemDecision { item_id: string; decision: "approve" | "reject" | "adjust"; reason?: string; }
export async function submitDecisions(
    id: string, decisions: ItemDecision[]
): Promise<Ok<{ status: string; approved: number; rejected: number }> | Fail> {
    const { supabase, clinicId, userId, role, perms } = await ctx();
    if (!perms["pre_order.decide"]) return { ok: false, error: "เฉพาะแพทย์เท่านั้น (FORBIDDEN_ROLE)" };
    const po = await loadPO(supabase, clinicId, id);
    if (!po) return { ok: false, error: "ไม่พบพรีออเดอร์" };
    if (po.status !== "in_consult") return { ok: false, error: "สถานะไม่ถูกต้อง (ต้องเป็น in_consult)" };

    // Phase 1: รับเฉพาะ approve/reject
    if (decisions.some(d => d.decision === "adjust")) {
        return { ok: false, error: "adjust ยังไม่เปิดใน Phase 1 (เปิด Phase 2)" };
    }
    if (decisions.some(d => d.decision === "reject" && !d.reason?.trim())) {
        return { ok: false, error: "การ reject ต้องระบุเหตุผล" };
    }

    // ต้องตัดสินครบทุก item ที่ pending
    const { data: items } = await supabase.from("pre_order_items")
        .select("id, status").eq("pre_order_id", id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = (items || []).filter((i: any) => i.status === "pending").map((i: any) => i.id);
    const decidedIds = new Set(decisions.map(d => d.item_id));
    if (pending.some((pid: string) => !decidedIds.has(pid))) {
        return { ok: false, error: "ต้องตัดสินให้ครบทุกรายการที่รอ" };
    }

    const staffId = await staffIdOf(supabase, userId);
    const now = new Date().toISOString();
    let approved = 0, rejected = 0;
    for (const d of decisions) {
        const isApprove = d.decision === "approve";
        if (isApprove) approved++; else rejected++;
        await supabase.from("pre_order_items").update({
            status: isApprove ? "approved" : "rejected",
            doctor_decision: d.decision, decision_reason: d.reason || null,
            decided_by: staffId, decided_at: now,
        }).eq("id", d.item_id).eq("pre_order_id", id);
        await auditLog(supabase, clinicId, id, userId, role, "in_consult", "decided",
            { itemId: d.item_id, reason: d.reason, metadata: { decision: d.decision } });
    }

    // P6: reject ไม่สร้างค่า consult · derive status
    const newStatus = approved === 0 ? "rejected_full" : "decided";
    const { error } = await supabase.from("pre_orders").update({ status: newStatus }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/dashboard/pre-orders");
    return { ok: true, status: newStatus, approved, rejected };
}

// ════════════════ T5: ยกเลิก (+ deposit resolution P4) ════════════════
export async function cancelPreOrder(
    id: string, input: { reason: string; deposit_resolution?: "refund_request" | "convert_to_credit" | null }
): Promise<Ok | Fail> {
    const { supabase, clinicId, userId, role, perms } = await ctx();
    if (!perms["pre_order.manage"]) return { ok: false, error: "ไม่มีสิทธิ์" };
    const po = await loadPO(supabase, clinicId, id);
    if (!po) return { ok: false, error: "ไม่พบพรีออเดอร์" };
    if (!["draft", "pending_deposit", "pending_doctor", "scheduled"].includes(po.status)) {
        return { ok: false, error: "ยกเลิกได้เฉพาะก่อนพบแพทย์" };
    }

    // ถ้ามีมัดจำ → resolve
    const { data: dep } = await supabase.from("deposit_ledger")
        .select("id, amount, entry_type").eq("pre_order_id", id).eq("entry_type", "deposit_received");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const depositTotal = (dep || []).reduce((s: number, r: any) => s + Number(r.amount), 0);
    if (depositTotal > 0 && input.deposit_resolution) {
        const entryType = input.deposit_resolution === "refund_request" ? "refund_pending" : "converted_to_credit";
        await supabase.from("deposit_ledger").insert({
            clinic_id: clinicId, hn: po.hn, pre_order_id: id, entry_type: entryType,
            amount: depositTotal, reason: input.reason, created_by: userId,
        });
    }

    const { error } = await supabase.from("pre_orders").update({ status: "cancelled" }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await auditLog(supabase, clinicId, id, userId, role, po.status, "cancelled",
        { reason: input.reason, metadata: { deposit_resolution: input.deposit_resolution, deposit: depositTotal } });
    revalidatePath("/dashboard/pre-orders");
    return { ok: true };
}

// ════════════════ T7: ขยายอายุมัดจำ (P2 — ผู้จัดการ) ════════════════
export async function extendExpiry(id: string): Promise<Ok<{ deposit_expires_at: string; count: number }> | Fail> {
    const { supabase, clinicId, userId, role, perms } = await ctx();
    if (!perms["pre_order.extend"]) return { ok: false, error: "เฉพาะผู้จัดการ/เจ้าของ (FORBIDDEN_ROLE)" };
    const po = await loadPO(supabase, clinicId, id);
    if (!po) return { ok: false, error: "ไม่พบพรีออเดอร์" };
    const settings = await getPreOrderSettings();
    if (po.expiry_extension_count >= settings.max_expiry_extensions) {
        return { ok: false, error: "ขยายได้ครบจำนวนครั้งแล้ว (EXTENSION_LIMIT_REACHED)" };
    }
    const base = po.deposit_expires_at ? new Date(po.deposit_expires_at).getTime() : Date.now();
    const newExpiry = new Date(base + settings.extension_days * 86400000).toISOString();
    const { error } = await supabase.from("pre_orders").update({
        deposit_expires_at: newExpiry,
        expiry_extension_count: po.expiry_extension_count + 1,
        expiry_extended_at: new Date().toISOString(), expiry_extended_by: userId,
    }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await auditLog(supabase, clinicId, id, userId, role, po.status, po.status,
        { metadata: { action: "extend_expiry", new_expiry: newExpiry, count: po.expiry_extension_count + 1 } });
    revalidatePath("/dashboard/pre-orders");
    return { ok: true, deposit_expires_at: newExpiry, count: po.expiry_extension_count + 1 };
}

// ════════════════ Refund approve/reject (ผู้จัดการ) ════════════════
export async function resolveRefund(ledgerId: string, approve: boolean, reason?: string): Promise<Ok | Fail> {
    const { supabase, clinicId, userId, perms } = await ctx();
    if (!perms["finance.refund"]) return { ok: false, error: "ไม่มีสิทธิ์อนุมัติคืนเงิน" };
    const { data: led } = await supabase.from("deposit_ledger")
        .select("id, entry_type, amount, hn, pre_order_id, reason").eq("id", ledgerId).eq("clinic_id", clinicId).maybeSingle();
    if (!led || led.entry_type !== "refund_pending") return { ok: false, error: "ไม่พบคำขอคืนเงินที่รออนุมัติ" };
    if (approve) {
        // เปลี่ยน pending → refunded (ต้องมี approved_by ตาม constraint)
        const { error } = await supabase.from("deposit_ledger").update({
            entry_type: "refunded", approved_by: userId, reason: reason || led.reason || null,
        }).eq("id", ledgerId);
        if (error) return { ok: false, error: error.message };
    } else {
        // reject → ลบคำขอ (กลับสถานะเดิม เครดิตไม่ถูกลด)
        const { error } = await supabase.from("deposit_ledger").delete().eq("id", ledgerId);
        if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/dashboard/pre-orders");
    return { ok: true };
}

// ════════════════ READS ════════════════
export async function getPreOrders(filters?: { status?: string; channel?: string; from?: string; to?: string }) {
    const { supabase, clinicId, perms } = await ctx();
    if (!perms["pre_order.view"]) return [];
    let q = supabase.from("pre_orders")
        .select("id, hn, status, channel, deposit_expires_at, created_at, note")
        .eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(200);
    if (filters?.status) q = q.eq("status", filters.status);
    if (filters?.channel) q = q.eq("channel", filters.channel);
    if (filters?.from) q = q.gte("created_at", filters.from);
    if (filters?.to) q = q.lte("created_at", filters.to);
    const { data } = await q;
    return data || [];
}

export async function getPreOrder(id: string) {
    const { supabase, clinicId, perms } = await ctx();
    if (!perms["pre_order.view"]) return null;
    const po = await loadPO(supabase, clinicId, id);
    if (!po) return null;
    const [{ data: items }, { data: ledger }, { data: audit }] = await Promise.all([
        supabase.from("pre_order_items").select("*").eq("pre_order_id", id).order("created_at"),
        supabase.from("deposit_ledger").select("*").eq("pre_order_id", id).order("created_at"),
        supabase.from("pre_order_audit_log").select("*").eq("pre_order_id", id).order("created_at", { ascending: false }).limit(50),
    ]);
    return { ...po, items: items || [], ledger: ledger || [], audit: audit || [] };
}

export async function getDoctorQueue() {
    const { supabase, clinicId, perms } = await ctx();
    if (!perms["pre_order.decide"]) return [];
    const { data } = await supabase.from("pre_orders")
        .select("id, hn, status, channel, created_at")
        .eq("clinic_id", clinicId).in("status", ["checked_in", "in_consult"])
        .order("created_at", { ascending: true });
    return data || [];
}

export async function getPatientCredit(hn: string): Promise<number> {
    const { supabase, clinicId, perms } = await ctx();
    if (!perms["pre_order.view"]) return 0;
    const { data } = await supabase.from("patient_credit_balance")
        .select("balance").eq("clinic_id", clinicId).eq("hn", hn).maybeSingle();
    return Number(data?.balance || 0);
}
