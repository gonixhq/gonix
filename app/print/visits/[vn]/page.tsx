import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PrintTrigger from "./print-trigger";
import { FaceChartRender } from "./face-chart-render";
import type { FaceChartData } from "@/lib/aesthetic-types";
import { ClinicMasthead } from "@/app/print/clinic-masthead";

export const dynamic = "force-dynamic";

export default async function VisitPrintPage({
    params,
}: {
    params: Promise<{ vn: string }>;
}) {
    const { vn } = await params;
    const supabase = await createClient();

    const [visitRes, drugOrdersRes, vitalRes, certRes, referRes, apptRes, pkgUsageRes, invItemsRes] = await Promise.all([
        supabase.from("visits").select(`
            vn, visit_date, visit_time, status, chief_complaint,
            soap_s, soap_o, soap_a, soap_p,
            icd10_primary, icd10_secondary,
            weight_kg, height_cm, bp_systolic, bp_diastolic, pulse_rate, temperature, o2_saturation,
            completed_at, clinic_id, visit_type, service_category, aesthetic_records,
            patients!inner(hn, prefix, first_name, last_name, dob, gender, phone, allergy_summary, blood_group, nhso_rights, thai_id_card, disease_summary, address_detail, subdistrict_code, occupation, race, nationality, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, patient_chronic_diseases(disease_name)),
            doctor:staff!visits_doctor_id_fkey(profiles(full_name)),
            nurse:staff!visits_nurse_id_fkey(profiles(full_name))
        `).eq("vn", vn).single(),
        supabase.from("drug_orders").select(`
            id, qty, unit, sig_text,
            inventory(item_name, generic_name, strength, dosage_form)
        `).eq("vn", vn),
        supabase.from("vital_signs").select("*").eq("vn", vn).order("recorded_at", { ascending: false }).limit(1),
        supabase.from("medical_certificates").select("*").eq("vn", vn),
        supabase.from("referrals").select("*").eq("vn", vn),
        supabase.from("appointments").select("appt_date, appt_start, note").eq("source_vn", vn),
        supabase.from("package_usages")
            .select("session_no, used_at, note, patient_packages(package_name, total_sessions)")
            .eq("visit_vn", vn)
            .order("used_at", { ascending: true }),
        supabase.from("invoice_items")
            .select("item_type, item_name, qty, unit_price, line_total, inv_id, invoice_headers!inner(vn)")
            .eq("invoice_headers.vn", vn),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visit = visitRes.data as any;
    if (!visit) notFound();

    const patient = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients;
    const doctor = Array.isArray(visit.doctor) ? visit.doctor[0] : visit.doctor;
    const nurse = Array.isArray(visit.nurse) ? visit.nurse[0] : visit.nurse;
    const doctorName = doctor?.profiles?.full_name || doctor?.profiles?.[0]?.full_name;
    const nurseName = nurse?.profiles?.full_name || nurse?.profiles?.[0]?.full_name;

    const { data: clinic } = await supabase
        .from("tenants").select("clinic_name, clinic_name_en, company_name, company_name_en, phone, address_detail, license_number")
        .eq("id", visit.clinic_id).maybeSingle();

    let fullAddress = patient?.address_detail || "";
    if (patient?.subdistrict_code) {
        const { data: addr } = await supabase.from("address_ref")
            .select("subdistrict_name, district_name, province_name, postal_code")
            .eq("subdistrict_code", patient.subdistrict_code).maybeSingle();
        if (addr) {
            const sub = String(addr.subdistrict_name || "").replace(/^(ตำบล|แขวง)\s*/, "").trim();
            const dist = String(addr.district_name || "").replace(/^(อำเภอ|เขต)\s*/, "").trim();
            const prov = String(addr.province_name || "").replace(/^จังหวัด\s*/, "").trim();
            const bkk = prov.includes("กรุงเทพ");
            fullAddress = `${fullAddress ? fullAddress + " " : ""}${bkk ? "แขวง" : "ต."}${sub} ${bkk ? "เขต" : "อ."}${dist} ${bkk ? "" : "จ."}${prov} ${addr.postal_code || ""}`.trim();
        }
    }

    const icdCodes = new Set<string>();
    if (visit.icd10_primary) icdCodes.add(visit.icd10_primary);
    if (Array.isArray(visit.icd10_secondary)) visit.icd10_secondary.forEach((c: string) => c && icdCodes.add(c));
    let icdMap: Record<string, string> = {};
    if (icdCodes.size > 0) {
        const { data: icdRows } = await supabase.from("icd10")
            .select("code, description_th, description_en")
            .in("code", Array.from(icdCodes));
        icdMap = Object.fromEntries(
            (icdRows || []).map(r => [r.code, r.description_th || r.description_en || ""])
        );
    }

    const drugs = drugOrdersRes.data || [];
    const vs = vitalRes.data?.[0] || {
        bp_systolic: visit.bp_systolic, bp_diastolic: visit.bp_diastolic,
        pulse_rate: visit.pulse_rate, temperature: visit.temperature,
        weight_kg: visit.weight_kg, height_cm: visit.height_cm,
        o2_saturation: visit.o2_saturation,
    };
    const certificates = certRes.data || [];
    const referrals = referRes.data || [];
    const followUps = apptRes.data || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packageUsages = (pkgUsageRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoiceItems = (invItemsRes.data || []) as any[];

    const isAesthetic = visit.service_category === "aesthetic";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aestheticRecords = (visit.aesthetic_records || {}) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const facePins = (aestheticRecords?.face_chart?.pins || []) as any[];
    const treatmentNotes = aestheticRecords?.treatment_notes || "";
    const beforePhotos = aestheticRecords?.photos?.before || [];
    const afterPhotos = aestheticRecords?.photos?.after || [];
    // Procedures + packages from invoice (สำหรับ aesthetic — แสดงรายการที่ทำ)
    const procedureItems = invoiceItems.filter(
        i => ["procedure", "package", "service", "supply"].includes(i.item_type)
    );

    const chronicList: string[] = Array.isArray(patient?.patient_chronic_diseases)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? patient.patient_chronic_diseases.map((c: any) => c.disease_name).filter(Boolean)
        : [];
    const chronicText = chronicList.length > 0 ? chronicList.join(", ") : patient?.disease_summary || "";

    function age(dob: string | null): string {
        if (!dob) return "—";
        const d = new Date(dob);
        const now = new Date();
        let y = now.getFullYear() - d.getFullYear();
        if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) y--;
        return `${y} ปี`;
    }

    const nhsoLabel: Record<string, string> = {
        none: "ไม่ระบุ", uc: "บัตรทอง (UC)", sso: "ประกันสังคม",
        gov_officer: "ข้าราชการ", private_ins: "ประกันเอกชน", self_pay: "ชำระเงินเอง",
    };
    const genderLabel: Record<string, string> = { M: "ชาย", F: "หญิง", other: "อื่นๆ" };

    const bmi = vs?.weight_kg && vs?.height_cm
        ? (Number(vs.weight_kg) / Math.pow(Number(vs.height_cm) / 100, 2)).toFixed(1) : null;

    const visitTypeLabel: Record<string, string> = {
        opd: "ตรวจรักษาทั่วไป", home: "เยี่ยมบ้าน", aesthetic: "หัตถการความงาม",
    };

    const startTime = visit.visit_time ? visit.visit_time.slice(0, 5) : "";
    // completed_at เก็บเป็น UTC (new Date().toISOString()) → บวก 7 ชม. เป็นเวลาไทย
    // ไม่พึ่ง Intl timeZone (บาง runtime ไม่มีข้อมูล tz เลย fallback เป็น UTC เงียบๆ)
    const endTime = visit.completed_at
        ? new Date(new Date(visit.completed_at).getTime() + 7 * 3600 * 1000).toISOString().slice(11, 16)
        : "";

    const hasFollowUp = followUps.length > 0;
    const referHospital = referrals[0]?.destination_hospital || "";
    const patientName = `${patient?.prefix || ""} ${patient?.first_name || ""} ${patient?.last_name || ""}`.trim();

    // ── Section ใช้ร่วมทั้ง general/aesthetic ──
    const patientSection = (
        <ColumnSection title="ผู้ป่วย" subtitle="Patient">
            <div className="text-[18px] font-bold leading-tight mb-1.5">{patientName}</div>
            <div className="text-[13px] space-y-1">
                <Row label="เพศ / อายุ" value={`${genderLabel[patient?.gender] || "—"} · ${age(patient?.dob)}`} />
                <Row label="เลขบัตรประชาชน" value={patient?.thai_id_card || "—"} mono />
                <Row label="โทรศัพท์" value={patient?.phone || "—"} mono />
            </div>
        </ColumnSection>
    );

    const vitalsSection = (
        <ColumnSection title="สัญญาณชีพ" subtitle="Vital Signs">
            <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-[13px]">
                <VitalRow label="BP" value={vs?.bp_systolic && vs?.bp_diastolic ? `${vs.bp_systolic}/${vs.bp_diastolic}` : "—"} unit="mmHg" />
                <VitalRow label="Pulse" value={vs?.pulse_rate ?? "—"} unit="/min" />
                <VitalRow label="Temp" value={vs?.temperature ?? "—"} unit="°C" />
                <VitalRow label="O₂Sat" value={vs?.o2_saturation ?? "—"} unit="%" />
                <VitalRow label="BW" value={vs?.weight_kg ?? "—"} unit="kg" />
                <VitalRow label="Height" value={vs?.height_cm ?? "—"} unit="cm" />
            </div>
        </ColumnSection>
    );

    const ccSection = (
        <ColumnSection title={isAesthetic ? "เหตุผลที่มา" : "อาการสำคัญ"} subtitle={isAesthetic ? "Reason for Visit" : "Chief Complaint"}>
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
                {visit.chief_complaint || "—"}
            </p>
        </ColumnSection>
    );

    const diagnosisSection = (
        <ColumnSection title="การวินิจฉัย" subtitle="Diagnosis">
            <div className="space-y-1 text-[13px]">
                {visit.icd10_primary && (
                    <div>
                        <span className="font-bold">หลัก </span>
                        <span className="font-mono font-bold">{visit.icd10_primary}</span>
                        {icdMap[visit.icd10_primary] && <span> — {icdMap[visit.icd10_primary]}</span>}
                    </div>
                )}
                {Array.isArray(visit.icd10_secondary) && visit.icd10_secondary.map((code: string) => (
                    <div key={code}>
                        <span className="font-semibold text-slate-600">รอง </span>
                        <span className="font-mono font-bold">{code}</span>
                        {icdMap[code] && <span> — {icdMap[code]}</span>}
                    </div>
                ))}
                {!visit.icd10_primary && (!visit.icd10_secondary || visit.icd10_secondary.length === 0) && (
                    <span className="text-slate-400 italic">—</span>
                )}
            </div>
        </ColumnSection>
    );

    const peSection = (
        <ColumnSection title="การตรวจร่างกาย" subtitle="Physical Exam">
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
                {visit.soap_o || visit.soap_s || "—"}
            </p>
        </ColumnSection>
    );

    const followReferSection = (
        <ColumnSection title="นัดหมาย / ส่งต่อ" subtitle="Follow-up & Refer">
            <div className="text-[13px] space-y-1">
                {visit.soap_p && (
                    <p className="leading-relaxed whitespace-pre-wrap mb-1.5">{visit.soap_p}</p>
                )}
                {certificates.length > 0 && (
                    <div>
                        <span className="font-semibold">ใบรับรองแพทย์ </span>
                        {certificates.map((c, i) => (
                            <span key={i}>
                                {i > 0 && ", "}
                                {c.cert_type === "sick_leave" ? "ใบลาป่วย" : c.cert_type === "fit_for_work" ? "ใบรับรองความปกติ" : c.cert_type}
                                {c.rest_days && ` (พัก ${c.rest_days} วัน)`}
                            </span>
                        ))}
                    </div>
                )}
                {referHospital && (
                    <div>
                        <span className="font-semibold">ส่งต่อ </span>→ {referHospital}
                    </div>
                )}
                <div>
                    <span className="font-semibold">นัดติดตาม </span>
                    {hasFollowUp && followUps[0]
                        ? `${new Date(followUps[0].appt_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}${followUps[0].appt_start ? " " + followUps[0].appt_start.slice(0, 5) + " น." : ""}`
                        : "ไม่นัด"}
                </div>
            </div>
        </ColumnSection>
    );

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}>
                <PrintTrigger />
            </div>

            <div className="print-page" style={{
                maxWidth: "210mm",
                fontFamily: "'Noto Sans Thai', sans-serif",
                color: "#000",
            }}>
                {/* ── หัวกระดาษ (component กลาง ใช้ร่วมกับใบรับรองแพทย์) ── */}
                <ClinicMasthead clinic={clinic} />
                <div className="text-center mt-1" style={{ fontSize: "16px", fontWeight: 900 }}>
                    {isAesthetic ? "บันทึกหัตถการความงาม" : "บันทึกการตรวจรักษา"}
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}> · {isAesthetic ? "Aesthetic Record" : "Medical Record · OPD"}</span>
                </div>

                {/* ── ข้อมูลผู้ป่วย / เวลา ── */}
                <div className="flex items-center justify-between py-1.5 px-1 text-[12px]" style={{ borderBottom: "1px solid #000" }}>
                    <div className="flex items-center gap-4">
                        <span className="text-[14px]"><strong>HN</strong> <span className="font-mono font-bold">{patient?.hn}</span></span>
                        <span className="text-slate-400">·</span>
                        <span><strong>VN</strong> <span className="font-mono">{vn}</span></span>
                        <span className="text-slate-400">·</span>
                        <span><strong>วันที่</strong> {new Date(visit.visit_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-700">
                        <span>เวลา {startTime || "—"} น.</span>
                        <span className="text-slate-400">·</span>
                        <span className="italic">{isAesthetic ? "หัตถการความงาม" : (visitTypeLabel[visit.visit_type] || visit.visit_type)}</span>
                    </div>
                </div>

                {/* ════════ MAIN CONTENT ════════ */}
                {isAesthetic ? (
                    /* ── ความงาม: 2 คอลัมน์ (ผู้ป่วย + แผนผังใบหน้า ซ้าย · คลินิก ขวา) ── */
                    <div className="grid grid-cols-2 mt-3" style={{ gap: 0 }}>
                        <div className="pr-5" style={{ borderRight: "1px solid #cbd5e1" }}>
                            {patientSection}
                            {(facePins.length > 0 || (aestheticRecords?.face_chart?.strokes?.length || 0) > 0) && (
                                <ColumnSection title="แผนผังใบหน้า" subtitle="Face Chart">
                                    <FaceChartRender data={aestheticRecords.face_chart as FaceChartData} width={300} />
                                </ColumnSection>
                            )}
                        </div>

                        <div className="pl-5">
                            {vitalsSection}
                            {ccSection}
                            <ColumnSection title="หัตถการที่ทำ" subtitle="Procedures Done">
                                {procedureItems.length === 0 && packageUsages.length === 0 ? (
                                    <span className="text-slate-400 italic text-[13px]">—</span>
                                ) : (
                                    <div className="space-y-1 text-[13px]">
                                        {procedureItems.map((it, i) => (
                                            <div key={i} className="flex items-baseline gap-2">
                                                <span className="text-slate-500 shrink-0">•</span>
                                                <span className="flex-1">{it.item_name}</span>
                                                {Number(it.qty) > 1 && (
                                                    <span className="text-[11px] text-slate-600 font-mono">×{it.qty}</span>
                                                )}
                                            </div>
                                        ))}
                                        {packageUsages.map((u, i) => {
                                            const pp = Array.isArray(u.patient_packages) ? u.patient_packages[0] : u.patient_packages;
                                            return (
                                                <div key={`pkg-${i}`} className="flex items-baseline gap-2">
                                                    <span className="text-slate-500 shrink-0"></span>
                                                    <span className="flex-1">
                                                        <span className="font-semibold">{pp?.package_name || "คอส"}</span>
                                                        <span className="text-slate-600"> — ตัดครั้งที่ {u.session_no}/{pp?.total_sessions || "?"}</span>
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </ColumnSection>

                            <ColumnSection title="บันทึกหัตถการ" subtitle="Treatment Notes">
                                <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
                                    {treatmentNotes || <span className="text-slate-400 italic">—</span>}
                                </p>
                            </ColumnSection>

                            {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
                                <ColumnSection title="รูปก่อน-หลัง" subtitle="Before / After Photos">
                                    <div className="flex items-center gap-4 text-[13px]">
                                        <span><strong>ก่อน</strong> {beforePhotos.length} รูป</span>
                                        <span className="text-slate-300">·</span>
                                        <span><strong>หลัง</strong> {afterPhotos.length} รูป</span>
                                        <span className="text-[11px] text-slate-500 italic">(ดูในระบบ)</span>
                                    </div>
                                </ColumnSection>
                            )}

                            <ColumnSection title="นัดหมาย" subtitle="Follow-up">
                                <div className="text-[13px]">
                                    {hasFollowUp && followUps[0]
                                        ? <span><strong>{new Date(followUps[0].appt_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}</strong>{followUps[0].appt_start ? " " + followUps[0].appt_start.slice(0, 5) + " น." : ""}{followUps[0].note ? ` — ${followUps[0].note}` : ""}</span>
                                        : <span className="text-slate-400 italic">ไม่นัด</span>}
                                </div>
                            </ColumnSection>
                        </div>
                    </div>
                ) : (
                    /* ── ทั่วไป: แถบบน (ผู้ป่วย | สัญญาณชีพ) + เนื้อหาเต็มความกว้าง ── */
                    <>
                        <div className="grid grid-cols-2 mt-3" style={{ gap: 0 }}>
                            <div className="pr-5" style={{ borderRight: "1px solid #cbd5e1" }}>
                                {patientSection}
                            </div>
                            <div className="pl-5">
                                {vitalsSection}
                            </div>
                        </div>

                        <div className="mt-2 pt-2" style={{ borderTop: "1px solid #000" }}>
                            {ccSection}
                            {diagnosisSection}
                            {peSection}
                            {followReferSection}
                        </div>
                    </>
                )}

                {/* ════════ PRESCRIPTIONS — FULL WIDTH (ไม่แสดงสำหรับ aesthetic) ════════ */}
                {!isAesthetic && drugs.length > 0 && (
                    <div className="mt-2">
                        <div style={{ borderTop: "2px solid #000", borderBottom: "1px solid #000" }} className="py-1 flex items-baseline justify-between">
                            <h2 className="text-[13px] font-black tracking-wider">รายการยา / Prescriptions</h2>
                            <span className="text-[10px] italic text-slate-600">{drugs.length} รายการ</span>
                        </div>
                        <div>
                            {drugs.map((d, i) => {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const item = Array.isArray((d as any).inventory) ? (d as any).inventory[0] : (d as any).inventory;
                                return (
                                    <div key={d.id} className="flex items-start gap-3 py-1 border-b border-dotted border-slate-300">
                                        <span className="text-[12px] font-bold w-5 shrink-0 tabular-nums">{i + 1}.</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-semibold leading-snug">
                                                {item?.item_name} <span className="font-normal text-slate-700">{item?.strength}</span>
                                            </div>
                                            {d.sig_text && <div className="text-[11px] text-slate-600 italic leading-snug">{d.sig_text}</div>}
                                        </div>
                                        <div className="text-[13px] font-bold whitespace-nowrap tabular-nums">
                                            {d.qty} {d.unit}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ════════ CLOSING TIME ════════ */}
                <div className="mt-1.5 pt-1 flex justify-end items-baseline gap-2 text-[11px]" style={{ borderTop: "1px solid #000" }}>
                    <span className="italic text-slate-600">เวลาสิ้นสุดบริการ</span>
                    <span className="font-bold tabular-nums">{endTime || "—"} น.</span>
                </div>

                {/* ════════ SIGNATURES ════════ */}
                <div className="mt-3 grid grid-cols-2 gap-12 text-[12px]">
                    <div className="text-center">
                        <div style={{ borderBottom: "1px solid #000" }} className="h-5 mb-1" />
                        <div className="font-semibold">{nurseName ? `( ${nurseName} )` : "(........................................)"}</div>
                        <div className="text-[10px] italic text-slate-600">ผู้บันทึก / พยาบาล</div>
                    </div>
                    <div className="text-center">
                        <div style={{ borderBottom: "1px solid #000" }} className="h-5 mb-1" />
                        <div className="font-semibold">{doctorName ? `( ${withDocTitle(doctorName)} )` : "(........................................)"}</div>
                        <div className="text-[10px] italic text-slate-600">แพทย์ผู้ตรวจรักษา</div>
                    </div>
                </div>
            </div>

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    @page { size: A4; margin: 8mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print-page { max-width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; page-break-inside: avoid; }
                }
                @media screen {
                    .print-page {
                        background: white;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                        margin: 20px auto;
                        padding: 10mm;
                    }
                    body { background: #f1f5f9; }
                }
            `}</style>
        </>
    );
}

/* ═══════════════ Components ═══════════════ */

// เติมคำนำหน้า "นพ." ให้ชื่อแพทย์ (เว้นถ้ามีคำนำหน้าแล้ว)
const DOC_TITLE_RE = /^(นพ|พญ|นายแพทย์|แพทย์หญิง|ทพ|ภก|ดร|นาย|นาง|นางสาว|น\.ส|ผศ|รศ|ศ)/;
function withDocTitle(name?: string | null): string {
    const n = (name || "").trim();
    if (!n) return "";
    return DOC_TITLE_RE.test(n) ? n : "นพ. " + n;
}

function ColumnSection({
    title, subtitle, children,
}: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <div className="mb-1.5">
            <div className="flex items-baseline gap-2 pb-0.5 mb-1" style={{ borderBottom: "1.5px solid #000" }}>
                <h3 className="text-[12px] font-black tracking-wider text-black uppercase" style={{ letterSpacing: "0.05em" }}>
                    {title}
                </h3>
                <span className="text-[10px] italic text-slate-500">{subtitle}</span>
            </div>
            <div>{children}</div>
        </div>
    );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-baseline gap-2 leading-snug">
            <span className="text-slate-600 shrink-0">{label}</span>
            <span className={`flex-1 ${mono ? "font-mono font-semibold" : "font-medium"}`}>{value}</span>
        </div>
    );
}

function VitalRow({ label, value, unit }: { label: string; value: string | number; unit: string }) {
    return (
        <div className="flex items-baseline gap-1.5">
            <span className="text-slate-600 w-12 shrink-0 text-[11px] italic">{label}</span>
            <span className="font-bold tabular-nums text-[14px]">{value}</span>
            {unit && <span className="text-[10px] text-slate-500">{unit}</span>}
        </div>
    );
}
