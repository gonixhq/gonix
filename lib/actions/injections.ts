"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

/** รายการสินค้าฉีด (deduction_type=injectable_vial) — ให้หมอเลือกตอนบันทึก */
export async function getInjectableProducts() {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("inventory")
            .select("id, item_name, brand, model_variant, capacity_unit_label, sell_price, stock_qty, unit")
            .eq("clinic_id", clinicId).eq("deduction_type", "injectable_vial").eq("is_active", true)
            .order("item_name");
        return data || [];
    } catch {
        return [];
    }
}

/** หมอบันทึกการฉีด (structured) — ไม่ตัดสต๊อก (ตัดตอนคิดเงิน)
 *  qty = จำนวนที่ฉีด (ยูนิต/cc/shot → ตัดสต๊อก) · sale_price = ราคาขายก้อน (คิดเงิน, optional) */
export async function saveVisitInjection(input: { vn: string; item_id: string; qty: number; sale_price?: number | null; site?: string }) {
    try {
        const { supabase, userId, clinicId } = await ctx();
        if (!(input.qty > 0)) return { success: false, error: "จำนวนต้องมากกว่า 0" };
        const { data: visit } = await supabase.from("visits").select("hn, doctor_id, clinic_id").eq("vn", input.vn).maybeSingle();
        if (!visit || visit.clinic_id !== clinicId) return { success: false, error: "ไม่พบ visit" };
        const { data: inv } = await supabase.from("inventory").select("capacity_unit_label, unit").eq("id", input.item_id).maybeSingle();

        const { error } = await supabase.from("visit_injections").insert({
            clinic_id: clinicId, vn: input.vn, hn: visit.hn, item_id: input.item_id,
            qty: input.qty, unit_label: inv?.capacity_unit_label || inv?.unit || null,
            sale_price: input.sale_price != null && input.sale_price > 0 ? input.sale_price : null,
            site: input.site?.trim() || null, doctor_id: visit.doctor_id || null, created_by: userId,
        });
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/visits/${input.vn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

export async function getVisitInjections(vn: string) {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("visit_injections")
            .select("id, item_id, qty, unit_label, sale_price, site, created_at, inventory(item_name, brand, model_variant, sell_price)")
            .eq("clinic_id", clinicId).eq("vn", vn).order("created_at");
        return (data || []).map((r: any) => {
            const inv = Array.isArray(r.inventory) ? r.inventory[0] : r.inventory;
            return {
                id: r.id, item_id: r.item_id, qty: Number(r.qty), unit_label: r.unit_label, site: r.site,
                sale_price: r.sale_price != null ? Number(r.sale_price) : null,
                item_name: inv?.item_name || "", brand: inv?.brand || null, model_variant: inv?.model_variant || null,
                sell_price: Number(inv?.sell_price || 0),
            };
        });
    } catch {
        return [];
    }
}

export async function deleteVisitInjection(id: string, vn: string) {
    try {
        const { supabase, clinicId } = await ctx();
        const { error } = await supabase.from("visit_injections").delete().eq("id", id).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/visits/${vn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
