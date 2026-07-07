import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import VisitDetailClient from "./visit-detail-client";

export default async function VisitDetailPage({
    params,
}: {
    params: Promise<{ vn: string }>;
}) {
    const { vn } = await params;
    const supabase = await createClient();

    const visitRes = await supabase.from("visits").select(`
      *,
      patients!inner(hn, prefix, first_name, last_name, phone, gender, dob, allergy_summary, disease_summary, past_history, blood_group, nhso_rights, thai_id_card, occupation, marital_status, race, nationality, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, first_visit_date, patient_chronic_diseases(disease_name), patient_allergies(allergen_name, severity, is_active))
    `).eq("vn", vn).single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visit = visitRes.data as any;
    if (!visit) notFound();
    const patient = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients;

    const [drugOrdersRes, vitalSignsRes, statusLogsRes, medCertRes, appointmentRes, referralRes, historyRes, patientPackagesRes] = await Promise.all([
        supabase.from("drug_orders").select(`
      id, qty, unit, sig_text, cost_per_unit, total_cost,
      inventory!inner(item_name, generic_name, strength, dosage_form)
    `).eq("vn", vn),
        supabase.from("vital_signs").select("*").eq("vn", vn).order("recorded_at", { ascending: false }).limit(1),
        supabase.from("visit_status_logs").select("*").eq("vn", vn).order("changed_at", { ascending: true }),
        // Graceful: may error if table not created yet
        supabase.from("medical_certificates").select("cert_type, rest_days, doctor_opinion, rest_from, rest_to, status, sign_mode").eq("vn", vn).maybeSingle(),
        supabase.from("appointments").select("appt_date, appt_start, note").eq("source_vn", vn).limit(3),
        supabase.from("referrals").select("destination_hospital, referral_reason").eq("vn", vn).limit(3),
        supabase.from("visits").select(`
            vn, visit_date, visit_time, status, chief_complaint, soap_o, soap_p,
            icd10_primary, service_category, aesthetic_records,
            weight_kg, height_cm, bp_systolic, bp_diastolic, pulse_rate, temperature,
            doctor:staff!visits_doctor_id_fkey(profiles(full_name)),
            drug_orders(qty, unit, sig_text, total_cost, inventory(item_name, strength))
        `).eq("hn", patient.hn).neq("vn", vn).order("visit_date", { ascending: false }).limit(10),
        supabase.from("patient_packages").select("id", { count: "exact", head: true }).eq("hn", patient.hn),
    ]);

    const patientHasPackages = (patientPackagesRes.count || 0) > 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drugs = (drugOrdersRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vitals = (vitalSignsRes.data?.[0] || null) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statusLogs = (statusLogsRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const medCert = (medCertRes.data || null) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appointments = (appointmentRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const referrals = (referralRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pastVisits = (historyRes.data || []) as any[];

    // Parse lab orders from soap_a (temporary storage)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let labOrders: any[] = [];
    if (visit.soap_a) {
        try { labOrders = JSON.parse(visit.soap_a); } catch { labOrders = []; }
    }

    // Fetch ICD-10 description if diagnosis exists
    let icd10Name: string | null = null;
    if (visit.icd10_primary) {
        const { data: icd } = await supabase
            .from("icd10")
            .select("description_th, description_en")
            .eq("code", visit.icd10_primary)
            .maybeSingle();
        if (icd) icd10Name = icd.description_th || icd.description_en || null;
    }

    return (
        <VisitDetailClient
            visit={visit}
            patient={patient}
            drugs={drugs}
            vitals={vitals}
            statusLogs={statusLogs}
            medCert={medCert}
            appointments={appointments}
            referrals={referrals}
            pastVisits={pastVisits}
            labOrders={labOrders}
            icd10Name={icd10Name}
            vn={vn}
            patientHasPackages={patientHasPackages}
        />
    );
}
