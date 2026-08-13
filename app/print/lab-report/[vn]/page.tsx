import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";
import { ClinicMasthead } from "@/app/print/clinic-masthead";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ vn: string }> }): Promise<Metadata> {
    const { vn } = await params;
    return { title: `${vn}-LabReport` };
}

type Clinic = { clinic_name?: string; clinic_name_en?: string; company_name?: string; company_name_en?: string; address_detail?: string; phone?: string; license_number?: string; logo_url?: string } | null;

const SEX_LABEL: Record<string, string> = { male: "ชาย", female: "หญิง", ชาย: "ชาย", หญิง: "หญิง", other: "อื่นๆ" };
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
function dmyShort(d: string | null | undefined): string {
    if (!d) return "—";
    const [y, m, dd] = String(d).slice(0, 10).split("-");
    return `${dd}/${m}/${(y || "").slice(2)}`;
}
function dtBkk(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
    const z = (n: number) => String(n).padStart(2, "0");
    return `${z(d.getUTCDate())}/${z(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}`;
}

export default async function LabReportPrintPage({ params }: { params: Promise<{ vn: string }> }) {
    const { vn } = await params;
    const supabase = await createClient();

    const { data: visit } = await supabase.from("visits").select(`
        vn, visit_date, clinic_id,
        lab_no, lab_sample_type, lab_collected_at, lab_received_at, lab_comment,
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
            .select("id, lab_name, lab_type, status, result_value, result_unit, normal_range, result_flag, result_note")
            .eq("vn", vn).order("created_at", { ascending: true }),
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

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>
            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000" }}>
                <ClinicMasthead clinic={clinic} />
                <div className="flex justify-end items-center gap-2.5 mt-1.5">
                    <div className="text-[8.5px] text-slate-500 text-right leading-tight">
                        <div>ตรวจโดยแล็บภายนอก · Tested at</div>
                        <div className="font-semibold text-slate-700">CMF Medical Laboratory</div>
                    </div>
                    <img src="/accredit-ilac.png" alt="ilac-MRA" style={{ height: "34px", width: "auto" }} />
                    <img src="/accredit-dmsc.png" alt="DMSc QA" style={{ height: "34px", width: "auto" }} />
                    <div className="text-[9px] leading-tight text-slate-700 text-right">
                        <div className="font-bold">ISO 15189</div>
                        <div>No. 4374/68</div>
                    </div>
                </div>

                <div className="text-center mt-3" style={{ fontSize: "18px", fontWeight: 900 }}>
                    Laboratory Report<span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}> · ใบรายงานผลตรวจ</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-[12px]" style={{ borderTop: "1px solid #cbd5e1", borderBottom: "1px solid #cbd5e1", padding: "10px 2px" }}>
                    <RptField label="Patient Name" value={patientName} />
                    <RptField label="HN" value={patient?.hn || "—"} mono />
                    <RptField label="Sex" value={sexEN} />
                    <RptField label="Age" value={ageFromDob(patient?.dob)} />
                    <RptField label="Clinic / Hosp" value={clinicName} />
                    <RptField label="LAB No." value={v.lab_no || "—"} mono />
                    <RptField label="Sample Type" value={v.lab_sample_type || "—"} />
                    <RptField label="Requested Date" value={dmyShort(v.visit_date)} />
                    <RptField label="Collected Date/Time" value={dtBkk(v.lab_collected_at)} />
                    <RptField label="Received Date/Time" value={dtBkk(v.lab_received_at)} />
                </div>

                <div className="mt-4">
                    <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "2px solid #0891b2", background: "#ecfeff" }} className="text-left">
                                <th className="py-2 px-2 font-black" style={{ width: "55%" }}>Lab Test <span className="text-[10px] font-semibold text-slate-500">รายการตรวจ</span></th>
                                <th className="py-2 px-2 font-black">Result <span className="text-[10px] font-semibold text-slate-500">ผล</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {labs.map((t, i) => {
                                const abn = ABNORMAL.has((t.result_flag as string) || "");
                                const base = t.result_value || (t.status === "resulted" ? "-" : "Pending");
                                const val = t.result_value && t.result_unit ? `${base} ${t.result_unit}` : base;
                                const flagLabel = t.result_flag ? (FLAG_LABEL[t.result_flag] || t.result_flag) : "";
                                const vlc = String(t.result_value || "").toLowerCase();
                                const showFlag = !!flagLabel && !vlc.includes(String(t.result_flag).toLowerCase()) && !vlc.includes(flagLabel.toLowerCase());
                                return (
                                    <tr key={t.id} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 ? "#f8fafc" : "#fff" }}>
                                        <td className="py-2 px-2 font-semibold align-top">{t.lab_type === "lab_external" ? "*" : ""}{t.lab_name}</td>
                                        <td className="py-2 px-2 align-top">
                                            <span style={{ fontWeight: 700, color: abn ? "#be123c" : "#0f172a" }}>{val}</span>
                                            {showFlag ? <span className="text-[10px] font-bold" style={{ color: abn ? "#be123c" : "#64748b" }}> · {flagLabel}</span> : null}
                                            {t.result_note ? <div className="text-slate-500 text-[10.5px] mt-0.5">{t.result_note}</div> : null}
                                        </td>
                                    </tr>
                                );
                            })}
                            {labs.length === 0 && <tr><td colSpan={2} className="py-3 px-2 text-slate-400 italic">ยังไม่มีรายการ Lab</td></tr>}
                        </tbody>
                    </table>

                    <p className="mt-2 text-[10.5px] text-slate-600">(*) เทสที่มีเครื่องหมาย * ส่งตรวจที่ CMF Medical Laboratory ซึ่งได้รับการรับรอง ISO 15189 (Accreditation No. 4374/68)</p>

                    <div className="mt-3 text-[11.5px] flex gap-2">
                        <span className="font-bold shrink-0">Comment :</span>
                        <span className="flex-1" style={{ borderBottom: "1px dotted #94a3b8", minHeight: "16px" }}>{v.lab_comment || ""}</span>
                    </div>
                    <p className="mt-3 text-[10.5px] text-slate-500 italic leading-relaxed">
                        * ผลตรวจควรได้รับการแปลผลและคำปรึกษาจากบุคลากรทางการแพทย์
                    </p>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-16 text-[12px]">
                    <SignBlock role="Reported By · ผู้รายงานผล" name={v.lab_reported_by_name} license={v.lab_reported_by_license} at={v.lab_reported_at} />
                    <SignBlock role="Approved By · ผู้ตรวจสอบ" name={v.lab_approved_by_name} license={v.lab_approved_by_license} at={v.lab_approved_at} />
                </div>
                <div className="mt-9 flex justify-center text-[12px]">
                    <div style={{ width: "56%" }}>
                        <SignBlock role="แพทย์ผู้ตรวจ · Examining Physician" name={doctorName} license={doctorLicense} at={null} />
                    </div>
                </div>
            </div>
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

function RptField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-baseline gap-1.5">
            <span className="text-slate-500 shrink-0">{label} :</span>
            <span className={`flex-1 font-semibold ${mono ? "font-mono" : ""}`} style={{ borderBottom: "1px dotted #cbd5e1" }}>{value}</span>
        </div>
    );
}

function SignBlock({ role, name, license, at }: { role: string; name: string | null; license: string | null; at: string | null }) {
    return (
        <div className="text-center">
            <div style={{ borderBottom: "1px solid #000" }} className="h-9 mb-1 flex items-end justify-center pb-1">
                <span className="text-[12px] font-semibold">{name || ""}{license ? `  ${license}` : ""}</span>
            </div>
            <div className="text-[10px] italic text-slate-600">{role}</div>
            {at ? <div className="text-[10px] text-slate-500 mt-0.5">{dtBkk(at)}</div> : null}
        </div>
    );
}
