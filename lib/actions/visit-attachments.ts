"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const ALLOWED_MIME = new Set([
    "application/pdf",
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const CATEGORIES = [
    "opd_record", "lab_external", "lab_internal", "imaging",
    "consent", "referral_doc", "prescription", "med_cert", "other",
] as const;
type Category = typeof CATEGORIES[number];

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles")
        .select("clinic_id, full_name").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Profile/clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

/**
 * Upload file via FormData (server action).
 * FormData fields:
 *   - file: File
 *   - vn: string
 *   - hn: string
 *   - category: Category
 *   - note?: string
 */
export async function uploadVisitAttachment(formData: FormData) {
    try {
        const { supabase, userId, clinicId } = await getCtx();

        const file = formData.get("file") as File | null;
        const vn = formData.get("vn") as string;
        const hn = formData.get("hn") as string;
        const category = (formData.get("category") as string || "other") as Category;
        const note = (formData.get("note") as string) || null;

        if (!file || file.size === 0) return { success: false, error: "ไม่พบไฟล์ที่อัปโหลด" };
        if (!vn || !hn) return { success: false, error: "ข้อมูลไม่ครบถ้วน" };
        if (file.size > MAX_BYTES) return { success: false, error: "ไฟล์ใหญ่เกิน 10MB" };
        if (!ALLOWED_MIME.has(file.type)) return { success: false, error: `ชนิดไฟล์ไม่รองรับ (${file.type})` };
        if (!CATEGORIES.includes(category)) return { success: false, error: "หมวดหมู่ไม่ถูกต้อง" };

        // Build storage path: {clinic_id}/visits/{vn}/{uuid}.{ext}
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const uid = crypto.randomUUID();
        const path = `${clinicId}/visits/${vn}/${uid}.${ext}`;

        // Upload to storage
        const buffer = await file.arrayBuffer();
        const { error: uploadErr } = await supabase.storage
            .from("clinic-assets")
            .upload(path, buffer, {
                contentType: file.type,
                upsert: false,
            });
        if (uploadErr) return { success: false, error: `Upload error: ${uploadErr.message}` };

        // Insert metadata
        const { error: dbErr } = await supabase.from("visit_attachments").insert({
            clinic_id: clinicId,
            vn, hn,
            category,
            file_name: file.name,
            file_path: path,
            file_size: file.size,
            mime_type: file.type,
            note,
            uploaded_by: userId,
        });
        if (dbErr) {
            // Roll back the upload if DB insert fails
            await supabase.storage.from("clinic-assets").remove([path]);
            return { success: false, error: `DB error: ${dbErr.message}` };
        }

        revalidatePath(`/dashboard/visits/${vn}`);
        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

export async function listVisitAttachments(vn: string) {
    try {
        const { supabase } = await getCtx();
        const { data, error } = await supabase.from("visit_attachments")
            .select("id, category, file_name, file_path, file_size, mime_type, note, uploaded_at, uploaded_by, profiles:uploaded_by(full_name)")
            .eq("vn", vn).eq("is_deleted", false)
            .order("uploaded_at", { ascending: false });
        if (error) return { success: false, error: error.message, data: [] };
        return { success: true, data: data || [] };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error", data: [] };
    }
}

/** List ALL attachments for a patient (across all visits) — for patient profile */
export async function listPatientAttachments(hn: string) {
    try {
        const { supabase } = await getCtx();
        const { data, error } = await supabase.from("visit_attachments")
            .select("id, vn, category, file_name, file_path, file_size, mime_type, note, uploaded_at, uploaded_by, profiles:uploaded_by(full_name)")
            .eq("hn", hn).eq("is_deleted", false)
            .order("uploaded_at", { ascending: false });
        if (error) return { success: false, error: error.message, data: [] };
        return { success: true, data: data || [] };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error", data: [] };
    }
}

/** Get a signed URL valid for 60 seconds (for view/download) */
export async function getAttachmentSignedUrl(filePath: string) {
    try {
        const { supabase } = await getCtx();
        const { data, error } = await supabase.storage
            .from("clinic-assets")
            .createSignedUrl(filePath, 60);
        if (error) return { success: false, error: error.message, url: null };
        return { success: true, url: data?.signedUrl || null };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error", url: null };
    }
}

export async function deleteVisitAttachment(id: string, vn: string, hn: string) {
    try {
        const { supabase } = await getCtx();
        // Fetch file_path to remove from storage
        const { data: row } = await supabase.from("visit_attachments")
            .select("file_path").eq("id", id).single();

        // Soft delete in DB
        const { error } = await supabase.from("visit_attachments")
            .update({ is_deleted: true }).eq("id", id);
        if (error) return { success: false, error: error.message };

        // Hard delete from storage (optional — comment out if you want recovery)
        if (row?.file_path) {
            await supabase.storage.from("clinic-assets").remove([row.file_path]);
        }

        revalidatePath(`/dashboard/visits/${vn}`);
        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
