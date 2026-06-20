"use client";

import { useState, useTransition } from "react";
import {
    ShieldCheck, Lock, Loader2, AlertTriangle, CheckCircle2, Clock,
    CalendarPlus, Phone, ArrowRight, FlaskConical,
} from "lucide-react";
import { lookupAnonResult, requestAnonFollowup, type AnonResult } from "@/lib/actions/anon-result";
import { isLabType } from "@/lib/anon-shared";

const STATUS_FLOW: Record<string, string> = {
    registered: "ลงทะเบียนแล้ว", opened: "อยู่ระหว่างให้บริการ", collected: "เก็บตัวอย่างแล้ว",
    resulted: "มีผลแล้ว", closed: "เสร็จสิ้น",
};
// การแปลผลสำหรับคนไข้ (ปลอดภัย — ผลผิดปกติให้พบแพทย์ ไม่โชว์ค่าดิบ)
const RESULT_VIEW: Record<string, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
    pending: { label: "รอผลจากห้องปฏิบัติการ", tone: "text-slate-500 bg-slate-100", icon: Clock },
    sent_out: { label: "อยู่ระหว่างส่งตรวจยืนยัน (Lab ภายนอก)", tone: "text-indigo-700 bg-indigo-100", icon: Clock },
    negative: { label: "ไม่พบเชื้อ / ปกติ", tone: "text-emerald-700 bg-emerald-100", icon: CheckCircle2 },
    positive: { label: "ผลผิดปกติ — แนะนำพบแพทย์", tone: "text-rose-700 bg-rose-100", icon: AlertTriangle },
    inconclusive: { label: "สรุปไม่ได้ — แนะนำตรวจซ้ำ/พบแพทย์", tone: "text-amber-700 bg-amber-100", icon: AlertTriangle },
};
const IN_PROGRESS = new Set(["pending", "sent_out"]);

export default function ResultClient({ initialCode }: { initialCode: string }) {
    const [code, setCode] = useState(initialCode.toUpperCase());
    const [phone4, setPhone4] = useState("");
    const [err, setErr] = useState("");
    const [data, setData] = useState<AnonResult | null>(null);
    const [busy, startBusy] = useTransition();

    function submit() {
        setErr("");
        startBusy(async () => {
            const res = await lookupAnonResult(code, phone4);
            if (res.ok) setData(res.data);
            else setErr(res.error);
        });
    }

    return (
        <div className="min-h-screen" style={{ background: "linear-gradient(160deg,#0b1020,#141A33 55%,#1C2244)" }}>
            <div className="max-w-lg mx-auto px-4 py-10">
                {/* Brand */}
                <div className="flex items-center gap-3 mb-6 text-white">
                    <div className="h-11 w-11 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00FFCC,#15FF83)" }}>
                        <ShieldCheck className="h-6 w-6 text-[#0A1020]" />
                    </div>
                    <div>
                        <div className="font-black text-lg leading-tight">เช็คผลตรวจออนไลน์</div>
                        <div className="text-[11px] text-white/60 flex items-center gap-1"><Lock className="h-3 w-3" /> นิรนาม · เป็นความลับ</div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-2xl p-6">
                    {!data ? (
                        // ── LOGIN ──
                        <div className="space-y-4">
                            <h1 className="text-lg font-black text-slate-800">เข้าดูผลด้วยรหัสยืนยัน</h1>
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">รหัสยืนยัน (Verify Code)</label>
                                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6}
                                    placeholder="เช่น 3A8RVS"
                                    className="w-full h-12 rounded-xl border-2 border-slate-200 px-3 text-lg font-mono font-bold tracking-[0.2em] uppercase text-[#2B54F0] focus:border-[#2B54F0] focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">เบอร์มือถือ 4 ตัวท้าย (ยืนยันตัวตน)</label>
                                <input value={phone4} onChange={(e) => setPhone4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                    inputMode="numeric" maxLength={4} placeholder="เช่น 4993"
                                    className="w-full h-12 rounded-xl border-2 border-slate-200 px-3 text-lg font-mono font-bold tracking-[0.3em] focus:border-[#2B54F0] focus:outline-none" />
                            </div>
                            {err && <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" /> {err}</p>}
                            <button onClick={submit} disabled={busy}
                                className="w-full h-12 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                                style={{ background: "linear-gradient(90deg,#2B54F0,#00A6C0)" }}>
                                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />} เข้าดูผล
                            </button>
                            <p className="text-[11px] text-slate-400 text-center">ใช้รหัสที่ได้ตอนลงทะเบียน + เบอร์มือถือที่ให้ไว้</p>
                        </div>
                    ) : (
                        <ResultView data={data} code={code} phone4={phone4} />
                    )}
                </div>

                <p className="text-center text-[11px] text-white/40 mt-5">ระบบคลินิกนิรนาม · Powered by Gonix</p>
            </div>
        </div>
    );
}

