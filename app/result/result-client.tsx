"use client";

import { useState, useTransition, useRef } from "react";
import {
    ShieldCheck, Lock, Loader2, AlertTriangle, CheckCircle2, Clock,
    CalendarPlus, Phone, ArrowRight, KeyRound, Smartphone,
    RotateCcw, EyeOff, Download,
} from "lucide-react";
import { lookupAnonResult, requestAnonFollowup, type AnonResult, type AnonResultTest } from "@/lib/actions/anon-result";
import { LabReportSheet, dmyShort, dtBkk, type LabRow } from "@/app/print/lab-report-sheet";
import { isLabType } from "@/lib/anon-shared";

type Lang = "th" | "en";

const STATUS_FLOW: Record<string, { th: string; en: string }> = {
    registered: { th: "ลงทะเบียนแล้ว", en: "Registered" },
    opened: { th: "อยู่ระหว่างให้บริการ", en: "In service" },
    collected: { th: "เก็บตัวอย่างแล้ว", en: "Sample collected" },
    resulted: { th: "มีผลแล้ว", en: "Results ready" },
    closed: { th: "เสร็จสิ้น", en: "Completed" },
};
// การแปลผลสำหรับคนไข้ (ปลอดภัย — ผลผิดปกติให้พบแพทย์ ไม่โชว์ค่าดิบ)
const RESULT_VIEW: Record<string, { th: string; en: string; tone: string; dot: string; icon: typeof CheckCircle2 }> = {
    pending: { th: "รอผลจากห้องปฏิบัติการ", en: "Awaiting lab result", tone: "text-slate-500 bg-slate-100", dot: "bg-slate-400", icon: Clock },
    sent_out: { th: "อยู่ระหว่างส่งตรวจยืนยัน", en: "Sent for confirmation", tone: "text-indigo-700 bg-indigo-50", dot: "bg-indigo-400", icon: Clock },
    negative: { th: "ไม่พบเชื้อ / ปกติ", en: "Not detected / Normal", tone: "text-emerald-700 bg-emerald-50", dot: "bg-emerald-500", icon: CheckCircle2 },
    positive: { th: "ผิดปกติ — พบแพทย์", en: "Abnormal — see doctor", tone: "text-rose-700 bg-rose-50", dot: "bg-rose-500", icon: AlertTriangle },
    inconclusive: { th: "สรุปไม่ได้ — ตรวจซ้ำ", en: "Inconclusive — retest", tone: "text-amber-700 bg-amber-50", dot: "bg-amber-500", icon: AlertTriangle },
};
const IN_PROGRESS = new Set(["pending", "sent_out"]);

