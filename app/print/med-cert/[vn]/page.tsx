import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";

export const dynamic = "force-dynamic";

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtDate(d: string | null | undefined, lang: "th" | "en"): string {
    if (!d) return "……………………";
    const dt = new Date(String(d).length <= 10 ? d + "T00:00:00" : d);
    if (isNaN(dt.getTime())) return "……………………";
    return lang === "th"
        ? `${dt.getDate()} ${THAI_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543}`
        : `${dt.getDate()} ${EN_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CertPage({ lang, d }: { lang: "th" | "en"; d: any }) {
    const th = lang === "th";
    const lbl = { fontWeight: 700 } as const;
    const name = th ? d.nameTh : (d.nameEn || d.nameTh);
    const sub = (CERT_SUB[d.type] || CERT_SUB.other)[lang];
    const withCertStmt = d.type === "fitness" || d.type === "driving" || d.type === "government" || d.type === "fit_for_work";

    return (
        <div className="cert-sheet" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000", fontSize: "13px", lineHeight: 1.75 }}>
            {/* Masthead */}
            <div className="text-center pb-2" style={{ borderBottom: "1.5px solid #000" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/clinic-logo.png" alt="" className="h-14 w-14 object-contain mx-auto mb-1" />
                <div style={{ fontSize: "17px", fontWeight: 900 }}>{(th ? d.clinic?.clinic_name : (d.clinic?.clinic_name_en || d.clinic?.clinic_name)) || "—"}</div>
                {d.clinic?.address_detail && <div style={{ fontSize: "11px" }}>{d.clinic.address_detail}</div>}
                <div style={{ fontSize: "11px" }}>
                    {d.clinic?.phone && <>{th ? "โทร." : "Tel."} {d.clinic.phone}</>}
                    {d.clinic?.license_number && <> · {th ? "เลขที่ใบอนุญาต" : "License No."} {d.clinic.license_number}</>}
                </div>
            </div>

            <div className="text-center mt-3">
                <div style={{ fontSize: "20px", fontWeight: 900 }}>{th ? "ใบรับรองแพทย์" : "MEDICAL CERTIFICATE"}</div>
                {sub && <div style={{ fontSize: "12px" }}>({sub})</div>}
            </div>
            <div className="flex justify-end gap-6 mt-1" style={{ fontSize: "11px" }}>
                <span>{th ? "เล่มที่" : "Book No."} …………</span><span>{th ? "เลขที่" : "No."} …………</span>
            </div>

            {/* Part 1 */}
            <div className="mt-2 px-2 py-0.5" style={{ background: "#eee", fontWeight: 700 }}>{th ? "ส่วนที่ 1 — สำหรับผู้ขอรับใบรับรอง" : "Part 1 — For the applicant"}</div>
            <div className="mt-1.5 space-y-0.5">
                <div><span style={lbl}>{th ? "ข้าพเจ้า" : "I, Mr./Mrs./Miss"}</span> {name} <span style={lbl}>{th ? "อายุ" : "Age"}</span> {calcAge(d.patient?.dob)} {th ? "ปี" : "years"}</div>
                <div><span style={lbl}>{th ? "ที่อยู่" : "Address"}</span> {d.patient?.address_detail || dots(70)}</div>
                <div><span style={lbl}>{th ? "เลขบัตรประชาชน" : "ID No."}</span> {fmtId(d.patient?.thai_id_card)}</div>
                <div className="mt-1" style={lbl}>{th ? "ประวัติสุขภาพ:" : "Health history:"}</div>
                <div className="pl-4">1. {th ? "โรคประจำตัว" : "Underlying disease"} <Box on={!d.hasChronic} /> {th ? "ไม่มี" : "No"} <Box on={d.hasChronic} /> {th ? "มี" : "Yes"} {d.hasChronic ? `(${d.patient?.disease_summary})` : dots(28)}</div>
                <div className="pl-4">2. {th ? "อุบัติเหตุและการผ่าตัด" : "Accident & surgery"} <Box /> {th ? "ไม่มี" : "No"} <Box /> {th ? "มี" : "Yes"} {dots(26)}</div>
                <div className="pl-4">3. {th ? "เคยเข้ารับการรักษาในโรงพยาบาล" : "History of hospitalization"} <Box /> {th ? "ไม่มี" : "No"} <Box /> {th ? "มี" : "Yes"} {dots(20)}</div>
                {d.isDriving && <div className="pl-4">4. {th ? "โรคลมชัก" : "Epilepsy"} <Box /> {th ? "ไม่มี" : "No"} <Box /> {th ? "มี" : "Yes"} {dots(28)}</div>}
                <div className="pl-4">{d.isDriving ? "5." : "4."} {th ? "ประวัติอื่นที่สำคัญ" : "Other significant history"} {d.patient?.past_history || dots(36)}</div>
                <div className="text-right mt-1">{th ? "ลงชื่อ" : "Signed"} {dots(20)} {th ? "วันที่" : "Date"} {dots(14)}</div>
            </div>

            {/* Part 2 */}
            <div className="mt-2 px-2 py-0.5" style={{ background: "#eee", fontWeight: 700 }}>{th ? "ส่วนที่ 2 — สำหรับแพทย์" : "Part 2 — For the physician"}</div>
            <div className="mt-1.5 space-y-0.5">
                <div><span style={lbl}>{th ? "สถานที่ตรวจ" : "Place of examination"}</span> {d.clinic?.clinic_name || dots(40)} <span style={lbl}>{th ? "วันที่" : "Date"}</span> {fmtDate(d.visit?.visit_date, lang)}</div>
                <div><span style={lbl}>{th ? "ข้าพเจ้า นพ./พญ." : "I, Dr."}</span> {th ? d.doctorName : (d.doctorNameEn || d.doctorName)} <span style={lbl}>{th ? "ใบอนุญาตเลขที่" : "License No."}</span> {d.doctorLicense || "…………"}</div>
                <div><span style={lbl}>{th ? "สถานพยาบาล" : "Medical facility"}</span> {d.clinic?.clinic_name || dots(30)} <span style={lbl}>{th ? "ที่อยู่" : "Address"}</span> {d.clinic?.address_detail || dots(28)}</div>
                <div><span style={lbl}>{th ? "ได้ตรวจร่างกาย" : "have examined"}</span> {name} <span style={lbl}>{th ? "เมื่อวันที่" : "on"}</span> {fmtDate(d.visit?.visit_date, lang)}</div>
                <div>
                    <span style={lbl}>{th ? "น้ำหนัก" : "Weight"}</span> {d.vit?.weight_kg ?? "……"} {th ? "กก." : "kg"}
                    <span style={lbl}> {th ? "ส่วนสูง" : "Height"}</span> {d.vit?.height_cm ?? "……"} {th ? "ซม." : "cm"}
                    <span style={lbl}> {th ? "ความดัน" : "BP"}</span> {d.vit?.bp_systolic ? `${d.vit.bp_systolic}/${d.vit.bp_diastolic}` : "……"} {th ? "มม.ปรอท" : "mmHg"}
                    <span style={lbl}> {th ? "ชีพจร" : "Pulse"}</span> {d.vit?.pulse_rate ?? "……"} {th ? "/นาที" : "/min"}
                </div>
                <div><span style={lbl}>{th ? "สภาพร่างกายทั่วไป" : "General condition"}</span> <Box on /> {th ? "ปกติ" : "Normal"} <Box /> {th ? "ผิดปกติ" : "Abnormal"} {dots(24)}</div>

                {withCertStmt && (
                    <div className="mt-1" style={{ textIndent: "1.5em" }}>
                        {th
                            ? "ขอรับรองว่าบุคคลดังกล่าวไม่เป็นผู้มีร่างกายทุพพลภาพจนไม่สามารถปฏิบัติหน้าที่ได้ ไม่ปรากฏอาการของโรคจิตหรือจิตฟั่นเฟือนหรือปัญญาอ่อน ไม่ปรากฏอาการของการติดยาเสพติดให้โทษและโรคพิษสุราเรื้อรัง และไม่ปรากฏอาการของโรค (1) โรคเรื้อนในระยะติดต่อ (2) วัณโรคในระยะอันตราย (3) โรคเท้าช้างในระยะที่ปรากฏอาการเป็นที่รังเกียจแก่สังคม"
                            : "I hereby certify that the said person is not physically disabled, shows no symptoms of psychosis, mental deficiency, drug addiction or chronic alcoholism, and no signs of the following diseases: (1) contagious leprosy (2) dangerous-stage tuberculosis (3) socially offensive elephantiasis."}
                    </div>
                )}

                {d.isSick && (d.cert.rest_days || d.cert.rest_from) && (
                    <div className="mt-1">
                        <span style={lbl}>{th ? "เห็นสมควรให้หยุดพักรักษาตัว" : "Should rest for"}</span> {d.cert.rest_days || "…"} {th ? "วัน" : "days"}
                        {d.cert.rest_from && <> <span style={lbl}>{th ? "ตั้งแต่" : "from"}</span> {fmtDate(d.cert.rest_from, lang)} <span style={lbl}>{th ? "ถึง" : "to"}</span> {fmtDate(d.cert.rest_to, lang)}</>}
                    </div>
                )}
                {d.visit?.icd10_primary && <div><span style={lbl}>{th ? "การวินิจฉัย (ICD-10)" : "Diagnosis (ICD-10)"}</span> {d.visit.icd10_primary}{d.icdName && ` — ${d.icdName}`}</div>}
                <div><span style={lbl}>{th ? "สรุปความเห็นและข้อแนะนำของแพทย์" : "Physician's opinion"}</span> {d.cert.doctor_opinion || dots(50)}</div>
            </div>

            {/* Signature */}
            <div className="mt-8 flex justify-end">
                <div className="text-center" style={{ minWidth: "270px" }}>
                    {d.showDigital
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={d.signatureUrl} alt="" className="h-14 object-contain mx-auto mb-1" />
                        : <div className="h-14" />}
                    <div style={{ borderBottom: "1px dotted #000" }} className="mb-1" />
                    <div>( {th ? d.doctorName : (d.doctorNameEn || d.doctorName)} )</div>
                    <div style={{ fontSize: "11px" }}>{th ? "แพทย์ผู้ตรวจร่างกาย" : "Examining physician"}{d.doctorLicense && ` · ${th ? "ว." : "Lic."} ${d.doctorLicense}`}</div>
                    <div style={{ fontSize: "11px" }}>{th ? "วันที่" : "Date"} {fmtDate(d.cert.issued_at ? String(d.cert.issued_at).slice(0, 10) : d.visit?.visit_date, lang)}</div>
                </div>
            </div>

            <div className="mt-4" style={{ fontSize: "10px", color: "#444", borderTop: "1px solid #ccc", paddingTop: "4px" }}>
                {th
                    ? <>หมายเหตุ: (1) ต้องเป็นแพทย์ผู้ได้ขึ้นทะเบียนรับใบอนุญาตประกอบวิชาชีพเวชกรรม (2) ใบรับรองนี้ใช้ได้ 1 เดือนนับแต่วันที่ตรวจ{d.isDriving && <> (3) ใช้สำหรับใบอนุญาตขับรถและผู้ประจำรถ</>}</>
                    : <>Remarks: (1) Must be a licensed physician. (2) Valid for 1 month from examination date.{d.isDriving && <> (3) For driving license and vehicle crew.</>}</>}
                <div className="mt-1">{th ? "แบบฟอร์มอ้างอิงตามมติคณะกรรมการแพทยสภา" : "Form per Medical Council of Thailand"} · Gonix</div>
            </div>

            {d.cert.status !== "approved" && <div className="mt-2 text-center no-print" style={{ fontSize: "11px", color: "#e11d48", fontStyle: "italic" }}>* {th ? "ฉบับร่าง — ควร Approve ก่อนพิมพ์ใช้จริง" : "Draft — approve before official use"}</div>}
        </div>
    );
}

export default async function MedCertPrintPage({ params, searchParams }: {
    params: Promise<{ vn: string }>;
    searchParams: Promise<{ lang?: string }>;
}) {
    const { vn } = await params;
    const { lang: langParam } = await searchParams;
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
            const { data: prof } = await supabase.from("profiles").select("full_name, full_name_en").eq("id", st.profile_id).maybeSingle();
            doctorName = (prof?.full_name as string) || doctorName;
            doctorNameEn = (prof?.full_name_en as string) || "";
        }
    }
    let icdName = "";
    if (visit?.icd10_primary) {
        const { data: icd } = await supabase.from("icd10").select("description_th, description_en").eq("code", visit.icd10_primary).maybeSingle();
        icdName = (icd?.description_th as string) || (icd?.description_en as string) || "";
    }

    const type = (cert.cert_type as string) || "other";
    const d = {
        cert, visit, patient, vit, clinic, icdName, type,
        nameTh: `${patient?.prefix || ""}${patient?.first_name || ""} ${patient?.last_name || ""}`.trim() || dots(40),
        nameEn: `${patient?.first_name_en || ""} ${patient?.last_name_en || ""}`.trim(),
        doctorName, doctorNameEn, doctorLicense, signatureUrl,
        hasChronic: !!patient?.disease_summary,
        showDigital: cert.sign_mode === "digital" && !!signatureUrl,
        isDriving: type === "driving",
        isSick: type === "sick_leave",
    };

    const lang = langParam === "en" ? "en" : langParam === "both" ? "both" : "th";

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>
            <div className="print-wrap">
                {lang === "both" ? (
                    <>
                        <div className="print-page"><CertPage lang="th" d={d} /></div>
                        <div className="print-page page-break"><CertPage lang="en" d={d} /></div>
                    </>
                ) : (
                    <div className="print-page"><CertPage lang={lang} d={d} /></div>
                )}
            </div>

            <style>{`
                @media print {
                    .no-print { display:none !important; }
                    @page { size: A4; margin: 12mm; }
                    body { background:white !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
                    .print-page { max-width:100% !important; margin:0 !important; padding:0 !important; box-shadow:none !important; }
                    .page-break { break-before: page; page-break-before: always; }
                }
                @media screen {
                    .print-page { background:white; box-shadow:0 4px 20px rgba(0,0,0,0.1); margin:20px auto; padding:14mm; max-width:210mm; }
                    body { background:#f1f5f9; }
                }
            `}</style>
        </>
    );
}
