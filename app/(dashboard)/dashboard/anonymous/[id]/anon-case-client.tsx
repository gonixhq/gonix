"use client";

import { useState, useTransition, useMemo, useRef, useEffect, Fragment } from "react";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    ShieldCheck, ArrowLeft, TestTube, Plus, Trash2, Loader2, Save,
    MessageSquareHeart, Wallet, CheckCircle2, Printer, CalendarClock, FileText,
    Activity, EyeOff, AlertTriangle, Tag, Package, Ban, RotateCcw, User, type LucideIcon,
} from "lucide-react";
import {
    updateAnonCaseInfo, setCounsel, saveTestResult, addAnonTest, removeAnonTest, addAnonPanel,
    recordAnonPayment, cancelAnonPayment, setAnonStatus, saveVitals, saveLabReport, saveAnonReportMeta, saveAnonTestResults, cancelAnonCase, uncancelAnonCase,
    type AnonCaseFull, type LabService, type AnonTest, type AnonPanel,
} from "@/lib/actions/anonymous";
import { isLabType } from "@/lib/anon-shared";
import LabImageUploader from "@/components/ui/lab-image-uploader";

interface Perms { clinical: boolean; result: boolean; manage: boolean; }

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

const RESULT_STATUS: Record<string, { label: string; cls: string }> = {
    pending: { label: "รอผล", cls: "bg-slate-100 text-slate-500" },
    sent_out: { label: "ส่งตรวจยืนยัน (Lab นอก)", cls: "bg-indigo-100 text-indigo-700" },
    negative: { label: "ลบ / ปกติ", cls: "bg-emerald-100 text-emerald-700" },
    positive: { label: "บวก / ผิดปกติ", cls: "bg-rose-100 text-rose-700" },
    inconclusive: { label: "สรุปไม่ได้", cls: "bg-amber-100 text-amber-700" },
};
const ACCENT_COLOR: Record<string, string> = {
    positive: "#e11d48", inconclusive: "#f59e0b", negative: "#10b981", sent_out: "#6366f1", pending: "transparent",
};
const STATUS_FLOW = ["opened", "collected", "resulted", "closed"];
const STATUS_LABEL: Record<string, string> = {
    registered: "ลงทะเบียน", opened: "เปิดเคสแล้ว", collected: "เก็บตัวอย่าง", resulted: "มีผลแล้ว", closed: "ปิดเคส", cancelled: "ยกเลิก",
};
const PAYMENT_METHODS: [string, string][] = [
    ["cash", "เงินสด"], ["transfer", "โอน"], ["qr_promptpay", "QR / พร้อมเพย์"], ["credit_card", "บัตรเครดิต"],
];
const SEX_LABEL: Record<string, string> = { male: "ชาย", female: "หญิง", other: "อื่นๆ" };
const ANON_SAMPLE_TYPES = ["Clotted blood", "Serum", "EDTA blood (CBC)", "Plasma", "Urine", "Swab", "Other"];

