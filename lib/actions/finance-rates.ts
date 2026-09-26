"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bangkokDate } from "@/lib/utils/date";
import { RATE_META } from "@/lib/card-fees";

// อัตราการเงินต่อคลินิก (finance_rates, mig 140) — ทุกอัตรามีวันเริ่มใช้ แถวเก่าคือประวัติ (ไม่ลบ)
export interface FinanceRateRow {
    id: string;
    rate_key: string;
    rate_value: number;
    effective_from: string;
    note: string | null;
    created_at: string;
    created_by_name: string | null;
}

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id, role").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("ไม่พบคลินิก");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string, role: String(profile.role || "") };
}

export async function getFinanceRates(): Promise<{ rows: FinanceRateRow[]; today: string; canEdit: boolean }> {
    const { supabase, clinicId, role } = await ctx();
    const { data } = await supabase.from("finance_rates")
        .select("id, rate_key, rate_value, effective_from, note, created_at, created_by")
        .eq("clinic_id", clinicId)
        .order("rate_key").order("effective_from", { ascending: false });
    const ids = [...new Set((data || []).map((r) => r.created_by).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        (ps || []).forEach((p) => names.set(p.id as string, (p.full_name as string) || ""));
    }
    return {
        rows: (data || []).map((r) => ({
            id: r.id as string, rate_key: r.rate_key as string, rate_value: Number(r.rate_value),
            effective_from: r.effective_from as string, note: (r.note as string) || null, created_at: r.created_at as string,
            created_by_name: r.created_by ? names.get(r.created_by as string) || null : null,
        })),
        today: bangkokDate(),
        canEdit: role === "owner" || role === "admin",
    };
}

/** ตั้งอัตราใหม่ (มีผลตั้งแต่วันที่กำหนด) — บิลที่บันทึกไปแล้วไม่เปลี่ยน เพราะ snapshot อัตราไว้ในแถว payment */
export async function setFinanceRate(input: { key: string; value: number; effectiveFrom: string; note?: string }) {
    try {
        const { supabase, clinicId, userId, role } = await ctx();
        if (role !== "owner" && role !== "admin") return { success: false, error: "แก้อัตราได้เฉพาะเจ้าของ/ผู้จัดการ" };
        const meta = RATE_META.find((m) => m.key === input.key);
        if (!meta) return { success: false, error: "ไม่รู้จักอัตรานี้" };
        const v = Number(input.value);
        if (!Number.isFinite(v)) return { success: false, error: "ค่าไม่ถูกต้อง" };
        if (meta.unit === "flag" && v !== 0 && v !== 1) return { success: false, error: "ค่าต้องเป็นเปิด/ปิด" };
        if (meta.unit === "%" && (v < 0 || v > 100)) return { success: false, error: "เปอร์เซ็นต์ต้องอยู่ระหว่าง 0–100" };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) return { success: false, error: "วันที่ไม่ถูกต้อง" };
        const { error } = await supabase.from("finance_rates").upsert({
            clinic_id: clinicId, rate_key: input.key, rate_value: v, effective_from: input.effectiveFrom,
            note: input.note?.trim() || null, created_by: userId,
        }, { onConflict: "clinic_id,rate_key,effective_from" });
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/settings/finance-rates");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ยกเลิกอัตราที่ตั้งล่วงหน้า (ยังไม่ถึงวันมีผล) — อัตราที่มีผลแล้วลบไม่ได้ (เป็นประวัติ) */
export async function cancelScheduledRate(id: string) {
    try {
        const { supabase, clinicId, role } = await ctx();
        if (role !== "owner" && role !== "admin") return { success: false, error: "ไม่มีสิทธิ์" };
        const { data: row } = await supabase.from("finance_rates").select("effective_from").eq("id", id).eq("clinic_id", clinicId).maybeSingle();
        if (!row) return { success: false, error: "ไม่พบรายการ" };
        if ((row.effective_from as string) <= bangkokDate()) return { success: false, error: "อัตรานี้มีผลแล้ว ลบไม่ได้ — ให้ตั้งอัตราใหม่แทน" };
        const { error } = await supabase.from("finance_rates").delete().eq("id", id).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/settings/finance-rates");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
