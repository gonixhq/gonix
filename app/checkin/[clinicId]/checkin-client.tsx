"use client";

import { useState, useTransition, useEffect } from "react";
import QRCode from "qrcode";
import {
    ShieldCheck, ArrowRight, ArrowLeft, Loader2, CheckCircle2, Download,
    Copy, Lock, AlertTriangle,
} from "lucide-react";
import { submitAnonRegistration } from "@/lib/actions/anon-public";
import { THAI_PROVINCES } from "@/lib/utils/thai-provinces";

type Lang = "th" | "en";
type Opt = { value: string; th: string; en: string };
const lbl = (o: Opt, lang: Lang) => (lang === "en" ? o.en : o.th);

// ── Option sets (value = ไทย canonical เก็บลง DB เสมอ) ──
const SEX: Opt[] = [
    { value: "male", th: "ชาย", en: "Male" }, { value: "female", th: "หญิง", en: "Female" }, { value: "other", th: "อื่นๆ", en: "Other" },
];
const MARITAL: Opt[] = [
    { value: "โสด", th: "โสด", en: "Single" }, { value: "สมรส", th: "สมรส", en: "Married" },
    { value: "หย่า/แยกกันอยู่", th: "หย่า/แยกกันอยู่", en: "Divorced / Separated" }, { value: "หม้าย", th: "หม้าย", en: "Widowed" },
];
const EDUCATION: Opt[] = [
    { value: "ประถม", th: "ประถม", en: "Primary" }, { value: "มัธยม/ปวช.", th: "มัธยม/ปวช.", en: "Secondary / Voc." },
    { value: "ปวส./อนุปริญญา", th: "ปวส./อนุปริญญา", en: "Diploma" }, { value: "ปริญญาตรี", th: "ปริญญาตรี", en: "Bachelor's" },
    { value: "สูงกว่าปริญญาตรี", th: "สูงกว่าปริญญาตรี", en: "Postgraduate" },
];
const INCOME: Opt[] = [
    { value: "< 15,000", th: "< 15,000", en: "< 15,000" }, { value: "15,000–30,000", th: "15,000–30,000", en: "15,000–30,000" },
    { value: "30,001–50,000", th: "30,001–50,000", en: "30,001–50,000" }, { value: "> 50,000", th: "> 50,000", en: "> 50,000" },
];
const SEX_PARTNERS: Opt[] = [
    { value: "ชาย", th: "ชาย", en: "Male" }, { value: "หญิง", th: "หญิง", en: "Female" },
    { value: "สาวประเภทสอง", th: "สาวประเภทสอง", en: "Transgender woman" }, { value: "ชายข้ามเพศ", th: "ชายข้ามเพศ", en: "Transgender man" },
];
const GENDER_IDENTITY: Opt[] = [
    { value: "ชาย", th: "ชาย", en: "Male" }, { value: "หญิง", th: "หญิง", en: "Female" },
    { value: "ชายรักชาย", th: "ชายรักชาย", en: "Gay / MSM" }, { value: "หญิงรักหญิง", th: "หญิงรักหญิง", en: "Lesbian" },
    { value: "หญิงข้ามเพศ", th: "หญิงข้ามเพศ", en: "Transgender woman" }, { value: "ชายข้ามเพศ", th: "ชายข้ามเพศ", en: "Transgender man" },
    { value: "ไม่ขอระบุ", th: "ไม่ขอระบุ", en: "Prefer not to say" }, { value: "อื่นๆ", th: "อื่นๆ", en: "Other" },
];
const HEAR_FROM: Opt[] = [
    { value: "เพื่อน/คนรู้จัก", th: "เพื่อน/คนรู้จัก", en: "Friend / acquaintance" },
    { value: "อินเทอร์เน็ต/โซเชียล", th: "อินเทอร์เน็ต/โซเชียล", en: "Internet / social media" },
    { value: "เคยมาใช้บริการ", th: "เคยมาใช้บริการ", en: "Returning client" },
    { value: "หน่วยงาน/องค์กร", th: "หน่วยงาน/องค์กร", en: "Organization / referral" },
    { value: "อื่นๆ", th: "อื่นๆ", en: "Other" },
];
const SERVICES: Opt[] = [
    { value: "ตรวจเอชไอวี / โรคติดต่อทางเพศสัมพันธ์ (STDs)", th: "ตรวจเอชไอวี / โรคติดต่อทางเพศสัมพันธ์ (STDs)", en: "HIV / STDs testing" },
    { value: "รับยาฉุกเฉินหลังเสี่ยง (PEP)", th: "รับยาฉุกเฉินหลังเสี่ยง (PEP)", en: "Post-exposure prophylaxis (PEP)" },
    { value: "รับยาป้องกันก่อนเสี่ยง (PrEP)", th: "รับยาป้องกันก่อนเสี่ยง (PrEP)", en: "Pre-exposure prophylaxis (PrEP)" },
    { value: "มาฟังผลการตรวจ", th: "มาฟังผลการตรวจ", en: "Get test results" },
    { value: "มาปรึกษาแพทย์", th: "มาปรึกษาแพทย์", en: "Consult a doctor" },
    { value: "ตรวจคัดกรองมะเร็ง", th: "ตรวจคัดกรองมะเร็ง", en: "Cancer screening" },
    { value: "ฉีดวัคซีน", th: "ฉีดวัคซีน", en: "Vaccination" },
    { value: "อื่นๆ", th: "อื่นๆ", en: "Other" },
];
const REASONS: Opt[] = [
    { value: "เปลี่ยนคู่นอนใหม่", th: "เปลี่ยนคู่นอนใหม่", en: "New sexual partner" },
    { value: "คู่นอนมีเชื้อ", th: "คู่นอนมีเชื้อ", en: "Partner is infected" },
    { value: "มีเหตุการณ์เสี่ยง", th: "มีเหตุการณ์เสี่ยง", en: "Had a risky event" },
    { value: "มีอาการผิดปกติ", th: "มีอาการผิดปกติ", en: "Have symptoms" },
    { value: "ตรวจสุขภาพประจำปี", th: "ตรวจสุขภาพประจำปี", en: "Routine check-up" },
];
const PROTECTIONS: Opt[] = [
    { value: "สวมถุงยางอนามัย", th: "สวมถุงยางอนามัย", en: "Used a condom" },
    { value: "ไม่สวมถุงยางอนามัย", th: "ไม่สวมถุงยางอนามัย", en: "No condom" },
    { value: "ถุงยางแตก/รั่ว/หลุด", th: "ถุงยางแตก/รั่ว/หลุด", en: "Condom broke / slipped" },
    { value: "ใช้ปากหรือนิ้ว", th: "ใช้ปากหรือนิ้ว", en: "Oral / fingers" },
    { value: "สัมผัสสารคัดหลั่งเข้าตา/แผล", th: "สัมผัสสารคัดหลั่งเข้าตา/แผล", en: "Fluid contact with eye / wound" },
];
const RISK_UNITS: Opt[] = [
    { value: "วัน", th: "วัน", en: "Day" }, { value: "สัปดาห์", th: "สัปดาห์", en: "Week" }, { value: "เดือน", th: "เดือน", en: "Month" },
];
const provinceOpts: Opt[] = THAI_PROVINCES.map((p) => ({ value: p, th: p, en: p }));

