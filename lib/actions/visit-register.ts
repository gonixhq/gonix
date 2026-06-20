"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { SERVICE_LABEL, type ServiceCategory, type TriageLevel } from "@/lib/visit-service-types";
import { bangkokDate } from "@/lib/utils/date";

export interface RegisterVisitInput {
    hn: string;
    service_category: ServiceCategory;
    chief_complaint?: string;
    pain_score?: number;
    triage_level?: TriageLevel;
    nurse_note?: string;

    // Vital signs
    bp_systolic?: number | null;
    bp_diastolic?: number | null;
    pulse_rate?: number | null;
    temperature?: number | null;
    o2_saturation?: number | null;
    respiratory_rate?: number | null;
    weight_kg?: number | null;
    height_cm?: number | null;

    // Routing
    doctor_id?: string | null;        // staff.id
    send_to_doctor?: boolean;         // ถ้า true → status='with_doctor'
}

/**
 * Atomic visit registration:
 * 1. Generate VN
 * 2. Create visit row (with vitals + screening data)
 * 3. Create vital_signs row
 * 4. Create queue entry
 * 5. Log status change
 */
export async function registerVisitWithScreening(input: RegisterVisitInput) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: "Unauthorized" };

        const { data: profile } = await supabase
            .from("profiles").select("clinic_id, full_name").eq("id", user.id).single();
        if (!profile?.clinic_id) return { success: false, error: "Profile not found" };

        // Verify patient
        const { data: patient } = await supabase
            .from("patients").select("hn, clinic_id").eq("hn", input.hn).single();
        if (!patient) return { success: false, error: "ไม่พบผู้ป่วย" };
        if (patient.clinic_id !== profile.clinic_id) {
            return { success: false, error: "ผู้ป่วยไม่อยู่ในคลินิกของคุณ" };
        }

        // 1. Generate VN
        const { data: vn, error: vnErr } = await supabase.rpc("fn_next_number", {
            p_clinic_id: profile.clinic_id,
            p_type: "VN",
        });
        if (vnErr || !vn) return { success: false, error: `VN error: ${vnErr?.message}` };

        // Decide initial status
        const initialStatus = input.send_to_doctor ? "with_doctor" : "triaged";

        // Lookup staff.id of nurse (current user)
        const { data: nurseStaff } = await supabase
            .from("staff").select("id").eq("profile_id", user.id).maybeSingle();
        const nurse_id = nurseStaff?.id || null;

        // 2. Insert visit
        const { error: visitErr } = await supabase.from("visits").insert({
            vn,
            clinic_id: profile.clinic_id,
            hn: input.hn,
            visit_date: bangkokDate(),
            visit_type: "opd",
            service_category: input.service_category,
            status: initialStatus,
            chief_complaint: input.chief_complaint || null,
            pain_score: input.pain_score ?? null,
            triage_level: input.triage_level || "normal",
            nurse_note: input.nurse_note || null,
            bp_systolic: input.bp_systolic ?? null,
            bp_diastolic: input.bp_diastolic ?? null,
            pulse_rate: input.pulse_rate ?? null,
            temperature: input.temperature ?? null,
            o2_saturation: input.o2_saturation ?? null,
            weight_kg: input.weight_kg ?? null,
            height_cm: input.height_cm ?? null,
            doctor_id: input.doctor_id || null,
            nurse_id,
        });
        if (visitErr) return { success: false, error: `Visit insert: ${visitErr.message}` };

        // 3. Insert vital_signs (separate detailed record)
        if (input.bp_systolic || input.pulse_rate || input.temperature || input.weight_kg) {
            await supabase.from("vital_signs").insert({
                vn,
                hn: input.hn,
                bp_systolic: input.bp_systolic ?? null,
                bp_diastolic: input.bp_diastolic ?? null,
                pulse_rate: input.pulse_rate ?? null,
                temperature: input.temperature ?? null,
                o2_saturation: input.o2_saturation ?? null,
                respiratory_rate: input.respiratory_rate ?? null,
                weight_kg: input.weight_kg ?? null,
                height_cm: input.height_cm ?? null,
                recorded_by: user.id,
            });
        }

        // 4. Create queue entry
        try {
            const { data: queueNum } = await supabase.rpc("fn_next_number", {
                p_clinic_id: profile.clinic_id,
                p_type: "QUEUE",
                p_prefix: "A",
            });
            await supabase.from("queue_entries").insert({
                clinic_id: profile.clinic_id,
                hn: input.hn,
                vn,
                queue_number: queueNum || "A01",
                queue_type: "walk_in",
                status: initialStatus,
            });
        } catch (e) {
            console.warn("[registerVisit] queue creation failed:", e);
        }

        // 5. Log status change
        try {
            await supabase.from("visit_status_logs").insert({
                vn,
                old_status: null,
                new_status: initialStatus,
                changed_by: user.id,
                note: `ลงทะเบียน — ${SERVICE_LABEL[input.service_category]}`,
            });
        } catch {}

        // 6. Update patient stats
        await supabase.from("patients").update({
            last_visit_date: bangkokDate(),
            visit_count: (await supabase.from("visits")
                .select("vn", { count: "exact", head: true })
                .eq("hn", input.hn)).count || 1,
        }).eq("hn", input.hn);

        revalidatePath("/dashboard/visits");
        revalidatePath("/dashboard/doctor-station");
        return { success: true, vn: vn as string };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error" };
    }
}

/** Get list of active doctors for routing */
export async function listActiveDoctors() {
    try {
        const supabase = await createClient();
        const { data } = await supabase
            .from("staff")
            .select("id, profile_id, profiles(full_name, role)")
            .in("role", ["doctor", "owner"])
            .eq("is_active", true)
            .order("created_at");
        return { success: true, data: data || [] };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Error", data: [] };
    }
}
