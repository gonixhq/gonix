import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";

export const dynamic = "force-dynamic";

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
function thaiDate(d?: string | null): string {
    if (!d) return "……………………";
    const dt = new Date(String(d).length <= 10 ? d + "T00:00:00" : d);
    if (isNaN(dt.getTime())) return "……………………";
    return `${dt.getDate()} ${THAI_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543}`;
}
function calcAge(dob?: string | null): string {
    if (!dob) return "…";
    const d = new Date(dob), n = new Date();
    let y = n.getFullYear() - d.getFullYear();
    if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) y--;
    return String(y);
}
function fmtId(id?: string | null): string {
    const s = (id || "").replace(/\D/g, "");
    if (s.length !== 13) return id || "……………………";
    return `${s[0]}-${s.slice(1, 5)}-${s.slice(5, 10)}-${s.slice(10, 12)}-${s[12]}`;
}
const Box = ({ on }: { on?: boolean }) => <span style={{ fontFamily: "sans-serif" }}>{on ? "☑" : "☐"}</span>;
const dots = (n = 40) => "…".repeat(n);

const CERT_SUB: Record<string, { th: string; en: string }> = {
    sick_leave: { th: "เพื่อการลาป่วย", en: "for Sick Leave" },
    fit_for_work: { th: "รับรองความพร้อมในการทำงาน", en: "Fitness for Work" },
    fitness: { th: "เพื่อการตรวจสุขภาพ", en: "Health Examination" },
    driving: { th: "สำหรับใบอนุญาตขับรถ", en: "for Driving License" },
    government: { th: "เพื่อสมัคร/ปฏิบัติราชการ", en: "for Government Service" },
    insurance: { th: "เพื่อการประกัน", en: "for Insurance" },
    other: { th: "", en: "" },
};

