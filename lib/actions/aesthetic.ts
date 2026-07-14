"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { FaceChartData, AestheticRecords, AestheticPhoto, PastAestheticVisit } from "@/lib/aesthetic-types";

const ALLOWED_IMAGE_MIME = new Set([
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

async function getCtx() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles")
        .select("clinic_id, full_name").eq("id", user.id).single();
    if (!profile?.clinic_id) throw new Error("Profile/clinic not found");
    return { supabase, userId: user.id, clinicId: profile.clinic_id as string };
}

/** บันทึกลิงก์ Google Drive (รูปก่อน-หลังเพิ่มเติม) ของ visit */
export async function setVisitDriveUrl(vn: string, url: string) {
    try {
        const { supabase } = await getCtx();
        const trimmed = url.trim();
        // อนุญาตเฉพาะลิงก์ว่าง หรือ http(s) เท่านั้น
        if (trimmed && !/^https?:\/\//i.test(trimmed)) {
            return { success: false, error: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://" };
        }
        const { error } = await supabase
            .from("visits").update({ photo_drive_url: trimmed || null }).eq("vn", vn);
        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

/**
 * บันทึกความยินยอมให้ใช้ภาพ (review_consent) ของผู้ป่วย + ลง audit log ไว้ตรวจสอบ (PDPA)
 * ใช้เป็น gate การนำภาพก่อน-หลังออกจากระบบ
 */
export async function setReviewConsent(hn: string, consented: boolean) {
    try {
        const { supabase, userId } = await getCtx();
        const { data: cur } = await supabase
            .from("patients").select("review_consent").eq("hn", hn).maybeSingle();
        const oldVal = cur?.review_consent ? "ยินยอม" : "ไม่ยินยอม";

        const { error } = await supabase
            .from("patients").update({ review_consent: consented }).eq("hn", hn);
        if (error) return { success: false, error: error.message };

        // ลง audit เพื่อ traceability (ใคร/เมื่อไหร่)
        await supabase.from("patient_audit_logs").insert({
            hn,
            changed_by: userId,
            field_name: "ความยินยอมใช้ภาพ (review_consent)",
            old_value: oldVal,
            new_value: consented ? "ยินยอม" : "ไม่ยินยอม",
        });

        revalidatePath(`/dashboard/patients/${hn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

async function getCurrentRecords(vn: string): Promise<AestheticRecords> {
    const { supabase } = await getCtx();
    const { data } = await supabase.from("visits").select("aesthetic_records").eq("vn", vn).maybeSingle();
    return (data?.aesthetic_records as AestheticRecords) || {};
}

/** ประวัติหัตถการความงามย้อนหลังของผู้ป่วย (ไม่รวม visit ปัจจุบัน) — เฉพาะ visit ที่มีข้อมูล */
export async function getPastAestheticRecords(hn: string, excludeVn: string): Promise<PastAestheticVisit[]> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !hn) return [];
        const { data } = await supabase
            .from("visits")
            .select("vn, visit_date, doctor_id, aesthetic_records")
            .eq("hn", hn)
            .neq("vn", excludeVn)
            .not("aesthetic_records", "is", null)
            .order("visit_date", { ascending: false })
            .limit(20);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = (data || []) as any[];
        const kept = rows
            .map(r => ({ vn: r.vn as string, visit_date: r.visit_date as string, doctor_id: (r.doctor_id as string) || null, records: (r.aesthetic_records || {}) as AestheticRecords }))
            .filter(r => {
                const rec = r.records;
                return !!(
                    rec.treatment_notes?.trim()
                    || (rec.face_chart?.pins?.length || rec.face_chart?.strokes?.length)
                    || (rec.photos?.before?.length || rec.photos?.after?.length)
                );
            });

        // ดึงชื่อแพทย์ผู้ทำ (visits.doctor_id → staff → profiles.full_name)
        const docIds = Array.from(new Set(kept.map(r => r.doctor_id).filter((x): x is string => !!x)));
        const nameByStaff = new Map<string, string>();
        if (docIds.length) {
            const { data: staff } = await supabase.from("staff").select("id, profile_id").in("id", docIds);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const staffRows = (staff || []) as any[];
            const profIds = Array.from(new Set(staffRows.map(s => s.profile_id).filter(Boolean)));
            const profName = new Map<string, string>();
            if (profIds.length) {
                const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", profIds);
                for (const p of (profs || []) as { id: string; full_name: string }[]) profName.set(p.id, p.full_name);
            }
            for (const s of staffRows) nameByStaff.set(s.id, profName.get(s.profile_id) || "");
        }

        return kept.map(r => ({
            vn: r.vn,
            visit_date: r.visit_date,
            doctor_name: r.doctor_id ? (nameByStaff.get(r.doctor_id) || null) : null,
            records: r.records,
        }));
    } catch {
        return [];
    }
}

/** บันทึก face chart (strokes + pins) ลง visits.aesthetic_records */
export async function saveFaceChart(vn: string, faceChart: FaceChartData) {
    try {
        const { supabase } = await getCtx();
        const current = await getCurrentRecords(vn);
        const next: AestheticRecords = {
            ...current,
            face_chart: {
                ...faceChart,
                updated_at: new Date().toISOString(),
            },
        };
        const { error } = await supabase
            .from("visits")
            .update({ aesthetic_records: next })
            .eq("vn", vn);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/visits/${vn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** อัปโหลดรูป before/after */
export async function uploadAestheticPhoto(
    formData: FormData
) {
    try {
        const { supabase, clinicId } = await getCtx();
        const file = formData.get("file") as File | null;
        const vn = formData.get("vn") as string;
        const type = formData.get("type") as "before" | "after";
        const label = (formData.get("label") as string) || "";

        if (!file || file.size === 0) return { success: false, error: "ไม่พบไฟล์" };
        if (!vn) return { success: false, error: "ไม่พบ VN" };
        if (type !== "before" && type !== "after") return { success: false, error: "type ไม่ถูกต้อง" };
        if (file.size > MAX_BYTES) return { success: false, error: "ไฟล์ใหญ่เกิน 10MB" };
        if (!ALLOWED_IMAGE_MIME.has(file.type)) return { success: false, error: `รองรับเฉพาะรูปภาพ` };

        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const uid = crypto.randomUUID();
        const path = `${clinicId}/visits/${vn}/aesthetic/${type}/${uid}.${ext}`;

        const buffer = await file.arrayBuffer();
        const { error: uploadErr } = await supabase.storage
            .from("clinic-assets")
            .upload(path, buffer, { contentType: file.type, upsert: false });
        if (uploadErr) return { success: false, error: `Upload: ${uploadErr.message}` };

        const { data: urlData } = supabase.storage.from("clinic-assets").getPublicUrl(path);
        const url = urlData.publicUrl;

        const current = await getCurrentRecords(vn);
        const newPhoto: AestheticPhoto = {
            path,
            url,
            label: label || undefined,
            uploaded_at: new Date().toISOString(),
        };
        const photos = current.photos || {};
        const list = photos[type] || [];
        const next: AestheticRecords = {
            ...current,
            photos: {
                ...photos,
                [type]: [...list, newPhoto],
            },
        };
        const { error } = await supabase.from("visits").update({ aesthetic_records: next }).eq("vn", vn);
        if (error) {
            await supabase.storage.from("clinic-assets").remove([path]);
            return { success: false, error: error.message };
        }

        revalidatePath(`/dashboard/visits/${vn}`);
        return { success: true, photo: newPhoto };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** ลบรูป before/after */
export async function deleteAestheticPhoto(vn: string, type: "before" | "after", path: string) {
    try {
        const { supabase } = await getCtx();
        await supabase.storage.from("clinic-assets").remove([path]);

        const current = await getCurrentRecords(vn);
        const photos = current.photos || {};
        const list = (photos[type] || []).filter(p => p.path !== path);
        const next: AestheticRecords = {
            ...current,
            photos: { ...photos, [type]: list },
        };
        const { error } = await supabase.from("visits").update({ aesthetic_records: next }).eq("vn", vn);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/visits/${vn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** บันทึก treatment notes */
export async function saveTreatmentNotes(vn: string, notes: string) {
    try {
        const { supabase } = await getCtx();
        const current = await getCurrentRecords(vn);
        const next: AestheticRecords = { ...current, treatment_notes: notes };
        const { error } = await supabase.from("visits").update({ aesthetic_records: next }).eq("vn", vn);
        if (error) return { success: false, error: error.message };
        revalidatePath(`/dashboard/visits/${vn}`);
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}
