"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { bangkokDate } from "@/lib/utils/date";

export async function getTodayVisits(statusFilter?: string) {
    const supabase = await createClient();
    const today = bangkokDate();

    let query = supabase
        .from("visits")
        .select(`
      vn, visit_date, visit_time, status, chief_complaint, visit_type,
      patients!inner(hn, first_name, last_name, phone, gender, dob),
      doctor:staff!visits_doctor_id_fkey(id, profile_id, profiles!inner(full_name))
    `)
        .eq("visit_date", today)
        .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function getVisitByVn(vn: string) {
    const supabase = await createClient();

    const [visitRes, drugOrdersRes, vitalSignsRes, statusLogsRes] = await Promise.all([
        supabase.from("visits").select(`
      *,
      patients!inner(hn, first_name, last_name, phone, gender, dob, allergy_summary, blood_group),
      doctor:staff!visits_doctor_id_fkey(id, profiles!inner(full_name)),
      nurse:staff!visits_nurse_id_fkey(id, profiles!inner(full_name))
    `).eq("vn", vn).single(),
        supabase.from("drug_orders").select(`
      id, qty, unit, sig_text, cost_per_unit, total_cost,
      inventory!inner(item_name, generic_name, strength, dosage_form)
    `).eq("vn", vn),
        supabase.from("vital_signs").select("*").eq("vn", vn).order("recorded_at", { ascending: false }).limit(1),
        supabase.from("visit_status_logs").select("*").eq("vn", vn).order("changed_at", { ascending: true }),
    ]);

    return {
        visit: visitRes.data,
        drugOrders: drugOrdersRes.data || [],
        vitalSigns: vitalSignsRes.data?.[0] || null,
        statusLogs: statusLogsRes.data || [],
    };
}

/**
 * Full visit summary — used by Patient detail page's expandable visit cards.
 * Returns the complete clinical record of one visit (CC, SOAP, vitals, Rx,
 * cert, referral, follow-up appt).
 */
export async function getVisitSummary(vn: string) {
    const supabase = await createClient();

    const [visitRes, drugOrdersRes, vitalRes, certRes, referRes, apptRes, attachRes] = await Promise.all([
        supabase.from("visits").select(`
            vn, visit_date, visit_time, status, visit_type, chief_complaint,
            soap_s, soap_o, soap_a, soap_p,
            icd10_primary, icd10_secondary,
            weight_kg, height_cm, bp_systolic, bp_diastolic, pulse_rate, temperature,
            completed_at, created_at,
            doctor:staff!visits_doctor_id_fkey(profiles(full_name)),
            nurse:staff!visits_nurse_id_fkey(profiles(full_name))
        `).eq("vn", vn).single(),
        supabase.from("drug_orders").select(`
            id, qty, unit, sig_text, cost_per_unit, total_cost,
            inventory(item_name, generic_name, strength, dosage_form)
        `).eq("vn", vn),
        supabase.from("vital_signs").select("*").eq("vn", vn).order("recorded_at", { ascending: false }).limit(1),
        supabase.from("medical_certificates").select("*").eq("vn", vn).order("issued_at", { ascending: false }),
        supabase.from("referrals").select("*").eq("vn", vn).order("created_at", { ascending: false }),
        supabase.from("appointments").select("id, appt_date, appt_start, appt_end, appt_type, note, status").eq("source_vn", vn),
        supabase.from("visit_attachments").select("id, category, file_name, file_path, file_size, mime_type, note, uploaded_at").eq("vn", vn).eq("is_deleted", false).order("uploaded_at", { ascending: false }),
    ]);

    // Look up ICD-10 descriptions (primary + secondary array)
    const visit = visitRes.data;
    const icdCodes = new Set<string>();
    if (visit?.icd10_primary) icdCodes.add(visit.icd10_primary);
    if (Array.isArray(visit?.icd10_secondary)) {
        visit.icd10_secondary.forEach((c: string) => c && icdCodes.add(c));
    }
    let icdMap: Record<string, { code: string; description_th: string | null; description_en: string | null }> = {};
    if (icdCodes.size > 0) {
        const { data: icdRows } = await supabase
            .from("icd10")
            .select("code, description_th, description_en")
            .in("code", Array.from(icdCodes));
        icdMap = Object.fromEntries((icdRows || []).map(r => [r.code, r]));
    }

    return {
        visit,
        drugOrders: drugOrdersRes.data || [],
        vitalSigns: vitalRes.data?.[0] || null,
        certificates: certRes.data || [],
        referrals: referRes.data || [],
        followUps: apptRes.data || [],
        attachments: attachRes.data || [],
        icdMap,
    };
}

export async function createVisit(hn: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user.id).single();
    if (!profile) throw new Error("Profile not found");

    // Generate VN
    const { data: vn } = await supabase.rpc("fn_next_number", {
        p_clinic_id: profile.clinic_id,
        p_type: "VN",
    });

    const visit = {
        vn,
        clinic_id: profile.clinic_id,
        hn,
        visit_date: bangkokDate(),
        visit_type: "opd",
        status: "waiting",
    };

    const { error } = await supabase.from("visits").insert(visit);
    if (error) throw error;

    // Create queue entry
    const { data: queueNum } = await supabase.rpc("fn_next_number", {
        p_clinic_id: profile.clinic_id,
        p_type: "QUEUE",
        p_prefix: "A",
    });

    await supabase.from("queue_entries").insert({
        clinic_id: profile.clinic_id,
        hn,
        vn,
        queue_number: queueNum || "A0001",
        queue_type: "walk_in",
        status: "waiting",
    });

    // Log status change
    await supabase.from("visit_status_logs").insert({
        vn,
        old_status: null,
        new_status: "waiting",
    });

    revalidatePath("/dashboard/visits");
    revalidatePath("/dashboard");
    return { vn };
}

