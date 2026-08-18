import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";
import { LabReportSheet, dmyShort, dtBkk, type LabRow } from "@/app/print/lab-report-sheet";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ vn: string }> }): Promise<Metadata> {
    const { vn } = await params;
    return { title: `${vn}-LabReport` };
}

type Clinic = { clinic_name?: string; clinic_name_en?: string; company_name?: string; company_name_en?: string; address_detail?: string; phone?: string; license_number?: string; logo_url?: string } | null;

const FLAG_LABEL: Record<string, string> = { normal: "ปกติ (N)", high: "สูง (H)", low: "ต่ำ (L)", abnormal: "ผิดปกติ", positive: "Positive", negative: "Negative" };
const ABNORMAL = new Set(["high", "low", "abnormal", "positive"]);

function ageFromDob(dob: string | null | undefined): string {
    if (!dob) return "—";
    const b = new Date(dob);
    if (isNaN(b.getTime())) return "—";
    const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
    return `${a} Yrs`;
}
// (dmyShort/dtBkk ย้ายไป lab-report-sheet.tsx)

export default async function LabReportPrintPage({ params }: { params: Promise<{ vn: string }> }) {
    const { vn } = await params;
    const supabase = await createClient();

    const { data: visit } = await supabase.from("visits").select(`
        vn, visit_date, clinic_id,
        lab_no, lab_sample_type, lab_collected_at, lab_received_at, lab_comment, lab_report_meta,
        lab_reported_by_name, lab_reported_by_license, lab_reported_at,
        lab_approved_by_name, lab_approved_by_license, lab_approved_at,
        patients!inner(hn, prefix, first_name, last_name, first_name_en, last_name_en, gender, dob),
        doctor:staff!visits_doctor_id_fkey(license_number, profiles(full_name, full_name_en))
    `).eq("vn", vn).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = visit as any;
    if (!v) notFound();
    const patient = Array.isArray(v.patients) ? v.patients[0] : v.patients;

    const [{ data: clinic }, { data: orders }] = await Promise.all([
        supabase.from("tenants")
            .select("clinic_name, clinic_name_en, company_name, company_name_en, phone, address_detail, license_number, logo_url")
            .eq("id", v.clinic_id).maybeSingle(),
        supabase.from("lab_orders")
            .select("id, lab_name, lab_type, status, result_value, result_unit, normal_range, result_flag, result_note, sample_type")
            .eq("vn", vn).neq("lab_type", "package").order("created_at", { ascending: true }),
    ]);

    const enName = `${patient?.first_name_en || ""} ${patient?.last_name_en || ""}`.trim();
    const g = String(patient?.gender || "").toLowerCase();
    const isF = g === "female" || g === "f" || g === "หญิง";
    const isM = g === "male" || g === "m" || g === "ชาย";
    const title = isF ? "Ms." : isM ? "Mr." : "";
    const sexEN = isF ? "Female" : isM ? "Male" : (patient?.gender || "—");
    const patientName = enName
        ? `${title} ${enName}`.trim()
        : (`${patient?.prefix || ""}${patient?.first_name || ""} ${patient?.last_name || ""}`.trim() || "—");
    const clinicName = (clinic as Clinic)?.clinic_name_en || (clinic as Clinic)?.clinic_name || "—";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doctor: any = Array.isArray(v.doctor) ? v.doctor[0] : v.doctor;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dProf: any = doctor?.profiles ? (Array.isArray(doctor.profiles) ? doctor.profiles[0] : doctor.profiles) : null;
    const doctorName = dProf?.full_name_en || dProf?.full_name || "";
    const dLic = String(doctor?.license_number || "");
    const doctorLicense = dLic ? (/^\d/.test(dLic) ? `MD.${dLic}` : dLic) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const labs = (orders || []) as any[];

    // แยกกลุ่มตาม Sample Type (fallback → sample type ระดับ visit) — แต่ละกลุ่ม = คนละใบ
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupMap = new Map<string, any[]>();
    for (const t of labs) {
        const key = String(t.sample_type || v.lab_sample_type || "").trim();
        const arr = groupMap.get(key) || [];
        arr.push(t); groupMap.set(key, arr);
    }
    const groups = [...groupMap.entries()].map(([label, tests]) => ({ key: label || "_none", label, tests }));
    if (groups.length === 0) groups.push({ key: "_none", label: String(v.lab_sample_type || ""), tests: [] });

    const shared = { clinic, v, patient, patientName, sexEN, clinicName, doctorName, doctorLicense };

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>
            {groups.map((grp, idx) => (
                <ReportSheet key={grp.key} {...shared} labs={grp.tests} sampleType={grp.label} notLast={idx < groups.length - 1} />
            ))}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    @page { size: A4; margin: 14mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print-page { max-width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
                }
                @media screen { .print-page { background: white; box-shadow: 0 4px 20px rgba(0,0,0,0.1); margin: 20px auto; padding: 14mm; } body { background: #f1f5f9; } }
            `}</style>
        </>
    );
}

// ── ใบผล 1 หน้า (ต่อ 1 Sample Type) — ใช้ LabReportSheet กลาง ──
function ReportSheet({
    clinic, v, patient, patientName, sexEN, clinicName, doctorName, doctorLicense, labs, sampleType, notLast,
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clinic: any; v: any; patient: any;
    patientName: string; sexEN: string; clinicName: string;
    doctorName: string; doctorLicense: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    labs: any[]; sampleType: string; notLast: boolean;
}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m: any = (v.lab_report_meta && v.lab_report_meta[sampleType]) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: LabRow[] = labs.map((t: any) => {
        const abn = ABNORMAL.has((t.result_flag as string) || "");
        const base = t.result_value || (t.status === "resulted" ? "-" : "Pending");
        const val = t.result_value && t.result_unit ? `${base} ${t.result_unit}` : base;
        const flagLabel = t.result_flag ? (FLAG_LABEL[t.result_flag] || t.result_flag) : "";
        const vlc = String(t.result_value || "").toLowerCase();
        const showFlag = !!flagLabel && !vlc.includes(String(t.result_flag).toLowerCase()) && !vlc.includes(flagLabel.toLowerCase());
        return { name: t.lab_name, isExternal: t.lab_type === "lab_external", main: val, mainAbn: abn, suffix: showFlag ? flagLabel : "", note: t.result_note };
    });
    return (
        <LabReportSheet
            clinic={clinic} notLast={notLast}
            patientName={patientName} hn={patient?.hn || "—"} sex={sexEN} age={ageFromDob(patient?.dob)} clinicName={clinicName}
            labNo={(m.lab_no || v.lab_no) || "—"} sampleType={sampleType || "—"} requestedDate={dmyShort(v.visit_date)}
            collectedAt={dtBkk(m.collected_at || v.lab_collected_at)} receivedAt={dtBkk(m.received_at || v.lab_received_at)}
            rows={rows}
            commentText={m.comment ?? v.lab_comment ?? ""}
            footerNote="* ผลตรวจควรได้รับการแปลผลและคำปรึกษาจากบุคลากรทางการแพทย์"
            reported={{ name: m.reported_by_name ?? v.lab_reported_by_name, license: m.reported_by_license ?? v.lab_reported_by_license, at: m.reported_at ?? v.lab_reported_at }}
            approved={{ name: m.approved_by_name ?? v.lab_approved_by_name, license: m.approved_by_license ?? v.lab_approved_by_license, at: m.approved_at ?? v.lab_approved_at }}
            physician={{ name: doctorName, license: doctorLicense }}
        />
    );
}
