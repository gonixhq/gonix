"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, Loader2, MessageCircle, ShieldCheck, AlertTriangle, Search, X } from "lucide-react";
import { PDPAModal } from "@/components/ui/pdpa-modal";
import { submitPendingRegistration } from "@/lib/actions/pending-registrations";

type Lang = "th" | "en";
type Opt = { value: string; th: string; en: string };
const lbl = (o: Opt, lang: Lang) => (lang === "en" ? o.en : o.th);
const opts = (set: Opt[], lang: Lang) => set.map((o) => ({ value: o.value, label: lbl(o, lang) }));

interface AddressItem {
    subdistrict_code: string;
    subdistrict_name: string;
    district_name: string;
    province_name: string;
    postal_code: string;
}

interface Clinic {
    id: string;
    clinic_name: string;
    clinic_name_en: string | null;
    phone: string | null;
    address_detail: string | null;
}

// ── Option sets (value = canonical เก็บลง DB เสมอ) ──
const PREFIX: Opt[] = [
    { value: "นาย", th: "นาย", en: "Mr." }, { value: "นาง", th: "นาง", en: "Mrs." },
    { value: "น.ส.", th: "น.ส.", en: "Ms." }, { value: "ด.ช.", th: "ด.ช.", en: "Master" }, { value: "ด.ญ.", th: "ด.ญ.", en: "Miss" },
];
const GENDER: Opt[] = [
    { value: "M", th: "ชาย", en: "Male" }, { value: "F", th: "หญิง", en: "Female" }, { value: "other", th: "อื่นๆ", en: "Other" },
];
const BLOOD: Opt[] = [
    { value: "A", th: "A", en: "A" }, { value: "B", th: "B", en: "B" }, { value: "AB", th: "AB", en: "AB" }, { value: "O", th: "O", en: "O" },
];
const MARITAL: Opt[] = [
    { value: "โสด", th: "โสด", en: "Single" }, { value: "สมรส", th: "สมรส", en: "Married" },
    { value: "หย่า", th: "หย่า", en: "Divorced" }, { value: "หม้าย", th: "หม้าย", en: "Widowed" },
];

