"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface ReceiveStockInput {
    item_id: string;
    qty: number;
    cost_per_unit?: number;
    note?: string;
    lot_no?: string;
    expiry_date?: string;   // วันหมดอายุของล็อตนี้
}

// ฟิลด์ที่แก้ไขได้ผ่านฟอร์ม "แก้ไขรายละเอียด" (ไม่รวม stock_qty — ใช้ปรับสต๊อกแทน)
const EDITABLE_FIELDS = [
    "item_name", "generic_name", "trade_name", "strength", "dosage_form",
    "category", "segment", "unit", "sell_price", "cost_price", "min_stock",
    "location", "supplier", "note", "expiry_date",
    // ── ข้อมูลฉลากยา ──
    "item_name_th", "indication", "storage_info", "dose_qty", "use_type",
    "frequency", "sig_text_default", "label_type", "warning_label",
    // ── ค่าตอบแทน (DF) ──
    "df_doctor", "df_nurse", "df_assistant",
] as const;
const NUMERIC_FIELDS = new Set(["sell_price", "cost_price", "min_stock", "df_doctor", "df_nurse", "df_assistant"]);

/** แก้ไขรายละเอียดสินค้า + บันทึก audit (ใครแก้อะไรเมื่อไหร่) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateInventoryItem(input: { id: string } & Record<string, any>) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };
        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        const { data: cur } = await supabase
            .from("inventory")
            .select("item_name, generic_name, trade_name, strength, dosage_form, category, segment, unit, sell_price, cost_price, min_stock, location, supplier, note, expiry_date, item_name_th, indication, storage_info, dose_qty, use_type, frequency, sig_text_default, label_type, warning_label, df_doctor, df_nurse, df_assistant")
            .eq("id", input.id).eq("clinic_id", profile.clinic_id).maybeSingle();
        if (!cur) return { success: false, error: "ไม่พบรายการในคลัง" };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: any = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const oldData: any = {}; const newData: any = {};
        for (const f of EDITABLE_FIELDS) {
            if (input[f] === undefined) continue;
            let v = input[f];
            if (NUMERIC_FIELDS.has(f)) v = Number(v) || 0;
            else if (typeof v === "string") v = v.trim() || null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oldV = (cur as any)[f];
            if (String(oldV ?? "") !== String(v ?? "")) {
                patch[f] = v; oldData[f] = oldV ?? null; newData[f] = v;
            }
        }
        if (Object.keys(patch).length === 0) return { success: true, changed: 0 };

        if (!input.item_name?.toString().trim() && patch.item_name !== undefined)
            return { success: false, error: "ชื่อสินค้าห้ามว่าง" };

        patch.updated_at = new Date().toISOString();
        const { error } = await supabase
            .from("inventory").update(patch).eq("id", input.id).eq("clinic_id", profile.clinic_id);
        if (error) return { success: false, error: error.message };

        // บันทึก audit log
        await supabase.from("audit_logs").insert({
            clinic_id: profile.clinic_id,
            table_name: "inventory",
            record_id: input.id,
            action: "update",
            old_data: oldData,
            new_data: newData,
            performed_by: user.id,
        });

        revalidatePath(`/dashboard/inventory/${input.id}`);
        revalidatePath("/dashboard/inventory");
        return { success: true, changed: Object.keys(patch).length - 1 };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ประวัติการแก้ไขรายละเอียดสินค้า (จาก audit_logs) */
export async function getInventoryAuditLogs(itemId: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const { data } = await supabase
            .from("audit_logs")
            .select("id, action, old_data, new_data, performed_by, performed_at")
            .eq("clinic_id", profile.clinic_id)
            .eq("table_name", "inventory").eq("record_id", itemId)
            .order("performed_at", { ascending: false }).limit(30);
        const logs = data || [];

        const ids = [...new Set(logs.map((l) => l.performed_by).filter(Boolean))];
        const nameMap: Record<string, string> = {};
        if (ids.length > 0) {
            const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids as string[]);
            for (const p of profs || []) nameMap[p.id as string] = (p.full_name as string) || "";
        }
        return logs.map((l) => ({
            id: l.id as string,
            old_data: (l.old_data || {}) as Record<string, unknown>,
            new_data: (l.new_data || {}) as Record<string, unknown>,
            performed_at: l.performed_at as string,
            by: nameMap[l.performed_by as string] || "—",
        }));
    } catch {
        return [];
    }
}

