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

/** ลายเซ็นของแพทย์ที่ล็อกอินอยู่ (data URL) */
export async function getMySignature(): Promise<string | null> {
    try {
        const { supabase, staffId } = await ctx();
        if (!staffId) return null;
        const { data } = await supabase.from("staff").select("signature_url").eq("id", staffId).maybeSingle();
        return (data?.signature_url as string) || null;
    } catch { return null; }
}

/** ตั้ง/ลบลายเซ็นของตัวเอง (รับ data URL base64 รูปเล็ก) */
export async function setMySignature(dataUrl: string | null) {
    try {
        const { supabase, staffId } = await ctx();
        if (!staffId) return { success: false, error: "ไม่พบข้อมูลพนักงานของผู้ใช้นี้" };
        if (dataUrl) {
            if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(dataUrl)) return { success: false, error: "ไฟล์ต้องเป็นรูปภาพ" };
            if (dataUrl.length > 500_000) return { success: false, error: "รูปใหญ่เกินไป (ควร < ~350KB) — ครอปให้เล็กลง" };
        }
        const { error } = await supabase.from("staff").update({ signature_url: dataUrl }).eq("id", staffId);
        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

export interface MedCertToPrint {
    vn: string; hn: string; patient_name: string; cert_type: string; approved_at: string | null;
}

/** ใบรับรองที่ approved แล้ว รอพิมพ์ (แจ้งเตือนเคาน์เตอร์ + พิมพ์จากหน้าจ่ายเงิน) */
export async function getMedCertsToPrint(days = 2): Promise<MedCertToPrint[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
        if (!profile?.clinic_id) return [];
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const { data } = await supabase.from("medical_certificates")
            .select("vn, hn, cert_type, approved_at")
            .eq("clinic_id", profile.clinic_id).eq("status", "approved")
            .gte("approved_at", since)
            .order("approved_at", { ascending: false }).limit(30);
        if (!data || data.length === 0) return [];
        const hns = [...new Set(data.map(d => d.hn as string).filter(Boolean))];
        const nameMap: Record<string, string> = {};
        if (hns.length > 0) {
            const { data: pts } = await supabase.from("patients").select("hn, prefix, first_name, last_name").in("hn", hns);
            for (const p of pts || []) nameMap[p.hn as string] = `${p.prefix || ""}${p.first_name || ""} ${p.last_name || ""}`.trim();
        }
        return data.map(d => ({
            vn: d.vn as string, hn: d.hn as string, patient_name: nameMap[d.hn as string] || (d.hn as string),
            cert_type: d.cert_type as string, approved_at: (d.approved_at as string) || null,
        }));
    } catch {
        return [];
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
