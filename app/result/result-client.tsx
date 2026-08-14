"use client";

import { useState, useTransition, useRef } from "react";
import {
    ShieldCheck, Lock, Loader2, AlertTriangle, CheckCircle2, Clock,
    CalendarPlus, Phone, ArrowRight, KeyRound, Smartphone,
    RotateCcw, EyeOff,
} from "lucide-react";
import { lookupAnonResult, requestAnonFollowup, type AnonResult } from "@/lib/actions/anon-result";
import { isLabType } from "@/lib/anon-shared";

const STATUS_FLOW: Record<string, string> = {
    registered: "ลงทะเบียนแล้ว", opened: "อยู่ระหว่างให้บริการ", collected: "เก็บตัวอย่างแล้ว",
    resulted: "มีผลแล้ว", closed: "เสร็จสิ้น",
};
// การแปลผลสำหรับคนไข้ (ปลอดภัย — ผลผิดปกติให้พบแพทย์ ไม่โชว์ค่าดิบ)
const RESULT_VIEW: Record<string, { label: string; tone: string; dot: string; icon: typeof CheckCircle2 }> = {
    pending: { label: "รอผลจากห้องปฏิบัติการ", tone: "text-slate-500 bg-slate-100", dot: "bg-slate-400", icon: Clock },
    sent_out: { label: "อยู่ระหว่างส่งตรวจยืนยัน", tone: "text-indigo-700 bg-indigo-50", dot: "bg-indigo-400", icon: Clock },
    negative: { label: "ไม่พบเชื้อ / ปกติ", tone: "text-emerald-700 bg-emerald-50", dot: "bg-emerald-500", icon: CheckCircle2 },
    positive: { label: "ผิดปกติ — พบแพทย์", tone: "text-rose-700 bg-rose-50", dot: "bg-rose-500", icon: AlertTriangle },
    inconclusive: { label: "สรุปไม่ได้ — ตรวจซ้ำ", tone: "text-amber-700 bg-amber-50", dot: "bg-amber-500", icon: AlertTriangle },
};
const IN_PROGRESS = new Set(["pending", "sent_out"]);

export default function ResultClient({ initialCode }: { initialCode: string }) {
    const [code, setCode] = useState(initialCode.toUpperCase());
    const [phone4, setPhone4] = useState("");
    const [err, setErr] = useState("");
    const [data, setData] = useState<AnonResult | null>(null);
    const [busy, startBusy] = useTransition();
    const phoneRef = useRef<HTMLInputElement>(null);

    function submit() {
        setErr("");
        startBusy(async () => {
            const res = await lookupAnonResult(code, phone4);
            if (res.ok) setData(res.data);
            else setErr(res.error);
        });
    }
    function reset() {
        setData(null); setErr(""); setPhone4("");
    }
    const canSubmit = code.trim().length >= 4 && phone4.length === 4 && !busy;

    return (
        <div className="min-h-screen" style={{ background: "radial-gradient(62% 45% at 72% 20%, rgba(255,255,255,0.9) 0%, transparent 60%), radial-gradient(95% 60% at 100% 3%, rgba(8,145,178,0.10) 0%, transparent 55%), repeating-linear-gradient(102deg, rgba(105,125,150,0.12) 0px, rgba(105,125,150,0.12) 1px, transparent 1px, transparent 6px), linear-gradient(150deg, #eef2f6 0%, #dbe2e9 48%, #cbd5dd 100%)" }}>
            <div className="max-w-md mx-auto px-4 py-8 sm:py-12">
                {/* Brand */}
                <div className="flex flex-col items-center text-center mb-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/clinic-logo.png" alt="" className="h-32 w-32 sm:h-36 sm:w-36 object-contain mb-2" />
                    <h1 className="text-lg font-black tracking-tight" style={{ color: "#0e7490" }}>{data?.clinic_name || "ธนเวชคลินิกเวชกรรม"}</h1>
                    <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-700 bg-white/70 ring-1 ring-cyan-100 rounded-full px-2.5 py-1">
                        <Lock className="h-3 w-3" /> นิรนาม · เป็นความลับ · เข้ารหัส
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-xl border border-slate-200/60 overflow-hidden">
                    {/* accent top bar */}
                    <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg,#0891b2,#14b8a6)" }} />
                    <div className="p-6">
                        {!data ? (
                            <LoginForm
                                code={code} setCode={setCode} phone4={phone4} setPhone4={setPhone4}
                                err={err} busy={busy} canSubmit={canSubmit} submit={submit} phoneRef={phoneRef}
                            />
                        ) : (
                            <ResultView data={data} code={code} phone4={phone4} onReset={reset} />
                        )}
                    </div>
                </div>

                {/* trust footer */}
                <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1"><EyeOff className="h-3.5 w-3.5" /> ไม่ระบุตัวตน</span>
                    <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> ปลอดภัย</span>
                </div>
                <p className="text-center text-[11px] text-slate-400 mt-3">ระบบคลินิกนิรนาม · Powered by Gonix</p>
            </div>
        </div>
    );
}

