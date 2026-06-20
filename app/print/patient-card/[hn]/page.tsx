import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PrintTrigger from "./print-trigger";

export const dynamic = "force-dynamic";

/** ตั้งชื่อ tab → browser ใช้เป็น filename default ตอนบันทึก PDF
 *  รูปแบบ: OPDCARD-HN690006-จำเนียร_เตรียม
 */
export async function generateMetadata(
    { params }: { params: Promise<{ hn: string }> }
): Promise<Metadata> {
    const { hn } = await params;
    try {
        const supabase = await createClient();
        const { data: pt } = await supabase
            .from("patients")
            .select("first_name, last_name")
            .eq("hn", hn)
            .maybeSingle();
        if (pt) {
            const name = `${pt.first_name || ""}_${pt.last_name || ""}`.trim().replace(/\s+/g, "_");
            return { title: `OPDCARD-${hn}-${name}` };
        }
    } catch {
        // fallback
    }
    return { title: `OPDCARD-${hn}` };
}

export default async function PatientCardPrintPage({
    params,
}: {
    params: Promise<{ hn: string }>;
}) {
    const { hn } = await params;
    const supabase = await createClient();

    const [patientRes, allergiesRes, chronicRes] = await Promise.all([
        supabase.from("patients").select(`
            hn, prefix, first_name, last_name, first_name_en, last_name_en,
            dob, gender, phone, email, line_user_id, allergy_summary, blood_group,
            nhso_rights, nhso_main_hospital, thai_id_card, passport_no,
            disease_summary, address_detail, subdistrict_code,
            occupation, race, nationality, marital_status,
            emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
            photo_url, first_visit_date, pdpa_consent, clinic_id
        `).eq("hn", hn).single(),
        supabase.from("patient_allergies").select("*").eq("hn", hn).eq("is_active", true),
        supabase.from("patient_chronic_diseases").select("*").eq("hn", hn),
    ]);

    const patient = patientRes.data;
    if (!patient) notFound();

    const { data: clinic } = await supabase
        .from("tenants").select("clinic_name, clinic_name_en, phone, address_detail, license_number")
        .eq("id", patient.clinic_id).maybeSingle();

    let fullAddress = patient.address_detail || "";
    if (patient.subdistrict_code) {
        const { data: addr } = await supabase.from("address_ref")
            .select("subdistrict_name, district_name, province_name, postal_code")
            .eq("subdistrict_code", patient.subdistrict_code).maybeSingle();
        if (addr) {
            fullAddress = `${fullAddress ? fullAddress + " " : ""}ต.${addr.subdistrict_name} อ.${addr.district_name} จ.${addr.province_name} ${addr.postal_code}`.trim();
        }
    }

    const allergies = allergiesRes.data || [];
    const chronic = chronicRes.data || [];

    function age(dob: string | null): string {
        if (!dob) return "—";
        const birth = new Date(dob + "T00:00:00");
        const now = new Date();
        let y = now.getFullYear() - birth.getFullYear();
        let m = now.getMonth() - birth.getMonth();
        let d = now.getDate() - birth.getDate();
        if (d < 0) {
            m--;
            const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            d += prevMonth.getDate();
        }
        if (m < 0) { y--; m += 12; }
        const parts: string[] = [];
        if (y > 0) parts.push(`${y} ปี`);
        if (m > 0) parts.push(`${m} เดือน`);
        if (y === 0 && (d > 0 || parts.length === 0)) parts.push(`${d} วัน`);
        return parts.join(" ");
    }

    const nhsoLabel: Record<string, string> = {
        none: "ไม่ระบุ", uc: "บัตรทอง (UC)", sso: "ประกันสังคม",
        gov_officer: "ข้าราชการ", private_ins: "ประกันเอกชน", self_pay: "ชำระเงินเอง",
    };
    const genderLabel: Record<string, string> = { M: "ชาย", F: "หญิง", other: "อื่นๆ" };
    const maritalLabel: Record<string, string> = {
        single: "โสด", married: "สมรส", divorced: "หย่า", widowed: "หม้าย",
        โสด: "โสด", สมรส: "สมรส", หย่า: "หย่า", หม้าย: "หม้าย",
    };

    const fullName = `${patient.prefix || ""} ${patient.first_name || ""} ${patient.last_name || ""}`.trim();
    const fullNameEn = patient.first_name_en || patient.last_name_en
        ? `${patient.first_name_en || ""} ${patient.last_name_en || ""}`.trim()
        : "";

    const allergyText = allergies.length > 0
        ? allergies.map(a => `${a.allergen_name}${a.severity ? ` (${a.severity})` : ""}`).join(", ")
        : patient.allergy_summary || "";

    const chronicText = chronic.length > 0
        ? chronic.map(c => c.disease_name).filter(Boolean).join(", ")
        : patient.disease_summary || "";

    return (
        <>
            <div className="mx-auto" style={{ maxWidth: "210mm" }}>
                <PrintTrigger />
            </div>

            <div className="print-page" style={{
                maxWidth: "210mm",
                fontFamily: "'Noto Sans Thai', sans-serif",
                color: "#000",
                fontSize: "11px",
            }}>
                {/* ════════ MASTHEAD ════════ */}
                <div style={{ borderBottom: "2px solid #000", padding: "4px 0" }}>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/clinic-logo.png" alt="Clinic" className="h-24 w-24 object-contain shrink-0" />
                            <div className="leading-tight min-w-0">
                                <div className="text-[18px] font-black text-black tracking-tight">
                                    ธนเวช คลินิกเวชกรรม
                                </div>
                                <div className="text-[13px] font-semibold text-slate-800 mt-0.5">
                                    {clinic?.clinic_name || "บริษัท ธนเวช เมดิคอล จำกัด"}
                                </div>
                                <div className="text-[12px] text-slate-700 mt-1 leading-relaxed">
                                    {clinic?.address_detail || "108/27 หมู่ 1 ต.สันพระเนตร อ.สันทราย จ.เชียงใหม่ 50210"}
                                </div>
                                <div className="text-[12px] text-slate-700">
                                    โทรศัพท์ {clinic?.phone || "093-987-4559 / 053-111215"}
                                </div>
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-slate-600 whitespace-nowrap">
                                Patient · OPD Card
                            </div>
                            <h1 className="text-[22px] font-black tracking-tight text-black leading-tight mt-1 whitespace-nowrap">
                                บัตรประจำตัวผู้ป่วย
                            </h1>
                            <div className="text-[12px] text-slate-700 whitespace-nowrap">Patient Identity Card</div>
                        </div>
                    </div>
                </div>

                {/* ════════ HERO ROW — HN + Name + Reg ════════ */}
                <div className="flex items-center gap-6 mt-1.5 mb-2" style={{ borderBottom: "1px solid #000", paddingBottom: "6px" }}>
                    {/* HN big */}
                    <div className="shrink-0">
                        <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-semibold">
                            Hospital Number
                        </div>
                        <div className="text-[34px] font-black tracking-tight text-blue-800 leading-none mt-1 font-mono">
                            {patient.hn}
                        </div>
                    </div>

                    {/* Name + chips */}
                    <div className="flex-1 min-w-0">
                        <div className="text-[24px] font-black tracking-tight leading-tight">{fullName}</div>
                        {fullNameEn && (
                            <div className="text-[13px] italic text-slate-700 mt-0.5">{fullNameEn}</div>
                        )}
                        <div className="flex items-baseline gap-4 text-[13px] mt-1.5">
                            <span><strong>เพศ</strong> {genderLabel[patient.gender] || "—"}</span>
                            <span className="text-slate-400">·</span>
                            <span><strong>อายุ</strong> {age(patient.dob)}</span>
                            {patient.blood_group && (
                                <>
                                    <span className="text-slate-400">·</span>
                                    <span><strong>กรุ๊ปเลือด</strong> <span className="font-mono font-bold">{patient.blood_group}</span></span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Registered */}
                    <div className="shrink-0 text-right text-[11px] text-slate-600 whitespace-nowrap">
                        <div>ลงทะเบียนเมื่อ</div>
                        <div className="font-semibold text-slate-800">
                            {patient.first_visit_date
                                ? new Date(patient.first_visit_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
                                : "—"}
                        </div>
                        {patient.pdpa_consent && (
                            <div className="mt-1.5 inline-block px-2 py-0.5 border border-emerald-700 text-emerald-700 font-semibold text-[10px]">
                                ✓ PDPA Consent
                            </div>
                        )}
                    </div>
                </div>

                {/* ════════ MAIN INFO 2-COLUMN ════════ */}
                <div className="grid grid-cols-2 mt-1.5" style={{ gap: 0 }}>
                    {/* ── LEFT — Personal & Contact ── */}
                    <div className="pr-5" style={{ borderRight: "1px solid #cbd5e1" }}>
                        <CardSection title="ข้อมูลส่วนตัว" subtitle="Personal Info">
                            <Row label="วันเกิด" value={patient.dob ? new Date(patient.dob).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }) : "—"} />
                            <Row label="เลขประจำตัวประชาชน" value={patient.thai_id_card || "—"} mono />
                            {patient.passport_no && <Row label="Passport" value={patient.passport_no} mono />}
                            <Row label="สถานภาพ" value={maritalLabel[patient.marital_status] || "—"} />
                            <Row label="อาชีพ" value={patient.occupation || "—"} />
                            <Row label="เชื้อชาติ / สัญชาติ" value={`${patient.race || "—"} / ${patient.nationality || "—"}`} />
                        </CardSection>

                        <CardSection title="ข้อมูลติดต่อ" subtitle="Contact">
                            <Row label="โทรศัพท์" value={patient.phone || "—"} mono />
                            {patient.email && <Row label="อีเมล" value={patient.email} />}
                            {patient.line_user_id && <Row label="LINE" value={patient.line_user_id} mono />}
                            <Row label="ที่อยู่" value={fullAddress || "—"} wrap />
                        </CardSection>
                    </div>

                    {/* ── RIGHT — Medical & Emergency ── */}
                    <div className="pl-5">
                        <CardSection title="ข้อมูลทางการแพทย์" subtitle="Medical Info">
                            <Row label="สิทธิ์การรักษา" value={nhsoLabel[patient.nhso_rights] || "—"} />
                            {patient.nhso_main_hospital && <Row label="รพ.หลัก" value={patient.nhso_main_hospital} />}
                            <Row label="กรุ๊ปเลือด" value={patient.blood_group || "—"} mono />
                            <div className="flex items-baseline gap-2 leading-snug">
                                <span className={`shrink-0 w-24 ${chronicText ? "text-red-700 font-bold" : "text-slate-600"}`}>
                                    {chronicText ? "⚠ โรคประจำตัว" : "โรคประจำตัว"}
                                </span>
                                <span className={`flex-1 ${chronicText ? "text-red-700 font-bold" : "font-medium"}`}>
                                    {chronicText || "ไม่มี"}
                                </span>
                            </div>
                            <div className="flex items-baseline gap-2 leading-snug">
                                <span className={`shrink-0 w-24 ${allergyText ? "text-red-700 font-bold" : "text-slate-600"}`}>
                                    {allergyText ? "⚠ ประวัติแพ้" : "ประวัติแพ้"}
                                </span>
                                <span className={`flex-1 ${allergyText ? "text-red-700 font-bold" : "font-medium"}`}>
                                    {allergyText || "ไม่มี"}
                                </span>
                            </div>
                        </CardSection>

                        <CardSection title="ผู้ติดต่อฉุกเฉิน" subtitle="Emergency Contact">
                            <Row label="ชื่อ" value={
                                patient.emergency_contact_name
                                    ? `${patient.emergency_contact_name}${patient.emergency_contact_relation ? ` (${patient.emergency_contact_relation})` : ""}`
                                    : "—"
                            } />
                            <Row label="เบอร์โทร" value={patient.emergency_contact_phone || "—"} mono />
                        </CardSection>

                    </div>
                </div>

            </div>

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    @page { size: A5 landscape; margin: 8mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print-page { max-width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; font-size: 10px; }
                }
                @media screen {
                    .print-page {
                        background: white;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                        margin: 20px auto;
                        padding: 8mm;
                    }
                    body { background: #f1f5f9; }
                }
            `}</style>
        </>
    );
}

/* ═══════════════ Components ═══════════════ */

function CardSection({
    title, subtitle, children,
}: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <div className="mb-2.5">
            <div className="flex items-baseline gap-2 pb-0.5 mb-1.5" style={{ borderBottom: "1.5px solid #000" }}>
                <h3 className="text-[12px] font-black tracking-wider text-black uppercase" style={{ letterSpacing: "0.05em" }}>
                    {title}
                </h3>
                <span className="text-[10px] italic text-slate-500">{subtitle}</span>
            </div>
            <div className="text-[12px] space-y-1">{children}</div>
        </div>
    );
}

function Row({ label, value, mono, wrap }: { label: string; value: string; mono?: boolean; wrap?: boolean }) {
    return (
        <div className={`flex ${wrap ? "items-start" : "items-baseline"} gap-2 leading-snug`}>
            <span className="text-slate-600 shrink-0 w-24">{label}</span>
            <span className={`flex-1 ${mono ? "font-mono font-semibold" : "font-medium"} ${wrap ? "break-words" : ""}`}>{value}</span>
        </div>
    );
}
