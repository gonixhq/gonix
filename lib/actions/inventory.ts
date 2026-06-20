"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface ReceiveStockInput {
    item_id: string;
    qty: number;
    cost_per_unit?: number;
    note?: string;
    lot_no?: string;
}

/** รับยา/วัสดุเข้าสต๊อก (PO_RECEIVE) */
export async function receiveStock(input: ReceiveStockInput) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        if (input.qty <= 0) return { success: false, error: "จำนวนต้องมากกว่า 0" };

        // Lock + fetch current stock
        const { data: item } = await supabase
            .from("inventory")
            .select("id, clinic_id, stock_qty")
            .eq("id", input.item_id)
            .single();
        if (!item) return { success: false, error: "ไม่พบรายการในคลัง" };

        const newStock = Number(item.stock_qty || 0) + input.qty;

        // Update inventory
        const { error: upErr } = await supabase
            .from("inventory")
            .update({
                stock_qty: newStock,
                cost_price: input.cost_per_unit ?? undefined,
                updated_at: new Date().toISOString(),
            })
            .eq("id", input.item_id);
        if (upErr) return { success: false, error: upErr.message };

        // Get staff.id (for recorded_by)
        const { data: staffRow } = await supabase
            .from("staff").select("id").eq("profile_id", user.id).maybeSingle();

        // Insert stock_card
        await supabase.from("stock_card").insert({
            item_id: input.item_id,
            clinic_id: item.clinic_id,
            tx_type: "PO_RECEIVE",
            qty_delta: input.qty,
            balance_after: newStock,
            cost_per_unit: input.cost_per_unit || null,
            total_cost: input.cost_per_unit ? input.cost_per_unit * input.qty : null,
            note: [input.lot_no && `Lot: ${input.lot_no}`, input.note].filter(Boolean).join(" · ") || null,
            recorded_by: staffRow?.id || null,
        });

        revalidatePath("/dashboard/inventory");
        revalidatePath(`/dashboard/inventory/${input.item_id}`);
        return { success: true, newStock };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

export interface AdjustStockInput {
    item_id: string;
    new_qty: number;          // ยอดที่ถูกต้อง (หลังนับ)
    reason: string;           // เหตุผล (จำเป็น)
    tx_type?: "ADJUST_IN" | "ADJUST_OUT" | "WASTE" | "RECOUNT";
}

/** ปรับสต๊อก (สำหรับนับ stock ใหม่ / ของเสีย / ของหาย) */
export async function adjustStock(input: AdjustStockInput) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        if (!input.reason?.trim()) return { success: false, error: "กรุณาระบุเหตุผล" };
        if (input.new_qty < 0) return { success: false, error: "จำนวนต้องไม่ติดลบ" };

        const { data: item } = await supabase
            .from("inventory")
            .select("id, clinic_id, stock_qty")
            .eq("id", input.item_id)
            .single();
        if (!item) return { success: false, error: "ไม่พบรายการ" };

        const oldQty = Number(item.stock_qty || 0);
        const delta = input.new_qty - oldQty;
        if (delta === 0) return { success: false, error: "ยอดไม่เปลี่ยน" };

        const txType = input.tx_type || (delta > 0 ? "ADJUST_IN" : "ADJUST_OUT");

        // Update
        const { error: upErr } = await supabase
            .from("inventory")
            .update({ stock_qty: input.new_qty, updated_at: new Date().toISOString() })
            .eq("id", input.item_id);
        if (upErr) return { success: false, error: upErr.message };

        // Log
        const { data: staffRow } = await supabase
            .from("staff").select("id").eq("profile_id", user.id).maybeSingle();

        await supabase.from("stock_card").insert({
            item_id: input.item_id,
            clinic_id: item.clinic_id,
            tx_type: txType,
            qty_delta: delta,
            balance_after: input.new_qty,
            note: input.reason.trim(),
            recorded_by: staffRow?.id || null,
        });

        revalidatePath("/dashboard/inventory");
        revalidatePath(`/dashboard/inventory/${input.item_id}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ดึงประวัติ stock card ของรายการ */
export async function getStockHistory(itemId: string, limit = 50) {
    try {
        const supabase = await createClient();
        const { data } = await supabase
            .from("stock_card")
            .select(`
                id, tx_type, qty_delta, balance_after, cost_per_unit, total_cost,
                ref_vn, ref_inv_id, note, recorded_at,
                recorded_by:staff!stock_card_recorded_by_fkey(profiles(full_name))
            `)
            .eq("item_id", itemId)
            .order("recorded_at", { ascending: false })
            .limit(limit);
        return data || [];
    } catch {
        return [];
    }
}

/** ดึงรายการที่ stock ต่ำกว่า min */
export async function getLowStockItems() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        // Supabase doesn't support column-vs-column gte directly — fetch all + filter
        const { data } = await supabase
            .from("inventory")
            .select("id, item_name, item_code, category, stock_qty, min_stock, unit")
            .eq("clinic_id", profile.clinic_id)
            .eq("is_active", true)
            .gt("min_stock", 0);

        return (data || []).filter(item =>
            Number(item.stock_qty || 0) <= Number(item.min_stock || 0)
        );
    } catch {
        return [];
    }
}
