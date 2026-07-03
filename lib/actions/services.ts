"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ServiceCatalogItem, ServiceItemType, InventoryPick } from "@/lib/service-types";

/** List active services for current clinic */
export async function listActiveServices(): Promise<ServiceCatalogItem[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const { data } = await supabase
            .from("service_catalog")
            .select("id, service_code, service_name, item_type, selling_price, duration_min, note, is_active, inventory_item_id, consume_qty, segment, follow_up_days")
            .eq("clinic_id", profile.clinic_id)
            .eq("is_active", true)
            .order("item_type")
            .order("service_name");

        return (data || []) as ServiceCatalogItem[];
    } catch {
        return [];
    }
}

/** List ALL services (admin — include inactive) */
export async function listAllServices(): Promise<ServiceCatalogItem[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];

        const { data } = await supabase
            .from("service_catalog")
            .select("id, service_code, service_name, item_type, selling_price, duration_min, note, is_active, inventory_item_id, consume_qty, segment, follow_up_days")
            .eq("clinic_id", profile.clinic_id)
            .order("is_active", { ascending: false })
            .order("item_type")
            .order("service_name");

        return (data || []) as ServiceCatalogItem[];
    } catch {
        return [];
    }
}

export interface ServiceInput {
    service_code?: string;
    service_name: string;
    item_type: ServiceItemType;
    selling_price: number;
    duration_min?: number;
    note?: string;
    is_active?: boolean;
    inventory_item_id?: string | null;
    consume_qty?: number | null;
    segment?: string | null;   // แผนกรายได้ medical/aesthetic/product
    follow_up_days?: string | null;   // รอบติดตามผล "1,7,14"
}

/** รายการในคลังสำหรับเลือกผูกเป็น kit (ตัด stock) */
export async function listInventoryForPicker(): Promise<InventoryPick[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return [];
        const { data } = await supabase
            .from("inventory")
            .select("id, item_name, stock_qty, unit")
            .eq("clinic_id", profile.clinic_id).eq("is_active", true)
            .order("item_name");
        return (data || []).map((i) => ({
            id: i.id as string, item_name: i.item_name as string,
            stock_qty: Number(i.stock_qty || 0), unit: (i.unit as string) || null,
        }));
    } catch {
        return [];
    }
}

const TYPE_PREFIX: Record<ServiceItemType, string> = {
    doctor_fee: "DOC",
    procedure: "PROC",
    service: "SVC",
    supply: "SUPP",
    lab_external: "LAB",
    other: "OTH",
};

/** Auto-generate service code: PROC-001, SVC-002, ฯลฯ */
async function generateServiceCode(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    clinicId: string,
    itemType: ServiceItemType
): Promise<string> {
    const prefix = TYPE_PREFIX[itemType] || "SVC";
    const { count } = await supabase
        .from("service_catalog")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("item_type", itemType);
    const next = (count || 0) + 1;
    return `${prefix}-${String(next).padStart(3, "0")}`;
}

export async function createService(input: ServiceInput) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        if (!input.service_name?.trim()) return { success: false, error: "กรุณากรอกชื่อรายการ" };

        // Auto-generate รหัสถ้าไม่ใส่
        const code = input.service_code?.trim() || await generateServiceCode(supabase, profile.clinic_id, input.item_type);

        const { data, error } = await supabase
            .from("service_catalog")
            .insert({
                clinic_id: profile.clinic_id,
                service_code: code,
                service_name: input.service_name.trim(),
                item_type: input.item_type,
                selling_price: input.selling_price ?? 0,
                duration_min: input.duration_min ?? 30,
                follow_up_days: input.follow_up_days || null,
                note: input.note?.trim() || null,
                is_active: input.is_active ?? true,
                inventory_item_id: input.inventory_item_id || null,
                consume_qty: input.consume_qty ?? 1,
                segment: input.segment || "medical",
            })
            .select("id")
            .single();

        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/settings/services");
        return { success: true, id: data.id };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** Backfill: เติมรหัสให้ service ที่ยังไม่มี (เรียกครั้งเดียว) */
export async function backfillMissingCodes() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        const { data: missing } = await supabase
            .from("service_catalog")
            .select("id, item_type")
            .eq("clinic_id", profile.clinic_id)
            .or("service_code.is.null,service_code.eq.")
            .order("created_at", { ascending: true });

        if (!missing || missing.length === 0) {
            return { success: true, updated: 0 };
        }

        // Count by type
        const typeCounters: Record<string, number> = {};
        const { data: allServices } = await supabase
            .from("service_catalog")
            .select("item_type, service_code")
            .eq("clinic_id", profile.clinic_id);
        for (const s of allServices || []) {
            const t = s.item_type as ServiceItemType;
            typeCounters[t] = (typeCounters[t] || 0) + 1;
        }

        // Assign code per row (ใช้ running ภายในประเภทตัวเอง)
        const runningByType: Record<string, number> = {};
        let updated = 0;
        for (const row of missing) {
            const t = (row.item_type || "other") as ServiceItemType;
            const prefix = TYPE_PREFIX[t] || "SVC";
            runningByType[t] = (runningByType[t] || 0) + 1;
            // หา next number ที่ไม่ชน — เริ่มจากท้ายแล้วเดินขึ้น (ง่ายๆ)
            const candidateNum = (typeCounters[t] || 0) + runningByType[t] - missing.filter(m => m.item_type === t).length;
            const code = `${prefix}-${String(Math.max(candidateNum, runningByType[t])).padStart(3, "0")}`;
            const { error } = await supabase
                .from("service_catalog")
                .update({ service_code: code })
                .eq("id", row.id);
            if (!error) updated++;
        }

        revalidatePath("/dashboard/settings/services");
        return { success: true, updated };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

export async function updateService(id: string, input: Partial<ServiceInput>) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: any = {};
        if (input.service_code !== undefined) update.service_code = input.service_code?.trim() || null;
        if (input.service_name !== undefined) update.service_name = input.service_name.trim();
        if (input.item_type !== undefined) update.item_type = input.item_type;
        if (input.selling_price !== undefined) update.selling_price = input.selling_price;
        if (input.duration_min !== undefined) update.duration_min = input.duration_min;
        if (input.follow_up_days !== undefined) update.follow_up_days = input.follow_up_days || null;
        if (input.note !== undefined) update.note = input.note?.trim() || null;
        if (input.is_active !== undefined) update.is_active = input.is_active;
        if (input.inventory_item_id !== undefined) update.inventory_item_id = input.inventory_item_id || null;
        if (input.consume_qty !== undefined) update.consume_qty = input.consume_qty ?? 1;
        if (input.segment !== undefined) update.segment = input.segment || "medical";

        const { error } = await supabase
            .from("service_catalog")
            .update(update)
            .eq("id", id);

        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/settings/services");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

export async function deleteService(id: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        // Soft delete
        const { error } = await supabase
            .from("service_catalog")
            .update({ is_active: false })
            .eq("id", id);

        if (error) return { success: false, error: error.message };

        revalidatePath("/dashboard/settings/services");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
