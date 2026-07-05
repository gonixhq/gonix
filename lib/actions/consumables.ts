"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { deductFEFO } from "@/lib/inventory-fefo";
import { revalidatePath } from "next/cache";

async function ctx() {
    const supabase = await createClient();
    const { userId, clinicId, role } = await getEffectivePermissionsForUser();
    if (!userId || !clinicId) throw new Error("Unauthorized");
    return { supabase, userId: userId as string, clinicId: clinicId as string, role: (role as string) || "" };
}
const isMgr = (role: string) => role === "owner" || role === "admin";
async function staffIdOf(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
    const { data } = await supabase.from("staff").select("id").eq("profile_id", userId).maybeSingle();
    return (data?.id as string) || null;
}

export interface ConsumableItem {
    id: string; item_name: string; unit: string; purchase_unit: string | null;
    units_per_pack: number | null; stock_qty: number; cost_price: number;
    category: string | null; track_group: string | null; min_stock: number;
}

/** รายการสินค้าในคลัง (active) — สำหรับตั้ง PAR / ตรวจนับ */
export async function getConsumableItems(): Promise<ConsumableItem[]> {
    const { supabase, clinicId } = await ctx();
    const { data } = await supabase.from("inventory")
        .select("id, item_name, unit, purchase_unit, units_per_pack, stock_qty, cost_price, category, track_group, min_stock")
        .eq("clinic_id", clinicId).eq("is_active", true)
        .order("category").order("item_name");
    return (data || []).map((i) => ({
        id: i.id as string, item_name: i.item_name as string, unit: (i.unit as string) || "ชิ้น",
        purchase_unit: (i.purchase_unit as string) || null, units_per_pack: i.units_per_pack != null ? Number(i.units_per_pack) : null,
        stock_qty: Number(i.stock_qty || 0), cost_price: Number(i.cost_price || 0),
        category: (i.category as string) || null, track_group: (i.track_group as string) || null, min_stock: Number(i.min_stock || 0),
    }));
}

// ─────────────────────────── PAR ───────────────────────────
export interface RoomParRow { item_id: string; item_name: string; unit: string; par_qty: number; stock_qty: number; }

