"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ShieldCheck, ArrowLeft, TestTube, Plus, Trash2, Loader2, Save,
    MessageSquareHeart, Wallet, CheckCircle2, Printer, CalendarClock, FileText,
    Activity, EyeOff, AlertTriangle, Tag,
} from "lucide-react";
import {
    updateAnonCaseInfo, setCounsel, saveTestResult, addAnonTest, removeAnonTest,
    recordAnonPayment, cancelAnonPayment, setAnonStatus, saveVitals,
    type AnonCaseFull, type LabService, type AnonTest,
} from "@/lib/actions/anonymous";
import { isLabType } from "@/lib/anon-shared";

interface Perms { clinical: boolean; result: boolean; manage: boolean; }

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

const RESULT_STATUS: Record<string, { label: string; cls: string }> = {
    pending: { label: "รอผล", cls: "bg-slate-100 text-slate-500" },
    sent_out: { label: "ส่งตรวจยืนยัน (Lab นอก)", cls: "bg-indigo-100 text-indigo-700" },
    negative: { label: "ลบ / ปกติ", cls: "bg-emerald-100 text-emerald-700" },
    positive: { label: "บวก / ผิดปกติ", cls: "bg-rose-100 text-rose-700" },
    inconclusive: { label: "สรุปไม่ได้", cls: "bg-amber-100 text-amber-700" },
};
const STATUS_FLOW = ["opened", "collected", "resulted", "closed"];
const STATUS_LABEL: Record<string, string> = {
    registered: "ลงทะเบียน", opened: "เปิดเคสแล้ว", collected: "เก็บตัวอย่าง", resulted: "มีผลแล้ว", closed: "ปิดเคส",
};
const PAYMENT_METHODS: [string, string][] = [
    ["cash", "เงินสด"], ["transfer", "โอน"], ["qr_promptpay", "QR / พร้อมเพย์"], ["credit_card", "บัตรเครดิต"],
];
const SEX_LABEL: Record<string, string> = { male: "ชาย", female: "หญิง", other: "อื่นๆ" };