// ── UI strings ──────────────────────────────────────
const T = {
    th: {
        brandTitle: "ลงทะเบียนตรวจแบบนิรนาม", brandSub: "ข้อมูลเป็นความลับ ไม่ระบุตัวตน",
        welcome: "ยินดีต้อนรับ", pdpaTitle: "นโยบายความเป็นส่วนตัว (PDPA)",
        pdpaBody: "คลินิกเก็บข้อมูลของท่านเพื่อใช้ในการให้บริการตรวจและให้คำปรึกษาเท่านั้น ระบบนี้ออกแบบให้ไม่ระบุตัวตน — ท่านจะได้รับ “รหัสยืนยัน 6 หลัก” แทนการใช้ชื่อจริง ข้อมูลจะถูกเก็บเป็นความลับตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 ท่านสามารถขอลบข้อมูลได้ที่คลินิก",
        consent: "ข้าพเจ้าได้อ่านและยอมรับนโยบายความเป็นส่วนตัว และยินยอมให้เก็บข้อมูลเพื่อการให้บริการ",
        startBtn: "ลงทะเบียนและคัดกรองความเสี่ยง",
        next: "ถัดไป", back: "ย้อนกลับ", submit: "ส่ง & รับรหัส",
        step1: "ข้อมูลพื้นฐาน", step2: "บริการที่ต้องการในครั้งนี้", step3: "คัดกรองก่อนตรวจ",
        sex: "เพศ (สำหรับสถิติ)", age: "อายุ (ปี)", agePh: "เช่น 28",
        district: "เขต / อำเภอ (ที่อยู่ปัจจุบัน)", province: "จังหวัด", birthProvince: "เกิดที่จังหวัด",
        email: "อีเมล", emailPh: "ใช้รับรหัส (ไม่บังคับ)", phone: "เบอร์มือถือ", phonePh: "ใช้ยืนยันตอนเช็คผล",
        marital: "สถานภาพสมรส", education: "ระดับการศึกษา", occupation: "อาชีพ", income: "รายได้ต่อเดือน (บาท)", weight: "น้ำหนัก (กก.)",
        sexHistory: "ประวัติการมีเพศสัมพันธ์ *", never: "ไม่เคยมี", had: "เคยมี", sexWith: "เคยมีเพศสัมพันธ์กับ",
        genderIdentity: "อัตลักษณ์ทางเพศ *", hearFrom: "รู้จักคลินิกจากทางใด",
        servicesLabel: "เลือกบริการ (ได้หลายข้อ)", hivYear: "หากทราบว่าติดเชื้อ HIV อยู่แล้ว — ทราบผลเมื่อปี พ.ศ.", hivYearPh: "เช่น 2565 (ไม่บังคับ)",
        reasons: "สาเหตุที่เข้ารับบริการตรวจ", protections: "การป้องกันในเหตุการณ์เสี่ยง",
        riskTime: "ระยะเวลาที่เกิดความเสี่ยงล่าสุด", selfHarm: "เคยมีความคิดทำร้ายตนเองหรือไม่", wantCounselor: "ต้องการผู้ให้คำปรึกษาพิเศษหรือไม่",
        yes: "ใช่", no: "ไม่ใช่", selectPh: "— เลือก —",
        regSuccess: "ลงทะเบียนสำเร็จ", regSuccessSub: "นำรหัสนี้ไปยื่นที่เคาน์เตอร์คลินิก",
        verifyCode: "รหัสยืนยัน (Verify Code)", copyCode: "คัดลอกรหัส", copied: "คัดลอกแล้ว!", downloadQR: "ดาวน์โหลด QR",
        expiryNote: (d: string) => `รหัสมีอายุ 72 ชั่วโมง (หมดอายุ ${d})`,
        keepNote: "กรุณาบันทึก/ถ่ายภาพรหัสไว้ — ใช้ยื่นที่เคาน์เตอร์เพื่อเข้ารับบริการ และใช้เช็คผลออนไลน์ภายหลัง",
        smsNote: "การส่งรหัสผ่าน SMS / อีเมล จะเปิดให้บริการเร็วๆ นี้",
        errGender: "กรุณาเลือกอัตลักษณ์ทางเพศ", errSexHistory: "กรุณาระบุประวัติการมีเพศสัมพันธ์", ago: "ที่แล้ว",
    },
    en: {
        brandTitle: "Anonymous Testing Registration", brandSub: "Confidential · Identity not required",
        welcome: "Welcome", pdpaTitle: "Privacy Policy (PDPA)",
        pdpaBody: "The clinic collects your information solely to provide testing and counseling. This system is anonymous — you will receive a 6-character verify code instead of using your real name. Data is kept confidential under Thailand's Personal Data Protection Act B.E. 2562. You may request deletion at the clinic.",
        consent: "I have read and accept the privacy policy and consent to data collection for service provision.",
        startBtn: "Register & Risk Screening",
        next: "Next", back: "Back", submit: "Submit & Get Code",
        step1: "Basic Information", step2: "Services Needed Today", step3: "Pre-test Screening",
        sex: "Sex (for statistics)", age: "Age (years)", agePh: "e.g. 28",
        district: "District (current address)", province: "Province", birthProvince: "Province of birth",
        email: "Email", emailPh: "to receive code (optional)", phone: "Mobile number", phonePh: "to verify when checking results",
        marital: "Marital status", education: "Education level", occupation: "Occupation", income: "Monthly income (THB)", weight: "Weight (kg)",
        sexHistory: "Sexual history *", never: "Never", had: "Yes, I have", sexWith: "Had sex with",
        genderIdentity: "Gender identity *", hearFrom: "How did you hear about us?",
        servicesLabel: "Select services (multiple)", hivYear: "If already HIV positive — year diagnosed (B.E.)", hivYearPh: "e.g. 2565 (optional)",
        reasons: "Reasons for testing", protections: "Protection during risky event",
        riskTime: "Time since last risk event", selfHarm: "Ever had thoughts of self-harm?", wantCounselor: "Need a special counselor?",
        yes: "Yes", no: "No", selectPh: "— Select —",
        regSuccess: "Registration complete", regSuccessSub: "Show this code at the clinic counter",
        verifyCode: "Verify Code", copyCode: "Copy code", copied: "Copied!", downloadQR: "Download QR",
        expiryNote: (d: string) => `Code valid for 72 hours (expires ${d})`,
        keepNote: "Please save / screenshot this code — use it at the counter and to check your results online later.",
        smsNote: "Sending the code via SMS / email is coming soon.",
        errGender: "Please select your gender identity", errSexHistory: "Please indicate your sexual history", ago: "ago",
    },
} as const;