export async function getRoomPar(roomId: string): Promise<RoomParRow[]> {
    const { supabase, clinicId } = await ctx();
    if (!roomId) return [];
    const { data } = await supabase.from("room_par")
        .select("item_id, par_qty, inventory!inner(item_name, unit, stock_qty)")
        .eq("clinic_id", clinicId).eq("room_id", roomId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((r: any) => {
        const inv = Array.isArray(r.inventory) ? r.inventory[0] : r.inventory;
        return { item_id: r.item_id as string, item_name: inv?.item_name || "—", unit: inv?.unit || "ชิ้น", par_qty: Number(r.par_qty || 0), stock_qty: Number(inv?.stock_qty || 0) };
    });
}

/** ตั้ง/แก้ PAR ของห้อง (แทนทั้งชุด: par_qty>0 = upsert, =0 = ลบ) */
export async function setRoomParBulk(roomId: string, lines: { item_id: string; par_qty: number }[]) {
    const { supabase, userId, clinicId, role } = await ctx();
    if (!isMgr(role)) return { success: false, error: "เฉพาะแอดมิน/เจ้าของตั้ง PAR ได้" };
    if (!roomId) return { success: false, error: "ยังไม่ได้เลือกห้อง" };
    const keep = lines.filter((l) => l.item_id && Number(l.par_qty) > 0);
    const removeIds = lines.filter((l) => l.item_id && Number(l.par_qty) <= 0).map((l) => l.item_id);
    if (removeIds.length > 0) {
        await supabase.from("room_par").delete().eq("clinic_id", clinicId).eq("room_id", roomId).in("item_id", removeIds);
    }
    if (keep.length > 0) {
        const { error } = await supabase.from("room_par").upsert(
            keep.map((l) => ({ clinic_id: clinicId, room_id: roomId, item_id: l.item_id, par_qty: Number(l.par_qty), updated_by: userId, updated_at: new Date().toISOString() })),
            { onConflict: "clinic_id,room_id,item_id" }
        );
        if (error) return { success: false, error: error.message };
    }
    revalidatePath("/dashboard/inventory/par");
    return { success: true };
}

/** เบิกเติม PAR — ตัดสต๊อกกลาง (FEFO) ตามจำนวนที่เบิก + log */
export async function replenishPar(roomId: string, lines: { item_id: string; qty: number }[]) {
    const { supabase, userId, clinicId, role } = await ctx();
    if (!isMgr(role) && role !== "nurse" && role !== "assistant") return { success: false, error: "ไม่มีสิทธิ์เบิกของ" };
    const use = lines.filter((l) => l.item_id && Number(l.qty) > 0);
    if (use.length === 0) return { success: false, error: "ยังไม่ได้ระบุจำนวนเบิก" };
    const staffId = await staffIdOf(supabase, userId);
    const { data: roomRow } = await supabase.from("rooms").select("room_name").eq("id", roomId).maybeSingle();
    const roomName = (roomRow?.room_name as string) || "ห้องตรวจ";

    let issued = 0;
    for (const l of use) {
        const qty = Number(l.qty);
        const { data: item } = await supabase.from("inventory").select("stock_qty").eq("id", l.item_id).eq("clinic_id", clinicId).maybeSingle();
        if (!item) continue;
        const bal = Number(item.stock_qty || 0) - qty;
        await supabase.from("inventory").update({ stock_qty: bal, updated_at: new Date().toISOString() }).eq("id", l.item_id);
        await deductFEFO(supabase, clinicId, l.item_id, qty);
        await supabase.from("stock_card").insert({
            item_id: l.item_id, clinic_id: clinicId, tx_type: "INTERNAL_USE",
            qty_delta: -qty, balance_after: bal, note: `เบิกเติม PAR — ${roomName}`, recorded_by: staffId,
        });
        issued++;
    }
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/par");
    return { success: true, issued };
}

// ─────────────────────── Expiry alert ───────────────────────
export interface ExpiringLot { item_id: string; item_name: string; lot_no: string | null; expiry_date: string; qty_remaining: number; days_left: number; }

export async function getExpiringSoon(days = 30): Promise<ExpiringLot[]> {
    const { supabase, clinicId } = await ctx();
    const today = new Date();
    const limit = new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10);
    const { data } = await supabase.from("inventory_lots")
        .select("item_id, lot_no, expiry_date, qty_remaining, inventory!inner(item_name)")
        .eq("clinic_id", clinicId).gt("qty_remaining", 0)
        .not("expiry_date", "is", null).lte("expiry_date", limit)
        .order("expiry_date", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((r: any) => {
        const inv = Array.isArray(r.inventory) ? r.inventory[0] : r.inventory;
        const dl = Math.round((new Date(r.expiry_date + "T00:00:00").getTime() - today.getTime()) / 86400000);
        return { item_id: r.item_id as string, item_name: inv?.item_name || "—", lot_no: (r.lot_no as string) || null, expiry_date: r.expiry_date as string, qty_remaining: Number(r.qty_remaining || 0), days_left: dl };
    });
}

// ─────────────────────── Stock Count ───────────────────────
export interface StockCountLine { id: string; item_id: string; item_name: string; unit: string; system_qty: number; counted_qty: number | null; cost_price: number; }
export interface StockCountHeader { id: string; count_date: string; status: string; note: string | null; counted_by_name: string | null; }

/** เปิดรอบตรวจนับใหม่ — snapshot สต๊อกปัจจุบันของทุกรายการ active */
export async function createStockCount(note?: string) {
    const { supabase, userId, clinicId, role } = await ctx();
    if (!isMgr(role)) return { success: false, error: "เฉพาะแอดมิน/เจ้าของเปิดรอบนับได้" };
    const { data: header, error } = await supabase.from("stock_counts")
        .insert({ clinic_id: clinicId, note: note || null, counted_by: userId, status: "open" }).select("id").single();
    if (error || !header) return { success: false, error: error?.message || "เปิดรอบไม่สำเร็จ" };
    const { data: items } = await supabase.from("inventory").select("id, stock_qty, cost_price").eq("clinic_id", clinicId).eq("is_active", true);
    if (items && items.length > 0) {
        await supabase.from("stock_count_lines").insert(items.map((i) => ({
            count_id: header.id, item_id: i.id, system_qty: Number(i.stock_qty || 0), cost_price: Number(i.cost_price || 0),
        })));
    }
    revalidatePath("/dashboard/inventory/stock-count");
    return { success: true, id: header.id as string };
}

export async function listStockCounts(): Promise<(StockCountHeader & { lines: number; diff_value: number })[]> {
    const { supabase, clinicId } = await ctx();
    const { data } = await supabase.from("stock_counts")
        .select("id, count_date, status, note, counted_by, stock_count_lines(system_qty, counted_qty, cost_price)")
        .eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((c: any) => {
        const lines = c.stock_count_lines || [];
        let diffValue = 0;
        for (const l of lines) if (l.counted_qty != null) diffValue += (Number(l.counted_qty) - Number(l.system_qty)) * Number(l.cost_price || 0);
        return { id: c.id, count_date: c.count_date, status: c.status, note: c.note || null, counted_by_name: null, lines: lines.length, diff_value: Math.round(diffValue * 100) / 100 };
    });
}

export async function getStockCount(id: string): Promise<{ header: StockCountHeader | null; lines: StockCountLine[] }> {
    const { supabase, clinicId } = await ctx();
    const { data: header } = await supabase.from("stock_counts").select("id, count_date, status, note, counted_by").eq("id", id).eq("clinic_id", clinicId).maybeSingle();
    if (!header) return { header: null, lines: [] };
    const { data: lines } = await supabase.from("stock_count_lines")
        .select("id, item_id, system_qty, counted_qty, cost_price, inventory!inner(item_name, unit)")
        .eq("count_id", id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: StockCountLine[] = (lines || []).map((l: any) => {
        const inv = Array.isArray(l.inventory) ? l.inventory[0] : l.inventory;
        return { id: l.id, item_id: l.item_id, item_name: inv?.item_name || "—", unit: inv?.unit || "ชิ้น", system_qty: Number(l.system_qty || 0), counted_qty: l.counted_qty != null ? Number(l.counted_qty) : null, cost_price: Number(l.cost_price || 0) };
    }).sort((a, b) => a.item_name.localeCompare(b.item_name));
    return { header: { id: header.id as string, count_date: header.count_date as string, status: header.status as string, note: (header.note as string) || null, counted_by_name: null }, lines: mapped };
}

/** บันทึกจำนวนที่นับได้ (ยังไม่ปิดรอบ) */
export async function saveStockCountCounts(id: string, counts: { line_id: string; counted_qty: number | null }[]) {
    const { supabase, clinicId, role } = await ctx();
    if (!isMgr(role)) return { success: false, error: "ไม่มีสิทธิ์" };
    const { data: header } = await supabase.from("stock_counts").select("status").eq("id", id).eq("clinic_id", clinicId).maybeSingle();
    if (!header) return { success: false, error: "ไม่พบรอบนับ" };
    if (header.status === "done") return { success: false, error: "รอบนี้ปิดแล้ว" };
    for (const c of counts) {
        await supabase.from("stock_count_lines").update({ counted_qty: c.counted_qty }).eq("id", c.line_id).eq("count_id", id);
    }
    revalidatePath(`/dashboard/inventory/stock-count/${id}`);
    return { success: true };
}

/** ปิดรอบนับ — option ปรับสต๊อกระบบให้ตรงกับที่นับได้ (RECOUNT) */
export async function finalizeStockCount(id: string, applyAdjust: boolean) {
    const { supabase, userId, clinicId, role } = await ctx();
    if (!isMgr(role)) return { success: false, error: "ไม่มีสิทธิ์" };
    const { data: header } = await supabase.from("stock_counts").select("status").eq("id", id).eq("clinic_id", clinicId).maybeSingle();
    if (!header) return { success: false, error: "ไม่พบรอบนับ" };
    if (header.status === "done") return { success: false, error: "รอบนี้ปิดแล้ว" };

    if (applyAdjust) {
        const staffId = await staffIdOf(supabase, userId);
        const { data: lines } = await supabase.from("stock_count_lines").select("item_id, system_qty, counted_qty").eq("count_id", id);
        for (const l of lines || []) {
            if (l.counted_qty == null) continue;
            const counted = Number(l.counted_qty), sys = Number(l.system_qty);
            if (counted === sys) continue;
            await supabase.from("inventory").update({ stock_qty: counted, updated_at: new Date().toISOString() }).eq("id", l.item_id).eq("clinic_id", clinicId);
            await supabase.from("stock_card").insert({
                item_id: l.item_id, clinic_id: clinicId, tx_type: "RECOUNT",
                qty_delta: counted - sys, balance_after: counted, note: "ปรับตามการตรวจนับ", recorded_by: staffId,
            });
        }
    }
    await supabase.from("stock_counts").update({ status: "done", finalized_at: new Date().toISOString() }).eq("id", id).eq("clinic_id", clinicId);
    revalidatePath("/dashboard/inventory/stock-count");
    revalidatePath(`/dashboard/inventory/stock-count/${id}`);
    revalidatePath("/dashboard/inventory");
    return { success: true };
}