export default function AnonCaseClient({ data, services, panels, perms }: { data: AnonCaseFull; services: LabService[]; panels: AnonPanel[]; perms: Perms }) {
    const router = useRouter();
    const [busy, startBusy] = useTransition();
    const run = (fn: () => Promise<unknown>) => startBusy(async () => { await fn(); router.refresh(); });
    const setStatus = (s: string) => startBusy(async () => { const r = await setAnonStatus(data.id, s); if (!r.ok) { toast.error(r.error); return; } router.refresh(); });

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
                        {data.status !== "cancelled" && (
                            <button onClick={() => { const r = prompt("เหตุผลที่ยกเลิกเคส (ไม่บังคับ):"); if (r === null) return; run(() => cancelAnonCase(data.id, r)); }}
                                className="h-9 px-3 rounded-xl border border-rose-200 inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50">
                                <Ban className="h-4 w-4" /> ยกเลิกเคส
                            </button>
                        )}
                    </div>
                </div>

                {/* Status flow / cancelled banner */}
                {data.status === "cancelled" ? (
                    <div className="mt-4 rounded-xl bg-slate-100 border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                            <Ban className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                            <div className="text-sm text-slate-600 min-w-0">
                                <span className="font-bold text-slate-700">เคสถูกยกเลิก</span>
                                {data.cancelled_at && <span className="text-xs"> · {new Date(data.cancelled_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>}
                                {data.cancelled_by_name && <span className="text-xs"> · โดย {data.cancelled_by_name}</span>}
                                {data.cancel_reason && <div className="text-xs text-slate-500 mt-0.5">เหตุผล: {data.cancel_reason}</div>}
                            </div>
                        </div>
                        <button disabled={busy} onClick={() => run(() => uncancelAnonCase(data.id))}
                            className="h-8 px-3 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-white inline-flex items-center gap-1 shrink-0 disabled:opacity-50">
                            <RotateCcw className="h-3.5 w-3.5" /> คืนสภาพ
                        </button>
                    </div>
                ) : (
                    <StatusStepper status={data.status} busy={busy} onSet={setStatus} />
                )}
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
                        <TestsCard caseId={data.id} tests={data.tests} services={services} panels={panels} busy={busy} run={run} />
                    )}

                    {/* ใบรายงานผล Laboratory Report — แพทย์ หรือผู้บันทึกผล */}
                    {(perms.clinical || perms.result) && (
                        <LabReportCard data={data} busy={busy} run={run} />
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

// ── Status stepper (ขั้นตอนการทำงานของเคส) ──────────
function StatusStepper({ status, busy, onSet }: { status: string; busy: boolean; onSet: (s: string) => void }) {
    const curr = STATUS_FLOW.indexOf(status);
    return (
        <div className="mt-5 flex items-start">
            {STATUS_FLOW.map((s, i) => {
                const done = curr > i;
                const active = curr === i;
                return (
                    <Fragment key={s}>
                        <button disabled={busy} onClick={() => onSet(s)} title={`ตั้งสถานะเป็น "${STATUS_LABEL[s]}"`}
                            className="flex flex-col items-center gap-1.5 shrink-0 w-16 group disabled:opacity-60">
                            <span className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${done
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : active
                                    ? "bg-[#2B54F0] border-[#2B54F0] text-white ring-4 ring-[#2B54F0]/15"
                                    : "bg-white border-slate-300 text-slate-400 group-hover:border-slate-400"}`}>
                                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                            </span>
                            <span className={`text-[10px] font-bold text-center leading-tight ${active ? "text-[#2B54F0]" : done ? "text-emerald-600" : "text-slate-400"}`}>
                                {STATUS_LABEL[s]}
                            </span>
                        </button>
                        {i < STATUS_FLOW.length - 1 && (
                            <div className={`flex-1 h-0.5 rounded mt-4 transition-colors ${curr > i ? "bg-emerald-400" : "bg-slate-200"}`} />
                        )}
                    </Fragment>
                );
            })}
        </div>
    );
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
const Q_GROUPS: { title: string; icon: LucideIcon; hdr: string; chip: string; keys: string[] }[] = [
    { title: "เหตุผล & ความเสี่ยง", icon: AlertTriangle, hdr: "text-rose-600", chip: "bg-rose-100 text-rose-600", keys: ["reasons", "__risk", "protections", "sexual_history", "sexual_partners"] },
    { title: "เพศสภาพ & สุขภาพจิต", icon: MessageSquareHeart, hdr: "text-violet-600", chip: "bg-violet-100 text-violet-600", keys: ["gender_identity", "self_harm", "want_counselor"] },
    { title: "บริการที่ต้องการ", icon: TestTube, hdr: "text-[#2B54F0]", chip: "bg-[#2B54F0]/10 text-[#2B54F0]", keys: ["services", "hiv_known_year"] },
    { title: "ข้อมูลทั่วไป", icon: User, hdr: "text-slate-500", chip: "bg-slate-100 text-slate-500", keys: ["weight", "marital", "education", "occupation", "income", "addr_district", "addr_province", "birth_province", "email", "phone"] },
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

            <div className="p-4 space-y-3">
                {groups.map((g) => (
                    <div key={g.title} className="rounded-xl border border-slate-100 bg-slate-50/40 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-white/60 border-b border-slate-100">
                            <span className={`h-6 w-6 rounded-lg flex items-center justify-center ${g.chip}`}><g.icon className="h-3.5 w-3.5" /></span>
                            <span className={`text-[12px] font-bold ${g.hdr}`}>{g.title}</span>
                        </div>
                        <div className="px-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                            {g.rows.map((r) => (
                                <div key={r.label} className="flex items-baseline justify-between gap-4 py-2 border-b border-slate-100/80 last:border-0">
                                    <span className="text-[13px] text-slate-500 shrink-0">{r.label}</span>
                                    <span className={`text-[14px] font-bold text-right leading-snug ${r.danger ? "text-rose-600" : "text-slate-800"}`}>{r.val}</span>
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
function TestsCard({ caseId, tests, services, panels, busy, run }: {
    caseId: string; tests: AnonTest[]; services: LabService[]; panels: AnonPanel[];
    busy: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
    const [adding, setAdding] = useState("");
    const [addingPanel, setAddingPanel] = useState("");
    const activePanels = panels.filter((p) => p.is_active);
    const labTests = tests.filter((t) => isLabType(t.item_type));
    const charges = tests.filter((t) => !isLabType(t.item_type));

    // จัดกลุ่ม dropdown: Lab ก่อน แล้วค่อยค่าบริการอื่น
    const labOpts = services.filter((s) => isLabType(s.item_type));
    const otherOpts = services.filter((s) => !isLabType(s.item_type));

    // ปุ่มเดียว: เก็บ draft ทุกแถวไว้ใน ref แล้วบันทึกพร้อมกัน
    const draftsRef = useRef<Map<string, { result_value: string; result_status: string; result_note: string; sample_type: string }>>(new Map());
    const onDraft = (id: string, vals: { result_value: string; result_status: string; result_note: string; sample_type: string }) => { draftsRef.current.set(id, vals); };
    const saveAll = () => run(() => saveAnonTestResults(caseId, labTests.map((t) => {
        const d = draftsRef.current.get(t.id);
        return { id: t.id, result_value: d?.result_value ?? t.result_value, result_status: d?.result_status ?? t.result_status, result_note: d?.result_note ?? t.result_note, sample_type: d?.sample_type ?? t.sample_type };
    })));

    return (
        <div className="gonix-card-premium overflow-hidden">
            <datalist id="anon-sample-types">{ANON_SAMPLE_TYPES.map((x) => <option key={x} value={x} />)}</datalist>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <TestTube className="h-4 w-4 text-[#2B54F0]" />
                <h2 className="text-sm font-bold text-slate-800">รายการตรวจ & ผล (Lab)</h2>
                <span className="text-xs text-slate-400">({labTests.length})</span>
                {labTests.length > 0 && (
                    <button disabled={busy} onClick={saveAll}
                        className="ml-auto h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} บันทึกผลทั้งหมด
                    </button>
                )}
            </div>
            <div className="divide-y divide-slate-100">
                {labTests.map((t) => <TestRow key={t.id} caseId={caseId} test={t} busy={busy} run={run} onDraft={onDraft} />)}
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

            {/* Add panel */}
            {activePanels.length > 0 && (
                <div className="p-3 border-t border-slate-100 bg-[#2B54F0]/[0.03] flex items-center gap-2">
                    <Package className="h-4 w-4 text-[#2B54F0] shrink-0" />
                    <select value={addingPanel} onChange={(e) => setAddingPanel(e.target.value)}
                        className="flex-1 min-w-0 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-[#2B54F0] focus:outline-none">
                        <option value="">+ เพิ่มแพ็กเกจ (ตรวจเป็นชุด)…</option>
                        {activePanels.map((p) => <option key={p.id} value={p.id}>{p.name} — {baht(p.price)} ({p.items.length} รายการ)</option>)}
                    </select>
                    <button disabled={!addingPanel || busy} onClick={() => run(async () => { await addAnonPanel(caseId, addingPanel); setAddingPanel(""); })}
                        className="h-9 px-3 rounded-lg text-white text-sm font-bold inline-flex items-center gap-1 disabled:opacity-50"
                        style={{ background: "linear-gradient(90deg,#2B54F0,#00A6C0)" }}>
                        <Plus className="h-4 w-4" /> เพิ่มแพ็ก
                    </button>
                </div>
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

function TestRow({ caseId, test, busy, run, onDraft }: {
    caseId: string; test: AnonTest; busy: boolean; run: (fn: () => Promise<unknown>) => void;
    onDraft: (id: string, vals: { result_value: string; result_status: string; result_note: string; sample_type: string }) => void;
}) {
    const [value, setValue] = useState(test.result_value || "");
    const [status, setStatus] = useState(test.result_status || "pending");
    const [note, setNote] = useState(test.result_note || "");
    const [sample, setSample] = useState(test.sample_type || "");
    const dirty = value !== (test.result_value || "") || status !== (test.result_status || "pending") || note !== (test.result_note || "") || sample !== (test.sample_type || "");
    const abn = status === "positive" || status === "inconclusive";
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { onDraft(test.id, { result_value: value, result_status: status, result_note: note, sample_type: sample }); }, [value, status, note, sample]);

    const inp = "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-[#2B54F0] focus:outline-none";
    return (
        <div className="px-4 py-2.5 flex flex-wrap md:flex-nowrap items-center gap-2" style={{ borderLeft: `3px solid ${ACCENT_COLOR[test.result_status] || "transparent"}` }}>
            <div className="w-full md:w-[23%] md:shrink-0 min-w-0 flex items-center justify-between md:block">
                <span className="font-semibold text-slate-800 text-[13px] leading-tight block truncate" title={test.test_name}>{test.test_name}</span>
                <span className="text-[10.5px] text-slate-400 tabular-nums">{baht(test.price)}</span>
            </div>
            <input list="anon-sample-types" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="ตัวอย่าง"
                className={`${inp} w-[46%] md:w-28 shrink-0`} title="ชนิดตัวอย่าง (Sample Type)" />
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="ค่าผล"
                className={`${inp} flex-1 min-w-0 ${abn ? "border-rose-300 text-rose-700 font-semibold" : ""}`} />
            <select value={status} onChange={(e) => setStatus(e.target.value)}
                className={`${inp} w-[46%] md:w-36 shrink-0 pr-1`}>
                {Object.entries(RESULT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ"
                className={`${inp} flex-1 min-w-0`} />
            <div className="flex items-center gap-1 shrink-0 ml-auto md:ml-0">
                {dirty && <span className="text-[11px] font-bold text-amber-600" title="ยังไม่บันทึก">●</span>}
                <button disabled={busy} onClick={() => run(() => removeAnonTest(test.id, caseId))}
                    className="h-8 w-8 rounded-lg hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}

// ── บันทึกแพทย์ + Counseling ──
// ── ใบรายงานผล Laboratory Report ──
function toDTLocal(iso: string | null): string {
    if (!iso) return "";
    const bkk = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
    return bkk.toISOString().slice(0, 16);
}
const SAMPLE_TYPES = ["Clotted blood", "Serum", "EDTA blood (CBC)", "Plasma", "Urine", "Swab", "Other"];

function LabReportCard({ data, busy, run }: { data: AnonCaseFull; busy: boolean; run: (fn: () => Promise<unknown>) => void }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaMap = (data.lab_report_meta || {}) as Record<string, any>;
    const sampleTypes = useMemo(() => {
        const set = new Set<string>();
        data.tests.filter((t) => isLabType(t.item_type)).forEach((t) => set.add(t.sample_type || ""));
        const arr = [...set];
        return arr.length ? arr : [""];
    }, [data.tests]);
    const [active, setActive] = useState(sampleTypes[0] ?? "");
    const legacy = {
        lab_no: data.lab_no, collected_at: data.collected_at, received_at: data.received_at, comment: data.lab_comment,
        reported_by_name: data.reported_by_name, reported_by_license: data.reported_by_license, reported_at: data.reported_at,
        approved_by_name: data.approved_by_name, approved_by_license: data.approved_by_license, approved_at: data.approved_at,
    };
    const initFor = (st: string) => {
        const m = metaMap[st] || {};
        return Object.keys(m).length === 0 ? legacy : m;
    };

    return (
        <div className="gonix-card-premium overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 bg-[#2B54F0]/[0.04]">
                <FileText className="h-4 w-4 text-[#2B54F0]" />
                <h2 className="text-sm font-bold text-slate-800">ใบรายงานผล (Laboratory Report)</h2>
                <span className="text-[11px] text-slate-400">ข้อมูลสำหรับพิมพ์ผลตรวจ</span>
            </div>
            <div className="p-4 space-y-3">
                {sampleTypes.length > 1 && (
                    <div>
                        <label className="text-[11px] font-semibold text-[#2B54F0]">เลือกชนิดตัวอย่าง — แต่ละชนิด = คนละใบ (LAB No. แยกกัน)</label>
                        <select value={active} onChange={(e) => setActive(e.target.value)}
                            className="w-full h-9 rounded-lg border border-[#2B54F0]/30 bg-[#2B54F0]/[0.04] px-2 text-sm font-semibold focus:border-[#2B54F0] focus:outline-none">
                            {sampleTypes.map((st) => <option key={st} value={st}>{st || "— ไม่ระบุชนิดตัวอย่าง —"}</option>)}
                        </select>
                    </div>
                )}
                <AnonMetaForm key={active} caseId={data.id} sampleType={active} initial={initFor(active)} busy={busy} run={run} />
            </div>
        </div>
    );
}

function AnonMetaForm({ caseId, sampleType, initial, busy, run }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    caseId: string; sampleType: string; initial: any; busy: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
    const [f, setF] = useState({
        lab_no: initial.lab_no || "",
        collected_at: toDTLocal(initial.collected_at),
        received_at: toDTLocal(initial.received_at),
        comment: initial.comment || "",
        reported_by_name: initial.reported_by_name || "",
        reported_by_license: initial.reported_by_license || "",
        reported_at: toDTLocal(initial.reported_at),
        approved_by_name: initial.approved_by_name || "",
        approved_by_license: initial.approved_by_license || "",
        approved_at: toDTLocal(initial.approved_at),
    });
    const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
    const inp = "w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-[#2B54F0] focus:outline-none";
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
                <div>
                    <label className="text-[11px] font-semibold text-slate-500">LAB No.</label>
                    <input value={f.lab_no} onChange={(e) => set("lab_no", e.target.value)} placeholder="เช่น 69-2-07459" className={inp} />
                </div>
                <div>
                    <label className="text-[11px] font-semibold text-slate-500">ชนิดตัวอย่าง (Sample Type)</label>
                    <input value={sampleType || "— ไม่ระบุ —"} disabled className={`${inp} bg-slate-50 text-slate-500`} />
                </div>
                <div>
                    <label className="text-[11px] font-semibold text-slate-500">วันเวลาเก็บตัวอย่าง (Collected)</label>
                    <input type="datetime-local" value={f.collected_at} onChange={(e) => set("collected_at", e.target.value)} className={inp} />
                </div>
                <div>
                    <label className="text-[11px] font-semibold text-slate-500">วันเวลารับตัวอย่าง (Received)</label>
                    <input type="datetime-local" value={f.received_at} onChange={(e) => set("received_at", e.target.value)} className={inp} />
                </div>
            </div>
            <div>
                <label className="text-[11px] font-semibold text-slate-500">หมายเหตุ (Comment)</label>
                <input value={f.comment} onChange={(e) => set("comment", e.target.value)} placeholder="หมายเหตุในรายงาน (ถ้ามี)" className={inp} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-2.5 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">ผู้รายงานผล (Reported By)</div>
                    <input value={f.reported_by_name} onChange={(e) => set("reported_by_name", e.target.value)} placeholder="ชื่อ-สกุล" className={inp} />
                    <input value={f.reported_by_license} onChange={(e) => set("reported_by_license", e.target.value)} placeholder="เลขใบประกอบ / MT" className={inp} />
                    <input type="datetime-local" value={f.reported_at} onChange={(e) => set("reported_at", e.target.value)} className={inp} />
                </div>
                <div className="rounded-xl border border-slate-200 p-2.5 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">ผู้ตรวจสอบ/อนุมัติ (Approved By)</div>
                    <input value={f.approved_by_name} onChange={(e) => set("approved_by_name", e.target.value)} placeholder="ชื่อ-สกุล" className={inp} />
                    <input value={f.approved_by_license} onChange={(e) => set("approved_by_license", e.target.value)} placeholder="เลขใบประกอบ / MT" className={inp} />
                    <input type="datetime-local" value={f.approved_at} onChange={(e) => set("approved_at", e.target.value)} className={inp} />
                </div>
            </div>
            <LabImageUploader scope="anon" caseKey={caseId} sampleType={sampleType} paths={(initial.images as string[]) || []} />
            <button disabled={busy} onClick={() => run(() => saveAnonReportMeta(caseId, sampleType, f))}
                className="h-9 px-4 rounded-lg bg-[#2B54F0] text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึกใบนี้ ({sampleType || "ไม่ระบุชนิด"})
            </button>
        </div>
    );
}

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