export async function updateVisitStatus(vn: string, newStatus: string) {
    const supabase = await createClient();

    // Get current status
    const { data: visit } = await supabase.from("visits").select("status").eq("vn", vn).single();
    if (!visit) throw new Error("Visit not found");

    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === "completed") {
        updates.completed_at = new Date().toISOString();
    }

    const { error } = await supabase.from("visits").update(updates).eq("vn", vn);
    if (error) throw error;

    // Log status change
    await supabase.from("visit_status_logs").insert({
        vn,
        old_status: visit.status,
        new_status: newStatus,
    });

    // Update queue entry
    const queueStatusMap: Record<string, string> = {
        waiting: "waiting",
        triaged: "with_nurse",
        with_doctor: "with_doctor",
        with_nurse: "with_nurse",
        waiting_medicine: "waiting_medicine",
        waiting_payment: "waiting_payment",
        completed: "done",
        cancelled: "cancelled",
    };

    await supabase
        .from("queue_entries")
        .update({
            status: queueStatusMap[newStatus] || "waiting",
            ...(newStatus === "completed" ? { done_at: new Date().toISOString() } : {}),
        })
        .eq("vn", vn);

    revalidatePath(`/dashboard/visits/${vn}`);
    revalidatePath("/dashboard/visits");
    revalidatePath("/dashboard");
}

export async function updateVisitSoap(vn: string, soap: {
    chief_complaint?: string;
    soap_s?: string;
    soap_o?: string;
    soap_a?: string;
    soap_p?: string;
    icd10_primary?: string;
}) {
    const supabase = await createClient();
    const { error } = await supabase.from("visits").update(soap).eq("vn", vn);
    if (error) throw error;
    revalidatePath(`/dashboard/visits/${vn}`);
}

/**
 * Cancel a visit (and its queue entry) with an optional reason.
 * - Blocks cancellation if already completed/cancelled.
 * - Logs the status change.
 */
export async function cancelVisit(vn: string, reason?: string) {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const { data: visit } = await supabase.from("visits")
        .select("status").eq("vn", vn).single();
    if (!visit) return { success: false, error: "Visit not found" };

    if (visit.status === "completed") {
        return { success: false, error: "Visit นี้เสร็จสิ้นแล้ว ไม่สามารถยกเลิกได้" };
    }
    if (visit.status === "cancelled") {
        return { success: false, error: "Visit นี้ถูกยกเลิกอยู่แล้ว" };
    }

    const cleanReason = reason?.trim() || null;

    // Update visit
    const { error: updErr } = await supabase.from("visits").update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
    }).eq("vn", vn);
    if (updErr) return { success: false, error: updErr.message };

    // Update queue entry
    await supabase.from("queue_entries").update({
        status: "cancelled",
        done_at: new Date().toISOString(),
    }).eq("vn", vn);

    // Log status change
    await supabase.from("visit_status_logs").insert({
        vn,
        old_status: visit.status,
        new_status: "cancelled",
        changed_by: user.id,
        note: cleanReason,
    });

    revalidatePath(`/dashboard/visits/${vn}`);
    revalidatePath("/dashboard/visits");
    revalidatePath("/dashboard/screening");
    revalidatePath("/dashboard/doctor-station");
    revalidatePath("/dashboard");
    return { success: true };
}
