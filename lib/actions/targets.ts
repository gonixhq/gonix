"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";

const EXCLUDE = new Set(["voided", "refunded", "draft"]);

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

function bkkToday(): string {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

/** รวมรายรับ (paid_amount ของบิลที่ไม่ void/refund/draft) ในช่วง */
async function sumRevenue(supabase: Awaited<ReturnType<typeof ctx>>["supabase"], clinicId: string, start: string, end: string): Promise<number> {
    const { data } = await supabase.from("invoice_headers")
        .select("paid_amount, status").eq("clinic_id", clinicId)
        .gte("invoice_date", start).lte("invoice_date", end);
    let sum = 0;
    for (const i of data || []) { if (!EXCLUDE.has(i.status as string)) sum += Number(i.paid_amount || 0); }
    return Math.round(sum * 100) / 100;
}

export interface GoalProgress {
    monthKey: string; monthLabel: string; monthTarget: number; monthActual: number; monthPct: number;
    quarterKey: string; quarterLabel: string; quarterTarget: number; quarterActual: number; quarterPct: number;
    canEdit: boolean;
}

/** ความคืบหน้าเทียบเป้า เดือนปัจจุบัน + ไตรมาสปัจจุบัน (real-time) */
export async function getGoalProgress(): Promise<GoalProgress> {
    const { supabase, clinicId } = await ctx();
    const today = bkkToday();
    const [y, m] = today.split("-").map(Number);
    const monthKey = `${y}-${String(m).padStart(2, "0")}`;
    const monthStart = `${monthKey}-01`;
    const q = Math.floor((m - 1) / 3) + 1;
    const quarterKey = `${y}-Q${q}`;
    const qStartMonth = (q - 1) * 3 + 1;
    const quarterStart = `${y}-${String(qStartMonth).padStart(2, "0")}-01`;

    const { data: targets } = await supabase.from("revenue_targets")
        .select("period_key, target_amount").eq("clinic_id", clinicId).in("period_key", [monthKey, quarterKey]);
    const tMap: Record<string, number> = {};
    (targets || []).forEach(t => { tMap[t.period_key as string] = Number(t.target_amount); });

    const [monthActual, quarterActual] = await Promise.all([
        sumRevenue(supabase, clinicId, monthStart, today),
        sumRevenue(supabase, clinicId, quarterStart, today),
    ]);

    const { role } = await getEffectivePermissionsForUser();
    const monthTarget = tMap[monthKey] || 0;
    const quarterTarget = tMap[quarterKey] || 0;
    const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" });

    return {
        monthKey, monthLabel, monthTarget, monthActual,
        monthPct: monthTarget > 0 ? Math.round((monthActual / monthTarget) * 1000) / 10 : 0,
        quarterKey, quarterLabel: `ไตรมาส ${q}/${y + 543}`, quarterTarget, quarterActual,
        quarterPct: quarterTarget > 0 ? Math.round((quarterActual / quarterTarget) * 1000) / 10 : 0,
        canEdit: role === "owner" || role === "admin",
    };
}

/** ตั้ง/แก้เป้า (เฉพาะ owner/admin) */
export async function setRevenueTarget(periodKey: string, amount: number) {
    try {
        const { supabase, userId, clinicId } = await ctx();
        const { role } = await getEffectivePermissionsForUser();
        if (role !== "owner" && role !== "admin") return { success: false, error: "เฉพาะเจ้าของ/แอดมินตั้งเป้าได้" };
        if (!/^\d{4}-(\d{2}|Q[1-4])$/.test(periodKey)) return { success: false, error: "รูปแบบงวดไม่ถูกต้อง" };
        if (amount < 0) return { success: false, error: "เป้าต้องไม่ติดลบ" };
        const { error } = await supabase.from("revenue_targets").upsert({
            clinic_id: clinicId, period_key: periodKey, target_amount: amount, updated_by: userId, updated_at: new Date().toISOString(),
        }, { onConflict: "clinic_id,period_key" });
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/reports");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}
