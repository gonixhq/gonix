"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bangkokDate } from "@/lib/utils/date";

export interface PettyCashItem {
    id: string;
    expense_date: string;
    category: string;
    description: string;
    amount: number;
    created_at: string;
    recorded_by_name: string | null;
}

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase
        .from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, clinicId: profile.clinic_id as string, userId: user.id };
}

/** บันทึกรายจ่ายย่อย (เงินสดจากลิ้นชัก) → ลงตาราง expenses */
export async function addPettyCash(input: { amount: number; category: string; description: string }) {
    try {
        const { supabase, clinicId, userId } = await ctx();
        const amount = Number(input.amount);
        if (!amount || amount <= 0) return { success: false, error: "กรุณากรอกจำนวนเงินให้ถูกต้อง" };
        if (!input.description?.trim()) return { success: false, error: "กรุณากรอกรายละเอียด" };

        const { data: staffRow } = await supabase
            .from("staff").select("id").eq("profile_id", userId).maybeSingle();

        const { error } = await supabase.from("expenses").insert({
            clinic_id: clinicId,
            expense_date: bangkokDate(),
            category: input.category?.trim() || "อื่นๆ",
            description: input.description.trim(),
            amount,
            payment_method: "cash",          // รายจ่ายย่อย = เงินสดจากลิ้นชัก
            recorded_by: staffRow?.id || null,
        });
        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/finance");
        revalidatePath("/dashboard/eod");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** รายจ่ายย่อย (เงินสด) ของวันที่กำหนด (default วันนี้) + ยอดรวม */
export async function getPettyCash(date?: string): Promise<{ items: PettyCashItem[]; total: number }> {
    try {
        const { supabase, clinicId } = await ctx();
        const targetDate = date || bangkokDate();
        const { data } = await supabase
            .from("expenses")
            .select("id, expense_date, category, description, amount, created_at, recorded_by:staff!expenses_recorded_by_fkey(profiles(full_name))")
            .eq("clinic_id", clinicId)
            .eq("expense_date", targetDate)
            .eq("payment_method", "cash")
            .order("created_at", { ascending: false });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: PettyCashItem[] = ((data || []) as any[]).map((r) => {
            const st = Array.isArray(r.recorded_by) ? r.recorded_by[0] : r.recorded_by;
            const prof = st?.profiles ? (Array.isArray(st.profiles) ? st.profiles[0] : st.profiles) : null;
            return {
                id: r.id,
                expense_date: r.expense_date,
                category: r.category,
                description: r.description,
                amount: Number(r.amount || 0),
                created_at: r.created_at,
                recorded_by_name: prof?.full_name || null,
            };
        });
        const total = items.reduce((s, i) => s + i.amount, 0);
        return { items, total };
    } catch {
        return { items: [], total: 0 };
    }
}

/** ยอดรวมรายจ่ายย่อย (เงินสด) ของวัน — ใช้ในหน้าปิดยอด (กระทบเงินสด) */
export async function getPettyCashTotal(date: string): Promise<number> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase
            .from("expenses")
            .select("amount")
            .eq("clinic_id", clinicId)
            .eq("expense_date", date)
            .eq("payment_method", "cash");
        return (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    } catch {
        return 0;
    }
}

/** ลบรายการรายจ่ายย่อย */
export async function deletePettyCash(id: string) {
    try {
        const { supabase, clinicId } = await ctx();
        const { error } = await supabase
            .from("expenses").delete().eq("id", id).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/finance");
        revalidatePath("/dashboard/eod");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