function ResultView({ data, code, phone4 }: { data: AnonResult; code: string; phone4: string }) {
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
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-[11px] text-slate-400 uppercase tracking-wider">รหัสเคส</div>
                    <div className="text-2xl font-black font-mono text-[#2B54F0] tracking-wider">{data.code}</div>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{STATUS_FLOW[data.status] || data.status}</span>
            </div>

            {/* สถานะรวม */}
            {!hasResults ? (
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-center">
                    <Clock className="h-8 w-8 text-slate-400 mx-auto mb-1" />
                    <div className="font-bold text-slate-700">ยังไม่มีผล</div>
                    <div className="text-xs text-slate-500">ผลอยู่ระหว่างดำเนินการ — กรุณาเข้ามาเช็คใหม่ภายหลัง</div>
                </div>
            ) : (
                <div className="space-y-2">
                    {labTests.map((t, i) => {
                        const v = RESULT_VIEW[t.result_status] || RESULT_VIEW.pending;
                        const Icon = v.icon;
                        return (
                            <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                                <span className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-slate-400" /> {t.test_name}</span>
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${v.tone}`}>
                                    <Icon className="h-3.5 w-3.5" /> {v.label}
                                </span>
                            </div>
                        );
                    })}
                    {anyPending && <p className="text-[11px] text-amber-600">* บางรายการยังรอผลจากห้องปฏิบัติการ</p>}
                </div>
            )}

            {/* ผลผิดปกติ → นัดหมาย */}
            {abnormal && (
                <div className="rounded-2xl bg-rose-50 border-2 border-rose-200 p-4 space-y-2.5">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-rose-800 font-semibold leading-snug">พบผลผิดปกติบางรายการ — แนะนำให้พบแพทย์เพื่อตรวจยืนยันและรับการดูแลที่เหมาะสม</p>
                    </div>
                    {requested ? (
                        <div className="rounded-xl bg-white border border-rose-200 px-3 py-2.5 text-center">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
                            <div className="text-sm font-bold text-slate-700">ส่งคำขอนัดหมายแล้ว</div>
                            <div className="text-xs text-slate-500">เจ้าหน้าที่จะติดต่อกลับ {data.clinic_phone && `· โทร ${data.clinic_phone}`}</div>
                        </div>
                    ) : (
                        <button onClick={requestAppt} disabled={busy}
                            className="w-full h-12 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarPlus className="h-5 w-5" />} นัดหมายพบแพทย์เพื่อรับการรักษา
                        </button>
                    )}
                </div>
            )}

            {/* ผลปกติทั้งหมด */}
            {hasResults && !abnormal && !anyPending && (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600 mx-auto mb-1" />
                    <div className="font-bold text-emerald-700">ผลปกติทั้งหมด</div>
                    <div className="text-xs text-emerald-600">หากมีข้อสงสัย ปรึกษาแพทย์ได้ที่คลินิก</div>
                </div>
            )}

            {data.result_appt_date && (
                <p className="text-xs text-slate-500 text-center">นัดฟังผล/ติดตาม: <b>{new Date(data.result_appt_date + "T00:00:00").toLocaleDateString("th-TH", { dateStyle: "long" })}</b></p>
            )}

            {data.clinic_phone && (
                <a href={`tel:${data.clinic_phone}`} className="flex items-center justify-center gap-2 text-sm text-slate-500 pt-1">
                    <Phone className="h-4 w-4" /> ติดต่อคลินิก {data.clinic_phone}
                </a>
            )}
        </div>
    );
}