function LoginForm({ code, setCode, phone4, setPhone4, err, busy, canSubmit, submit, phoneRef }: {
    code: string; setCode: (v: string) => void; phone4: string; setPhone4: (v: string) => void;
    err: string; busy: boolean; canSubmit: boolean; submit: () => void;
    phoneRef: React.RefObject<HTMLInputElement | null>;
}) {
    return (
        <div className="space-y-5">
            <div className="text-center">
                <h2 className="text-xl font-black text-slate-800">เช็คผลตรวจออนไลน์</h2>
                <p className="text-xs text-slate-500 mt-1">กรอกรหัสยืนยันและเบอร์เพื่อดูผลของคุณ</p>
            </div>

            {/* Verify code */}
            <div>
                <label className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5 text-cyan-600" /> รหัสยืนยัน (Verify Code)</label>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6}
                    onKeyDown={(e) => { if (e.key === "Enter") phoneRef.current?.focus(); }}
                    autoFocus placeholder="A B 8 R V S"
                    className="w-full h-14 rounded-2xl border-2 border-slate-200 bg-slate-50/60 px-4 text-center text-2xl font-mono font-black tracking-[0.35em] uppercase text-cyan-700 placeholder:text-slate-300 placeholder:tracking-[0.25em] focus:border-cyan-500 focus:bg-white focus:outline-none transition" />
            </div>

            {/* Phone 4 */}
            <div>
                <label className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5 text-cyan-600" /> เบอร์มือถือ 4 ตัวท้าย</label>
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
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />} เข้าดูผลตรวจ
            </button>

            <div className="flex items-start gap-2 rounded-xl bg-cyan-50/70 px-3 py-2.5">
                <ShieldCheck className="h-4 w-4 text-cyan-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-cyan-800/80 leading-relaxed">ผลตรวจของคุณเป็นความลับ เปิดดูได้เฉพาะผู้ที่มีรหัสยืนยันและเบอร์ที่ลงทะเบียนไว้เท่านั้น</p>
            </div>
        </div>
    );
}