const T = {
    th: {
        brandSub: "นิรนาม · เป็นความลับ · เข้ารหัส",
        loginTitle: "เช็คผลตรวจออนไลน์", loginSub: "กรอกรหัสยืนยันและเบอร์เพื่อดูผลของคุณ",
        codeLabel: "รหัสยืนยัน (Verify Code)", phoneLabel: "เบอร์มือถือ 4 ตัวท้าย", submitBtn: "เข้าดูผลตรวจ",
        trustNote: "ผลตรวจของคุณเป็นความลับ เปิดดูได้เฉพาะผู้ที่มีรหัสยืนยันและเบอร์ที่ลงทะเบียนไว้เท่านั้น",
        caseCode: "รหัสเคส", protect: "ไม่ระบุตัวตน", secure: "ปลอดภัย", brand: "ระบบคลินิกนิรนาม · Powered by Gonix",
        heroPendingT: "ผลอยู่ระหว่างดำเนินการ", heroPendingD: "กรุณาเข้ามาเช็คใหม่ภายหลัง",
        heroAbnT: "พบผลที่ต้องพบแพทย์", heroAbnD: "มีบางรายการผิดปกติ แนะนำให้พบแพทย์เพื่อตรวจยืนยันและดูแล",
        heroPartialT: "มีผลแล้วบางส่วน", heroPartialD: "บางรายการยังรอผลจากห้องปฏิบัติการ",
        heroNormalT: "ผลปกติทั้งหมด", heroNormalD: "หากมีข้อสงสัย ปรึกษาแพทย์ได้ที่คลินิก",
        apptBtn: "นัดหมายพบแพทย์", apptDoneT: "ส่งคำขอนัดหมายแล้ว", apptDoneD: "เจ้าหน้าที่จะติดต่อกลับเร็วที่สุด",
        apptDate: "นัดฟังผล/ติดตาม:", contactBtn: "ติดต่อคลินิก", resetBtn: "เช็ครหัสอื่น", downloadPdf: "โหลดผลเป็น PDF",
    },
    en: {
        brandSub: "Anonymous · Confidential · Encrypted",
        loginTitle: "Check Results Online", loginSub: "Enter your verify code and phone to view your results",
        codeLabel: "Verify Code", phoneLabel: "Last 4 digits of phone", submitBtn: "View Results",
        trustNote: "Your results are confidential. Only someone with the verify code and registered phone can view them.",
        caseCode: "Case Code", protect: "Anonymous", secure: "Secure", brand: "Anonymous Clinic · Powered by Gonix",
        heroPendingT: "Results in progress", heroPendingD: "Please check again later",
        heroAbnT: "Please see a doctor", heroAbnD: "Some results are abnormal. Please see a doctor for confirmation and care.",
        heroPartialT: "Some results ready", heroPartialD: "Some items are still awaiting lab results",
        heroNormalT: "All results normal", heroNormalD: "If you have questions, consult a doctor at the clinic",
        apptBtn: "Request appointment", apptDoneT: "Appointment requested", apptDoneD: "Staff will contact you soon",
        apptDate: "Follow-up appointment:", contactBtn: "Contact clinic", resetBtn: "Check another code", downloadPdf: "Download PDF",
    },
};
// แปล error จาก server (ไทย) → EN
const ERR_EN: Record<string, string> = {
    "รหัสยืนยัน หรือเบอร์ 4 ตัวท้าย ไม่ถูกต้อง": "Incorrect verify code or last 4 digits",
    "พยายามเกินจำนวนครั้ง กรุณารอสักครู่แล้วลองใหม่": "Too many attempts. Please wait and try again.",
    "กรุณากรอกรหัสยืนยัน และเบอร์ 4 ตัวท้ายให้ครบ": "Please enter the verify code and last 4 digits",
    "ระบบขัดข้อง กรุณาลองใหม่": "System error. Please try again.",
};

