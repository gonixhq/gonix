"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface MedCertInput {
    cert_type: string;
    doctor_opinion?: string | null;
    rest_days?: number | null;
    rest_from?: string | null;
    rest_to?: string | null;
    sign_mode?: string;   // manual | digital
}

async function ctx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
    const { data: staff } = await supabase.from("staff").select("id").eq("profile_id", user.id).maybeSingle();
    return { supabase, userId: user.id, clinicId: (profile?.clinic_id as string) || null, staffId: (staff?.id as string) || null };
}

/** บันทึก/แก้ไขใบรับรอง (draft) — 1 ใบต่อ visit (upsert by vn) */
export async function saveMedCert(vn: string, hn: string, input: MedCertInput) {
    try {
        const { supabase, staffId, clinicId } = await ctx();
        const row = {
            vn, hn, doctor_id: staffId, clinic_id: clinicId,
            cert_type: input.cert_type,
            doctor_opinion: input.doctor_opinion?.trim() || null,
            rest_days: input.rest_days ?? null,
            rest_from: input.rest_from || null,
            rest_to: input.rest_to || null,
            sign_mode: input.sign_mode || "manual",
            updated_at: new Date().toISOString(),
        };
        const { data: existing } = await supabase.from("medical_certificates").select("id, status").eq("vn", vn).maybeSingle();
        if (existing) {
            const { error } = await supabase.from("medical_certificates").update(row).eq("id", existing.id);
            if (error) return { success: false, error: error.message };
        } else {
            const { error } = await supabase.from("medical_certificates").insert({ ...row, status: "draft" });
            if (error) return { success: false, error: error.message };
        }
        revalidatePath(`/dashboard/visits/${vn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** อนุมัติใบรับรอง → พร้อม print (แจ้งเตือนเคาน์เตอร์) */
export async function approveMedCert(vn: string) {
    try {
        const { supabase, userId } = await ctx();
        const { data: cur } = await supabase.from("medical_certificates").select("id, cert_type").eq("vn", vn).maybeSingle();
        if (!cur) return { success: false, error: "ยังไม่ได้บันทึกใบรับรอง — กดบันทึกก่อน" };
        const { error } = await supabase.from("medical_certificates")
            .update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", cur.id);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/visits/${vn}`);
        revalidatePath("/dashboard/finance");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ยกเลิกอนุมัติ (กลับเป็น draft เพื่อแก้) */
export async function reopenMedCert(vn: string) {
    try {
        const { supabase } = await ctx();
        const { error } = await supabase.from("medical_certificates")
            .update({ status: "draft", approved_by: null, approved_at: null, updated_at: new Date().toISOString() })
            .eq("vn", vn);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/visits/${vn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ลบใบรับรอง */
export async function deleteMedCert(vn: string) {
    try {
        const { supabase } = await ctx();
        const { error } = await supabase.from("medical_certificates").delete().eq("vn", vn);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/visits/${vn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