export default function AnonCaseClient({ data, services, perms }: { data: AnonCaseFull; services: LabService[]; perms: Perms }) {
    const router = useRouter();
    const [busy, startBusy] = useTransition();
    const run = (fn: () => Promise<unknown>) => startBusy(async () => { await fn(); router.refresh(); });

    return (
        <div className="space-y-4 max-w-5xl mx-auto animate-fade-in pb-12">
            {/* Header */}
            <div className="gonix-card-premium p-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard/anonymous" className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50 shrink-0">
                            <ArrowLeft className="h-4 w-4 text-slate-500" />
                        </Link>
                        <div className="h-12 w-12 rounded-2xl flex items-center justify-center bg-[#2B54F0]/10 shrink-0">
                            <ShieldCheck className="h-6 w-6 text-[#2B54F0]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl font-black text-slate-800 font-mono tracking-tight">{data.verify_code || data.case_code}</h1>
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{STATUS_LABEL[data.status]}</span>
                                {data.reg_channel === "online" && (
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">ลงทะเบียนออนไลน์</span>
                                )}
                                {data.followup_requested && (
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 inline-flex items-center gap-1">
                                        <CalendarClock className="h-3 w-3" /> ขอนัดหมาย
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {formatDateThai(data.case_date)}
                                {data.sex && <span className="ml-2">· {SEX_LABEL[data.sex] || data.sex}</span>}
                                {data.age != null && <span className="ml-1">· {data.age} ปี</span>}
                                {data.paid ? <span className="text-emerald-600 font-semibold ml-2">· ชำระแล้ว</span> : <span className="text-amber-600 font-semibold ml-2">· ค้างชำระ</span>}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <a href={`/print/anon-sticker/${data.id}`} target="_blank" rel="noreferrer"
                            className="h-9 px-3 rounded-xl border border-slate-200 inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                            <Tag className="h-4 w-4" /> สติ๊กเกอร์
                        </a>
                        <a href={`/print/anon/${data.id}?doc=result`} target="_blank" rel="noreferrer"
                            className="h-9 px-3 rounded-xl border border-slate-200 inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                            <Printer className="h-4 w-4" /> พิมพ์ผลตรวจ
                        </a>
                        <a href={`/print/anon/${data.id}?doc=receipt`} target="_blank" rel="noreferrer"
                            className="h-9 px-3 rounded-xl border border-slate-200 inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                            <FileText className="h-4 w-4" /> ใบเสร็จ
                        </a>
                    </div>
                </div>

                {/* Status flow */}
                <div className="flex items-center gap-1.5 mt-4 flex-wrap">
                    {STATUS_FLOW.map((s) => (
                        <button key={s} disabled={busy} onClick={() => run(() => setAnonStatus(data.id, s))}
                            className={`h-8 px-3 rounded-lg text-xs font-bold transition-all ${data.status === s ? "bg-[#2B54F0] text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                            {STATUS_LABEL[s]}
                        </button>
                    ))}
                </div>
            </div>

            <div className={perms.manage ? "grid grid-cols-1 lg:grid-cols-3 gap-4" : "space-y-4"}>
                {/* LEFT (คลินิก) */}
                <div className={perms.manage ? "lg:col-span-2 space-y-4" : "space-y-4"}>
                    {/* Vital signs — เจ้าหน้าที่คัดกรอง (ทุกบทบาทที่เข้าถึงเคสได้) */}
                    <VitalsCard caseId={data.id} vitals={data.vitals} busy={busy} run={run} />

                    {/* ข้อมูลความเสี่ยง/แบบประเมิน — แพทย์เท่านั้น */}
                    {perms.clinical
                        ? (data.questionnaire && <QuestionnaireCard q={data.questionnaire} />)
                        : <ClinicalHiddenNote />}

                    {/* รายการตรวจ + ผล — แพทย์ หรือผู้บันทึกผล */}
                    {(perms.clinical || perms.result) && (
                        <TestsCard caseId={data.id} tests={data.tests} services={services} busy={busy} run={run} />
                    )}

                    {/* บันทึกแพทย์ + Counseling — แพทย์ */}
                    {perms.clinical && <CounselCard data={data} busy={busy} run={run} />}
                </div>

                {/* RIGHT (ใบเสร็จ — พนักงานเคาน์เตอร์) */}
                {perms.manage && (
                    <div className="space-y-4">
                        <PaymentCard data={data} services={services} busy={busy} run={run} />
                    </div>
                )}
            </div>
        </div>
    );
}

function formatDateThai(d: string): string {
    return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

// ── Vital signs (เจ้าหน้าที่คัดกรอง) ────────────────
const VITAL_FIELDS: { key: string; label: string; unit: string; w?: string }[] = [
    { key: "weight", label: "น้ำหนัก", unit: "กก." },
    { key: "height", label: "ส่วนสูง", unit: "ซม." },
    { key: "bp_sys", label: "ความดัน (บน)", unit: "mmHg" },
    { key: "bp_dia", label: "ความดัน (ล่าง)", unit: "mmHg" },
    { key: "pulse", label: "ชีพจร", unit: "/นาที" },
    { key: "temp", label: "อุณหภูมิ", unit: "°C" },
    { key: "rr", label: "การหายใจ", unit: "/นาที" },
    { key: "spo2", label: "SpO₂", unit: "%" },
];
function VitalsCard({ caseId, vitals, busy, run }: {
    caseId: string; vitals: Record<string, unknown> | null;
    busy: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
    const init = (vitals || {}) as Record<string, string>;
    const [v, setV] = useState<Record<string, string>>(() => {
        const o: Record<string, string> = {};
        VITAL_FIELDS.forEach((f) => { o[f.key] = init[f.key] != null ? String(init[f.key]) : ""; });
        o.note = init.note != null ? String(init.note) : "";
        return o;
    });
    const setK = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }));

    return (
        <div className="gonix-card-premium overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 bg-emerald-50/40">
                <Activity className="h-4 w-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-800">คัดกรองสัญญาณชีพ (Vital Signs)</h2>
                <span className="text-[11px] text-slate-400">โดยเจ้าหน้าที่</span>
            </div>
            <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {VITAL_FIELDS.map((f) => (
                        <div key={f.key}>
                            <label className="text-[11px] font-semibold text-slate-500">{f.label}</label>
                            <div className="relative">
                                <input type="number" value={v[f.key]} onChange={(e) => setK(f.key, e.target.value)}
                                    className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-2.5 pr-9 text-sm focus:border-emerald-500 focus:outline-none" />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">{f.unit}</span>
                            </div>
                        </div>
                    ))}
                </div>
                <input value={v.note} onChange={(e) => setK("note", e.target.value)} placeholder="หมายเหตุการคัดกรอง (ไม่บังคับ)"
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-emerald-500 focus:outline-none" />
                <button disabled={busy} onClick={() => run(() => saveVitals(caseId, v))}
                    className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึกสัญญาณชีพ
                </button>
            </div>
        </div>
    );
}

function ClinicalHiddenNote() {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-slate-200/70 flex items-center justify-center shrink-0">
                <EyeOff className="h-4 w-4 text-slate-500" />
            </div>
            <div className="text-sm text-slate-600">
                <p className="font-bold text-slate-700">ข้อมูลความเสี่ยง / แบบประเมิน และผลตรวจ — เฉพาะแพทย์</p>
                <p className="text-xs mt-0.5">หน้านี้สำหรับเจ้าหน้าที่ใช้ <b>เปิดเคส + คัดกรองสัญญาณชีพ</b> เท่านั้น ข้อมูลความเสี่ยงของผู้รับบริการจะแสดงเมื่อเข้าสู่ระบบด้วยบัญชีแพทย์</p>
            </div>
        </div>
    );
}

// ── Questionnaire (แบบประเมินจากลงทะเบียนออนไลน์) ────
const Q_LABEL: Record<string, string> = {
    addr_district: "เขต/อำเภอ", addr_province: "จังหวัด", birth_province: "เกิดที่จังหวัด",
    marital: "สถานภาพ", education: "การศึกษา", occupation: "อาชีพ", income: "รายได้/เดือน", weight: "น้ำหนัก (กก.)",
    sexual_history: "ประวัติเพศสัมพันธ์", sexual_partners: "เคยมีเพศสัมพันธ์กับ", gender_identity: "อัตลักษณ์ทางเพศ",
    hear_from: "รู้จักคลินิกจาก", services: "บริการที่ต้องการ", hiv_known_year: "ทราบผล HIV ปี",
    reasons: "สาเหตุที่มาตรวจ", protections: "การป้องกัน", self_harm: "เคยคิดทำร้ายตนเอง", want_counselor: "ต้องการที่ปรึกษาพิเศษ",
    email: "อีเมล", phone: "เบอร์ติดต่อ",
};
function qVal(key: string, v: unknown): string {
    if (Array.isArray(v)) return v.join(", ");
    if (key === "sexual_history") return v === "had" ? "เคยมี" : v === "never" ? "ไม่เคยมี" : String(v ?? "");
    if (key === "self_harm" || key === "want_counselor") return v === "yes" ? "ใช่" : v === "no" ? "ไม่ใช่" : String(v ?? "");
    return String(v ?? "");
}
const Q_GROUPS: { title: string; color: string; keys: string[] }[] = [
    { title: "เหตุผล & ความเสี่ยง", color: "text-rose-600", keys: ["reasons", "__risk", "protections", "sexual_history", "sexual_partners"] },
    { title: "เพศสภาพ & สุขภาพจิต", color: "text-violet-600", keys: ["gender_identity", "self_harm", "want_counselor"] },
    { title: "บริการที่ต้องการ", color: "text-[#2B54F0]", keys: ["services", "hiv_known_year"] },
    { title: "ข้อมูลทั่วไป", color: "text-slate-400", keys: ["weight", "marital", "education", "occupation", "income", "addr_district", "addr_province", "birth_province", "email", "phone"] },
];

function QuestionnaireCard({ q }: { q: Record<string, unknown> }) {
    const riskAmt = q.risk_amount ? `${q.risk_amount} ${q.risk_unit || ""} ที่แล้ว` : "";
    const flagged = q.self_harm === "yes" || q.want_counselor === "yes";

    function rowsFor(keys: string[]) {
        const out: { label: string; val: string; danger: boolean }[] = [];
        for (const k of keys) {
            if (k === "__risk") {
                if (riskAmt) out.push({ label: "เสี่ยงล่าสุด", val: riskAmt, danger: false });
                continue;
            }
            const v = q[k];
            if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
            const danger = (k === "self_harm" || k === "want_counselor") && v === "yes";
            out.push({ label: Q_LABEL[k] || k, val: qVal(k, v), danger });
        }
        return out;
    }

    const groups = Q_GROUPS.map((g) => ({ ...g, rows: rowsFor(g.keys) })).filter((g) => g.rows.length > 0);

    return (
        <div className="gonix-card-premium overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 bg-cyan-50/40">
                <ShieldCheck className="h-4 w-4 text-cyan-600" />
                <h2 className="text-sm font-bold text-slate-800">แบบประเมินความเสี่ยง (กรอกออนไลน์)</h2>
            </div>

            {flagged && (
                <div className="mx-4 mt-3 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                    <span className="text-xs font-semibold text-rose-700">ผู้รับบริการอาจต้องการการดูแลด้านจิตใจ / ที่ปรึกษาพิเศษ</span>
                </div>
            )}

            <div className="p-4 space-y-4">
                {groups.map((g) => (
                    <div key={g.title}>
                        <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${g.color}`}>{g.title}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
                            {g.rows.map((r) => (
                                <div key={r.label} className="flex justify-between gap-3 text-sm border-b border-slate-50 pb-1.5">
                                    <span className="text-slate-500 shrink-0">{r.label}</span>
                                    <span className={`font-semibold text-right ${r.danger ? "text-rose-600" : "text-slate-800"}`}>{r.val}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                {groups.length === 0 && <p className="text-sm text-slate-400">ไม่มีข้อมูลแบบประเมิน</p>}
            </div>
        </div>
    );
}

// ── Tests & charges ─────────────────────────────────
function TestsCard({ caseId, tests, services, busy, run }: {
    caseId: string; tests: AnonTest[]; services: LabService[];
    busy: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
    const [adding, setAdding] = useState("");
    const labTests = tests.filter((t) => isLabType(t.item_type));
    const charges = tests.filter((t) => !isLabType(t.item_type));

    // จัดกลุ่ม dropdown: Lab ก่อน แล้วค่อยค่าบริการอื่น
    const labOpts = services.filter((s) => isLabType(s.item_type));
    const otherOpts = services.filter((s) => !isLabType(s.item_type));

    return (
        <div className="gonix-card-premium overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <TestTube className="h-4 w-4 text-[#2B54F0]" />
                <h2 className="text-sm font-bold text-slate-800">รายการตรวจ & ผล (Lab)</h2>
                <span className="text-xs text-slate-400">({labTests.length})</span>
            </div>
            <div className="divide-y divide-slate-100">
                {labTests.map((t) => <TestRow key={t.id} caseId={caseId} test={t} busy={busy} run={run} />)}
                {labTests.length === 0 && <p className="text-center text-sm text-slate-400 py-6">ยังไม่มีรายการตรวจ Lab</p>}
            </div>

            {/* ค่าบริการ/รายการอื่น — ไม่มีผล */}
            {charges.length > 0 && (
                <>
                    <div className="px-5 py-2 bg-slate-50 border-t border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        ค่าบริการ / รายการอื่น (ไม่มีผลตรวจ)
                    </div>
                    <div className="divide-y divide-slate-100">
                        {charges.map((t) => (
                            <div key={t.id} className="flex items-center justify-between px-5 py-2.5">
                                <span className="text-sm text-slate-700">{t.test_name}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-700 tabular-nums">{baht(t.price)}</span>
                                    <button disabled={busy} onClick={() => run(() => removeAnonTest(t.id, caseId))}
                                        className="h-7 w-7 rounded-lg hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-600">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Add */}
            <div className="p-3 border-t border-slate-100 flex items-center gap-2">
                <select value={adding} onChange={(e) => setAdding(e.target.value)}
                    className="flex-1 min-w-0 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-[#2B54F0] focus:outline-none">
                    <option value="">+ เพิ่มรายการ…</option>
                    {labOpts.length > 0 && (
                        <optgroup label="รายการตรวจ Lab (มีผล)">
                            {labOpts.map((s) => <option key={s.id} value={s.id}>{s.name} — {baht(s.price)}</option>)}
                        </optgroup>
                    )}
                    {otherOpts.length > 0 && (
                        <optgroup label="ค่าบริการ / อื่นๆ (ไม่มีผล)">
                            {otherOpts.map((s) => <option key={s.id} value={s.id}>{s.name} — {baht(s.price)}</option>)}
                        </optgroup>
                    )}
                </select>
                <button disabled={!adding || busy} onClick={() => run(async () => { await addAnonTest(caseId, adding); setAdding(""); })}
                    className="h-9 px-3 rounded-lg bg-[#2B54F0] text-white text-sm font-bold inline-flex items-center gap-1 disabled:opacity-50">
                    <Plus className="h-4 w-4" /> เพิ่ม
                </button>
            </div>
        </div>
    );
}

function TestRow({ caseId, test, busy, run }: {
    caseId: string; test: AnonTest; busy: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
    const [value, setValue] = useState(test.result_value || "");
    const [status, setStatus] = useState(test.result_status || "pending");
    const [note, setNote] = useState(test.result_note || "");
    const dirty = value !== (test.result_value || "") || status !== (test.result_status || "pending") || note !== (test.result_note || "");
    const st = RESULT_STATUS[test.result_status] || RESULT_STATUS.pending;

    return (
        <div className="px-5 py-3">
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-semibold text-slate-800 text-sm">{test.test_name}</div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 tabular-nums">{baht(test.price)}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                    <button disabled={busy} onClick={() => run(() => removeAnonTest(test.id, caseId))}
                        className="h-7 w-7 rounded-lg hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="ค่าผล เช่น Non-reactive"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-[#2B54F0] focus:outline-none" />
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-[#2B54F0] focus:outline-none">
                    {Object.entries(RESULT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ)"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-[#2B54F0] focus:outline-none" />
            </div>
            {dirty && (
                <div className="mt-2 flex justify-end">
                    <button disabled={busy} onClick={() => run(() => saveTestResult(test.id, caseId, { result_value: value, result_status: status, result_note: note }))}
                        className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} บันทึกผล
                    </button>
                </div>
            )}
        </div>
    );
}

// ── บันทึกแพทย์ + Counseling ────────────────────────
function CounselCard({ data, busy, run }: { data: AnonCaseFull; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
    const [appt, setAppt] = useState(data.result_appt_date || "");
    const [risk, setRisk] = useState(data.risk_note || "");
    const notesDirty = appt !== (data.result_appt_date || "") || risk !== (data.risk_note || "");

    return (
        <div className="gonix-card-premium overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <MessageSquareHeart className="h-4 w-4 text-pink-600" />
                <h2 className="text-sm font-bold text-slate-800">บันทึกแพทย์ & การให้คำปรึกษา</h2>
            </div>

            {/* บันทึกแพทย์ */}
            <div className="p-4 border-b border-slate-100 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-1"><CalendarClock className="h-3 w-3" /> นัดฟังผล (ถ้ามี)</label>
                        <input type="date" value={appt} onChange={(e) => setAppt(e.target.value)}
                            className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-[#2B54F0] focus:outline-none" />
                    </div>
                </div>
                <div>
                    <label className="text-[11px] font-semibold text-slate-500">บันทึกของแพทย์ / ความเสี่ยงเพิ่มเติม</label>
                    <textarea value={risk} onChange={(e) => setRisk(e.target.value)} rows={2}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm focus:border-[#2B54F0] focus:outline-none resize-none" />
                </div>
                <div className="flex items-center gap-2">
                    <button disabled={busy} onClick={() => run(() => updateAnonCaseInfo(data.id, { result_appt_date: appt || null, risk_note: risk || null }))}
                        className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึกข้อมูลแพทย์
                    </button>
                    {notesDirty && <span className="text-xs text-amber-600 font-semibold">• ยังไม่ได้บันทึก</span>}
                </div>
            </div>

            {/* Counseling ก่อน/หลัง — ติ๊กว่าทำแล้ว (VCT record) */}
            <div className="p-4 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">การให้คำปรึกษา (VCT)</div>
                <CounselCheck phase="pre" label="ให้คำปรึกษาก่อนตรวจแล้ว" done={data.pre_counsel_done} at={data.pre_counsel_at} caseId={data.id} busy={busy} run={run} />
                <CounselCheck phase="post" label="ให้คำปรึกษาหลังตรวจ / แจ้งผลแล้ว" done={data.post_counsel_done} at={data.post_counsel_at} caseId={data.id} busy={busy} run={run} />
            </div>
        </div>
    );
}

function CounselCheck({ phase, label, done, at, caseId, busy, run }: {
    phase: "pre" | "post"; label: string; done: boolean; at: string | null;
    caseId: string; busy: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
    return (
        <label className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${done ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200 hover:border-slate-300"}`}>
            <div className="flex items-center gap-2.5">
                <input type="checkbox" checked={done} disabled={busy}
                    onChange={() => run(() => setCounsel(caseId, phase, { done: !done }))}
                    className="h-4 w-4 accent-emerald-600" />
                <span className="text-sm font-medium text-slate-700">{label}</span>
            </div>
            {done && at && (
                <span className="text-[10px] font-semibold text-emerald-600 inline-flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {new Date(at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
            )}
        </label>
    );
}

// ── Payment (พนักงานเคาน์เตอร์) ─────────────────────
function PaymentCard({ data, services, busy, run }: { data: AnonCaseFull; services: LabService[]; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
    const [method, setMethod] = useState(data.payment_method || "cash");
    const [addCharge, setAddCharge] = useState("");
    const closed = data.status === "closed";
    const chargeOpts = services.filter((s) => !isLabType(s.item_type)); // เพิ่มได้เฉพาะค่าบริการ ไม่ใช่ Lab

    return (
        <div className="gonix-card-premium p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-[#0EA5A0]" />
                <h2 className="text-sm font-bold text-slate-800">ใบเสร็จนิรนาม</h2>
            </div>

            {/* รายการที่ต้องชำระ — ให้แคชเชียร์ตรวจสอบ */}
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {data.tests.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-slate-400 text-center">ยังไม่มีรายการ</div>
                ) : data.tests.map((t) => {
                    const lab = isLabType(t.item_type);
                    return (
                        <div key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <span className="text-slate-700 truncate pr-2">
                                {t.test_name}{lab && <span className="text-[10px] text-slate-400 ml-1">(Lab)</span>}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-semibold text-slate-700 tabular-nums">{baht(t.price)}</span>
                                {/* ลบได้เฉพาะค่าบริการที่เพิ่มเอง (ไม่ใช่ Lab) และยังไม่จ่าย */}
                                {!data.paid && !lab && (
                                    <button disabled={busy} onClick={() => run(() => removeAnonTest(t.id, data.id))}
                                        className="h-6 w-6 rounded hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-600">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
                <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50">
                    <span className="text-xs font-bold text-slate-500 uppercase">ยอดรวม</span>
                    <span className="text-lg font-black text-slate-800 tabular-nums">{baht(data.total_amount)}</span>
                </div>
            </div>

            {/* เพิ่มค่าบริการ/รายการอื่น (พนักงานเคาน์เตอร์) */}
            {!data.paid && chargeOpts.length > 0 && (
                <div className="flex items-center gap-2">
                    <select value={addCharge} onChange={(e) => setAddCharge(e.target.value)}
                        className="flex-1 min-w-0 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-[#0EA5A0] focus:outline-none">
                        <option value="">+ เพิ่มค่าบริการ / รายการอื่น…</option>
                        {chargeOpts.map((s) => <option key={s.id} value={s.id}>{s.name} — {baht(s.price)}</option>)}
                    </select>
                    <button disabled={!addCharge || busy} onClick={() => run(async () => { await addAnonTest(data.id, addCharge); setAddCharge(""); })}
                        className="h-9 px-3 rounded-lg bg-[#0EA5A0] text-white text-sm font-bold inline-flex items-center gap-1 disabled:opacity-50">
                        <Plus className="h-4 w-4" /> เพิ่ม
                    </button>
                </div>
            )}

            {data.paid ? (
                <div className="space-y-2">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-1" />
                        <div className="text-sm font-bold text-emerald-700">ชำระแล้ว</div>
                        <div className="text-[11px] text-emerald-600">
                            {PAYMENT_METHODS.find(([k]) => k === data.payment_method)?.[1] || data.payment_method}
                            {data.paid_at && ` · ${new Date(data.paid_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}`}
                        </div>
                        {data.receipt_no && <div className="text-[10px] text-emerald-500 font-mono mt-0.5">เลขที่ {data.receipt_no}</div>}
                    </div>
                    {/* ปิดเคส */}
                    {closed ? (
                        <div className="text-center text-xs font-bold text-slate-500 py-1.5">เคสนี้ปิดแล้ว</div>
                    ) : (
                        <button disabled={busy} onClick={() => run(() => setAnonStatus(data.id, "closed"))}
                            className="w-full h-10 rounded-xl bg-slate-800 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} ปิดเคส
                        </button>
                    )}
                    <button disabled={busy} onClick={() => run(() => cancelAnonPayment(data.id))}
                        className="w-full h-8 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold disabled:opacity-50">ยกเลิกการชำระ</button>
                </div>
            ) : (
                <>
                    <div>
                        <label className="text-[11px] font-semibold text-slate-500">วิธีชำระ</label>
                        <select value={method} onChange={(e) => setMethod(e.target.value)}
                            className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-[#0EA5A0] focus:outline-none">
                            {PAYMENT_METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>
                    <button disabled={busy || data.total_amount <= 0} onClick={() => run(() => recordAnonPayment(data.id, method))}
                        className="w-full h-10 rounded-xl text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                        style={{ background: "linear-gradient(90deg,#0EA5A0,#15FF83)" }}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} รับชำระเงิน
                    </button>
                </>
            )}
        </div>
    );
}
