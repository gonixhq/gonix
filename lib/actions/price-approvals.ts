"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";

export interface PriceApproval {
    id: string;
    inv_id: string | null;
    vn: string | null;
    hn: string | null;
    patient_name: string | null;
    requester_name: string | null;
    requested_by: string | null;
    discount_amount: number;
    subtotal: number;
    total: number;
    is_self_transaction: boolean;
    status: string;
    approved_at: string | null;
    created_at: string;
}

async function ctx() {
    const supabase = await createClient();
    const { userId, clinicId, role } = await getEffectivePermissionsForUser();
    if (!userId || !clinicId) throw new Error("Unauthorized");
    return { supabase, userId, clinicId, role };
}

/** รายการคำขออนุมัติราคา (ค่าเริ่มต้น = pending) */
export async function getPriceApprovals(status: "pending" | "all" = "pending"): Promise<PriceApproval[]> {
    try {
        const { supabase, clinicId } = await ctx();
        let q = supabase.from("price_approvals").select("*").eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(200);
        if (status === "pending") q = q.eq("status", "pending");
        const { data } = await q;
        return (data || []) as PriceApproval[];
    } catch {
        return [];
    }
}

/** จำนวนคำขอที่รออนุมัติ (badge) */
export async function getPendingApprovalCount(): Promise<number> {
    try {
        const { supabase, clinicId } = await ctx();
        const { count } = await supabase.from("price_approvals")
            .select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("status", "pending");
        return count ?? 0;
    } catch {
        return 0;
    }
}

async function decide(id: string, decision: "approved" | "rejected", note?: string) {
    const { supabase, userId, clinicId, role } = await ctx();
    const { data: ap } = await supabase.from("price_approvals")
        .select("requested_by, is_self_transaction, status").eq("id", id).eq("clinic_id", clinicId).maybeSingle();
    if (!ap) return { success: false, error: "ไม่พบรายการ" };
    if (ap.status !== "pending") return { success: false, error: "รายการนี้ตัดสินใจไปแล้ว" };

    // Segregation of duties — ผู้อนุมัติต้องคนละคนกับผู้ขอ
    if (ap.requested_by && ap.requested_by === userId) {
        return { success: false, error: "อนุมัติบิลของตัวเองไม่ได้ (ต้องคนละคน)" };
    }
    // self-transaction → owner เท่านั้น
    if (ap.is_self_transaction && role !== "owner") {
        return { success: false, error: "เคสนี้เป็น self-transaction — เฉพาะเจ้าของคลินิก (owner) อนุมัติได้" };
    }

    const { error } = await supabase.from("price_approvals")
        .update({ status: decision, approved_by: userId, approved_at: new Date().toISOString(), note: note || null })
        .eq("id", id);
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/price-approvals");
    return { success: true };
}

export async function approvePriceApproval(id: string, note?: string) {
    try { return await decide(id, "approved", note); }
    catch (e) { return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }; }
}

export async function rejectPriceApproval(id: string, note?: string) {
    try { return await decide(id, "rejected", note); }
    catch (e) { return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }; }
}
