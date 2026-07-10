import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";

export const dynamic = "force-dynamic";

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtDate(d: string | null | undefined, lang: "th" | "en" = "th"): string {
    if (!d) return "…………………";
    const dt = new Date(String(d).length <= 10 ? d + "T00:00:00" : d);
    if (isNaN(dt.getTime())) return "…………………";
    return lang === "th"
        ? `${dt.getDate()} ${THAI_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543}`
        : `${dt.getDate()} ${EN_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
function fmtTime(t?: string | null): string {
    if (!t) return "………";
    const m = String(t).match(/(\d{2}):(\d{2})/);
    return m ? `${m[1]}.${m[2]}` : "………";
}
function calcAge(dob?: string | null): string {
    if (!dob) return "……";
    const d = new Date(dob), n = new Date();
    let y = n.getFullYear() - d.getFullYear();
    if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) y--;
    return String(y);
}
function fmtId(id?: string | null): string {
    const s = (id || "").replace(/\D/g, "");
    if (s.length !== 13) return id || "…………………………";
    return `${s[0]}-${s.slice(1, 5)}-${s.slice(5, 10)}-${s.slice(10, 12)}-${s[12]}`;
}
const Box = ({ on }: { on?: boolean }) => <span style={{ fontFamily: "sans-serif", fontSize: "14px" }}>{on ? "☑" : "☐"}</span>;
const dots = (n = 40) => "…".repeat(n);

// ช่องเลขบัตร ปชช. 13 หลัก จัดกลุ่ม 1-4-5-2-1 ตามฟอร์มแพทยสภา
function IdBoxes({ id }: { id?: string | null }) {
    const s = (id || "").replace(/\D/g, "").padEnd(13, " ").slice(0, 13).split("");
    const groups = [[0], [1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11], [12]];
    return (
        <span style={{ display: "inline-flex", gap: "5px", verticalAlign: "middle", alignItems: "center" }}>
            {groups.map((g, gi) => (
                <span key={gi} style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}>
                    {g.map((idx) => (
                        <span key={idx} style={{ display: "inline-block", width: "16px", height: "20px", border: "1px solid #000", textAlign: "center", lineHeight: "20px", fontSize: "12px" }}>{s[idx]?.trim() || ""}</span>
                    ))}
                    {gi < groups.length - 1 && <span>-</span>}
                </span>
            ))}
        </span>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Masthead({ clinic, en }: { clinic: any; en?: boolean }) {
    const nameTh = clinic?.clinic_name || "ธนเวชคลินิกเวชกรรม";
    const nameEn = clinic?.clinic_name_en || "Tanavej Clinic";
    const company = clinic?.company_name as string | undefined;
    return (
        <div className="flex items-center justify-between gap-4 pb-1.5" style={{ borderBottom: "2.5px solid #0891b2" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/clinic-logo.png" alt="" className="h-20 w-20 object-contain shrink-0" />
            <div className="text-right min-w-0" style={{ lineHeight: 1.3 }}>
                    <div style={{ fontSize: "18.5px", fontWeight: 700, letterSpacing: "0.01em" }}>
                        {en ? nameEn : <>{nameTh} <span style={{ fontWeight: 600, color: "#0e7490" }}>{nameEn}</span></>}
                    </div>
                    {company && !en && <div style={{ fontSize: "11px", fontWeight: 500, color: "#374151" }}>{company}</div>}
                    <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "1px" }}>
                        {clinic?.address_detail || (en ? "Chiang Mai, Thailand" : "จ.เชียงใหม่")}
                    </div>
                    <div style={{ fontSize: "10px", color: "#6b7280" }}>
                        {clinic?.phone && <>{en ? "Tel:" : "โทร."} {clinic.phone}{"  ·  "}</>}
                        {en ? "License No:" : "เลขที่ใบอนุญาต"} {clinic?.license_number || "…………"}
                    </div>
                </div>
            </div>
    );
}

// บล็อกลายเซ็นแพทย์ (ดิจิทัลถ้ามี)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SigBlock({ d, label, name }: { d: any; label: string; name?: string }) {
    return (
        <div className="text-center" style={{ minWidth: "260px" }}>
            {d.showDigital
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={d.signatureUrl} alt="" className="h-12 object-contain mx-auto" style={{ marginBottom: "-6px" }} />
                : <div className="h-10" />}
            <div>ลงชื่อ ……………………………………………… {label}</div>
            <div>( {name ?? "……………………………………………………"} )</div>
        </div>
    );
}

/* ───────────────────────── Layout A: แพทยสภา 2 ส่วน (ตรวจสุขภาพ / ใบขับขี่) ───────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LayoutA({ d, lang }: { d: any; lang: "th" | "en" }) {
    const th = lang === "th";
    const driving = d.isDriving;
    const name = th ? d.nameTh : (d.nameEn || d.nameTh);
    const lbl = { fontWeight: 700 } as const;
    const title = th
        ? (driving ? "ใบรับรองแพทย์สำหรับใบอนุญาตขับรถ" : "ใบรับรองแพทย์ (Medical Certificate)")
        : "MEDICAL CERTIFICATE";

    return (
        <div style={{ fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", color: "#000", fontSize: "14px", lineHeight: 1.55 }}>
            <Masthead clinic={d.clinic} en={!th} />

            <div className="text-center mt-2" style={{ fontSize: "16px", fontWeight: 900 }}>{title}</div>
            <div className="text-right" style={{ fontSize: "10.5px" }}>{th ? "เลขที่ตรวจ / Ref No" : "Ref No"}: {d.vn}</div>

            {/* ส่วนที่ 1 */}
            <div className="mt-2" style={{ fontWeight: 700 }}>{th ? "ส่วนที่ 1 ของผู้ขอรับใบรับรองสุขภาพ (To be filled by applicant)" : "Part 1: To be filled by applicant"}</div>
            <div className="mt-1 space-y-1">
                <div><span style={lbl}>{th ? "ข้าพเจ้า" : "Name (Mr./Mrs./Miss)"}</span> {name} <span style={lbl}>{th ? "อายุ" : "Age"}</span> {calcAge(d.patient?.dob)} {th ? "ปี" : "years"}</div>
                <div className="flex items-center gap-2"><span style={lbl}>{th ? "เลขประจำตัวประชาชน / ID Number:" : "National ID / Passport No.:"}</span> {th ? <IdBoxes id={d.patient?.thai_id_card} /> : fmtId(d.patient?.thai_id_card)}</div>
                <div><span style={lbl}>{th ? "สถานที่อยู่ (ที่สามารถติดต่อได้)" : "Residential Address"}</span> {d.fullAddress || dots(60)}</div>
                <div style={lbl}>{th ? "ข้าพเจ้าขอใบรับรองสุขภาพ โดยมีประวัติสุขภาพดังนี้:" : "I do apply for a medical certificate with my health history as follows:"}</div>
                <div className="pl-3">1. {th ? "โรคประจำตัว" : "Personal chronic disease"}: <Box /> {th ? "ไม่มี" : "No"} <Box /> {th ? "มี (ระบุ)" : "Yes (specify)"} {d.hasChronic ? d.patient?.disease_summary : dots(24)}</div>
                <div className="pl-3">2. {th ? "อุบัติเหตุและการผ่าตัด" : "Accident or Surgery"}: <Box /> {th ? "ไม่มี" : "No"} <Box /> {th ? "มี (ระบุ)" : "Yes (specify)"} {dots(22)}</div>
                <div className="pl-3">3. {th ? "เคยเข้ารับการรักษาในโรงพยาบาล" : "Hospital Admission"}: <Box /> {th ? "ไม่มี" : "No"} <Box /> {th ? "มี (ระบุ)" : "Yes (specify)"} {dots(18)}</div>
                {driving ? <>
                    <div className="pl-3">4. {th ? "โรคลมชัก" : "Seizure"} *: <Box /> {th ? "ไม่มี" : "No"} <Box /> {th ? "มี (ระบุ)" : "Yes (specify)"} {dots(24)}</div>
                    <div className="pl-3" style={{ fontSize: "10.5px", color: "#555" }}>* {th
                        ? "หมายเหตุ: ในกรณีมีโรคลมชัก ให้แนบประวัติการรักษาจากแพทย์ผู้รักษาว่าท่านปลอดจากอาการชักมากกว่า 1 ปี เพื่ออนุญาตให้ขับรถได้"
                        : "Note: Seizure — treatment history produced by the doctor in charge must be accompanied to certify that no attack experienced within 1 year."}</div>
                    <div className="pl-3">5. {th ? "ประวัติสำคัญอื่น ๆ" : "Other significant history"}: {d.patient?.past_history || dots(40)}</div>
                </> : (
                    <div className="pl-3">4. {th ? "ประวัติสุขภาพอื่นที่สำคัญ" : "Other significant health history"}: {d.patient?.past_history || dots(40)}</div>
                )}
                <div className="mt-2 flex justify-end">
                    <div className="text-center" style={{ minWidth: "300px" }}>
                        <div>{th ? "ลงชื่อ" : "Signature"} …………………………………… {th ? "ผู้ขอรับใบรับรอง" : "Applicant"}</div>
                        <div>( {name} )</div>
                        <div style={{ fontSize: "11px" }}>{th ? "วันที่" : "Date"} {fmtDate(d.visit?.visit_date, lang)}</div>
                    </div>
                </div>
            </div>

            {/* ส่วนที่ 2 */}
            <div className="mt-2" style={{ fontWeight: 700 }}>{th ? "ส่วนที่ 2 ของแพทย์ (To be filled by physician)" : "Part 2: To be filled by doctor"}</div>
            <div className="mt-1 space-y-1">
                <div><span style={lbl}>{th ? "สถานที่ตรวจ:" : "Place of examination:"}</span> {d.clinic?.clinic_name || "คลินิกเวชกรรมธนเวช"} {th && <><span style={lbl}> วันที่</span> {fmtDate(d.visit?.visit_date, "th")}</>}</div>
                <div><span style={lbl}>{th ? "ข้าพเจ้า" : "I, Dr."}</span> {th ? d.doctorName : (d.doctorNameEn || d.doctorName)} <span style={lbl}>{th ? "ใบอนุญาตประกอบวิชาชีพเวชกรรมเลขที่ ว." : "Medical Practice License No."}</span> {d.doctorLicense || "…………"}</div>
                <div><span style={lbl}>{th ? "ได้ตรวจร่างกาย" : "have examined (Mr./Mrs./Miss)"}</span> {name}</div>
                <div className="my-1 px-3 py-1.5 flex items-center justify-between" style={{ background: "#f8fafc", borderRadius: "6px", whiteSpace: "nowrap", fontSize: "13.5px" }}>
                    <span><span style={lbl}>{th ? "น้ำหนัก" : "Weight"}</span> {d.vit?.weight_kg ?? "……"} {th ? "กก." : "kg"}</span>
                    <span><span style={lbl}>{th ? "ส่วนสูง" : "Height"}</span> {d.vit?.height_cm ?? "……"} {th ? "ซม." : "cm"}</span>
                    <span><span style={lbl}>{th ? "ความดัน" : "BP"}</span> {d.vit?.bp_systolic ? `${d.vit.bp_systolic}/${d.vit.bp_diastolic}` : "……"} {th ? "มม.ปรอท" : "mmHg"}</span>
                    <span><span style={lbl}>{th ? "ชีพจร" : "Pulse"}</span> {d.vit?.pulse_rate ?? "……"} {th ? "ครั้ง/นาที" : "/min"}</span>
                </div>
                <div><span style={lbl}>{th ? "สภาพร่างกายทั่วไปอยู่ในเกณฑ์:" : "General Physical Condition:"}</span> <Box /> {th ? "ปกติ" : "Normal"} <Box /> {th ? "ผิดปกติ (ระบุ)" : "Abnormal (specify)"} {dots(20)}</div>

                <div className="mt-1" style={{ textIndent: "1.5em" }}>
                    {th
                        ? "ขอรับรองว่า บุคคลดังกล่าว ไม่เป็นผู้มีร่างกายทุพพลภาพจนไม่สามารถปฏิบัติหน้าที่ได้ ไม่ปรากฏอาการของโรคจิต หรือจิตฟั่นเฟือน หรือปัญญาอ่อน ไม่ปรากฏอาการของการติดยาเสพติดให้โทษ และอาการของโรคพิษสุราเรื้อรัง และไม่ปรากฏอาการและอาการแสดงของโรคต่อไปนี้:"
                        : "I hereby certify that the above person is capable to work/drive, free from physical disability, showing no symptoms of mental disability or mental retardation, nor drug addiction, nor chronic alcoholism, and no sign and symptom of the following diseases:"}
                </div>
                <div className="pl-4">{th ? "1. โรคเรื้อนในระยะติดต่อ หรือในระยะที่ปรากฏอาการเป็นที่รังเกียจแก่สังคม" : "(1) Leprosy at contagious or symptomatic stage"}</div>
                <div className="pl-4">{th ? "2. วัณโรคในระยะอันตราย" : "(2) Contagious stage of Tuberculosis"}</div>
                <div className="pl-4">{th ? "3. โรคเท้าช้างในระยะที่ปรากฏอาการเป็นที่รังเกียจแก่สังคม" : "(3) Symptomatic Elephantiasis"}</div>
                {!driving && <div className="pl-4">{th ? "4. โรคอื่น ๆ (ถ้ามี)" : "(4) Other diseases (if any)"} {dots(30)}</div>}

                <div><span style={lbl}>{th ? "สรุปความเห็นและข้อแนะนำของแพทย์:" : "Physician's Conclusion / Advice:"}</span> {d.opinionText || dots(45)}</div>
                <div>{dots(78)}</div>
                <div>{dots(78)}</div>
            </div>

            {/* ลายเซ็นแพทย์ */}
            <div className="mt-5 flex justify-end">
                <div className="text-center" style={{ minWidth: "270px" }}>
                    {d.showDigital
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={d.signatureUrl} alt="" className="h-10 object-contain mx-auto" style={{ marginBottom: "-4px" }} />
                        : <div className="h-7" />}
                    <div>{th ? "ลงชื่อ" : "Signature"} ………………………………… {th ? "แพทย์ผู้ตรวจร่างกาย" : "M.D."}</div>
                    <div>( {th ? d.doctorName : (d.doctorNameEn || d.doctorName)} )</div>
                    <div style={{ fontSize: "11px" }}>{th ? "วันที่" : "Date"} {fmtDate(d.visit?.visit_date || (d.cert.issued_at ? String(d.cert.issued_at).slice(0, 10) : null), lang)}</div>
                </div>
            </div>

            <div className="mt-2" style={{ fontSize: "9.5px", color: "#444", borderTop: "1px solid #ccc", paddingTop: "3px" }}>
                {th ? (
                    <>หมายเหตุ: ใบรับรองแพทย์ฉบับนี้ให้ใช้ได้ 1 เดือนนับแต่วันที่ตรวจร่างกาย{driving && " และใช้สำหรับใบอนุญาตขับรถ และปฏิบัติหน้าที่เป็นผู้ประจำรถ"}</>
                ) : (
                    <>N.B. This certificate is valid within 1 month from the day of examination.{driving && " Valid for driving license and vehicle crew duty."}</>
                )}
                {th && <div className="mt-1">แบบฟอร์มนี้ได้รับการรับรองจากมติคณะกรรมการแพทยสภาในการประชุมครั้งที่ {driving ? "6/2564 วันที่ 13 พฤษภาคม 2564" : "4/2561 วันที่ 19 เมษายน 2561"}</div>}
            </div>

            {d.cert.status !== "approved" && <div className="mt-2 text-center no-print" style={{ fontSize: "11px", color: "#e11d48", fontStyle: "italic" }}>* {th ? "ฉบับร่าง — ควร Approve ก่อนพิมพ์ใช้จริง" : "Draft — approve before official use"}</div>}
        </div>
    );
}

/* ───────────────────── Layout B: ใบรับรองแพทย์ (มาตรวจจริง / ลาป่วย) — Form 4 ───────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LayoutB({ d }: { d: any }) {
    const lbl = { fontWeight: 700 } as const;
    const isSick = d.isSick;

    return (
        <div style={{ fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", color: "#000", fontSize: "14.5px", lineHeight: 1.85 }}>
            <Masthead clinic={d.clinic} />

            <div className="text-center mt-3" style={{ fontSize: "18px", fontWeight: 900 }}>ใบรับรองแพทย์ / MEDICAL CERTIFICATE</div>
            <div className="text-right" style={{ fontSize: "11px" }}>เลขที่ / Ref No: {d.vn}</div>

            <div className="mt-3 space-y-1.5">
                <div><span style={lbl}>ข้าพเจ้า</span> {d.doctorName} เป็นผู้ประกอบวิชาชีพเวชกรรมแผนปัจจุบันชั้นหนึ่ง</div>
                <div>ใบอนุญาตประกอบวิชาชีพเวชกรรมเลขที่ ว. {d.doctorLicense || "…………"} ปฏิบัติงาน ณ {d.clinic?.clinic_name || "คลินิกเวชกรรมธนเวช"}</div>
                <div><span style={lbl}>ได้ทำการตรวจรักษาผู้ป่วยชื่อ</span> {d.nameTh}</div>
                <div><span style={lbl}>อายุ</span> {calcAge(d.patient?.dob)} ปี <span style={lbl}>เลขประจำตัวผู้ป่วย (HN)</span> {d.hn || "…………"}</div>
                <div><span style={lbl}>เลขประจำตัวประชาชน / ID Number:</span> {fmtId(d.patient?.thai_id_card)}</div>
                <div><span style={lbl}>เมื่อวันที่</span> {fmtDate(d.visit?.visit_date, "th")} <span style={lbl}>เวลาประมาณ</span> {fmtTime(d.visit?.visit_time)} น.</div>

                <div className="mt-1" style={lbl}>ผลการตรวจร่างกายและวินิจฉัยโรค (Diagnosis):</div>
                <div style={{ minHeight: "2.6em", borderBottom: "1px dotted #999" }}>{d.diagText || ""}</div>

                <div className="mt-2" style={lbl}>ความเห็นของแพทย์ (Physician&apos;s Opinion):</div>
                <div className="pl-2"><Box on={!isSick} /> <span style={{ fontWeight: !isSick ? 700 : 400 }}>กรณีรับการรักษาจริง:</span> ขอรับรองว่าผู้ป่วยรายนี้ได้มารับการตรวจรักษาในวันและเวลาดังกล่าวจริง</div>
                <div className="pl-2"><Box on={isSick} /> <span style={{ fontWeight: isSick ? 700 : 400 }}>กรณีลาป่วย:</span> เห็นควรให้ผู้ป่วยพักรักษาตัว / หยุดพักงานเพื่อฟื้นฟูร่างกาย</div>
                <div className="pl-6">ตั้งแต่วันที่ {isSick && d.cert.rest_from ? fmtDate(d.cert.rest_from, "th") : "……… เดือน ………… พ.ศ. ……"} ถึงวันที่ {isSick && d.cert.rest_to ? fmtDate(d.cert.rest_to, "th") : "……… เดือน ………… พ.ศ. ……"}</div>
                <div className="pl-6">มีกำหนดรวม {isSick && d.cert.rest_days ? d.cert.rest_days : "………"} วัน</div>

                <div className="mt-2" style={{ fontSize: "11px", fontStyle: "italic", color: "#555" }}>* เอกสารนี้มีผลสมบูรณ์เมื่อมีลายมือชื่อแพทย์และตราประทับของสถานพยาบาลเท่านั้น</div>
            </div>

            <div className="mt-8 flex justify-end">
                <div className="text-center" style={{ minWidth: "270px" }}>
                    {d.showDigital
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={d.signatureUrl} alt="" className="h-12 object-contain mx-auto" style={{ marginBottom: "-6px" }} />
                        : <div className="h-10" />}
                    <div>ลงชื่อ ………………………………………… แพทย์ผู้ตรวจ</div>
                    <div>( {d.doctorName} )</div>
                    <div style={{ fontSize: "11px" }}>วันที่ {fmtDate(d.visit?.visit_date || (d.cert.issued_at ? String(d.cert.issued_at).slice(0, 10) : null), "th")}</div>
                </div>
            </div>

            {d.cert.status !== "approved" && <div className="mt-4 text-center no-print" style={{ fontSize: "11px", color: "#e11d48", fontStyle: "italic" }}>* ฉบับร่าง — ควร Approve ก่อนพิมพ์ใช้จริง</div>}
        </div>
    );
}

/* ─────────────────── Layout C: ใบสั่งจ่ายสมุนไพรควบคุม (กัญชา) — แบบ ภ.ท.๓๓ / Form 5 ─────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LayoutC({ d }: { d: any }) {
    const lbl = { fontWeight: 700 } as const;
    const prof = (label: string, on?: boolean) => <span className="mr-3"><Box on={on} /> {label}</span>;

    return (
        <div style={{ fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", color: "#000", fontSize: "14px", lineHeight: 1.75 }}>
            <div className="flex justify-end mb-1">
                <span style={{ fontWeight: 700, border: "1.5px solid #000", padding: "1px 12px", borderRadius: "4px", fontSize: "13px" }}>แบบ ภ.ท.๓๓</span>
            </div>
            <Masthead clinic={d.clinic} />

            <div className="text-center mt-3" style={{ fontSize: "18px", fontWeight: 900 }}>ใบสั่งจ่ายสมุนไพรควบคุม (กัญชา)</div>
            <div className="text-right mt-1">วันที่ {fmtDate(d.visit?.visit_date, "th")}</div>

            <div className="mt-2 space-y-1.5">
                <div><span style={lbl}>ข้าพเจ้า</span> {d.doctorName}</div>
                <div>ซึ่งเป็นผู้ประกอบวิชาชีพ</div>
                <div className="pl-3">{prof("เวชกรรม", true)}{prof("ทันตกรรม")}{prof("แพทย์แผนไทย")}{prof("แพทย์แผนไทยประยุกต์")}</div>
                <div className="pl-3">{prof("เภสัชกรรม")}{prof("ผู้ประกอบโรคศิลปะ สาขาการแพทย์แผนจีน")}{prof("หมอพื้นบ้าน")}</div>
                <div><span style={lbl}>ใบอนุญาต/หนังสือรับรอง เลขที่</span> {d.doctorLicense || dots(30)}</div>
                <div><span style={lbl}>ที่อยู่:</span> {d.clinic?.clinic_name || "คลินิกเวชกรรมธนเวช"} {d.clinic?.address_detail || "จังหวัดเชียงใหม่"}</div>

                <div className="mt-1"><span style={lbl}>ได้ตรวจรักษา</span> {d.nameTh}</div>
                <div><span style={lbl}>อายุ</span> {calcAge(d.patient?.dob)} ปี <span style={lbl}>สัญชาติ</span> {d.patient?.nationality || "ไทย"}</div>
                <div><span style={lbl}>เลขที่ประชาชน/หนังสือเดินทาง</span> {fmtId(d.patient?.thai_id_card)}</div>
                <div><span style={lbl}>พบว่ามีโรคหรืออาการ</span> {d.diagText || dots(45)}</div>

                <div className="mt-1" style={lbl}>สมควรได้รับ ช่อดอกกัญชา</div>
                <div className="pl-3">ขนาดที่ใช้ต่อวัน จำนวน …………… กรัม จำนวนวันที่ใช้ …………… วัน</div>
                <div className="pl-3">รวมปริมาณทั้งหมดที่ต้องใช้ …………………… กรัม</div>

                <div className="mt-1" style={lbl}>หมายเหตุ:</div>
                <div className="pl-3" style={{ fontSize: "11.5px" }}>1. ให้ได้ไม่เกิน ๓๐ วันต่อ ๑ ครั้งการสั่งจ่าย</div>
                <div className="pl-3" style={{ fontSize: "11.5px" }}>2. การวินิจฉัยที่สอดคล้องหรือเป็นไปตามแนวทางการปฏิบัติและข้อบ่งชี้ในการใช้กัญชาทางการแพทย์ ของวิชาชีพผู้สั่งจ่ายที่ได้รับอนุญาต</div>
                <div className="pl-3" style={{ fontSize: "11.5px" }}>3. การวินิจฉัยที่ตรงกับเอกสารรับรองทางการแพทย์อื่นใดที่เห็นควรให้ผู้ซื้อสามารถใช้กัญชาทางการแพทย์ได้</div>
            </div>

            <div className="mt-6 flex justify-between items-end">
                <SigBlock d={{ showDigital: false }} label="ผู้รับใบสั่ง" />
                <SigBlock d={d} label="ผู้สั่งจ่าย" name={d.doctorName} />
            </div>

            <div className="mt-6" style={{ fontSize: "10.5px", color: "#444", borderTop: "1px solid #ccc", paddingTop: "4px" }}>
                แบบใบสั่งจ่ายนี้ให้ผู้ประกอบการเก็บไว้ ณ สถานที่จ่ายเพื่อตรวจสอบเป็นระยะเวลา ๑ ปีนับแต่วันที่จ่าย
            </div>

            {d.cert.status !== "approved" && <div className="mt-2 text-center no-print" style={{ fontSize: "11px", color: "#e11d48", fontStyle: "italic" }}>* ฉบับร่าง — ควร Approve ก่อนพิมพ์ใช้จริง</div>}
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

    const { data: visit } = await supabase.from("visits").select("visit_date, visit_time, icd10_primary, hn, clinic_id, doctor_id, room_id, weight_kg, height_cm, bp_systolic, bp_diastolic, pulse_rate").eq("vn", vn).maybeSingle();
    const hn = (cert.hn as string) || (visit?.hn as string);
    const { data: patient } = await supabase.from("patients")
        .select("prefix, first_name, last_name, first_name_en, last_name_en, dob, gender, thai_id_card, nationality, address_detail, subdistrict_code, disease_summary, past_history")
        .eq("hn", hn).maybeSingle();

    // ประกอบที่อยู่เต็ม: address_detail + ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ (join address_ref)
    let fullAddress = (patient?.address_detail as string) || "";
    if (patient?.subdistrict_code) {
        const { data: addr } = await supabase.from("address_ref")
            .select("subdistrict_name, district_name, province_name, postal_code")
            .eq("subdistrict_code", patient.subdistrict_code).maybeSingle();
        if (addr) fullAddress = `${fullAddress ? fullAddress + " " : ""}ต.${addr.subdistrict_name} อ.${addr.district_name} จ.${addr.province_name} ${addr.postal_code}`.trim();
    }
    // vitals: อ่านจาก visits ก่อน (หน้าซักประวัติเซฟลง visits ทุกครั้ง) แล้ว fallback ไป vital_signs
    const { data: vsRow } = await supabase.from("vital_signs").select("weight_kg, height_cm, bp_systolic, bp_diastolic, pulse_rate").eq("vn", vn).order("recorded_at", { ascending: false }).limit(1).maybeSingle();
    const vit = {
        weight_kg: visit?.weight_kg ?? vsRow?.weight_kg ?? null,
        height_cm: visit?.height_cm ?? vsRow?.height_cm ?? null,
        bp_systolic: visit?.bp_systolic ?? vsRow?.bp_systolic ?? null,
        bp_diastolic: visit?.bp_diastolic ?? vsRow?.bp_diastolic ?? null,
        pulse_rate: visit?.pulse_rate ?? vsRow?.pulse_rate ?? null,
    };

    const clinicId = visit?.clinic_id as string | undefined;
    const { data: clinic } = clinicId
        ? await supabase.from("tenants").select("clinic_name, clinic_name_en, company_name, address_detail, phone, license_number").eq("id", clinicId).maybeSingle()
        : { data: null };

    // แพทย์: ใช้ผู้ที่ถูกเลือกในห้องตรวจ (visit.doctor_id) ก่อน แล้ว fallback ไปแพทย์ที่บันทึกในใบรับรอง
    // ถ้ายังไม่มี → ใช้แพทย์ประจำห้อง (rooms.assigned_doctor_ids) ที่ visit ถูกส่งไป
    let doctorId = (visit?.doctor_id as string) || (cert.doctor_id as string) || null;
    if (!doctorId && visit?.room_id) {
        const { data: room } = await supabase.from("rooms").select("assigned_doctor_ids").eq("id", visit.room_id).maybeSingle();
        const ids = (room?.assigned_doctor_ids as string[] | null) || [];
        if (ids.length > 0) doctorId = ids[0];
    }
    let doctorName = "……………………………", doctorNameEn = "", doctorLicense = "", signatureUrl: string | null = null;
    if (doctorId) {
        const { data: st } = await supabase.from("staff").select("license_number, signature_url, profile_id").eq("id", doctorId).maybeSingle();
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

    const type = (cert.cert_type as string) || "treatment";
    const diagText = [
        visit?.icd10_primary ? `${visit.icd10_primary}${icdName ? " — " + icdName : ""}` : "",
        cert.doctor_opinion as string,
    ].filter(Boolean).join("   ");

    const d = {
        cert, visit, patient, vit, clinic, icdName, type, fullAddress, hn, vn,
        nameTh: `${patient?.prefix || ""}${patient?.first_name || ""} ${patient?.last_name || ""}`.trim() || dots(36),
        nameEn: `${patient?.first_name_en || ""} ${patient?.last_name_en || ""}`.trim(),
        doctorName, doctorNameEn, doctorLicense, signatureUrl,
        diagText, opinionText: (cert.doctor_opinion as string) || "",
        hasChronic: !!patient?.disease_summary,
        showDigital: cert.sign_mode === "digital" && !!signatureUrl,
        isDriving: type === "driving",
        isSick: type === "sick_leave",
    };

    const isLayoutA = ["health_check", "driving", "fitness", "government", "fit_for_work", "insurance"].includes(type);
    const isCannabis = type === "cannabis";
    const lang = langParam === "en" ? "en" : langParam === "both" ? "both" : "th";

    let content: React.ReactNode;
    if (isCannabis) {
        content = <div className="print-page"><LayoutC d={d} /></div>;
    } else if (isLayoutA) {
        content = lang === "both" ? (
            <>
                <div className="print-page"><LayoutA lang="th" d={d} /></div>
                <div className="print-page page-break"><LayoutA lang="en" d={d} /></div>
            </>
        ) : (
            <div className="print-page"><LayoutA lang={lang === "en" ? "en" : "th"} d={d} /></div>
        );
    } else {
        content = <div className="print-page"><LayoutB d={d} /></div>;
    }

    return (
        <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" />

            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>
            <div className="print-wrap">{content}</div>

            <style>{`
                @media print {
                    .no-print { display:none !important; }
                    @page { size: A4; margin: 10mm 12mm; }
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
