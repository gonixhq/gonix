"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    return { supabase, clinicId: profile.clinic_id as string };
}

export interface PresetItem { inventory_id: string; qty: number; sig_text: string; }
export interface PresetRow {
    id: string;
    preset_name: string;
    preset_type: string;        // drug_formula / vitamin_formula
    items: PresetItem[];
    is_active: boolean;
}
export interface PresetInvPick { id: string; item_name: string; unit: string | null; }

/** สูตรทั้งหมดของคลินิก (สูตรยา + สูตรวิตามิน) */
export async function listPresets(): Promise<PresetRow[]> {
    const { supabase, clinicId } = await getCtx();
    const { data } = await supabase
        .from("supply_presets")
        .select("id, preset_name, preset_type, items, is_active")
        .eq("clinic_id", clinicId)
        .order("preset_type")
        .order("preset_name");
    return (data || []).map((p) => ({
        id: p.id as string,
        preset_name: (p.preset_name as string) || "",
        preset_type: (p.preset_type as string) || "drug_formula",
        items: Array.isArray(p.items) ? (p.items as PresetItem[]) : [],
        is_active: p.is_active !== false,
    }));
}

/** รายการในคลังสำหรับเลือกใส่สูตร (ยา/วิตามิน/เวชภัณฑ์ ที่ active) */
export async function listPresetInventory(): Promise<PresetInvPick[]> {
    const { supabase, clinicId } = await getCtx();
    const { data } = await supabase
        .from("inventory")
        .select("id, item_name, unit")
        .eq("clinic_id", clinicId).eq("is_active", true)
        .order("item_name");
    return (data || []).map((i) => ({ id: i.id as string, item_name: i.item_name as string, unit: (i.unit as string) || null }));
}

export interface PresetInput { preset_name: string; preset_type: string; items: PresetItem[]; }

function cleanItems(items: PresetItem[]): PresetItem[] {
    return (items || [])
        .filter((it) => it.inventory_id)
        .map((it) => ({ inventory_id: it.inventory_id, qty: Number(it.qty) || 1, sig_text: (it.sig_text || "").trim() }));
}

export async function createPreset(input: PresetInput): Promise<{ ok: boolean; error?: string }> {
    const { supabase, clinicId } = await getCtx();
    if (!input.preset_name?.trim()) return { ok: false, error: "กรุณากรอกชื่อสูตร" };
    const items = cleanItems(input.items);
    if (items.length === 0) return { ok: false, error: "กรุณาเพิ่มรายการอย่างน้อย 1 รายการ" };
    const { error } = await supabase.from("supply_presets").insert({
        clinic_id: clinicId, preset_name: input.preset_name.trim(),
        preset_type: input.preset_type, items, is_active: true,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/dashboard/settings/formulas");
    return { ok: true };
}

export async function updatePreset(id: string, input: PresetInput): Promise<{ ok: boolean; error?: string }> {
    const { supabase, clinicId } = await getCtx();
    if (!input.preset_name?.trim()) return { ok: false, error: "กรุณากรอกชื่อสูตร" };
    const items = cleanItems(input.items);
    if (items.length === 0) return { ok: false, error: "กรุณาเพิ่มรายการอย่างน้อย 1 รายการ" };
    const { error } = await supabase.from("supply_presets").update({
        preset_name: input.preset_name.trim(), preset_type: input.preset_type, items,
    }).eq("id", id).eq("clinic_id", clinicId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/dashboard/settings/formulas");
    return { ok: true };
}

export async function deletePreset(id: string): Promise<{ ok: boolean }> {
    const { supabase, clinicId } = await getCtx();
    await supabase.from("supply_presets").delete().eq("id", id).eq("clinic_id", clinicId);
    revalidatePath("/dashboard/settings/formulas");
    return { ok: true };
}
