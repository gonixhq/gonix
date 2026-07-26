"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

/** ดึง client IP จาก proxy header (Vercel ตั้ง x-forwarded-for) — ใช้ทำ rate limit */
async function clientIp(): Promise<string> {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    return h.get("x-real-ip") || "unknown";
}

/** ลงทะเบียนสาธารณะ (หน้า /register/[clinicCode]) — ผ่าน RPC security-definer (mig 110)
 *  clinic_id มาจาก clinic_code ฝั่ง server (ตั้งเองไม่ได้) + rate limit ต่อ IP */
export async function submitPendingRegistration(
    clinicCode: string, data: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
    if (!clinicCode) return { ok: false, error: "ลิงก์ไม่ถูกต้อง (ไม่พบรหัสคลินิก)" };
    const supabase = await createClient();
    const { data: res, error } = await supabase.rpc("submit_pending_registration", {
        p_clinic_code: clinicCode,
        p_data: data,
        p_ip: await clientIp(),
    });
    if (error) return { ok: false, error: "ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = res as any;
    if (!r?.ok) {
        const msg = r?.error === "rate_limited" ? "ส่งข้อมูลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่"
            : r?.error === "clinic_not_found" ? "ไม่พบคลินิกจากลิงก์นี้"
            : r?.error === "missing_required" ? "กรุณากรอกชื่อ-นามสกุล และเบอร์โทร"
            : "ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่";
        return { ok: false, error: msg };
    }
    return { ok: true };
}

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
