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

export default async function ReferralPrintPage({ params }: { params: Promise<{ vn: string }> }) {
    const { vn } = await params;
    const supabase = await createClient();

    const { data: ref } = await supabase.from("referrals")
        .select("destination_hospital, referral_reason, include_history, doctor_id, hn, created_at")
        .eq("vn", vn).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!ref) return notFound();

    const { data: visit } = await supabase.from("visits").select("visit_date, icd10_primary, hn, clinic_id, chief_complaint, soap_o, soap_p").eq("vn", vn).maybeSingle();
    const hn = (ref.hn as string) || (visit?.hn as string);
    const { data: patient } = await supabase.from("patients").select("prefix, first_name, last_name, dob, gender, thai_id_card, allergy_summary, disease_summary").eq("hn", hn).maybeSingle();

    const clinicId = visit?.clinic_id as string | undefined;
    const { data: clinic } = clinicId
        ? await supabase.from("tenants").select("clinic_name, address_detail, phone, license_number").eq("id", clinicId).maybeSingle()
        : { data: null };

    let doctorName = "…………………", doctorLicense = "";
    if (ref.doctor_id) {
        const { data: st } = await supabase.from("staff").select("license_number, profile_id").eq("id", ref.doctor_id).maybeSingle();
        doctorLicense = (st?.license_number as string) || "";
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

    const patientName = `${patient?.prefix || ""}${patient?.first_name || ""} ${patient?.last_name || ""}`.trim() || "…………………";

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}><PrintTrigger /></div>
            <div className="print-page" style={{ maxWidth: "210mm", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000" }}>
                <div className="text-center pb-3" style={{ borderBottom: "2px solid #000" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/clinic-logo.png" alt="" className="h-16 w-16 object-contain mx-auto mb-1" />
                    <div className="text-[18px] font-black">{clinic?.clinic_name || "—"}</div>
                    {clinic?.address_detail && <div className="text-[12px] text-slate-700">{clinic.address_detail}</div>}
                    <div className="text-[12px] text-slate-700">
                        {clinic?.phone && <>โทร. {clinic.phone}</>}
                        {clinic?.license_number && <> · เลขที่ใบอนุญาต {clinic.license_number}</>}
                    </div>
                </div>

                <h1 className="text-center text-[22px] font-black mt-5">หนังสือส่งตัวผู้ป่วย</h1>
                <p className="text-right text-[13px] mt-3">วันที่ {thaiDate(visit?.visit_date)}</p>

                <div className="mt-3 text-[15px] leading-[2]">
                    <p>เรียน แพทย์ผู้รับการส่งต่อ <span className="font-bold">{ref.destination_hospital}</span></p>
                    <p className="mt-2">
                        ขอส่งตัวผู้ป่วย <span className="font-bold">{patientName}</span> อายุ <span className="font-bold">{calcAge(patient?.dob)}</span> ปี
                        {patient?.thai_id_card && <> เลขบัตรประชาชน {patient.thai_id_card}</>} (HN {hn})
                    </p>
                    {(visit?.chief_complaint) && <p>อาการสำคัญ: {visit.chief_complaint}</p>}
                    {visit?.icd10_primary && <p>การวินิจฉัย: <span className="font-bold">{visit.icd10_primary}</span>{icdName && <> — {icdName}</>}</p>}
                    {patient?.allergy_summary && <p>ประวัติแพ้ยา: <span className="font-bold text-slate-900">{patient.allergy_summary}</span></p>}
                    {patient?.disease_summary && <p>โรคประจำตัว: {patient.disease_summary}</p>}
                    {ref.include_history && visit?.soap_o && <p>ผลตรวจร่างกาย: {visit.soap_o}</p>}
                    <p className="mt-2">เหตุผลในการส่งต่อ: <span className="font-bold">{ref.referral_reason || "—"}</span></p>
                    <p className="mt-2">จึงเรียนมาเพื่อโปรดพิจารณาให้การดูแลรักษาผู้ป่วยต่อไป</p>
                </div>

                <div className="mt-12 flex justify-end">
                    <div className="text-center text-[14px]" style={{ minWidth: "260px" }}>
                        <div className="h-14" />
                        <div style={{ borderBottom: "1px dotted #000" }} className="mb-1" />
                        <div>( {doctorName} )</div>
                        <div className="text-[12px] text-slate-700">แพทย์ผู้ส่งต่อ{doctorLicense && <> · ว.{doctorLicense}</>}</div>
                    </div>
                </div>

                <div className="mt-8 text-[10px] text-slate-500 text-center italic">
                    ออกโดยระบบ Gonix · พิมพ์เมื่อ {new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                </div>
            </div>

            <style>{`
                @media print { .no-print { display:none !important; } @page { size: A4; margin: 18mm; } body { background:white !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } .print-page { max-width:100% !important; margin:0 !important; padding:0 !important; box-shadow:none !important; } }
                @media screen { .print-page { background:white; box-shadow:0 4px 20px rgba(0,0,0,0.1); margin:20px auto; padding:18mm; } body { background:#f1f5f9; } }
            `}</style>
        </>
    );
}
