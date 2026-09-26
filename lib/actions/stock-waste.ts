"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bangkokDate } from "@/lib/utils/date";
import { deductFEFO } from "@/lib/inventory-fefo";
import type { WasteReason } from "@/lib/stock-waste";

// ยาทิ้ง / หมดอายุ / เสียหาย (เฟส 4B) — หักสต๊อก + มูลค่าตามราคาทุน ณ วันทิ้ง

export interface WasteRow {
    id: string; wasted_on: string; item_name: string; qty: number; unit: string | null;
    unit_cost: number; value: number; reason: WasteReason; note: string | null; recorded_by: string | null; lot: string | null;
}
export interface WasteItemPick {
    id: string; item_name: string; unit: string | null; cost_price: number; stock_qty: number; is_vial: boolean;
    lots: { id: string; label: string; qty: number }[];
    vials: { id: string; label: string; remaining: number; status: string }[];
}
export interface OpenVialRow {
    id: string; item_id: string; item_name: string; unit: string | null; lot: string | null;
    remaining: number; total: number; opened_at: string; hours_open: number; shelf_hours: number | null; value: number; overdue: boolean;
}

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("ไม่พบคลินิก");
    const { data: staff } = await supabase.from("staff").select("id").eq("profile_id", user.id).maybeSingle();
    return { supabase, clinicId: profile.clinic_id as string, staffId: (staff?.id as string) || null };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function getWasteLog(month: string): Promise<{ rows: WasteRow[]; total: number; byReason: Record<string, number> } | { error: string }> {
    try {
        if (!/^\d{4}-\d{2}$/.test(month)) return { error: "เดือนไม่ถูกต้อง" };
        const { supabase, clinicId } = await ctx();
        const [y, m] = month.split("-").map(Number);
        const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        const { data } = await supabase.from("stock_waste")
            .select("id, wasted_on, qty, unit, unit_cost, value, reason, note, item:item_id(item_name), lot:lot_id(lot_no), vial:vial_id(lot_number), staff:recorded_by(profiles(full_name))")
            .eq("clinic_id", clinicId).gte("wasted_on", `${month}-01`).lte("wasted_on", last)
            .order("wasted_on", { ascending: false }).order("created_at", { ascending: false });
        const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] : x) ?? null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: WasteRow[] = (data || []).map((r: any) => {
            const st = one(r.staff) as { profiles?: unknown } | null;
            const p = st ? one(st.profiles as { full_name?: string } | { full_name?: string }[]) : null;
            return {
                id: r.id, wasted_on: r.wasted_on, item_name: one<{ item_name: string }>(r.item)?.item_name || "—",
                qty: Number(r.qty), unit: r.unit, unit_cost: Number(r.unit_cost), value: Number(r.value),
                reason: r.reason, note: r.note, recorded_by: p?.full_name || null,
                lot: one<{ lot_no: string }>(r.lot)?.lot_no || one<{ lot_number: string }>(r.vial)?.lot_number || null,
            };
        });
        const byReason: Record<string, number> = {};
        rows.forEach(r => { byReason[r.reason] = r2((byReason[r.reason] || 0) + r.value); });
        return { rows, total: r2(rows.reduce((s, r) => s + r.value, 0)), byReason };
    } catch (e) {
        return { error: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" };
    }
}

export async function getWasteItemPicks(): Promise<WasteItemPick[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const [{ data: items }, { data: lots }, { data: vials }] = await Promise.all([
            supabase.from("inventory").select("id, item_name, unit, cost_price, stock_qty, deduction_type").eq("clinic_id", clinicId).eq("is_active", true).order("item_name"),
            supabase.from("inventory_lots").select("id, item_id, lot_no, expiry_date, qty_remaining").eq("clinic_id", clinicId).gt("qty_remaining", 0).order("expiry_date"),
            supabase.from("inventory_vials").select("id, item_id, lot_number, expiry_date, capacity_remaining, status, opened_at").eq("clinic_id", clinicId).neq("status", "depleted").order("status").order("expiry_date"),
        ]);
        return (items || []).map(i => ({
            id: i.id as string, item_name: i.item_name as string, unit: (i.unit as string) || null,
            cost_price: Number(i.cost_price || 0), stock_qty: Number(i.stock_qty || 0), is_vial: i.deduction_type === "injectable_vial",
            lots: (lots || []).filter(l => l.item_id === i.id).map(l => ({
                id: l.id as string, qty: Number(l.qty_remaining),
                label: `${l.lot_no || "ไม่มีเลขล็อต"}${l.expiry_date ? ` · หมด ${l.expiry_date}` : ""} · เหลือ ${Number(l.qty_remaining)}`,
            })),
            vials: (vials || []).filter(v => v.item_id === i.id).map(v => ({
                id: v.id as string, remaining: Number(v.capacity_remaining), status: v.status as string,
                label: `${v.status === "open" ? "🔓 เปิดแล้ว" : "ยังไม่เปิด"} · ${v.lot_number || "—"}${v.expiry_date ? ` · หมด ${v.expiry_date}` : ""} · เหลือ ${Number(v.capacity_remaining)}`,
            })),
        }));
    } catch {
        return [];
    }
}

