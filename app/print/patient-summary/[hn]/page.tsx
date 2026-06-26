import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PrintTrigger from "./print-trigger";

export async function generateMetadata({ params }: { params: Promise<{ hn: string }> }): Promise<Metadata> {
    const { hn } = await params;
    return { title: `PATIENT-SUMMARY-${hn}` };
}

function age(dob: string | null): string {
    if (!dob) return "—";
    const birth = new Date(dob + "T00:00:00");
    const now = new Date();
    let y = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) y--;
    return `${y} ปี`;
}

const thDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function PatientSummaryPrintPage({ params }: { params: Promise<{ hn: string }> }) {
    const { hn } = await params;
    const supabase = await createClient();

    const [patientRes, allergiesRes, chronicRes, visitsRes, pkgsRes] = await Promise.all([
        supabase.from("patients").select("*").eq("hn", hn).single(),
        supabase.from("patient_allergies").select("*").eq("hn", hn).eq("is_active", true),
        supabase.from("patient_chronic_diseases").select("*").eq("hn", hn),
        supabase.from("visits").select("vn, visit_date, chief_complaint, icd10_primary, status")
            .eq("hn", hn).order("visit_date", { ascending: false }).limit(20),
        supabase.from("v_patient_packages_active")
            .select("package_name, total_sessions, used_sessions, remaining_sessions, expires_at, status")
            .eq("hn", hn).order("expires_at", { ascending: true }),
    ]);

    const patient = patientRes.data;
    if (!patient) notFound();

    const { data: clinic } = await supabase
        .from("tenants").select("clinic_name, phone, address_detail, license_number")
        .eq("id", patient.clinic_id).maybeSingle();

    // ICD names
    const visits = visitsRes.data || [];
    const icdCodes = Array.from(new Set(visits.map((v) => v.icd10_primary).filter(Boolean) as string[]));
    let icdMap: Record<string, string> = {};
    if (icdCodes.length > 0) {
        const { data: icd } = await supabase.from("icd10").select("code, description_th, description_en").in("code", icdCodes);
        icdMap = Object.fromEntries((icd || []).map((r) => [r.code, r.description_th || r.description_en || ""]));
    }

    const allergies = allergiesRes.data || [];
    const chronic = chronicRes.data || [];
    const packages = (pkgsRes.data || []).filter((p) => p.status === "active");
    const genderLabel: Record<string, string> = { M: "ชาย", F: "หญิง", other: "อื่นๆ" };

    return (
        <div className="bg-white min-h-screen p-6 text-black" style={{ fontFamily: "'Sarabun', sans-serif" }}>
            <style>{`@media print { .no-print { display: none !important; } @page { size: A4; margin: 14mm; } } .sec { break-inside: avoid; }`}</style>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}>
                <PrintTrigger />

                {/* Header */}
                <div className="flex items-start justify-between border-b-2 border-black pb-3 mb-4 sec">
                    <div>
                        <div className="text-[20px] font-black">{clinic?.clinic_name || "คลินิก"}</div>
                        {clinic?.address_detail && <div className="text-[12px] text-slate-600">{clinic.address_detail}</div>}
                        <div className="text-[12px] text-slate-600">
                            {clinic?.phone ? `โทร ${clinic.phone}` : ""}{clinic?.license_number ? ` · เลขที่ใบอนุญาต ${clinic.license_number}` : ""}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[16px] font-bold">สรุปข้อมูลผู้ป่วย</div>
                        <div className="text-[12px] text-slate-500">พิมพ์ {thDate(new Date().toISOString())}</div>
                    </div>
                </div>

                {/* Patient identity */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] mb-4 sec">
                    <div><b>ชื่อ-นามสกุล:</b> {patient.prefix} {patient.first_name} {patient.last_name}</div>
                    <div><b>HN:</b> <span className="font-mono">{patient.hn}</span></div>
                    <div><b>เพศ:</b> {genderLabel[patient.gender] || "—"} · <b>อายุ:</b> {age(patient.dob)}</div>
                    <div><b>วันเกิด:</b> {thDate(patient.dob)}</div>
                    <div><b>กรุ๊ปเลือด:</b> {patient.blood_group || "—"}</div>
                    <div><b>โทร:</b> {patient.phone || "—"}</div>
                </div>

                {/* Allergy */}
                <div className="sec mb-3">
                    <div className="text-[14px] font-bold bg-red-100 px-2 py-1 rounded">⚠️ ประวัติการแพ้</div>
                    <div className="text-[13px] mt-1 px-2">
                        {allergies.length === 0 && !patient.allergy_summary ? (
                            <span className="text-slate-500">ไม่มีประวัติแพ้</span>
                        ) : (
                            <>
                                {allergies.map((a) => (
                                    <span key={a.id} className="inline-block mr-2 font-semibold">
                                        • {a.allergen_name}{a.severity ? ` (${a.severity})` : ""}{a.reaction ? ` — ${a.reaction}` : ""}
                                    </span>
                                ))}
                                {patient.allergy_summary && <div className="mt-1">{patient.allergy_summary}</div>}
                            </>
                        )}
                    </div>
                </div>

                {/* Chronic */}
                <div className="sec mb-3">
                    <div className="text-[14px] font-bold bg-amber-100 px-2 py-1 rounded">โรคประจำตัว</div>
                    <div className="text-[13px] mt-1 px-2">
                        {chronic.length === 0 ? (
                            <span className="text-slate-500">ไม่มี</span>
                        ) : (
                            chronic.map((c) => (
                                <span key={c.id} className="inline-block mr-3">• {c.disease_name}{c.is_controlled ? " (คุมได้)" : ""}</span>
                            ))
                        )}
                    </div>
                </div>

                {/* Past History */}
                {patient.past_history && (
                    <div className="sec mb-3">
                        <div className="text-[14px] font-bold bg-slate-100 px-2 py-1 rounded">ประวัติเจ็บป่วยในอดีต (PH)</div>
                        <div className="text-[13px] mt-1 px-2 whitespace-pre-wrap">{patient.past_history}</div>
                    </div>
                )}

                {/* Active packages */}
                {packages.length > 0 && (
                    <div className="sec mb-3">
                        <div className="text-[14px] font-bold bg-violet-100 px-2 py-1 rounded">คอสบริการที่ใช้งานอยู่</div>
                        <table className="w-full text-[12px] mt-1">
                            <thead><tr className="text-left border-b border-slate-300">
                                <th className="py-1">คอส</th><th>ใช้ไป</th><th>คงเหลือ</th><th>หมดอายุ</th>
                            </tr></thead>
                            <tbody>
                                {packages.map((p, i) => (
                                    <tr key={i} className="border-b border-slate-100">
                                        <td className="py-1">{p.package_name}</td>
                                        <td>{p.used_sessions}/{p.total_sessions}</td>
                                        <td>{p.remaining_sessions}</td>
                                        <td>{thDate(p.expires_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Visit history */}
                <div className="sec mb-3">
                    <div className="text-[14px] font-bold bg-blue-100 px-2 py-1 rounded">ประวัติการมาคลินิก (ล่าสุด {visits.length} ครั้ง)</div>
                    {visits.length === 0 ? (
                        <div className="text-[13px] text-slate-500 px-2 mt-1">ยังไม่มีประวัติ</div>
                    ) : (
                        <table className="w-full text-[12px] mt-1">
                            <thead><tr className="text-left border-b border-slate-300">
                                <th className="py-1">วันที่</th><th>VN</th><th>อาการ/เหตุที่มา</th><th>ICD-10</th>
                            </tr></thead>
                            <tbody>
                                {visits.map((v) => (
                                    <tr key={v.vn} className="border-b border-slate-100">
                                        <td className="py-1 whitespace-nowrap">{thDate(v.visit_date)}</td>
                                        <td className="font-mono">{v.vn}</td>
                                        <td>{v.chief_complaint || "—"}</td>
                                        <td>{v.icd10_primary ? `${v.icd10_primary} ${icdMap[v.icd10_primary] || ""}` : "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="text-[10px] text-slate-400 mt-6 border-t pt-2">
                    เอกสารนี้เป็นข้อมูลลับทางการแพทย์ · จัดทำโดยระบบ Gonix · {clinic?.clinic_name || ""}
                </div>
            </div>
        </div>
    );
}
