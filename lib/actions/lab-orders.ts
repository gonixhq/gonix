"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Clinic not found");
    // ordered_by อ้าง staff.id — หาแบบ best-effort
    const { data: staff } = await supabase.from("staff").select("id").eq("profile_id", user.id).maybeSingle();
    return { supabase, clinicId: profile.clinic_id as string, userId: user.id, staffId: (staff?.id as string) || null };
}

export interface LabCatalogItem { id: string; name: string; price: number; item_type: string; }
export interface LabOrder {
    id: string;
    lab_name: string;
    lab_type: string | null;
    status: string;
    result_value: string | null;
    result_unit: string | null;
    normal_range: string | null;
    result_flag: string | null;
    result_note: string | null;
    resulted_at: string | null;
}

const num = (n: unknown) => Number(n || 0);
const LAB_TYPES = ["lab", "lab_external"];

// รายการ Lab จาก service_catalog (ชนิด lab/lab_external)
export async function getLabCatalog(): Promise<LabCatalogItem[]> {
    const { supabase, clinicId } = await getCtx();
    const { data } = await supabase
        .from("service_catalog")
        .select("id, service_name, selling_price, item_type")
        .eq("clinic_id", clinicId).eq("is_active", true).in("item_type", LAB_TYPES)
        .order("service_name", { ascending: true });
    return (data || []).map((s) => ({
        id: s.id as string, name: s.service_name as string,
        price: num(s.selling_price), item_type: (s.item_type as string) || "lab",
    }));
}

export async function getVisitLabOrders(vn: string): Promise<LabOrder[]> {
    const { supabase, clinicId } = await getCtx();
    const { data } = await supabase
        .from("lab_orders")
        .select("id, lab_name, lab_type, status, result_value, result_unit, normal_range, result_flag, result_note, resulted_at")
        .eq("vn", vn).eq("clinic_id", clinicId)
        .order("created_at", { ascending: true });
    return (data || []) as LabOrder[];
}

export async function addLabOrder(vn: string, hn: string, serviceId: string) {
    const { supabase, clinicId, staffId } = await getCtx();
    const { data: s } = await supabase.from("service_catalog")
        .select("service_name, item_type").eq("clinic_id", clinicId).eq("id", serviceId).maybeSingle();
    if (!s) return { ok: false, error: "ไม่พบรายการ Lab" };
    await supabase.from("lab_orders").insert({
        vn, hn, clinic_id: clinicId,
        lab_name: s.service_name, lab_type: (s.item_type as string) || "lab",
        ordered_by: staffId, status: "ordered",
    });
    revalidatePath(`/dashboard/visits/${vn}`);
    return { ok: true };
}

// เพิ่มแพ็กเกจตรวจ (ใช้ชุดเดียวกับคลินิกนิรนาม — anon_panels) → แตกเป็นรายการ lab ใน lab_orders
export async function addLabPanel(vn: string, hn: string, panelId: string) {
    const { supabase, clinicId, staffId } = await getCtx();
    const { data: panel } = await supabase.from("anon_panels")
        .select("id").eq("clinic_id", clinicId).eq("id", panelId).maybeSingle();
    if (!panel) return { ok: false, error: "ไม่พบแพ็กเกจ" };
    const { data: items } = await supabase.from("anon_panel_items")
        .select("service_catalog(service_name, item_type)").eq("panel_id", panelId);
    const { data: existing } = await supabase.from("lab_orders")
        .select("lab_name").eq("vn", vn).eq("clinic_id", clinicId);
    const have = new Set((existing || []).map((o) => o.lab_name as string));
    const rows = (items || []).map((it) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sc: any = Array.isArray(it.service_catalog) ? it.service_catalog[0] : it.service_catalog;
        if (!sc?.service_name || have.has(sc.service_name)) return null;
        have.add(sc.service_name);
        return { vn, hn, clinic_id: clinicId, lab_name: sc.service_name, lab_type: (sc.item_type as string) || "lab", ordered_by: staffId, status: "ordered" };
    }).filter(Boolean);
    if (rows.length) await supabase.from("lab_orders").insert(rows);
    revalidatePath(`/dashboard/visits/${vn}`);
    return { ok: true };
}

export async function removeLabOrder(id: string, vn: string) {
    const { supabase, clinicId } = await getCtx();
    await supabase.from("lab_orders").delete().eq("id", id).eq("clinic_id", clinicId);
    revalidatePath(`/dashboard/visits/${vn}`);
    return { ok: true };
}

export async function saveLabOrderResult(id: string, vn: string, body: {
    result_value?: string | null; result_unit?: string | null; normal_range?: string | null;
    result_flag?: string | null; result_note?: string | null;
}) {
    const { supabase, clinicId } = await getCtx();
    const hasResult = !!(body.result_value && body.result_value.trim());
    await supabase.from("lab_orders").update({
        result_value: body.result_value ?? null,
        result_unit: body.result_unit ?? null,
        normal_range: body.normal_range ?? null,
        result_flag: body.result_flag ?? null,
        result_note: body.result_note ?? null,
        status: hasResult ? "resulted" : "ordered",
        resulted_at: hasResult ? new Date().toISOString() : null,
    }).eq("id", id).eq("clinic_id", clinicId);
    revalidatePath(`/dashboard/visits/${vn}`);
    return { ok: true };
}

// หัวใบรายงานผล (Laboratory Report) — เก็บบน visits (prefix lab_)
export async function saveVisitLabReport(vn: string, patch: {
    lab_no?: string | null; lab_sample_type?: string | null;
    lab_collected_at?: string | null; lab_received_at?: string | null;
    lab_comment?: string | null;
    lab_reported_by_name?: string | null; lab_reported_by_license?: string | null; lab_reported_at?: string | null;
    lab_approved_by_name?: string | null; lab_approved_by_license?: string | null; lab_approved_at?: string | null;
}) {
    const { supabase, clinicId } = await getCtx();
    const dtKeys = new Set(["lab_collected_at", "lab_received_at", "lab_reported_at", "lab_approved_at"]);
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        if (v === "" || v === null) { clean[k] = null; continue; }
        if (dtKeys.has(k)) {
            const s = (v as string).length === 16 ? `${v}:00` : (v as string);
            clean[k] = new Date(`${s}+07:00`).toISOString();
        } else {
            clean[k] = v;
        }
    }
    await supabase.from("visits").update(clean).eq("vn", vn).eq("clinic_id", clinicId);
    revalidatePath(`/dashboard/visits/${vn}`);
    return { ok: true };
}
