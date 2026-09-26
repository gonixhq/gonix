"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FIXED_COST_CATEGORIES, FIXED_COST_EXAMPLES, type FixedCostCategory } from "@/lib/fixed-costs";

// ต้นทุนคงที่ (เฟส 5A)

export interface FixedCostRow {
    id: string; name: string; category: FixedCostCategory; amount: number; cycle: "monthly" | "yearly";
    start_month: string; end_month: string | null; status: "actual" | "planned"; note: string | null;
    monthly: number;          // ยอดต่อเดือน (รายปี ÷ 12)
    active: boolean;          // มีผลในเดือนที่ดู
}
export interface FixedCostInput {
    name: string; category: FixedCostCategory; amount: number; cycle: "monthly" | "yearly";
    start_month: string; end_month?: string | null; status: "actual" | "planned"; note?: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const monthly = (amount: number, cycle: string) => r2(cycle === "yearly" ? amount / 12 : amount);

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id, role").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("ไม่พบคลินิก");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string, canManage: ["owner", "admin"].includes(String(profile.role)) };
}

export async function getFixedCosts(month: string): Promise<{ rows: FixedCostRow[]; actual: number; planned: number; byCategory: Record<string, number>; canManage: boolean } | { error: string }> {
    try {
        if (!/^\d{4}-\d{2}$/.test(month)) return { error: "เดือนไม่ถูกต้อง" };
        const { supabase, clinicId, canManage } = await ctx();
        const m = `${month}-01`;
        const { data } = await supabase.from("fixed_costs").select("*").eq("clinic_id", clinicId).order("status").order("category").order("name");
        const rows: FixedCostRow[] = (data || []).map(r => ({
            id: r.id, name: r.name, category: r.category, amount: Number(r.amount), cycle: r.cycle,
            start_month: r.start_month, end_month: r.end_month, status: r.status, note: r.note,
            monthly: monthly(Number(r.amount), r.cycle),
            active: r.start_month <= m && (!r.end_month || r.end_month >= m),
        }));
        const act = rows.filter(r => r.active);
        const byCategory: Record<string, number> = {};
        act.filter(r => r.status === "actual").forEach(r => { byCategory[r.category] = r2((byCategory[r.category] || 0) + r.monthly); });
        return {
            rows, canManage, byCategory,
            actual: r2(act.filter(r => r.status === "actual").reduce((s, r) => s + r.monthly, 0)),
            planned: r2(act.filter(r => r.status === "planned").reduce((s, r) => s + r.monthly, 0)),
        };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
    }
}

function validate(i: FixedCostInput): string | null {
    if (!i.name?.trim()) return "กรุณาใส่ชื่อรายการ";
    if (!FIXED_COST_CATEGORIES.some(c => c.value === i.category)) return "หมวดไม่ถูกต้อง";
    if (!(Number(i.amount) >= 0)) return "จำนวนเงินไม่ถูกต้อง";
    if (!["monthly", "yearly"].includes(i.cycle)) return "รอบจ่ายไม่ถูกต้อง";
    if (!/^\d{4}-\d{2}-01$/.test(i.start_month)) return "เดือนเริ่มไม่ถูกต้อง";
    if (i.end_month && (!/^\d{4}-\d{2}-01$/.test(i.end_month) || i.end_month < i.start_month)) return "เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่ม";
    if (!["actual", "planned"].includes(i.status)) return "สถานะไม่ถูกต้อง";
    return null;
}

export async function saveFixedCost(id: string | null, input: FixedCostInput) {
    try {
        const { supabase, clinicId, userId, canManage } = await ctx();
        if (!canManage) return { success: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const err = validate(input);
        if (err) return { success: false, error: err };
        const row = {
            name: input.name.trim(), category: input.category, amount: Number(input.amount), cycle: input.cycle,
            start_month: input.start_month, end_month: input.end_month || null, status: input.status,
            note: input.note?.trim() || null, updated_at: new Date().toISOString(),
        };
        const { error } = id
            ? await supabase.from("fixed_costs").update(row).eq("id", id).eq("clinic_id", clinicId)
            : await supabase.from("fixed_costs").insert({ ...row, clinic_id: clinicId, created_by: userId });
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/finance/fixed-costs");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
    }
}

export async function deleteFixedCost(id: string) {
    try {
        const { supabase, clinicId, canManage } = await ctx();
        if (!canManage) return { success: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const { error } = await supabase.from("fixed_costs").delete().eq("id", id).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/finance/fixed-costs");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" };
    }
}

/** นำเข้าตัวอย่างจากสเปก (เฉพาะตอนยังไม่มีรายการ) */
export async function importFixedCostExamples(startMonth: string) {
    try {
        const { supabase, clinicId, userId, canManage } = await ctx();
        if (!canManage) return { success: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        if (!/^\d{4}-\d{2}-01$/.test(startMonth)) return { success: false, error: "เดือนเริ่มไม่ถูกต้อง" };
        const { count } = await supabase.from("fixed_costs").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId);
        if ((count || 0) > 0) return { success: false, error: "มีรายการอยู่แล้ว — เพิ่มทีละรายการแทน" };
        const { error } = await supabase.from("fixed_costs").insert(FIXED_COST_EXAMPLES.map(e => ({
            ...e, clinic_id: clinicId, start_month: startMonth, created_by: userId, note: "ตัวอย่างจากสเปก — ตรวจตัวเลขอีกครั้ง",
        })));
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/finance/fixed-costs");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ" };
    }
}
