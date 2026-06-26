"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bangkokDate } from "@/lib/utils/date";

export async function getPatients(search?: string) {
    const supabase = await createClient();

    let query = supabase
        .from("patients")
        .select("hn, first_name, last_name, phone, gender, dob, visit_count, last_visit_date, is_active")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50);

    if (search) {
        query = query.or(`hn.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function getPatientByHn(hn: string) {
    const supabase = await createClient();

    const [patientRes, allergiesRes, chronicRes, visitsRes] = await Promise.all([
        supabase.from("patients").select("*").eq("hn", hn).single(),
        supabase.from("patient_allergies").select("*").eq("hn", hn).eq("is_active", true),
        supabase.from("patient_chronic_diseases").select("*").eq("hn", hn),
        supabase.from("visits").select("vn, visit_date, status, chief_complaint, icd10_primary").eq("hn", hn).order("visit_date", { ascending: false }).limit(20),
    ]);

    return {
        patient: patientRes.data,
        allergies: allergiesRes.data || [],
        chronicDiseases: chronicRes.data || [],
        visits: visitsRes.data || [],
    };
}

export async function createPatient(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Get clinic_id from profile
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile) throw new Error("Profile not found");

    // Generate HN
    const { data: hn } = await supabase.rpc("fn_next_number", {
        p_clinic_id: profile.clinic_id,
        p_type: "HN",
    });

    const patient = {
        hn,
        clinic_id: profile.clinic_id,
        prefix: formData.get("prefix") as string,
        first_name: formData.get("first_name") as string,
        last_name: formData.get("last_name") as string,
        dob: formData.get("dob") as string || null,
        gender: formData.get("gender") as string || null,
        phone: formData.get("phone") as string || null,
        email: formData.get("email") as string || null,
        thai_id_card: formData.get("thai_id_card") as string || null,
        address_detail: formData.get("address_detail") as string || null,
        occupation: formData.get("occupation") as string || null,
        emergency_contact_name: formData.get("emergency_contact_name") as string || null,
        emergency_contact_phone: formData.get("emergency_contact_phone") as string || null,
        first_visit_date: bangkokDate(),
    };

    const { error } = await supabase.from("patients").insert(patient);
    if (error) throw error;

    revalidatePath("/dashboard/patients");
    return { hn };
}

export async function updatePatient(hn: string, updates: Record<string, unknown>) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase.from("profiles").select("clinic_id, full_name").eq("id", user.id).single();
    if (!profile) throw new Error("Profile not found");

    // Fetch current patient data to compute diff
    const { data: current } = await supabase.from("patients").select("*").eq("hn", hn).single();
    if (!current) throw new Error("Patient not found");

    // Update patient — `last_edited_by` is the correct column (migration 004)
    const { error } = await supabase.from("patients")
        .update({ ...updates, updated_at: new Date().toISOString(), last_edited_by: user.id })
        .eq("hn", hn);
    if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = (error as any).message || (error as any).details || "Update failed";
        throw new Error(msg);
    }

    // Build audit log entries for changed fields
    const fieldLabels: Record<string, string> = {
        first_name: "ชื่อ", last_name: "นามสกุล", prefix: "คำนำหน้า",
        dob: "วันเกิด", gender: "เพศ", phone: "โทรศัพท์", email: "อีเมล",
        address_detail: "ที่อยู่", subdistrict_code: "ตำบล/อำเภอ/จังหวัด",
        occupation: "อาชีพ", marital_status: "สถานภาพ",
        race: "เชื้อชาติ", nationality: "สัญชาติ",
        nhso_rights: "สิทธิ์การรักษา", blood_group: "กรุ๊ปเลือด",
        allergy_summary: "สรุปแพ้ยา", past_history: "ประวัติเจ็บป่วยในอดีต (PH)",
        disease_summary: "โรคประจำตัว", emergency_contact_name: "ผู้ติดต่อฉุกเฉิน",
        emergency_contact_phone: "เบอร์ผู้ติดต่อฉุกเฉิน",
        emergency_contact_relation: "ความสัมพันธ์ผู้ติดต่อฉุกเฉิน",
    };

    const auditEntries: object[] = [];
    for (const [key, newVal] of Object.entries(updates)) {
        const oldVal = current[key];
        if (String(oldVal ?? "") !== String(newVal ?? "")) {
            auditEntries.push({
                clinic_id: profile.clinic_id,
                hn,
                changed_by: user.id,
                field_name: fieldLabels[key] || key,
                old_value: oldVal != null ? String(oldVal) : "",
                new_value: newVal != null ? String(newVal) : "",
            });
        }
    }
    if (auditEntries.length > 0) {
        await supabase.from("patient_audit_logs").insert(auditEntries);
    }

    revalidatePath(`/dashboard/patients/${hn}`);
    revalidatePath("/dashboard/patients");
    return { success: true };
}

/**
 * Delete patient + all related data (cascade).
 * ⚠️ Owner role only. Used for cleanup of test/erroneous records.
 */
export async function deletePatient(hn: string, confirmText: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    // Check owner role
    const { data: profile } = await supabase
        .from("profiles").select("role, clinic_id, full_name").eq("id", user.id).single();
    if (!profile) return { success: false, error: "Profile not found" };
    if (profile.role !== "owner") {
        return { success: false, error: "ลบได้เฉพาะเจ้าของคลินิกเท่านั้น" };
    }

    // Double-confirm: must type the HN exactly
    if (confirmText !== hn) {
        return { success: false, error: "ข้อความยืนยันไม่ตรงกับ HN" };
    }

    // Verify patient belongs to this clinic
    const { data: patient } = await supabase
        .from("patients").select("hn, clinic_id, first_name, last_name").eq("hn", hn).single();
    if (!patient) return { success: false, error: "ไม่พบผู้ป่วย" };
    if (patient.clinic_id !== profile.clinic_id) {
        return { success: false, error: "ผู้ป่วยไม่ได้อยู่ในคลินิกของคุณ" };
    }

    try {
        // Delete visit-related (children first)
        const { data: visits } = await supabase.from("visits").select("vn").eq("hn", hn);
        const vns = (visits || []).map(v => v.vn);

        if (vns.length > 0) {
            await supabase.from("drug_orders").delete().in("vn", vns);
            await supabase.from("vital_signs").delete().in("vn", vns);
            await supabase.from("visit_status_logs").delete().in("vn", vns);
            await supabase.from("medical_certificates").delete().in("vn", vns);
            await supabase.from("referrals").delete().in("vn", vns);
        }

        await supabase.from("queue_entries").delete().eq("hn", hn);
        await supabase.from("appointments").delete().eq("hn", hn);
        await supabase.from("visits").delete().eq("hn", hn);

        // Patient-level data
        await supabase.from("patient_allergies").delete().eq("hn", hn);
        await supabase.from("patient_chronic_diseases").delete().eq("hn", hn);
        await supabase.from("patient_audit_logs").delete().eq("hn", hn);
        await supabase.from("loyalty_transactions").delete().eq("hn", hn);

        // Visit attachments (if table exists; ignore error if not)
        try { await supabase.from("visit_attachments").delete().eq("hn", hn); } catch {}

        // Reset pending_registrations link
        try {
            await supabase.from("pending_registrations")
                .delete().eq("converted_to_hn", hn);
        } catch {}

        // 🔒 บันทึก HN ลง deleted_hn_log ก่อนลบ (กัน HN ถูก reuse)
        try {
            await supabase.from("deleted_hn_log").insert({
                hn,
                clinic_id: profile.clinic_id,
                deleted_by: user.id,
                original_patient_name: `${patient.first_name} ${patient.last_name}`,
            });
        } catch (e) {
            // ถ้าตารางยังไม่ถูกสร้าง → warning แต่ไม่ block
            console.warn("[deletePatient] deleted_hn_log not available:", e);
        }

        // Finally delete patient
        const { error: delErr } = await supabase.from("patients").delete().eq("hn", hn);
        if (delErr) return { success: false, error: `Delete failed: ${delErr.message}` };

        // Log deletion to staff_activity_log (if exists)
        try {
            await supabase.from("staff_activity_log").insert({
                clinic_id: profile.clinic_id,
                actor_id: user.id,
                action: "patient_deleted",
                target_type: "patient",
                target_id: hn,
                detail: `ลบผู้ป่วย ${patient.first_name} ${patient.last_name} (${hn}) โดย ${profile.full_name}`,
            });
        } catch {}

        revalidatePath("/dashboard/patients");
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Delete failed" };
    }
}

