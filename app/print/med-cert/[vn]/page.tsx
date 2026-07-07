import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PrintTrigger from "@/app/print/visits/[vn]/print-trigger";

export const dynamic = "force-dynamic";

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
function thaiDate(d?: string | null): string {
    if (!d) return "…………………";
    const dt = new Date(d.length <= 10 ? d + "T00:00:00" : d);
    if (isNaN(dt.getTime())) return "…………………";
    return `${dt.getDate()} ${THAI_MONTHS[dt.getMonth()]} ${dt.getFullYear() + 543}`;
}
function calcAge(dob?: string | null): string {
    if (!dob) return "…";
    const d = new Date(dob), n = new Date();
    let y = n.getFullYear() - d.getFullYear();
    if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) y--;
    return String(y);
}

const CERT_META: Record<string, { subtitle: string; purpose: string }> = {
    sick_leave: { subtitle: "เพื่อการลาป่วย", purpose: "เพื่อใช้ประกอบการลาป่วย" },
    fit_for_work: { subtitle: "รับรองร่างกายปกติ / พร้อมทำงาน", purpose: "เพื่อรับรองว่ามีสุขภาพร่างกายปกติ สามารถปฏิบัติงานได้" },
    fitness: { subtitle: "ตรวจสุขภาพทั่วไป", purpose: "เพื่อรับรองผลการตรวจสุขภาพ" },
    driving: { subtitle: "เพื่อขอรับใบอนุญาตขับขี่", purpose: "เพื่อใช้ประกอบการขอรับ/ต่ออายุใบอนุญาตขับรถ" },
    government: { subtitle: "เพื่อสมัคร/ปฏิบัติราชการ", purpose: "เพื่อใช้ประกอบการสมัครงานราชการ" },
    insurance: { subtitle: "เพื่อการประกัน", purpose: "เพื่อใช้ประกอบการเรียกร้องสินไหม/ทำประกัน" },
    other: { subtitle: "", purpose: "" },
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
    const { data: patient } = await supabase.from("patients").select("prefix, first_name, last_name, dob, gender, thai_id_card").eq("hn", hn).maybeSingle();

    // clinic
    const clinicId = visit?.clinic_id as string | undefined;
    const { data: clinic } = clinicId
        ? await supabase.from("tenants").select("clinic_name, clinic_name_en, address_detail, phone, license_number").eq("id", clinicId).maybeSingle()
        : { data: null };

    // doctor
    let doctorName = "…………………", doctorLicense = "", signatureUrl: string | null = null;
    if (cert.doctor_id) {
        const { data: st } = await supabase.from("staff").select("license_number, signature_url, profile_id").eq("id", cert.doctor_id).maybeSingle();
        doctorLicense = (st?.license_number as string) || "";
        signatureUrl = (st?.signature_url as string) || null;
        if (st?.profile_id) {
            const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", st.profile_id).maybeSingle();
            doctorName = (prof?.full_name as string) || doctorName;
        }
    }

    // ICD-10 name
    let icdName = "";
    if (visit?.icd10_primary) {
        const { data: icd } = await supabase.from("icd10").select("description_th, description_en").eq("code", visit.icd10_primary).maybeSingle();
        icdName = (icd?.description_th as string) || (icd?.description_en as string) || "";
    }

    const meta = CERT_META[cert.cert_type as string] || CERT_META.other;
    const patientName = `${patient?.prefix || ""}${patient?.first_name || ""} ${patient?.last_name || ""}`.trim() || "…………………";
    const showDigital = cert.sign_mode === "digital" && signatureUrl;

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>

            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000" }}>
                {/* Masthead */}
                <div className="text-center pb-3" style={{ borderBottom: "2px solid #000" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/clinic-logo.png" alt="" className="h-16 w-16 object-contain mx-auto mb-1" />
                    <div className="text-[18px] font-black">{clinic?.clinic_name || "—"}</div>
                    {clinic?.address_detail && <div className="text-[12px] text-slate-700">{clinic.address_detail}</div>}
                    <div className="text-[12px] text-slate-700">
                        {clinic?.phone && <>โทร. {clinic.phone}</>}
                        {clinic?.license_number && <> · เลขที่ใบอนุญาตสถานพยาบาล {clinic.license_number}</>}
                    </div>
                </div>

                <h1 className="text-center text-[22px] font-black mt-5">ใบรับรองแพทย์</h1>
                {meta.subtitle && <p className="text-center text-[13px] text-slate-700 -mt-1">({meta.subtitle})</p>}

                <div className="mt-6 text-[15px] leading-[2.1]" style={{ textIndent: "0" }}>
                    <p>
                        ข้าพเจ้า <span className="font-bold">{doctorName}</span> ใบประกอบวิชาชีพเวชกรรมเลขที่ <span className="font-bold">{doctorLicense || "………………"}</span>
                    </p>
                    <p>
                        ได้ทำการตรวจร่างกาย <span className="font-bold">{patientName}</span> อายุ <span className="font-bold">{calcAge(patient?.dob)}</span> ปี
                        {patient?.thai_id_card && <> เลขบัตรประชาชน {patient.thai_id_card}</>}
                    </p>
                    <p>
                        เมื่อวันที่ <span className="font-bold">{thaiDate(visit?.visit_date)}</span>
                        {visit?.icd10_primary && <> ผลการวินิจฉัย <span className="font-bold">{visit.icd10_primary}</span>{icdName && <> — {icdName}</>}</>}
                    </p>
                    {cert.cert_type === "sick_leave" && (cert.rest_days || cert.rest_from) && (
                        <p>
                            เห็นสมควรให้หยุดพักรักษาตัวเป็นเวลา <span className="font-bold">{cert.rest_days || "…"}</span> วัน
                            {cert.rest_from && <> ตั้งแต่วันที่ <span className="font-bold">{thaiDate(cert.rest_from)}</span> ถึงวันที่ <span className="font-bold">{thaiDate(cert.rest_to)}</span></>}
                        </p>
                    )}
                    {meta.purpose && <p>ออกให้ไว้{meta.purpose}</p>}
                    {cert.doctor_opinion && (
                        <p className="mt-2">ความเห็นแพทย์: {cert.doctor_opinion}</p>
                    )}
                </div>

                {/* Signature */}
                <div className="mt-12 flex justify-end">
                    <div className="text-center text-[14px]" style={{ minWidth: "260px" }}>
                        {showDigital ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={signatureUrl!} alt="signature" className="h-16 object-contain mx-auto mb-1" />
                        ) : (
                            <div className="h-16" />
                        )}
                        <div style={{ borderBottom: "1px dotted #000" }} className="mb-1" />
                        <div>( {doctorName} )</div>
                        <div className="text-[12px] text-slate-700">แพทย์ผู้ตรวจ{doctorLicense && <> · ว.{doctorLicense}</>}</div>
                        <div className="text-[12px] text-slate-700 mt-1">วันที่ {thaiDate(cert.issued_at ? String(cert.issued_at).slice(0, 10) : visit?.visit_date)}</div>
                    </div>
                </div>

                {cert.status !== "approved" && (
                    <div className="mt-6 text-center text-[11px] text-rose-500 italic no-print">
                        * ยังไม่อนุมัติ (ฉบับร่าง) — ควร Approve ก่อนพิมพ์ใช้จริง
                    </div>
                )}
                <div className="mt-8 text-[10px] text-slate-500 text-center italic">
                    ออกโดยระบบ Gonix · พิมพ์เมื่อ {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                </div>
            </div>

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    @page { size: A4; margin: 18mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print-page { max-width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
                }
                @media screen {
                    .print-page { background: white; box-shadow: 0 4px 20px rgba(0,0,0,0.1); margin: 20px auto; padding: 18mm; }
                    body { background: #f1f5f9; }
                }
            `}</style>
        </>
    );
}