export default async function MedCertPrintPage({ params }: { params: Promise<{ vn: string }> }) {
    const { vn } = await params;
    const supabase = await createClient();

    const { data: cert } = await supabase.from("medical_certificates")
        .select("cert_type, doctor_opinion, rest_days, rest_from, rest_to, sign_mode, status, doctor_id, hn, issued_at")
        .eq("vn", vn).maybeSingle();
    if (!cert) return notFound();

    const { data: visit } = await supabase.from("visits").select("visit_date, icd10_primary, hn, clinic_id").eq("vn", vn).maybeSingle();
    const hn = (cert.hn as string) || (visit?.hn as string);
    const { data: patient } = await supabase.from("patients")
        .select("prefix, first_name, last_name, first_name_en, last_name_en, dob, gender, thai_id_card, address_detail, disease_summary, past_history")
        .eq("hn", hn).maybeSingle();
    const { data: vit } = await supabase.from("vital_signs").select("weight_kg, height_cm, bp_systolic, bp_diastolic, pulse_rate").eq("vn", vn).order("recorded_at", { ascending: false }).limit(1).maybeSingle();

    const clinicId = visit?.clinic_id as string | undefined;
    const { data: clinic } = clinicId
        ? await supabase.from("tenants").select("clinic_name, clinic_name_en, address_detail, phone, license_number").eq("id", clinicId).maybeSingle()
        : { data: null };

    let doctorName = "……………………", doctorNameEn = "", doctorLicense = "", signatureUrl: string | null = null;
    if (cert.doctor_id) {
        const { data: st } = await supabase.from("staff").select("license_number, signature_url, profile_id").eq("id", cert.doctor_id).maybeSingle();
        doctorLicense = (st?.license_number as string) || "";
        signatureUrl = (st?.signature_url as string) || null;
        if (st?.profile_id) {
            const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", st.profile_id).maybeSingle();
            doctorName = (prof?.full_name as string) || doctorName;
        }
    }
    let icdName = "";
    if (visit?.icd10_primary) {
        const { data: icd } = await supabase.from("icd10").select("description_th, description_en").eq("code", visit.icd10_primary).maybeSingle();
        icdName = (icd?.description_th as string) || (icd?.description_en as string) || "";
    }

    const type = (cert.cert_type as string) || "other";
    const sub = CERT_SUB[type] || CERT_SUB.other;
    const nameTh = `${patient?.prefix || ""}${patient?.first_name || ""} ${patient?.last_name || ""}`.trim() || dots(40);
    const nameEn = `${patient?.first_name_en || ""} ${patient?.last_name_en || ""}`.trim();
    const hasChronic = !!patient?.disease_summary;
    const showDigital = cert.sign_mode === "digital" && signatureUrl;
    const isDriving = type === "driving";
    const isSick = type === "sick_leave";

    const lbl = { fontWeight: 700 } as const;

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>

            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000", fontSize: "13px", lineHeight: 1.7 }}>
                {/* Masthead */}
                <div className="text-center pb-2" style={{ borderBottom: "1.5px solid #000" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/clinic-logo.png" alt="" className="h-14 w-14 object-contain mx-auto mb-1" />
                    <div style={{ fontSize: "17px", fontWeight: 900 }}>{clinic?.clinic_name || "—"}</div>
                    {clinic?.clinic_name_en && <div style={{ fontSize: "12px", fontWeight: 600 }}>{clinic.clinic_name_en}</div>}
                    {clinic?.address_detail && <div style={{ fontSize: "11px" }}>{clinic.address_detail}</div>}
                    <div style={{ fontSize: "11px" }}>
                        {clinic?.phone && <>โทร./Tel. {clinic.phone}</>}
                        {clinic?.license_number && <> · เลขที่ใบอนุญาต/License No. {clinic.license_number}</>}
                    </div>
                </div>

                <div className="text-center mt-3">
                    <div style={{ fontSize: "20px", fontWeight: 900 }}>ใบรับรองแพทย์</div>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>MEDICAL CERTIFICATE</div>
                    {sub.th && <div style={{ fontSize: "12px" }}>({sub.th} / {sub.en})</div>}
                </div>
                <div className="flex justify-end gap-6 mt-1" style={{ fontSize: "11px" }}>
                    <span>เล่มที่/Book No. …………</span><span>เลขที่/No. …………</span>
                </div>

                {/* ── Part 1 ── */}
                <div className="mt-2 px-2 py-0.5" style={{ background: "#eee", fontWeight: 700 }}>ส่วนที่ 1 — สำหรับผู้ขอรับใบรับรอง / Part 1 — For the applicant</div>
                <div className="mt-1.5 space-y-0.5">
                    <div><span style={lbl}>ข้าพเจ้า / I, Mr./Mrs./Miss</span> {nameTh}{nameEn && ` (${nameEn})`} <span style={lbl}>อายุ/Age</span> {calcAge(patient?.dob)} <span style={lbl}>ปี/years</span></div>
                    <div><span style={lbl}>ที่อยู่ / Address</span> {patient?.address_detail || dots(70)}</div>
                    <div><span style={lbl}>เลขบัตรประชาชน / ID No.</span> {fmtId(patient?.thai_id_card)}</div>
                    <div className="mt-1" style={lbl}>ประวัติสุขภาพ / Health history:</div>
                    <div className="pl-4">1. โรคประจำตัว / Underlying disease <Box on={!hasChronic} /> ไม่มี/No <Box on={hasChronic} /> มี/Yes {hasChronic ? `(${patient?.disease_summary})` : `(ระบุ/specify) ${dots(30)}`}</div>
                    <div className="pl-4">2. อุบัติเหตุและการผ่าตัด / Accident &amp; surgery <Box /> ไม่มี/No <Box /> มี/Yes (ระบุ/specify) {dots(28)}</div>
                    <div className="pl-4">3. เคยเข้ารับการรักษาในโรงพยาบาล / Hospitalization <Box /> ไม่มี/No <Box /> มี/Yes (ระบุ/specify) {dots(22)}</div>
                    {isDriving && <div className="pl-4">4. โรคลมชัก / Epilepsy <Box /> ไม่มี/No <Box /> มี/Yes (ระบุ/specify) {dots(30)}</div>}
                    <div className="pl-4">{isDriving ? "5." : "4."} ประวัติอื่นที่สำคัญ / Other significant history {patient?.past_history || dots(40)}</div>
                    <div className="text-right mt-1">ลงชื่อ/Signed {dots(20)} วันที่/Date {dots(14)}</div>
                </div>

                {/* ── Part 2 ── */}
                <div className="mt-2 px-2 py-0.5" style={{ background: "#eee", fontWeight: 700 }}>ส่วนที่ 2 — สำหรับแพทย์ / Part 2 — For the physician</div>
                <div className="mt-1.5 space-y-0.5">
                    <div><span style={lbl}>สถานที่ตรวจ / Place of examination</span> {clinic?.clinic_name || dots(40)} <span style={lbl}>วันที่/Date</span> {thaiDate(visit?.visit_date)}</div>
                    <div><span style={lbl}>ข้าพเจ้า นพ./พญ. / I, Dr.</span> {doctorName}{doctorNameEn && ` (${doctorNameEn})`} <span style={lbl}>ใบอนุญาตเลขที่ / License No.</span> {doctorLicense || "…………"}</div>
                    <div><span style={lbl}>สถานพยาบาล / Medical facility</span> {clinic?.clinic_name || dots(30)} <span style={lbl}>ที่อยู่/Address</span> {clinic?.address_detail || dots(30)}</div>
                    <div><span style={lbl}>ได้ตรวจร่างกาย / have examined</span> {nameTh} <span style={lbl}>เมื่อวันที่ / on</span> {thaiDate(visit?.visit_date)}</div>
                    <div>
                        <span style={lbl}>น้ำหนัก/Weight</span> {vit?.weight_kg ?? "……"} กก./kg
                        <span style={lbl}> ส่วนสูง/Height</span> {vit?.height_cm ?? "……"} ซม./cm
                        <span style={lbl}> ความดัน/BP</span> {vit?.bp_systolic ? `${vit.bp_systolic}/${vit.bp_diastolic}` : "……"} มม.ปรอท/mmHg
                        <span style={lbl}> ชีพจร/Pulse</span> {vit?.pulse_rate ?? "……"} /นาที/min
                    </div>
                    <div><span style={lbl}>สภาพร่างกายทั่วไป / General condition</span> <Box on /> ปกติ/Normal <Box /> ผิดปกติ/Abnormal (ระบุ/specify) {dots(24)}</div>

                    {(type === "fitness" || type === "driving" || type === "government" || type === "fit_for_work") && (
                        <div className="mt-1" style={{ textIndent: "1.5em" }}>
                            ขอรับรองว่าบุคคลดังกล่าวไม่เป็นผู้มีร่างกายทุพพลภาพจนไม่สามารถปฏิบัติหน้าที่ได้ ไม่ปรากฏอาการของโรคจิตหรือจิตฟั่นเฟือนหรือปัญญาอ่อน ไม่ปรากฏอาการของการติดยาเสพติดให้โทษและโรคพิษสุราเรื้อรัง และไม่ปรากฏอาการของโรค (1) โรคเรื้อนในระยะติดต่อ (2) วัณโรคในระยะอันตราย (3) โรคเท้าช้างในระยะที่ปรากฏอาการเป็นที่รังเกียจแก่สังคม
                            <div style={{ fontSize: "11px", color: "#333" }}>I hereby certify that the said person is not disabled, shows no symptoms of psychosis or mental deficiency, drug addiction or chronic alcoholism, and no signs of: (1) contagious leprosy (2) dangerous tuberculosis (3) elephantiasis.</div>
                        </div>
                    )}

                    {isSick && (cert.rest_days || cert.rest_from) && (
                        <div className="mt-1">
                            <span style={lbl}>เห็นสมควรให้หยุดพักรักษาตัว / Should rest for</span> {cert.rest_days || "…"} วัน/days
                            {cert.rest_from && <> <span style={lbl}>ตั้งแต่/from</span> {thaiDate(cert.rest_from)} <span style={lbl}>ถึง/to</span> {thaiDate(cert.rest_to)}</>}
                        </div>
                    )}
                    {visit?.icd10_primary && <div><span style={lbl}>การวินิจฉัย / Diagnosis (ICD-10)</span> {visit.icd10_primary}{icdName && ` — ${icdName}`}</div>}
                    <div><span style={lbl}>สรุปความเห็นและข้อแนะนำของแพทย์ / Physician&apos;s opinion</span> {cert.doctor_opinion || dots(50)}</div>
                </div>

                {/* Signature */}
                <div className="mt-8 flex justify-end">
                    <div className="text-center" style={{ minWidth: "270px" }}>
                        {showDigital
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={signatureUrl!} alt="" className="h-14 object-contain mx-auto mb-1" />
                            : <div className="h-14" />}
                        <div style={{ borderBottom: "1px dotted #000" }} className="mb-1" />
                        <div>( {doctorName} )</div>
                        <div style={{ fontSize: "11px" }}>แพทย์ผู้ตรวจร่างกาย / Examining physician{doctorLicense && ` · ว./Lic. ${doctorLicense}`}</div>
                        <div style={{ fontSize: "11px" }}>วันที่/Date {thaiDate(cert.issued_at ? String(cert.issued_at).slice(0, 10) : visit?.visit_date)}</div>
                    </div>
                </div>

                <div className="mt-4" style={{ fontSize: "10px", color: "#444", borderTop: "1px solid #ccc", paddingTop: "4px" }}>
                    หมายเหตุ/Remarks: (1) ต้องเป็นแพทย์ผู้ได้ขึ้นทะเบียนรับใบอนุญาตประกอบวิชาชีพเวชกรรม (2) ใบรับรองนี้ใช้ได้ 1 เดือนนับแต่วันที่ตรวจ / valid for 1 month from examination date
                    {isDriving && <> (3) ใช้สำหรับใบอนุญาตขับรถและผู้ประจำรถ / for driving license</>}
                    <div className="mt-1">แบบฟอร์มอ้างอิงตามมติคณะกรรมการแพทยสภา · ออกโดยระบบ Gonix · พิมพ์ {new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</div>
                </div>

                {cert.status !== "approved" && <div className="mt-2 text-center no-print" style={{ fontSize: "11px", color: "#e11d48", fontStyle: "italic" }}>* ฉบับร่าง — ควร Approve ก่อนพิมพ์ใช้จริง</div>}
            </div>

            <style>{`
                @media print { .no-print { display:none !important; } @page { size: A4; margin: 12mm; } body { background:white !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } .print-page { max-width:100% !important; margin:0 !important; padding:0 !important; box-shadow:none !important; } }
                @media screen { .print-page { background:white; box-shadow:0 4px 20px rgba(0,0,0,0.1); margin:20px auto; padding:14mm; } body { background:#f1f5f9; } }
            `}</style>
        </>
    );
}