// ── UI strings ──────────────────────────────────────
const T = {
    th: {
        successTitle: "ลงทะเบียนสำเร็จ!",
        successBody1: "ขอบคุณที่ลงทะเบียนล่วงหน้า",
        successBody2: "กรุณามายืนยันตัวตนที่เคาน์เตอร์เมื่อมาถึงคลินิก",
        headerTitle: "ลงทะเบียนล่วงหน้า",
        headerSub: "กรอกข้อมูลก่อนมา เพื่อความรวดเร็วในวันรับบริการ",
        secPersonal: "ข้อมูลส่วนตัว", secContact: "การติดต่อ", secAddress: "ที่อยู่", secMedical: "ข้อมูลทางการแพทย์", secEmergency: "ผู้ติดต่อฉุกเฉิน",
        prefix: "คำนำหน้า", gender: "เพศ", firstName: "ชื่อ *", lastName: "นามสกุล *",
        dob: "วันเกิด", idCard: "เลขบัตรประชาชน / Passport No.", idCardPh: "เลขบัตร 13 หลัก หรือ Passport No.",
        blood: "กรุ๊ปเลือด", marital: "สถานะสมรส", occupation: "อาชีพ", occupationPh: "เช่น พนักงานบริษัท",
        race: "เชื้อชาติ", nationality: "สัญชาติ", racePh: "ไทย",
        phone: "เบอร์โทรศัพท์ *", phonePh: "08X-XXX-XXXX", email: "อีเมล", emailPh: "example@email.com", lineId: "LINE ID", lineIdPh: "@somchai หรือเบอร์โทร LINE",
        addrDetail: "บ้านเลขที่ / ซอย / ถนน", addrDetailPh: "เช่น 99/9 ซ.สุขุมวิท 21 ถ.อโศก", moo: "หมู่ที่", mooPh: "เช่น 4",
        tambonSearch: "ค้นหาตำบล / รหัสปณ.", tambonPh: "พิมพ์ชื่อตำบลหรือรหัสปณ...", district: "อำเภอ", province: "จังหวัด",
        addrPrefix: "ที่อยู่:", clear: "ล้าง",
        allergy: "ประวัติแพ้ยา/อาหาร", allergyPh: "ระบุยา/อาหารที่แพ้ (ถ้ามี)", disease: "โรคประจำตัว", diseasePh: "เบาหวาน, ความดัน, ฯลฯ (ถ้ามี)",
        emgName: "ชื่อ", emgNamePh: "ชื่อ-นามสกุล", emgRelation: "ความสัมพันธ์", emgRelationPh: "บิดา, มารดา, ฯลฯ", emgPhone: "เบอร์โทร",
        pdpaRead: "อ่านนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA) ฉบับเต็ม",
        consentPre: "ข้าพเจ้าได้อ่านและยินยอมให้", consentMid: "เก็บและใช้ข้อมูลส่วนบุคคลและข้อมูลสุขภาพ ตามวัตถุประสงค์ที่ระบุใน", consentLink: "นโยบาย PDPA",
        submit: "ส่งข้อมูลลงทะเบียน", submitting: "กำลังส่ง...",
        footer: "ข้อมูลจะถูกเก็บอย่างปลอดภัย — เจ้าหน้าที่จะยืนยันตัวตนเมื่อท่านมาถึงคลินิก",
        errRequired: "กรุณากรอกชื่อ-นามสกุล และเบอร์โทร", errSubmit: "ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่",
        selectPh: "—",
    },
    en: {
        successTitle: "Registration complete!",
        successBody1: "Thank you for registering in advance.",
        successBody2: "Please verify your identity at the counter when you arrive.",
        headerTitle: "Pre-registration",
        headerSub: "Fill in your details before your visit for a faster check-in",
        secPersonal: "Personal Information", secContact: "Contact", secAddress: "Address", secMedical: "Medical Information", secEmergency: "Emergency Contact",
        prefix: "Title", gender: "Sex", firstName: "First name *", lastName: "Last name *",
        dob: "Date of birth", idCard: "National ID / Passport No.", idCardPh: "13-digit ID or Passport No.",
        blood: "Blood group", marital: "Marital status", occupation: "Occupation", occupationPh: "e.g. Company employee",
        race: "Race", nationality: "Nationality", racePh: "Thai",
        phone: "Phone number *", phonePh: "08X-XXX-XXXX", email: "Email", emailPh: "example@email.com", lineId: "LINE ID", lineIdPh: "@somchai or LINE phone number",
        addrDetail: "House no. / Soi / Road", addrDetailPh: "e.g. 99/9 Soi Sukhumvit 21, Asoke Rd.", moo: "Village no. (Moo)", mooPh: "e.g. 4",
        tambonSearch: "Search subdistrict / postal code", tambonPh: "Type subdistrict name or postal code...", district: "District", province: "Province",
        addrPrefix: "Address:", clear: "Clear",
        allergy: "Drug / food allergies", allergyPh: "Specify allergies (if any)", disease: "Chronic conditions", diseasePh: "Diabetes, hypertension, etc. (if any)",
        emgName: "Name", emgNamePh: "Full name", emgRelation: "Relationship", emgRelationPh: "Father, mother, etc.", emgPhone: "Phone",
        pdpaRead: "Read the full Personal Data Protection (PDPA) policy",
        consentPre: "I have read and consent to", consentMid: "collecting and using my personal and health data for the purposes stated in the", consentLink: "PDPA policy",
        submit: "Submit registration", submitting: "Submitting...",
        footer: "Your data is stored securely — staff will verify your identity when you arrive at the clinic.",
        errRequired: "Please enter your first name, last name and phone number", errSubmit: "Submission failed, please try again",
        selectPh: "—",
    },
} as const;