/** รายการล็อตของสินค้า (เรียง FEFO: หมดอายุก่อน=บนสุด) */
export async function getItemLots(itemId: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];
        const { data } = await supabase
            .from("inventory_lots")
            .select("id, lot_no, expiry_date, qty_received, qty_remaining, cost_per_unit, received_at, note")
            .eq("clinic_id", profile.clinic_id).eq("item_id", itemId)
            .order("expiry_date", { ascending: true, nullsFirst: false })
            .order("received_at", { ascending: true });
        return data || [];
    } catch {
        return [];
    }
}

/** แก้ไขล็อต (เลขล็อต/วันหมดอายุ/คงเหลือ) — สำหรับแก้ที่กรอกผิด */
export async function updateLot(input: { id: string; lot_no?: string; expiry_date?: string | null; qty_remaining?: number }) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        const { data: lot } = await supabase.from("inventory_lots")
            .select("id, item_id, qty_remaining").eq("id", input.id).eq("clinic_id", profile.clinic_id).maybeSingle();
        if (!lot) return { success: false, error: "ไม่พบล็อต" };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: any = {};
        if (input.lot_no !== undefined) patch.lot_no = input.lot_no?.trim() || null;
        if (input.expiry_date !== undefined) patch.expiry_date = input.expiry_date || null;
        // ปรับจำนวนคงเหลือ → sync stock ของรายการตามส่วนต่าง
        let stockDelta = 0;
        if (input.qty_remaining !== undefined) {
            const newRem = Math.max(0, Number(input.qty_remaining) || 0);
            stockDelta = newRem - Number(lot.qty_remaining || 0);
            patch.qty_remaining = newRem;
        }
        const { error } = await supabase.from("inventory_lots").update(patch).eq("id", input.id).eq("clinic_id", profile.clinic_id);
        if (error) return { success: false, error: error.message };

        if (stockDelta !== 0) {
            const { data: it } = await supabase.from("inventory").select("stock_qty").eq("id", lot.item_id).maybeSingle();
            await supabase.from("inventory").update({ stock_qty: Math.max(0, Number(it?.stock_qty || 0) + stockDelta) }).eq("id", lot.item_id);
        }
        await supabase.rpc("fn_sync_item_expiry", { p_item_id: lot.item_id });
        revalidatePath(`/dashboard/inventory/${lot.item_id}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ลบล็อต (เช่นกรอกซ้ำ) — ลดสต๊อกตามคงเหลือของล็อต */
export async function deleteLot(id: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        const { data: lot } = await supabase.from("inventory_lots")
            .select("id, item_id, qty_remaining").eq("id", id).eq("clinic_id", profile.clinic_id).maybeSingle();
        if (!lot) return { success: false, error: "ไม่พบล็อต" };

        await supabase.from("inventory_lots").delete().eq("id", id).eq("clinic_id", profile.clinic_id);
        const { data: it } = await supabase.from("inventory").select("stock_qty").eq("id", lot.item_id).maybeSingle();
        await supabase.from("inventory").update({ stock_qty: Math.max(0, Number(it?.stock_qty || 0) - Number(lot.qty_remaining || 0)) }).eq("id", lot.item_id);
        await supabase.rpc("fn_sync_item_expiry", { p_item_id: lot.item_id });
        revalidatePath(`/dashboard/inventory/${lot.item_id}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
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

        // สร้างล็อตใหม่ (lot tracking)
        const { data: lot } = await supabase.from("inventory_lots").insert({
            clinic_id: item.clinic_id,
            item_id: input.item_id,
            lot_no: input.lot_no?.trim() || null,
            expiry_date: input.expiry_date || null,
            qty_received: input.qty,
            qty_remaining: input.qty,
            cost_per_unit: input.cost_per_unit || 0,
            note: input.note?.trim() || null,
            created_by: staffRow?.id || null,
        }).select("id").maybeSingle();

        // Insert stock_card (ผูก lot_id)
        await supabase.from("stock_card").insert({
            item_id: input.item_id,
            clinic_id: item.clinic_id,
            lot_id: lot?.id || null,
            tx_type: "PO_RECEIVE",
            qty_delta: input.qty,
            balance_after: newStock,
            cost_per_unit: input.cost_per_unit || null,
            total_cost: input.cost_per_unit ? input.cost_per_unit * input.qty : null,
            note: [input.lot_no && `Lot: ${input.lot_no}`, input.note].filter(Boolean).join(" · ") || null,
            recorded_by: staffRow?.id || null,
        });

        // sync วันหมดอายุของรายการ = ล็อตใกล้หมดสุด
        await supabase.rpc("fn_sync_item_expiry", { p_item_id: input.item_id });

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