export async function recordWaste(input: { item_id: string; qty: number; reason: WasteReason; note?: string; lot_id?: string | null; vial_id?: string | null; wasted_on?: string }) {
    try {
        const { supabase, clinicId, staffId } = await ctx();
        const qty = Number(input.qty);
        if (!(qty > 0)) return { success: false, error: "จำนวนต้องมากกว่า 0" };
        if (!["mixed_leftover", "expired", "damaged", "other"].includes(input.reason)) return { success: false, error: "เหตุผลไม่ถูกต้อง" };
        if (input.reason === "other" && !input.note?.trim()) return { success: false, error: "เหตุผล \"อื่นๆ\" ต้องระบุหมายเหตุ" };
        const today = bangkokDate();
        const wastedOn = input.wasted_on && input.wasted_on <= today ? input.wasted_on : today;

        const { data: item } = await supabase.from("inventory").select("id, item_name, unit, cost_price, stock_qty, deduction_type")
            .eq("id", input.item_id).eq("clinic_id", clinicId).maybeSingle();
        if (!item) return { success: false, error: "ไม่พบรายการในคลัง" };
        const isVial = item.deduction_type === "injectable_vial";

        if (isVial) {
            if (!input.vial_id) return { success: false, error: "เวชภัณฑ์ฉีด: เลือกขวดที่ทิ้ง" };
            const { error } = await supabase.rpc("fn_waste_vial", { p_vial: input.vial_id, p_qty: qty });
            if (error) return { success: false, error: error.message };
        } else {
            if (qty > Number(item.stock_qty || 0)) return { success: false, error: `สต๊อกไม่พอ (เหลือ ${Number(item.stock_qty || 0)})` };
            await supabase.from("inventory").update({ stock_qty: Number(item.stock_qty || 0) - qty, updated_at: new Date().toISOString() }).eq("id", item.id);
            if (input.lot_id) {
                const { data: lot } = await supabase.from("inventory_lots").select("qty_remaining").eq("id", input.lot_id).eq("item_id", item.id).maybeSingle();
                if (!lot) return { success: false, error: "ไม่พบล็อต" };
                const take = Math.min(qty, Number(lot.qty_remaining || 0));
                await supabase.from("inventory_lots").update({ qty_remaining: Number(lot.qty_remaining) - take }).eq("id", input.lot_id);
                if (qty > take) await deductFEFO(supabase, clinicId, item.id as string, qty - take);
                try { await supabase.rpc("fn_sync_item_expiry", { p_item_id: item.id }); } catch { /* ignore */ }
            } else {
                await deductFEFO(supabase, clinicId, item.id as string, qty);
            }
        }

        const { data: after } = await supabase.from("inventory").select("stock_qty").eq("id", item.id).maybeSingle();
        const unitCost = Number(item.cost_price || 0);
        await supabase.from("stock_card").insert({
            item_id: item.id, clinic_id: clinicId, tx_type: "WASTE", qty_delta: -qty,
            balance_after: Number(after?.stock_qty || 0), note: `ทิ้ง: ${input.reason}${input.note ? ` · ${input.note}` : ""}`, recorded_by: staffId,
        });
        const { error: wErr } = await supabase.from("stock_waste").insert({
            clinic_id: clinicId, item_id: item.id, lot_id: input.lot_id || null, vial_id: input.vial_id || null,
            qty, unit: item.unit || null, unit_cost: unitCost, value: r2(unitCost * qty),
            reason: input.reason, note: input.note?.trim() || null, wasted_on: wastedOn, recorded_by: staffId,
        });
        if (wErr) return { success: false, error: `หักสต๊อกแล้ว แต่บันทึกรายการทิ้งไม่สำเร็จ: ${wErr.message}` };
        revalidatePath("/dashboard/inventory/waste");
        revalidatePath("/dashboard/inventory");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
    }
}

/** ขวดที่เปิดค้าง — ใช้ต่อก่อนเปิดขวดใหม่ / ทิ้งเมื่อเกินอายุหลังเปิด */
export async function getOpenVials(): Promise<OpenVialRow[]> {
    try {
        const { supabase, clinicId } = await ctx();
        const { data } = await supabase.from("inventory_vials")
            .select("id, item_id, lot_number, capacity_total, capacity_remaining, opened_at, item:item_id(item_name, unit, cost_price, opened_shelf_hours)")
            .eq("clinic_id", clinicId).eq("status", "open").order("opened_at");
        const now = Date.now();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data || []).map((v: any) => {
            const it = Array.isArray(v.item) ? v.item[0] : v.item;
            const hours = v.opened_at ? (now - new Date(v.opened_at).getTime()) / 3600000 : 0;
            const shelf = it?.opened_shelf_hours != null ? Number(it.opened_shelf_hours) : null;
            return {
                id: v.id, item_id: v.item_id, item_name: it?.item_name || "—", unit: it?.unit || null, lot: v.lot_number || null,
                remaining: Number(v.capacity_remaining), total: Number(v.capacity_total), opened_at: v.opened_at,
                hours_open: Math.round(hours * 10) / 10, shelf_hours: shelf,
                value: r2(Number(it?.cost_price || 0) * Number(v.capacity_remaining)), overdue: shelf != null && hours > shelf,
            };
        });
    } catch {
        return [];
    }
}

export async function setOpenedShelfHours(itemId: string, hours: number | null) {
    try {
        const { supabase, clinicId } = await ctx();
        const { error } = await supabase.from("inventory").update({ opened_shelf_hours: hours }).eq("id", itemId).eq("clinic_id", clinicId);
        if (error) return { success: false, error: error.message };
        revalidatePath("/dashboard/inventory/waste");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
    }
}