export default function RegisterForm({ clinic, clinicCode }: { clinic: Clinic; clinicCode: string }) {
    const supabase = createClient();
    const [lang, setLang] = useState<Lang>("th");
    const L = T[lang];
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");
    const [showPDPA, setShowPDPA] = useState(false);

    /* ── Subdistrict autocomplete ── */
    const [tambonQuery, setTambonQuery] = useState("");
    const [tambonResults, setTambonResults] = useState<AddressItem[]>([]);
    const [showTambonList, setShowTambonList] = useState(false);
    const [selectedAddress, setSelectedAddress] = useState<AddressItem | null>(null);
    const tambonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const searchTambon = useCallback((q: string) => {
        setTambonQuery(q);
        if (q.length < 2) { setTambonResults([]); setShowTambonList(false); return; }
        if (tambonTimer.current) clearTimeout(tambonTimer.current);
        tambonTimer.current = setTimeout(async () => {
            const isPostal = /^\d+$/.test(q);
            const { data } = await supabase
                .from("address_ref")
                .select("subdistrict_code, subdistrict_name, district_name, province_name, postal_code")
                .ilike(isPostal ? "postal_code" : "subdistrict_name", `%${q}%`)
                .limit(15);
            if (data && data.length > 0) { setTambonResults(data); setShowTambonList(true); }
            else { setTambonResults([]); setShowTambonList(false); }
        }, 300);
    }, [supabase]);

    function selectTambon(addr: AddressItem) {
        setSelectedAddress(addr);
        setTambonQuery(addr.subdistrict_name);
        setShowTambonList(false);
    }

    function clearTambon() {
        setSelectedAddress(null);
        setTambonQuery("");
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        const form = new FormData(e.currentTarget);
        const getField = (n: string) => (form.get(n) as string)?.trim() || null;

        const firstName = getField("first_name");
        const lastName = getField("last_name");
        const phone = getField("phone");

        if (!firstName || !lastName || !phone) {
            setError(L.errRequired);
            setSubmitting(false);
            return;
        }

        const payload = {
            clinic_id: clinic.id,
            source: "online_form",
            prefix: getField("prefix"),
            first_name: firstName,
            last_name: lastName,
            dob: getField("dob"),
            gender: getField("gender"),
            thai_id_card: getField("thai_id_card"),
            phone,
            email: getField("email"),
            line_id_handle: getField("line_id_handle"),
            blood_group: getField("blood_group"),
            marital_status: getField("marital_status"),
            occupation: getField("occupation"),
            race: getField("race"),
            nationality: getField("nationality"),
            address_detail: getField("address_detail"),
            address_moo: getField("address_moo"),
            subdistrict_code: selectedAddress?.subdistrict_code || null,
            allergy_summary: getField("allergy_summary"),
            disease_summary: getField("disease_summary"),
            emergency_contact_name: getField("emergency_contact_name"),
            emergency_contact_phone: getField("emergency_contact_phone"),
            emergency_contact_relation: getField("emergency_contact_relation"),
            pdpa_consent: form.get("pdpa_consent") === "on",
        };

        // ส่งผ่าน server action → RPC security-definer (clinic_id ผูกจาก code + rate limit, mig 110)
        const res = await submitPendingRegistration(clinicCode, payload);
        if (!res.ok) {
            setError(res.error || L.errSubmit);
            setSubmitting(false);
            return;
        }

        setDone(true);
        setSubmitting(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (done) {
        return (
            <div className="min-h-screen flex items-center justify-center p-5" style={{ background: "radial-gradient(62% 45% at 72% 20%, rgba(255,255,255,0.9) 0%, transparent 60%), radial-gradient(95% 60% at 100% 3%, rgba(8,145,178,0.10) 0%, transparent 55%), repeating-linear-gradient(102deg, rgba(105,125,150,0.12) 0px, rgba(105,125,150,0.12) 1px, transparent 1px, transparent 6px), linear-gradient(150deg, #eef2f6 0%, #dbe2e9 48%, #cbd5dd 100%)" }}>
                <div className="bg-white rounded-3xl shadow-xl border border-emerald-100 max-w-md w-full p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="h-9 w-9 text-emerald-600" />
                    </div>
                    <h1 className="text-2xl font-extrabold text-slate-800">{L.successTitle}</h1>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                        {L.successBody1}<br />
                        {L.successBody2}
                    </p>
                    <div className="mt-5 pt-5 border-t border-slate-100">
                        <p className="text-xs text-slate-500">{lang === "en" ? (clinic.clinic_name_en || clinic.clinic_name) : clinic.clinic_name}</p>
                        {clinic.phone && <p className="text-xs text-slate-500 mt-1">{clinic.phone}</p>}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen py-5 sm:py-8 px-3 sm:px-4" style={{ background: "radial-gradient(62% 45% at 72% 20%, rgba(255,255,255,0.9) 0%, transparent 60%), radial-gradient(95% 60% at 100% 3%, rgba(8,145,178,0.10) 0%, transparent 55%), repeating-linear-gradient(102deg, rgba(105,125,150,0.12) 0px, rgba(105,125,150,0.12) 1px, transparent 1px, transparent 6px), linear-gradient(150deg, #eef2f6 0%, #dbe2e9 48%, #cbd5dd 100%)" }}>
            <PDPAModal open={showPDPA} onClose={() => setShowPDPA(false)} clinicName={clinic.clinic_name} />
            <div className="max-w-2xl mx-auto">
                {/* Language switcher */}
                <div className="flex justify-center mb-4">
                    <div className="inline-flex items-center rounded-2xl bg-white border border-slate-200 shadow-sm p-1.5 gap-1.5">
                        {([["th", "ไทย", <ThaiFlag key="th" />], ["en", "English", <UkFlag key="en" />]] as [Lang, string, React.ReactNode][]).map(([lg, name, flag]) => (
                            <button key={lg} onClick={() => setLang(lg)} type="button"
                                className={`h-11 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-all ${lang === lg ? "bg-[#0891b2] text-white shadow-md scale-[1.03]" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"}`}>
                                <span className="h-5 w-8 rounded-[3px] overflow-hidden ring-1 ring-black/10 shrink-0 inline-flex">{flag}</span>
                                {name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Header */}
                <div className="text-center mb-6 px-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/clinic-logo.png" alt="" className="mx-auto block h-32 w-32 sm:h-36 sm:w-36 object-contain mb-2" />
                    <div className="text-lg font-black text-[#0e7490]">{lang === "en" ? (clinic.clinic_name_en || clinic.clinic_name) : clinic.clinic_name}</div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight mt-1">{L.headerTitle}</h1>
                    <p className="text-sm text-slate-500 mt-1.5">{L.headerSub}</p>
                    {clinic.address_detail && <p className="text-xs text-slate-400 mt-1">{clinic.address_detail}</p>}
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200/60 p-4 sm:p-6 space-y-4 sm:space-y-5">
                    {error && (
                        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                        </div>
                    )}

                    {/* Name */}
                    <SectionTitle>{L.secPersonal}</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label={L.prefix} name="prefix" type="select" ph={L.selectPh} options={opts(PREFIX, lang)} />
                        <Field label={L.gender} name="gender" type="select" ph={L.selectPh} options={opts(GENDER, lang)} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label={L.firstName} name="first_name" required />
                        <Field label={L.lastName} name="last_name" required />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label={L.dob} name="dob" type="date" />
                        <Field label={L.idCard} name="thai_id_card" placeholder={L.idCardPh} maxLength={20} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label={L.blood} name="blood_group" type="select" ph={L.selectPh} options={opts(BLOOD, lang)} />
                        <Field label={L.marital} name="marital_status" type="select" ph={L.selectPh} options={opts(MARITAL, lang)} />
                    </div>

                    <Field label={L.occupation} name="occupation" placeholder={L.occupationPh} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label={L.race} name="race" placeholder={L.racePh} defaultValue="ไทย" />
                        <Field label={L.nationality} name="nationality" placeholder={L.racePh} defaultValue="ไทย" />
                    </div>

                    {/* Contact */}
                    <SectionTitle>{L.secContact}</SectionTitle>
                    <div className="grid grid-cols-1 gap-3">
                        <Field label={L.phone} name="phone" type="tel" required placeholder={L.phonePh} />
                        <Field label={L.email} name="email" type="email" placeholder={L.emailPh} />
                        <Field label={L.lineId} name="line_id_handle" placeholder={L.lineIdPh} />
                    </div>

                    {/* Address */}
                    <SectionTitle>{L.secAddress}</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                            <Field label={L.addrDetail} name="address_detail" placeholder={L.addrDetailPh} />
                        </div>
                        <Field label={L.moo} name="address_moo" placeholder={L.mooPh} />
                    </div>

                    {/* Tambon autocomplete */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="space-y-1.5 relative sm:col-span-2">
                            <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                                <Search className="h-3 w-3" /> {L.tambonSearch}
                            </Label>
                            <Input
                                value={tambonQuery}
                                onChange={(e) => searchTambon(e.target.value)}
                                onFocus={() => tambonResults.length > 0 && setShowTambonList(true)}
                                placeholder={L.tambonPh}
                                className="h-12 rounded-xl border-slate-300 focus:ring-cyan-500/30 focus:border-cyan-500 text-base sm:text-sm"
                            />
                            {showTambonList && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                                    {tambonResults.map((addr) => (
                                        <button key={addr.subdistrict_code} type="button" onClick={() => selectTambon(addr)}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-cyan-50 transition-colors border-b border-slate-100 last:border-0">
                                            <span className="font-medium">{addr.subdistrict_name}</span>
                                            <span className="text-slate-500"> → {addr.district_name}, {addr.province_name} {addr.postal_code}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">{L.district}</Label>
                            <Input value={selectedAddress?.district_name || ""} disabled
                                className="h-11 rounded-xl bg-slate-100 text-slate-600 border-slate-200" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">{L.province}</Label>
                            <Input value={selectedAddress?.province_name || ""} disabled
                                className="h-11 rounded-xl bg-slate-100 text-slate-600 border-slate-200" />
                        </div>
                    </div>
                    {selectedAddress && (
                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-cyan-50 border border-cyan-200 text-xs">
                            <span className="text-cyan-800">
                                 {L.addrPrefix} ต.{selectedAddress.subdistrict_name} อ.{selectedAddress.district_name} จ.{selectedAddress.province_name} <strong>{selectedAddress.postal_code}</strong>
                            </span>
                            <button type="button" onClick={clearTambon} className="text-cyan-600 hover:underline inline-flex items-center gap-1">
                                <X className="h-3 w-3" /> {L.clear}
                            </button>
                        </div>
                    )}

                    {/* Medical */}
                    <SectionTitle>{L.secMedical}</SectionTitle>
                    <div className="space-y-3">
                        <FieldTextarea label={L.allergy} name="allergy_summary" placeholder={L.allergyPh} />
                        <FieldTextarea label={L.disease} name="disease_summary" placeholder={L.diseasePh} />
                    </div>

                    {/* Emergency */}
                    <SectionTitle>{L.secEmergency}</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label={L.emgName} name="emergency_contact_name" placeholder={L.emgNamePh} />
                        <Field label={L.emgRelation} name="emergency_contact_relation" placeholder={L.emgRelationPh} />
                    </div>
                    <Field label={L.emgPhone} name="emergency_contact_phone" type="tel" placeholder={L.phonePh} />

                    {/* PDPA */}
                    <div className="pt-3 border-t border-slate-200 space-y-2">
                        <button
                            type="button"
                            onClick={() => setShowPDPA(true)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 transition-colors group"
                        >
                            <span className="text-sm font-bold text-cyan-900 inline-flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-cyan-600" />
                                {L.pdpaRead}
                            </span>
                            <span className="text-xs text-cyan-600 font-bold group-hover:translate-x-0.5 transition-transform">›</span>
                        </button>

                        <label className="flex items-start gap-2.5 cursor-pointer">
                            <input type="checkbox" name="pdpa_consent" required
                                className="h-5 w-5 mt-0.5 rounded accent-cyan-600" />
                            <span className="text-sm text-slate-700 leading-relaxed">
                                {L.consentPre} <strong>{lang === "en" ? (clinic.clinic_name_en || clinic.clinic_name) : clinic.clinic_name}</strong> {L.consentMid}{" "}
                                <button type="button" onClick={() => setShowPDPA(true)} className="text-cyan-600 font-bold underline hover:text-cyan-700">
                                    {L.consentLink}
                                </button>
                                {" "}<span className="text-red-500">*</span>
                            </span>
                        </label>
                    </div>

                    {/* Submit */}
                    <Button type="submit" disabled={submitting}
                        className="w-full rounded-xl h-14 text-base font-semibold bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 shadow-md">
                        {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <MessageCircle className="h-5 w-5 mr-2" />}
                        {submitting ? L.submitting : L.submit}
                    </Button>

                    <p className="text-xs text-center text-slate-400">
                        {L.footer}
                    </p>
                </form>
            </div>
        </div>
    );
}

/* ─── Flags (SVG) ─── */
function ThaiFlag() {
    return (
        <svg viewBox="0 0 60 40" className="h-full w-full" preserveAspectRatio="none">
            <rect width="60" height="40" fill="#A51931" />
            <rect y="6.67" width="60" height="26.66" fill="#F4F5F8" />
            <rect y="13.33" width="60" height="13.34" fill="#2D2A4A" />
        </svg>
    );
}
function UkFlag() {
    return (
        <svg viewBox="0 0 60 40" className="h-full w-full" preserveAspectRatio="none">
            <defs><clipPath id="ukclip-reg"><rect width="60" height="40" /></clipPath></defs>
            <g clipPath="url(#ukclip-reg)">
                <rect width="60" height="40" fill="#012169" />
                <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8" />
                <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="4" />
                <path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="13" />
                <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="7" />
            </g>
        </svg>
    );
}

/* ─── Components ─── */
function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 pt-2">
            <div className="h-1 w-8 bg-cyan-600 rounded-full" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{children}</h3>
        </div>
    );
}

function Field({
    label, name, type = "text", placeholder, required, options, maxLength, defaultValue, ph,
}: {
    label: string; name: string; type?: string;
    placeholder?: string; required?: boolean;
    options?: { value: string; label: string }[];
    maxLength?: number;
    defaultValue?: string;
    ph?: string;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={name} className="text-xs font-semibold text-slate-600">{label}</Label>
            {type === "select" ? (
                <select name={name} id={name} required={required} defaultValue={defaultValue || ""}
                    className="flex h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500">
                    <option value="">{ph || "—"}</option>
                    {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            ) : (
                <Input id={name} name={name} type={type} required={required} placeholder={placeholder} maxLength={maxLength} defaultValue={defaultValue}
                    className="h-12 rounded-xl border-slate-300 focus:ring-cyan-500/30 focus:border-cyan-500 text-base sm:text-sm" />
            )}
        </div>
    );
}

function FieldTextarea({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={name} className="text-xs font-semibold text-slate-600">{label}</Label>
            <textarea id={name} name={name} placeholder={placeholder} rows={3}
                className="flex w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 resize-none" />
        </div>
    );
}