export default function ResultClient({ initialCode }: { initialCode: string }) {
    const [lang, setLang] = useState<Lang>("th");
    const [code, setCode] = useState(initialCode.toUpperCase());
    const [phone4, setPhone4] = useState("");
    const [err, setErr] = useState("");
    const [data, setData] = useState<AnonResult | null>(null);
    const [busy, startBusy] = useTransition();
    const phoneRef = useRef<HTMLInputElement>(null);
    const t = T[lang];

    function submit() {
        setErr("");
        startBusy(async () => {
            const res = await lookupAnonResult(code, phone4);
            if (res.ok) setData(res.data);
            else setErr(lang === "en" ? (ERR_EN[res.error] || res.error) : res.error);
        });
    }
    function reset() { setData(null); setErr(""); setPhone4(""); }
    function downloadPdf() {
        const prev = document.title;
        if (data) document.title = `${data.code}-result`;
        window.print();
        setTimeout(() => { document.title = prev; }, 800);
    }
    const canSubmit = code.trim().length >= 4 && phone4.length === 4 && !busy;

    return (
        <>
        <div className="min-h-screen result-screen" style={{ background: "radial-gradient(62% 45% at 72% 20%, rgba(255,255,255,0.9) 0%, transparent 60%), radial-gradient(95% 60% at 100% 3%, rgba(8,145,178,0.10) 0%, transparent 55%), repeating-linear-gradient(102deg, rgba(105,125,150,0.12) 0px, rgba(105,125,150,0.12) 1px, transparent 1px, transparent 6px), linear-gradient(150deg, #eef2f6 0%, #dbe2e9 48%, #cbd5dd 100%)" }}>
            <div className="max-w-md mx-auto px-4 py-8 sm:py-12">
                {/* Language switch */}
                <div className="flex justify-end mb-3">
                    <div className="inline-flex items-center rounded-xl bg-white border border-slate-200 shadow-sm p-1 gap-1">
                        {(["th", "en"] as Lang[]).map((lg) => (
                            <button key={lg} onClick={() => setLang(lg)}
                                className={`h-8 px-3.5 rounded-lg text-xs font-bold transition-all ${lang === lg ? "bg-[#0891b2] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}>
                                {lg === "th" ? "ไทย" : "EN"}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Brand */}
                <div className="flex flex-col items-center text-center mb-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/clinic-logo.png" alt="" className="h-32 w-32 sm:h-36 sm:w-36 object-contain mb-2" />
                    <h1 className="text-lg font-black tracking-tight" style={{ color: "#0e7490" }}>{data?.clinic_name || "ธนเวชคลินิกเวชกรรม"}</h1>
                    <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-700 bg-white/70 ring-1 ring-cyan-100 rounded-full px-2.5 py-1">
                        <Lock className="h-3 w-3" /> {t.brandSub}
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-xl border border-slate-200/60 overflow-hidden">
                    <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg,#0891b2,#14b8a6)" }} />
                    <div className="p-6">
                        {!data ? (
                            <LoginForm
                                t={t} code={code} setCode={setCode} phone4={phone4} setPhone4={setPhone4}
                                err={err} busy={busy} canSubmit={canSubmit} submit={submit} phoneRef={phoneRef}
                            />
                        ) : (
                            <ResultView data={data} code={code} phone4={phone4} onReset={reset} onDownload={downloadPdf} lang={lang} t={t} />
                        )}
                    </div>
                </div>

                <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1"><EyeOff className="h-3.5 w-3.5" /> {t.protect}</span>
                    <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> {t.secure}</span>
                </div>
                <p className="text-center text-[11px] text-slate-400 mt-3">{t.brand}</p>
            </div>
        </div>
        {data && <PrintDoc data={data} lang={lang} />}
        <style>{`
            @media print {
                .result-screen { display: none !important; }
                .result-print { display: block !important; }
                body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .print-page { max-width: 100% !important; margin: 0 !important; }
                @page { size: A4; margin: 12mm; }
            }
        `}</style>
        </>
    );
}

function LoginForm({ t, code, setCode, phone4, setPhone4, err, busy, canSubmit, submit, phoneRef }: {
    t: typeof T["th"]; code: string; setCode: (v: string) => void; phone4: string; setPhone4: (v: string) => void;
    err: string; busy: boolean; canSubmit: boolean; submit: () => void;
    phoneRef: React.RefObject<HTMLInputElement | null>;
}) {
    return (
        <div className="space-y-5">
            <div className="text-center">
                <h2 className="text-xl font-black text-slate-800">{t.loginTitle}</h2>
                <p className="text-xs text-slate-500 mt-1">{t.loginSub}</p>
            </div>

            <div>
                <label className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5 text-cyan-600" /> {t.codeLabel}</label>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6}
                    onKeyDown={(e) => { if (e.key === "Enter") phoneRef.current?.focus(); }}
                    autoFocus placeholder="A B 8 R V S"
                    className="w-full h-14 rounded-2xl border-2 border-slate-200 bg-slate-50/60 px-4 text-center text-2xl font-mono font-black tracking-[0.35em] uppercase text-cyan-700 placeholder:text-slate-300 placeholder:tracking-[0.25em] focus:border-cyan-500 focus:bg-white focus:outline-none transition" />
            </div>

            <div>
                <label className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5 text-cyan-600" /> {t.phoneLabel}</label>
                <input ref={phoneRef} value={phone4} onChange={(e) => setPhone4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }}
                    inputMode="numeric" maxLength={4} placeholder="• • • •"
                    className="w-full h-14 rounded-2xl border-2 border-slate-200 bg-slate-50/60 px-4 text-center text-2xl font-mono font-black tracking-[0.5em] text-slate-700 placeholder:text-slate-300 focus:border-cyan-500 focus:bg-white focus:outline-none transition" />
            </div>

            {err && (
                <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {err}
                </p>
            )}

            <button onClick={submit} disabled={!canSubmit}
                className="w-full h-14 rounded-2xl text-white font-bold text-base inline-flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:shadow-none transition active:scale-[0.99]"
                style={{ background: "linear-gradient(90deg,#0891b2,#14b8a6)" }}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />} {t.submitBtn}
            </button>

            <div className="flex items-start gap-2 rounded-xl bg-cyan-50/70 px-3 py-2.5">
                <ShieldCheck className="h-4 w-4 text-cyan-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-cyan-800/80 leading-relaxed">{t.trustNote}</p>
            </div>
        </div>
    );
}

function ResultView({ data, code, phone4, onReset, onDownload, lang, t }: {
    data: AnonResult; code: string; phone4: string; onReset: () => void; onDownload: () => void; lang: Lang; t: typeof T["th"];
}) {
    const [requested, setRequested] = useState(data.followup_requested);
    const [busy, startBusy] = useTransition();
    const labTests = data.tests.filter((tt) => isLabType(tt.item_type));
    const hasResults = labTests.some((tt) => !IN_PROGRESS.has(tt.result_status));
    const anyPending = labTests.some((tt) => IN_PROGRESS.has(tt.result_status));
    const abnormal = labTests.some((tt) => tt.result_status === "positive" || tt.result_status === "inconclusive");

    function requestAppt() {
        startBusy(async () => {
            const res = await requestAnonFollowup(code, phone4);
            if (res.ok) setRequested(true);
        });
    }
    const status = STATUS_FLOW[data.status];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{t.caseCode}</div>
                    <div className="text-2xl font-black font-mono tracking-widest" style={{ color: "#0e7490" }}>{data.code}</div>
                </div>
                <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-white ring-1 ring-slate-200 text-slate-600">{status ? status[lang] : data.status}</span>
            </div>

            {!hasResults ? (
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center mx-auto mb-2"><Clock className="h-6 w-6 text-slate-400" /></div>
                    <div className="font-bold text-slate-700">{t.heroPendingT}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.heroPendingD}</div>
                </div>
            ) : abnormal ? (
                <div className="rounded-2xl p-5 text-center text-white" style={{ background: "linear-gradient(135deg,#f43f5e,#e11d48)" }}>
                    <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-2"><AlertTriangle className="h-6 w-6" /></div>
                    <div className="font-black text-lg">{t.heroAbnT}</div>
                    <div className="text-xs text-white/85 mt-0.5">{t.heroAbnD}</div>
                </div>
            ) : anyPending ? (
                <div className="rounded-2xl bg-cyan-50 border border-cyan-200 p-5 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center mx-auto mb-2"><Clock className="h-6 w-6 text-cyan-600" /></div>
                    <div className="font-bold text-cyan-800">{t.heroPartialT}</div>
                    <div className="text-xs text-cyan-700/80 mt-0.5">{t.heroPartialD}</div>
                </div>
            ) : (
                <div className="rounded-2xl p-5 text-center text-white" style={{ background: "linear-gradient(135deg,#10b981,#0d9488)" }}>
                    <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-2"><CheckCircle2 className="h-6 w-6" /></div>
                    <div className="font-black text-lg">{t.heroNormalT}</div>
                    <div className="text-xs text-white/85 mt-0.5">{t.heroNormalD}</div>
                </div>
            )}

            {hasResults && (
                <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                    {labTests.map((tt, i) => {
                        const v = RESULT_VIEW[tt.result_status] || RESULT_VIEW.pending;
                        const Icon = v.icon;
                        return (
                            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                                <span className="text-sm font-semibold text-slate-700 flex items-center gap-2 min-w-0">
                                    <span className={`h-2 w-2 rounded-full shrink-0 ${v.dot}`} />
                                    <span className="truncate">{tt.test_name}</span>
                                </span>
                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 shrink-0 ${v.tone}`}>
                                    <Icon className="h-3.5 w-3.5" /> {v[lang]}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {abnormal && (
                requested ? (
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3.5 text-center">
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-1" />
                        <div className="text-sm font-bold text-emerald-800">{t.apptDoneT}</div>
                        <div className="text-xs text-emerald-700/80 mt-0.5">{t.apptDoneD}</div>
                    </div>
                ) : (
                    <button onClick={requestAppt} disabled={busy}
                        className="w-full h-14 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 disabled:opacity-60 transition active:scale-[0.99]">
                        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarPlus className="h-5 w-5" />} {t.apptBtn}
                    </button>
                )
            )}

            {data.result_appt_date && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                    <CalendarPlus className="h-3.5 w-3.5" /> {t.apptDate} <b className="text-slate-700">{new Date(data.result_appt_date + "T00:00:00").toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { dateStyle: "long" })}</b>
                </div>
            )}

            {hasResults && (
                <button onClick={onDownload}
                    className="w-full h-11 rounded-xl border-2 border-cyan-500 text-cyan-700 text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:bg-cyan-50 transition">
                    <Download className="h-4 w-4" /> {t.downloadPdf}
                </button>
            )}

            <div className="flex gap-2 pt-1">
                {data.clinic_phone && (
                    <a href={`tel:${data.clinic_phone}`} className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:bg-slate-50">
                        <Phone className="h-4 w-4 text-cyan-600" /> {t.contactBtn}
                    </a>
                )}
                <button onClick={onReset} className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:bg-slate-50">
                    <RotateCcw className="h-4 w-4" /> {t.resetBtn}
                </button>
            </div>
        </div>
    );
}