function ResultView({ data, code, phone4, onReset }: { data: AnonResult; code: string; phone4: string; onReset: () => void }) {
    const [requested, setRequested] = useState(data.followup_requested);
    const [busy, startBusy] = useTransition();
    const labTests = data.tests.filter((t) => isLabType(t.item_type));
    const hasResults = labTests.some((t) => !IN_PROGRESS.has(t.result_status));
    const anyPending = labTests.some((t) => IN_PROGRESS.has(t.result_status));
    const abnormal = labTests.some((t) => t.result_status === "positive" || t.result_status === "inconclusive");

    function requestAppt() {
        startBusy(async () => {
            const res = await requestAnonFollowup(code, phone4);
            if (res.ok) setRequested(true);
        });
    }

    return (
        <div className="space-y-4">
            {/* Case header */}
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">รหัสเคส</div>
                    <div className="text-2xl font-black font-mono tracking-widest" style={{ color: "#0e7490" }}>{data.code}</div>
                </div>
                <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-white ring-1 ring-slate-200 text-slate-600">{STATUS_FLOW[data.status] || data.status}</span>
            </div>

            {/* Overall hero */}
            {!hasResults ? (
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center mx-auto mb-2"><Clock className="h-6 w-6 text-slate-400" /></div>
                    <div className="font-bold text-slate-700">ผลอยู่ระหว่างดำเนินการ</div>
                    <div className="text-xs text-slate-500 mt-0.5">กรุณาเข้ามาเช็คใหม่ภายหลัง</div>
                </div>
            ) : abnormal ? (
                <div className="rounded-2xl p-5 text-center text-white" style={{ background: "linear-gradient(135deg,#f43f5e,#e11d48)" }}>
                    <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-2"><AlertTriangle className="h-6 w-6" /></div>
                    <div className="font-black text-lg">พบผลที่ต้องพบแพทย์</div>
                    <div className="text-xs text-white/85 mt-0.5">มีบางรายการผิดปกติ แนะนำให้พบแพทย์เพื่อตรวจยืนยันและดูแล</div>
                </div>
            ) : anyPending ? (
                <div className="rounded-2xl bg-cyan-50 border border-cyan-200 p-5 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center mx-auto mb-2"><Clock className="h-6 w-6 text-cyan-600" /></div>
                    <div className="font-bold text-cyan-800">มีผลแล้วบางส่วน</div>
                    <div className="text-xs text-cyan-700/80 mt-0.5">บางรายการยังรอผลจากห้องปฏิบัติการ</div>
                </div>
            ) : (
                <div className="rounded-2xl p-5 text-center text-white" style={{ background: "linear-gradient(135deg,#10b981,#0d9488)" }}>
                    <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-2"><CheckCircle2 className="h-6 w-6" /></div>
                    <div className="font-black text-lg">ผลปกติทั้งหมด</div>
                    <div className="text-xs text-white/85 mt-0.5">หากมีข้อสงสัย ปรึกษาแพทย์ได้ที่คลินิก</div>
                </div>
            )}

            {/* Per-test list */}
            {hasResults && (
                <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                    {labTests.map((t, i) => {
                        const v = RESULT_VIEW[t.result_status] || RESULT_VIEW.pending;
                        const Icon = v.icon;
                        return (
                            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                                <span className="text-sm font-semibold text-slate-700 flex items-center gap-2 min-w-0">
                                    <span className={`h-2 w-2 rounded-full shrink-0 ${v.dot}`} />
                                    <span className="truncate">{t.test_name}</span>
                                </span>
                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 shrink-0 ${v.tone}`}>
                                    <Icon className="h-3.5 w-3.5" /> {v.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Appointment CTA (abnormal) */}
            {abnormal && (
                requested ? (
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3.5 text-center">
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-1" />
                        <div className="text-sm font-bold text-emerald-800">ส่งคำขอนัดหมายแล้ว</div>
                        <div className="text-xs text-emerald-700/80 mt-0.5">เจ้าหน้าที่จะติดต่อกลับเร็วที่สุด</div>
                    </div>
                ) : (
                    <button onClick={requestAppt} disabled={busy}
                        className="w-full h-14 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 disabled:opacity-60 transition active:scale-[0.99]">
                        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarPlus className="h-5 w-5" />} นัดหมายพบแพทย์
                    </button>
                )
            )}

            {data.result_appt_date && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                    <CalendarPlus className="h-3.5 w-3.5" /> นัดฟังผล/ติดตาม: <b className="text-slate-700">{new Date(data.result_appt_date + "T00:00:00").toLocaleDateString("th-TH", { dateStyle: "long" })}</b>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
                {data.clinic_phone && (
                    <a href={`tel:${data.clinic_phone}`} className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:bg-slate-50">
                        <Phone className="h-4 w-4 text-cyan-600" /> ติดต่อคลินิก
                    </a>
                )}
                <button onClick={onReset} className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:bg-slate-50">
                    <RotateCcw className="h-4 w-4" /> เช็ครหัสอื่น
                </button>
            </div>
        </div>
    );
}
