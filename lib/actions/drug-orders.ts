"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

/** แก้ไขคำสั่งยาที่บันทึกแล้ว (จำนวน/วิธีใช้) — total_cost คำนวณใหม่จาก cost_per_unit ในระบบ (ไม่เชื่อ client) */
export async function updateDrugOrder(input: { id: string; qty?: number; sig_text?: string }, vn: string) {
    try {
        const { supabase, clinicId } = await ctx();
        const { data: row } = await supabase.from("drug_orders")
            .select("id, cost_per_unit, qty").eq("id", input.id).eq("clinic_id", clinicId).maybeSingle();
        if (!row) return { success: false, error: "ไม่พบรายการยา" };

        const patch: Record<string, unknown> = {};
        if (input.qty != null) {
            if (!(input.qty > 0)) return { success: false, error: "จำนวนต้องมากกว่า 0" };
            patch.qty = input.qty;
            patch.total_cost = Number(row.cost_per_unit || 0) * input.qty;
        }
        if (input.sig_text != null) patch.sig_text = input.sig_text.trim() || null;
        if (Object.keys(patch).length === 0) return { success: true };

        const { error } = await supabase.from("drug_orders").update(patch).eq("id", input.id).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/visits/${vn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ลบคำสั่งยาที่บันทึกแล้ว */
export async function deleteDrugOrder(id: string, vn: string) {
    try {
        const { supabase, clinicId } = await ctx();
        const { error } = await supabase.from("drug_orders").delete().eq("id", id).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/visits/${vn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