interface Form {
    patientType: "new" | "old";
    sex: string; age: string;
    addr_district: string; addr_province: string; birth_province: string;
    email: string; phone: string;
    marital: string; education: string; occupation: string; income: string; weight: string;
    sexual_history: string; sexual_partners: string[];
    gender_identity: string; hear_from: string[];
    services: string[]; hiv_known_year: string;
    reasons: string[]; protections: string[];
    risk_amount: string; risk_unit: string;
    self_harm: string; want_counselor: string;
}
const EMPTY: Form = {
    patientType: "new", sex: "", age: "", addr_district: "", addr_province: "", birth_province: "",
    email: "", phone: "", marital: "", education: "", occupation: "", income: "", weight: "",
    sexual_history: "", sexual_partners: [], gender_identity: "", hear_from: [],
    services: [], hiv_known_year: "", reasons: [], protections: [], risk_amount: "", risk_unit: "วัน",
    self_harm: "", want_counselor: "",
};

export default function CheckinClient({ clinicId }: { clinicId: string }) {
    const [lang, setLang] = useState<Lang>("th");
    const [step, setStep] = useState(0);
    const [consent, setConsent] = useState(false);
    const [f, setF] = useState<Form>(EMPTY);
    const [err, setErr] = useState("");
    const [saving, startSave] = useTransition();
    const [result, setResult] = useState<{ code: string; expiresAt: string } | null>(null);
    const L = T[lang];

    const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
    const toggle = (k: keyof Form, v: string) => setF((p) => {
        const arr = new Set(p[k] as string[]);
        if (arr.has(v)) arr.delete(v); else arr.add(v);
        return { ...p, [k]: [...arr] };
    });

    function next() {
        setErr("");
        if (step === 1) {
            if (!f.gender_identity) { setErr(L.errGender); return; }
            if (!f.sexual_history) { setErr(L.errSexHistory); return; }
        }
        setStep((s) => s + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function back() { setErr(""); setStep((s) => s - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }

    function submit() {
        setErr("");
        startSave(async () => {
            const { patientType, sex, age, email, phone, ...rest } = f;
            const res = await submitAnonRegistration(clinicId, {
                sex: sex || null,
                age: age ? Number(age) : null,
                email: email || null,
                phone: phone || null,
                questionnaire: { patientType, lang, ...rest, email, phone },
            });
            if (res.ok) { setResult({ code: res.verifyCode, expiresAt: res.expiresAt }); setStep(4); window.scrollTo({ top: 0 }); }
            else setErr(res.error);
        });
    }

    return (
        <div className="min-h-screen" style={{ background: "linear-gradient(160deg,#0b1020,#141A33 55%,#1C2244)" }}>
            <div className="max-w-2xl mx-auto px-4 py-8">
                {/* Brand header */}
                <div className="flex items-center gap-3 mb-4 text-white">
                    <div className="h-11 w-11 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00FFCC,#15FF83)" }}>
                        <ShieldCheck className="h-6 w-6 text-[#0A1020]" />
                    </div>
                    <div>
                        <div className="font-black text-lg leading-tight">{L.brandTitle}</div>
                        <div className="text-[11px] text-white/60 flex items-center gap-1"><Lock className="h-3 w-3" /> {L.brandSub}</div>
                    </div>
                </div>

                {/* Language switcher — ใหญ่ + ธงชาติ + กึ่งกลาง */}
                <div className="flex justify-center mb-6">
                    <div className="inline-flex items-center rounded-2xl bg-white/10 border border-white/15 p-1.5 gap-1.5 backdrop-blur-sm">
                        {([["th", "ไทย", <ThaiFlag key="th" />], ["en", "English", <UkFlag key="en" />]] as [Lang, string, React.ReactNode][]).map(([lg, name, flag]) => (
                            <button key={lg} onClick={() => setLang(lg)}
                                className={`h-12 px-5 rounded-xl text-base font-bold inline-flex items-center gap-2.5 transition-all ${lang === lg ? "bg-white text-[#1C2244] shadow-lg scale-[1.03]" : "text-white/70 hover:text-white hover:bg-white/5"}`}>
                                <span className="h-6 w-9 rounded-[3px] overflow-hidden ring-1 ring-black/10 shrink-0 inline-flex">{flag}</span>
                                {name}
                            </button>
                        ))}
                    </div>
                </div>

                {step >= 1 && step <= 3 && (
                    <div className="flex items-center gap-1.5 mb-4">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className="flex-1 h-1.5 rounded-full" style={{ background: s <= step ? "#00FFCC" : "rgba(255,255,255,0.15)" }} />
                        ))}
                    </div>
                )}

                <div className="bg-white rounded-3xl shadow-2xl p-5 sm:p-7">
                    {/* STEP 0: Consent */}
                    {step === 0 && (
                        <div className="space-y-4">
                            <h1 className="text-xl font-black text-slate-800">{L.welcome}</h1>
                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600 leading-relaxed max-h-52 overflow-y-auto">
                                <p className="font-bold text-slate-700 mb-1">{L.pdpaTitle}</p>
                                <p>{L.pdpaBody}</p>
                            </div>
                            <label className="flex items-start gap-2.5 cursor-pointer">
                                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-5 w-5 accent-[#2B54F0] mt-0.5" />
                                <span className="text-sm text-slate-700">{L.consent}</span>
                            </label>
                            <button onClick={() => setStep(1)} disabled={!consent}
                                className="w-full h-12 rounded-2xl text-white font-bold disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                                style={{ background: "linear-gradient(90deg,#2B54F0,#00A6C0)" }}>
                                {L.startBtn} <ArrowRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    {/* STEP 1 */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <StepTitle n={1} title={L.step1} />
                            <div className="grid grid-cols-2 gap-3">
                                <Sel label={L.sex} value={f.sex} onChange={(v) => set("sex", v)} options={SEX} lang={lang} ph={L.selectPh} />
                                <Txt label={L.age} type="number" value={f.age} onChange={(v) => set("age", v)} placeholder={L.agePh} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Txt label={L.district} value={f.addr_district} onChange={(v) => set("addr_district", v)} />
                                <Sel label={L.province} value={f.addr_province} onChange={(v) => set("addr_province", v)} options={provinceOpts} lang={lang} ph={L.selectPh} />
                            </div>
                            <Sel label={L.birthProvince} value={f.birth_province} onChange={(v) => set("birth_province", v)} options={provinceOpts} lang={lang} ph={L.selectPh} />
                            <div className="grid grid-cols-2 gap-3">
                                <Txt label={L.email} type="email" value={f.email} onChange={(v) => set("email", v)} placeholder={L.emailPh} />
                                <Txt label={L.phone} type="tel" value={f.phone} onChange={(v) => set("phone", v)} placeholder={L.phonePh} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Sel label={L.marital} value={f.marital} onChange={(v) => set("marital", v)} options={MARITAL} lang={lang} ph={L.selectPh} />
                                <Sel label={L.education} value={f.education} onChange={(v) => set("education", v)} options={EDUCATION} lang={lang} ph={L.selectPh} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Txt label={L.occupation} value={f.occupation} onChange={(v) => set("occupation", v)} />
                                <Sel label={L.income} value={f.income} onChange={(v) => set("income", v)} options={INCOME} lang={lang} ph={L.selectPh} />
                            </div>
                            <Txt label={L.weight} type="number" value={f.weight} onChange={(v) => set("weight", v)} />

                            <RadioGroup label={L.sexHistory} value={f.sexual_history} onChange={(v) => set("sexual_history", v)}
                                options={[{ value: "never", th: L.never, en: L.never }, { value: "had", th: L.had, en: L.had }]} lang={lang} />
                            {f.sexual_history === "had" && (
                                <CheckGroup label={L.sexWith} values={f.sexual_partners} onToggle={(v) => toggle("sexual_partners", v)} options={SEX_PARTNERS} lang={lang} />
                            )}
                            <RadioGroup label={L.genderIdentity} value={f.gender_identity} onChange={(v) => set("gender_identity", v)} options={GENDER_IDENTITY} lang={lang} wrap />
                            <CheckGroup label={L.hearFrom} values={f.hear_from} onToggle={(v) => toggle("hear_from", v)} options={HEAR_FROM} lang={lang} />
                        </div>
                    )}

                    {/* STEP 2 */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <StepTitle n={2} title={L.step2} />
                            <CheckGroup label={L.servicesLabel} values={f.services} onToggle={(v) => toggle("services", v)} options={SERVICES} lang={lang} />
                            <Txt label={L.hivYear} type="number" value={f.hiv_known_year} onChange={(v) => set("hiv_known_year", v)} placeholder={L.hivYearPh} />
                        </div>
                    )}

                    {/* STEP 3 */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <StepTitle n={3} title={L.step3} />
                            <CheckGroup label={L.reasons} values={f.reasons} onToggle={(v) => toggle("reasons", v)} options={REASONS} lang={lang} />
                            <CheckGroup label={L.protections} values={f.protections} onToggle={(v) => toggle("protections", v)} options={PROTECTIONS} lang={lang} />
                            <div>
                                <FieldLabel>{L.riskTime}</FieldLabel>
                                <div className="flex gap-2">
                                    <input type="number" value={f.risk_amount} onChange={(e) => set("risk_amount", e.target.value)}
                                        className="w-24 h-11 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#2B54F0] focus:outline-none" placeholder="0" />
                                    <div className="inline-flex rounded-xl bg-slate-100 p-1">
                                        {RISK_UNITS.map((u) => (
                                            <button key={u.value} onClick={() => set("risk_unit", u.value)}
                                                className={`h-9 px-3 rounded-lg text-sm font-bold ${f.risk_unit === u.value ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-500"}`}>{lbl(u, lang)}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <RadioGroup label={L.selfHarm} value={f.self_harm} onChange={(v) => set("self_harm", v)}
                                options={[{ value: "no", th: L.no, en: L.no }, { value: "yes", th: L.yes, en: L.yes }]} lang={lang} />
                            <RadioGroup label={L.wantCounselor} value={f.want_counselor} onChange={(v) => set("want_counselor", v)}
                                options={[{ value: "no", th: L.no, en: L.no }, { value: "yes", th: L.yes, en: L.yes }]} lang={lang} />
                        </div>
                    )}

                    {/* STEP 4 */}
                    {step === 4 && result && <ResultScreen code={result.code} expiresAt={result.expiresAt} clinicId={clinicId} L={L} lang={lang} />}

                    {err && step !== 4 && (
                        <p className="mt-4 text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4 shrink-0" /> {err}
                        </p>
                    )}

                    {step >= 1 && step <= 3 && (
                        <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-slate-100">
                            <button onClick={back} className="h-11 px-4 rounded-xl text-slate-600 font-semibold inline-flex items-center gap-1.5 hover:bg-slate-100">
                                <ArrowLeft className="h-4 w-4" /> {L.back}
                            </button>
                            {step < 3 ? (
                                <button onClick={next} className="h-11 px-6 rounded-xl text-white font-bold inline-flex items-center gap-1.5"
                                    style={{ background: "linear-gradient(90deg,#2B54F0,#00A6C0)" }}>
                                    {L.next} <ArrowRight className="h-4 w-4" />
                                </button>
                            ) : (
                                <button onClick={submit} disabled={saving} className="h-11 px-6 rounded-xl text-white font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                                    style={{ background: "linear-gradient(90deg,#0EA5A0,#15FF83)" }}>
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {L.submit}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <p className="text-center text-[11px] text-white/40 mt-5">ระบบคลินิกนิรนาม · Powered by Gonix</p>
            </div>
        </div>
    );
}

// ── Result screen ───────────────────────────────────
function ResultScreen({ code, expiresAt, clinicId, L, lang }: {
    code: string; expiresAt: string; clinicId: string; L: typeof T[Lang]; lang: Lang;
}) {
    const [qr, setQr] = useState("");
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        QRCode.toDataURL(`${origin}/result?clinic=${clinicId}&code=${code}`, { width: 320, margin: 1, errorCorrectionLevel: "M" })
            .then(setQr).catch(() => setQr(""));
    }, [code, clinicId]);
    const expThai = new Date(expiresAt).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short" });

    return (
        <div className="text-center space-y-4">
            <div className="inline-flex h-14 w-14 rounded-full bg-emerald-100 items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
                <h1 className="text-xl font-black text-slate-800">{L.regSuccess}</h1>
                <p className="text-sm text-slate-500">{L.regSuccessSub}</p>
            </div>
            <div className="rounded-2xl border-2 border-dashed border-[#2B54F0]/30 bg-[#2B54F0]/5 p-5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{L.verifyCode}</div>
                <div className="text-4xl font-black text-[#2B54F0] tracking-[0.3em] font-mono my-1">{code}</div>
                <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className="text-xs text-slate-500 inline-flex items-center gap-1 hover:text-[#2B54F0]">
                    <Copy className="h-3.5 w-3.5" /> {copied ? L.copied : L.copyCode}
                </button>
            </div>
            {qr && (
                <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="QR Code" className="w-44 h-44 rounded-xl border border-slate-200" />
                    <a href={qr} download={`verify-${code}.png`} className="h-10 px-4 rounded-xl bg-slate-800 text-white text-sm font-bold inline-flex items-center gap-1.5">
                        <Download className="h-4 w-4" /> {L.downloadQR}
                    </a>
                </div>
            )}
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-left">
                <p className="text-xs text-amber-800 leading-relaxed"><b>⏱ {L.expiryNote(expThai)}</b><br />{L.keepNote}</p>
            </div>
            <p className="text-[11px] text-slate-400">{L.smsNote}</p>
        </div>
    );
}

// ── Flags (SVG — ขึ้นเป็นธงจริงทุกเครื่อง ไม่พึ่ง emoji) ──
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
            <defs><clipPath id="ukclip"><rect width="60" height="40" /></clipPath></defs>
            <g clipPath="url(#ukclip)">
                <rect width="60" height="40" fill="#012169" />
                <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8" />
                <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="4" />
                <path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="13" />
                <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="7" />
            </g>
        </svg>
    );
}

// ── Reusable inputs ─────────────────────────────────
function StepTitle({ n, title }: { n: number; title: string }) {
    return (
        <div className="flex items-center gap-2.5 mb-1">
            <span className="h-7 w-7 rounded-lg bg-[#2B54F0] text-white text-sm font-black flex items-center justify-center">{n}</span>
            <h1 className="text-lg font-black text-slate-800">{title}</h1>
        </div>
    );
}
function FieldLabel({ children }: { children: React.ReactNode }) {
    return <label className="text-xs font-bold text-slate-600 mb-1.5 block">{children}</label>;
}
function Txt({ label, value, onChange, type = "text", placeholder }: {
    label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
    return (
        <div>
            <FieldLabel>{label}</FieldLabel>
            <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#2B54F0] focus:outline-none" />
        </div>
    );
}
function Sel({ label, value, onChange, options, lang, ph }: {
    label: string; value: string; onChange: (v: string) => void; options: Opt[]; lang: Lang; ph: string;
}) {
    return (
        <div>
            <FieldLabel>{label}</FieldLabel>
            <select value={value} onChange={(e) => onChange(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#2B54F0] focus:outline-none">
                <option value="">{ph}</option>
                {options.map((o) => <option key={o.value} value={o.value}>{lbl(o, lang)}</option>)}
            </select>
        </div>
    );
}
function RadioGroup({ label, value, onChange, options, lang, wrap }: {
    label: string; value: string; onChange: (v: string) => void; options: Opt[]; lang: Lang; wrap?: boolean;
}) {
    return (
        <div>
            <FieldLabel>{label}</FieldLabel>
            <div className={`flex gap-2 ${wrap ? "flex-wrap" : ""}`}>
                {options.map((o) => (
                    <button key={o.value} type="button" onClick={() => onChange(o.value)}
                        className={`h-10 px-4 rounded-xl text-sm font-semibold border transition-all ${value === o.value ? "bg-[#2B54F0] text-white border-[#2B54F0]" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
                        {lbl(o, lang)}
                    </button>
                ))}
            </div>
        </div>
    );
}
function CheckGroup({ label, values, onToggle, options, lang }: {
    label: string; values: string[]; onToggle: (v: string) => void; options: Opt[]; lang: Lang;
}) {
    return (
        <div>
            <FieldLabel>{label}</FieldLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {options.map((o) => {
                    const on = values.includes(o.value);
                    return (
                        <button key={o.value} type="button" onClick={() => onToggle(o.value)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left border transition-all ${on ? "bg-[#2B54F0]/5 border-[#2B54F0]/40 text-slate-800" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                            <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-[#2B54F0] border-[#2B54F0]" : "border-slate-300"}`}>
                                {on && <CheckCircle2 className="h-3 w-3 text-white" />}
                            </span>
                            <span className="flex-1">{lbl(o, lang)}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