// ── ใบ Laboratory Report (เหมือนคลินิก) สำหรับโหลด PDF ──
const RESULT_EN: Record<string, string> = { pending: "Pending", sent_out: "Sent for confirmation", negative: "Negative", positive: "Positive", inconclusive: "Inconclusive" };
const SEX_LABEL_TH: Record<string, string> = { male: "ชาย", female: "หญิง", other: "อื่นๆ" };
// (dmyShort/dtBkk มาจาก lab-report-sheet.tsx)
function dateThaiLong(d: string): string {
    return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

function PrintDoc({ data }: { data: AnonResult; lang: Lang }) {
    const labTests = data.tests.filter((tt) => isLabType(tt.item_type));
    const sexTitle = data.sex === "female" ? "Ms." : data.sex === "male" ? "Mr." : "";
    const clinicName = data.clinic_name || "—";
    const clinic = {
        clinic_name: data.clinic_name, clinic_name_en: data.clinic_name_en,
        company_name: data.company_name, company_name_en: data.company_name_en,
        address_detail: data.address_detail, phone: data.clinic_phone,
        license_number: data.license_number, logo_url: data.logo_url,
    };
    const grpMap = new Map<string, AnonResultTest[]>();
    for (const t of labTests) {
        const k = String(t.sample_type || data.sample_type || "").trim();
        const a = grpMap.get(k) || [];
        a.push(t); grpMap.set(k, a);
    }
    const groups = [...grpMap.entries()].map(([label, tests]) => ({ label, tests }));
    if (groups.length === 0) groups.push({ label: String(data.sample_type || ""), tests: [] });
    return (
        <div className="result-print" style={{ display: "none" }}>
            {groups.map((grp, idx) => (
                <AnonSheet key={idx} data={data} clinic={clinic} clinicName={clinicName} sexTitle={sexTitle} tests={grp.tests} sampleType={grp.label} notLast={idx < groups.length - 1} />
            ))}
        </div>
    );
}

function AnonSheet({ data, clinic, clinicName, sexTitle, tests, sampleType, notLast }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: AnonResult; clinic: any; clinicName: string; sexTitle: string;
    tests: AnonResultTest[]; sampleType: string; notLast: boolean;
}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m: any = (data.lab_report_meta && data.lab_report_meta[sampleType]) || {};
    const rows: LabRow[] = tests.map((t) => {
        const pos = t.result_status === "positive";
        const main = t.result_value || RESULT_EN[t.result_status] || "Pending";
        const enWord = RESULT_EN[t.result_status] || "";
        const showEn = t.result_status !== "pending" && t.result_status !== "sent_out" && !!enWord && String(t.result_value || "").toLowerCase() !== enWord.toLowerCase();
        return { name: t.test_name, isExternal: t.item_type === "lab_external", main, mainAbn: pos, suffix: showEn ? enWord : "", note: t.result_note };
    });
    return (
        <LabReportSheet
            clinic={clinic} titleSuffix="ใบรายงานผลตรวจ (นิรนาม)" notLast={notLast}
            patientName={`${sexTitle} ${data.code || ""}`.trim()} hn="—"
            sex={data.sex ? SEX_LABEL_TH[data.sex] || data.sex : "—"} age={data.age != null ? `${data.age} ปี` : "—"} clinicName={clinicName}
            labNo={(m.lab_no || data.lab_no) || "—"} sampleType={sampleType || "—"} requestedDate={dmyShort(data.case_date)}
            collectedAt={dtBkk(m.collected_at || data.collected_at)} receivedAt={dtBkk(m.received_at || data.received_at)}
            rows={rows}
            commentText={m.comment ?? data.lab_comment ?? ""}
            apptText={data.result_appt_date ? dateThaiLong(data.result_appt_date) : null}
            footerNote="* เอกสารไม่ระบุตัวตน — กรุณาเก็บรหัสเคสไว้เพื่อติดตามผลและรับคำปรึกษา ผลตรวจควรได้รับการแปลผลจากบุคลากรทางการแพทย์"
            reported={{ name: m.reported_by_name ?? data.reported_by_name, license: m.reported_by_license ?? data.reported_by_license, at: m.reported_at ?? data.reported_at }}
            approved={{ name: m.approved_by_name ?? data.approved_by_name, license: m.approved_by_license ?? data.approved_by_license, at: m.approved_at ?? data.approved_at }}
            physician={{ name: "", license: null }}
        />
    );
}
