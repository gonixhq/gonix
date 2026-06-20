"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/** ดึงรายการ pending registrations ของคลินิก */
export async function listPendingRegistrations(search?: string) {
    try {
        const supabase = await createClient();
        let query = supabase
            .from("pending_registrations")
            .select(`
                id, source, prefix, first_name, last_name,
                dob, gender, phone, email, thai_id_card,
                blood_group, allergy_summary, disease_summary,
                pdpa_consent, status, created_at
            `)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(50);

        if (search?.trim()) {
            const q = search.trim();
            query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,thai_id_card.ilike.%${q}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, data: data || [] };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error", data: [] };
    }
}

/** ดึงรายละเอียดเต็มของ pending record */
export async function getPendingRegistration(id: string) {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("pending_registrations")
            .select("*")
            .eq("id", id)
            .single();
        if (error) throw error;
        return { success: true, data };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error", data: null };
    }
}

/** Mark record เป็น 'used' หลังจากสร้าง patient จริงแล้ว */
export async function markPendingAsUsed(id: string, newHn: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Unauthorized");

        const { error } = await supabase
            .from("pending_registrations")
            .update({
                status: "used",
                converted_to_hn: newHn,
                used_at: new Date().toISOString(),
                used_by: user.id,
            })
            .eq("id", id);

        if (error) throw error;
        revalidatePath("/dashboard/patients/new");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** Reject (ยกเลิก) pending record */
export async function rejectPendingRegistration(id: string, reason?: string) {
    try {
        const supabase = await createClient();
        const { error } = await supabase
            .from("pending_registrations")
            .update({
                status: "rejected",
                notes: reason || null,
            })
            .eq("id", id);
        if (error) throw error;
        revalidatePath("/dashboard/patients/new");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** Count pending (สำหรับ badge บน UI) */
export async function countPendingRegistrations() {
    try {
        const supabase = await createClient();
        const { count, error } = await supabase
            .from("pending_registrations")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending");
        if (error) throw error;
        return { success: true, count: count || 0 };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error", count: 0 };
    }
}
