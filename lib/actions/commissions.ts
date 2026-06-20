"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface CommissionEntry {
    staff_id: string;
    role: string;
    item_id: string;
    item_name: string;
    qty: number;
    df_rate: number;
    commission_amount: number;
    inv_id: string;
    invoice_date: string;
    vn: string;
}

export interface StaffCommissionSummary {
    staff_id: string;
    staff_name: string;
    role: string;
    period_month: string;
    total_amount: number;
    entries_count: number;
    is_paid: boolean;
    paid_at?: string | null;
    paid_amount?: number | null;
}

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles")
        .select("clinic_id, full_name").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Profile/clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

/**
 * ดึงสรุปคอมมิชชั่นของพนักงานทั้งหมด ในเดือนที่กำหนด
 * รวม + คำนวณยอด + ดู status ว่าจ่ายแล้วยัง
 */
export async function getCommissionsByPeriod(periodMonth: string): Promise<StaffCommissionSummary[]> {
    try {
        const { supabase, clinicId } = await getCtx();

        // 1. ดึงข้อมูลจาก view
        const { data: entries, error } = await supabase
            .from("v_commission_summary")
            .select("staff_id, role, commission_amount")
            .eq("clinic_id", clinicId)
            .eq("period_month", periodMonth);

        if (error || !entries) return [];

        // 2. Group + sum
        const grouped: Record<string, { role: string; total: number; count: number }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (entries as any[]).forEach(e => {
            const key = `${e.staff_id}|${e.role}`;
            if (!grouped[key]) grouped[key] = { role: e.role, total: 0, count: 0 };
            grouped[key].total += Number(e.commission_amount || 0);
            grouped[key].count += 1;
        });

        // 3. ดึงชื่อ staff
        const staffIds = [...new Set(Object.keys(grouped).map(k => k.split("|")[0]))];
        if (staffIds.length === 0) return [];

        const { data: staffList } = await supabase
            .from("staff")
            .select("id, profiles!inner(full_name)")
            .in("id", staffIds);

        const staffNames: Record<string, string> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (staffList || []).forEach((s: any) => {
            const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
            staffNames[s.id] = p?.full_name || "—";
        });

        // 4. ดึงข้อมูล payouts (ใครจ่ายแล้วบ้าง)
        const { data: payouts } = await supabase
            .from("commission_payouts")
            .select("staff_id, role, amount, paid_at")
            .eq("clinic_id", clinicId)
            .eq("period_month", periodMonth);

        const paidMap: Record<string, { paid_at: string; amount: number }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payouts || []).forEach((p: any) => {
            paidMap[`${p.staff_id}|${p.role}`] = { paid_at: p.paid_at, amount: Number(p.amount) };
        });

        // 5. รวมเป็น summary
        const summary: StaffCommissionSummary[] = Object.entries(grouped).map(([key, val]) => {
            const [staff_id, role] = key.split("|");
            const paid = paidMap[key];
            return {
                staff_id,
                staff_name: staffNames[staff_id] || "—",
                role,
                period_month: periodMonth,
                total_amount: val.total,
                entries_count: val.count,
                is_paid: !!paid,
                paid_at: paid?.paid_at || null,
                paid_amount: paid?.amount || null,
            };
        });

        return summary.sort((a, b) => b.total_amount - a.total_amount);
    } catch {
        return [];
    }
}

/**
 * ดึงรายละเอียดของ staff คนเดียวในเดือนนั้น (สำหรับ print PDF)
 */
export async function getCommissionDetail(
    staffId: string,
    role: string,
    periodMonth: string
): Promise<{ entries: CommissionEntry[]; total: number; staff_name: string }> {
    try {
        const { supabase, clinicId } = await getCtx();

        const { data: entries } = await supabase
            .from("v_commission_summary")
            .select("*")
            .eq("clinic_id", clinicId)
            .eq("staff_id", staffId)
            .eq("role", role)
            .eq("period_month", periodMonth)
            .order("invoice_date", { ascending: true });

        const list = (entries || []) as unknown as CommissionEntry[];
        const total = list.reduce((s, e) => s + Number(e.commission_amount || 0), 0);

        // ชื่อ staff
        const { data: staff } = await supabase
            .from("staff")
            .select("id, profiles!inner(full_name)")
            .eq("id", staffId).maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sp = staff?.profiles as any;
        const staff_name = (Array.isArray(sp) ? sp[0]?.full_name : sp?.full_name) || "—";

        return { entries: list, total, staff_name };
    } catch {
        return { entries: [], total: 0, staff_name: "—" };
    }
}

/**
 * บันทึกการจ่าย commission (จ่ายแล้ว)
 */
export async function recordCommissionPayout(input: {
    staff_id: string;
    role: string;
    period_month: string;
    amount: number;
    payment_method?: "cash" | "transfer" | "payroll";
    transaction_ref?: string;
    note?: string;
}) {
    try {
        const { supabase, userId, clinicId } = await getCtx();

        if (!input.amount || input.amount <= 0) {
            return { success: false, error: "ยอดจ่ายต้องมากกว่า 0" };
        }

        const { error } = await supabase
            .from("commission_payouts")
            .upsert({
                clinic_id: clinicId,
                staff_id: input.staff_id,
                role: input.role,
                period_month: input.period_month,
                amount: input.amount,
                paid_by: userId,
                payment_method: input.payment_method || "cash",
                transaction_ref: input.transaction_ref || null,
                note: input.note || null,
            }, {
                onConflict: "clinic_id,staff_id,period_month",
            });

        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/commissions");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ลบการจ่าย (กรณีบันทึกผิด) */
export async function deleteCommissionPayout(staffId: string, periodMonth: string) {
    try {
        const { supabase, clinicId } = await getCtx();
        const { error } = await supabase
            .from("commission_payouts")
            .delete()
            .eq("clinic_id", clinicId)
            .eq("staff_id", staffId)
            .eq("period_month", periodMonth);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/commissions");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
