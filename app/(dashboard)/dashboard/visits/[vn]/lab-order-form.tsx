"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, Trash2, Loader2, Save, Printer, FileText, CheckCircle2, Package } from "lucide-react";
import {
    addLabOrder, addLabPanel, removeLabOrder, saveLabOrderResult, saveLabOrderResults, saveVisitLabReport, saveVisitReportMeta,
    type LabCatalogItem, type LabOrder,
} from "@/lib/actions/lab-orders";
import type { AnonPanel } from "@/lib/actions/anonymous";

interface LabReport {
    lab_no?: string | null; lab_sample_type?: string | null;
    lab_collected_at?: string | null; lab_received_at?: string | null;
    lab_comment?: string | null;
    lab_reported_by_name?: string | null; lab_reported_by_license?: string | null; lab_reported_at?: string | null;
    lab_approved_by_name?: string | null; lab_approved_by_license?: string | null; lab_approved_at?: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lab_report_meta?: Record<string, any>;
}

const FLAGS: [string, string][] = [
    ["", "— แปลผล —"], ["normal", "ปกติ (N)"], ["high", "สูง (H)"], ["low", "ต่ำ (L)"],
    ["abnormal", "ผิดปกติ"], ["positive", "Positive"], ["negative", "Negative"],
];
const SAMPLE_TYPES = ["Clotted blood", "Serum", "EDTA blood (CBC)", "Plasma", "Urine", "Swab", "Other"];

// แนะนำ Lab ตาม CC — คำใน CC → คำที่ต้องมีในชื่อ lab
const CC_HINTS: { kw: string[]; match: string[] }[] = [
    { kw: ["ปวดท้อง", "ท้องเสีย", "อาเจียน", "จุกเสียด"], match: ["urine", "ua", "ปัสสาวะ", "ultrasound", "abdomen", "lft", "liver", "ตับ"] },
    { kw: ["ไข้", "หวัด", "เจ็บคอ", "ไอ"], match: ["cbc", "เม็ดเลือด", "covid", "x-ray", "xray", "เอกซเรย", "chest"] },
    { kw: ["เบาหวาน", "น้ำตาล", "หิวน้ำ", "ปัสสาวะบ่อย"], match: ["fbs", "glucose", "น้ำตาล", "hba1c", "lipid", "ไขมัน"] },
    { kw: ["เจ็บหน้าอก", "ใจสั่น", "เหนื่อย", "หัวใจ"], match: ["ekg", "ecg", "คลื่นหัวใจ", "lipid", "chest"] },
    { kw: ["ตรวจสุขภาพ", "เช็คร่างกาย", "annual"], match: ["cbc", "fbs", "lipid", "lft", "urine", "ua"] },
];

function toDTLocal(iso: string | null | undefined): string {
    if (!iso) return "";
    return new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 16);
}

export default function LabOrderForm({ vn, hn, cc = "", catalog, orders, panels, report }: {
    vn: string; hn: string; cc?: string;
    catalog: LabCatalogItem[]; orders: LabOrder[]; panels: AnonPanel[]; report: LabReport;
}) {
    const router = useRouter();
    const [busy, startBusy] = useTransition();
    const run = (fn: () => Promise<unknown>) => startBusy(async () => { await fn(); router.refresh(); });
    const [search, setSearch] = useState("");
    const [addingPanel, setAddingPanel] = useState("");
    const activePanels = (panels || []).filter((p) => p.is_active);

    const suggested = useMemo(() => {
        const s = (cc || "").toLowerCase();
        const set = new Set<string>();
        for (const h of CC_HINTS) if (h.kw.some((k) => s.includes(k.toLowerCase()))) h.match.forEach((m) => set.add(m.toLowerCase()));
        return set;
    }, [cc]);
    const isSuggested = (name: string) => {
        const n = name.toLowerCase();
        return [...suggested].some((m) => n.includes(m));
    };

    const orderedNames = useMemo(() => new Set(orders.map((o) => o.lab_name)), [orders]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = q ? catalog.filter((c) => c.name.toLowerCase().includes(q)) : catalog;
        return [...list].sort((a, b) => (isSuggested(b.name) ? 1 : 0) - (isSuggested(a.name) ? 1 : 0));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [catalog, search, suggested]);

    // ปุ่มเดียว: บันทึกผลทุกแถวพร้อมกัน
    const draftsRef = useRef<Map<string, { result_value: string; result_unit: string; normal_range: string; result_flag: string; result_note: string; sample_type: string }>>(new Map());
    const onDraft = (id: string, vals: { result_value: string; result_unit: string; normal_range: string; result_flag: string; result_note: string; sample_type: string }) => { draftsRef.current.set(id, vals); };
    const saveAll = () => run(() => saveLabOrderResults(vn, orders.map((o) => {
        const d = draftsRef.current.get(o.id);
        return { id: o.id, result_value: d?.result_value ?? o.result_value, result_unit: d?.result_unit ?? o.result_unit, normal_range: d?.normal_range ?? o.normal_range, result_flag: d?.result_flag ?? o.result_flag, result_note: d?.result_note ?? o.result_note, sample_type: d?.sample_type ?? o.sample_type };
    })));

    return (
        <div className="space-y-6">
            <datalist id="visit-sample-types">{SAMPLE_TYPES.map((x) => <option key={x} value={x} />)}</datalist>
            <div className="flex items-center justify-between pb-3 border-b">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-blue-600" /> สั่ง Lab & กรอกผล
                </h2>
                <a href={`/print/lab-report/${vn}`} target="_blank" rel="noreferrer"
                    className="h-9 px-3 rounded-lg border border-slate-200 inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <Printer className="h-4 w-4" /> พิมพ์ใบผล (Lab Report)
                </a>
            </div>

            {/* Ordered labs + result entry */}
            {orders.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-500 uppercase">รายการที่สั่ง & ผล ({orders.length})</p>
                        <button disabled={busy} onClick={saveAll}
                            className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} บันทึกผลทั้งหมด
                        </button>
                    </div>
                    <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                        {orders.map((o) => <LabResultRow key={o.id} vn={vn} order={o} busy={busy} run={run} onDraft={onDraft} />)}
                    </div>
                </div>
            )}

            {/* Panels (แพ็กเกจตรวจ — ชุดเดียวกับคลินิกนิรนาม) */}
            {activePanels.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-blue-50/40 p-3 flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-600 shrink-0" />
                    <select value={addingPanel} onChange={(e) => setAddingPanel(e.target.value)}
                        className="flex-1 min-w-0 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-blue-500 focus:outline-none">
                        <option value="">+ เพิ่มแพ็กเกจตรวจ (ชุด)…</option>
                        {activePanels.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.items.length} รายการ</option>)}
                    </select>
                    <button disabled={!addingPanel || busy} onClick={() => run(async () => { await addLabPanel(vn, hn, addingPanel); setAddingPanel(""); })}
                        className="h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-bold inline-flex items-center gap-1 disabled:opacity-50">
                        <Plus className="h-4 w-4" /> เพิ่มแพ็ก
                    </button>
                </div>
            )}

            {/* Catalog */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase">
                        เลือกรายการ Lab
                        {suggested.size > 0 && <span className="ml-2 normal-case text-[11px] text-emerald-600 font-bold">· แนะนำตามอาการขึ้นก่อน</span>}
                    </p>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา…"
                        className="h-8 w-40 rounded-lg border border-slate-200 px-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                {catalog.length === 0 ? (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                        ยังไม่มีรายการ Lab ในคลังบริการ — เพิ่มที่ <b>ตั้งค่า → รายการบริการ & ราคา</b> (เลือกชนิด = Lab / แล็บภายนอก)
                    </p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {filtered.map((lab) => {
                            const already = orderedNames.has(lab.name);
                            const sug = isSuggested(lab.name);
                            return (
                                <button key={lab.id} type="button" disabled={already || busy}
                                    onClick={() => run(() => addLabOrder(vn, hn, lab.id))}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left text-sm transition-colors disabled:opacity-60 ${already
                                        ? "border-slate-200 bg-slate-50 text-slate-400"
                                        : sug ? "border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}>
                                    {already
                                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                                        : <Plus className="h-4 w-4 shrink-0 text-slate-400" />}
                                    <span className="flex-1">{lab.name}</span>
                                    {sug && !already && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">แนะนำ</span>}
                                    <span className="text-xs text-slate-400 shrink-0">฿{lab.price.toLocaleString("th-TH")}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Lab report header info */}
            <LabReportInfo vn={vn} orders={orders} report={report} busy={busy} run={run} />
        </div>
    );
}

function LabResultRow({ vn, order, busy, run, onDraft }: {
    vn: string; order: LabOrder; busy: boolean; run: (fn: () => Promise<unknown>) => void;
    onDraft: (id: string, vals: { result_value: string; result_unit: string; normal_range: string; result_flag: string; result_note: string; sample_type: string }) => void;
}) {
    const [value, setValue] = useState(order.result_value || "");
    const [unit, setUnit] = useState(order.result_unit || "");
    const [range, setRange] = useState(order.normal_range || "");
    const [flag, setFlag] = useState(order.result_flag || "");
    const [note, setNote] = useState(order.result_note || "");
    const [sample, setSample] = useState(order.sample_type || "");
    const dirty = value !== (order.result_value || "") || unit !== (order.result_unit || "")
        || range !== (order.normal_range || "") || flag !== (order.result_flag || "") || note !== (order.result_note || "") || sample !== (order.sample_type || "");
    const abn = flag === "high" || flag === "low" || flag === "abnormal" || flag === "positive";
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { onDraft(order.id, { result_value: value, result_unit: unit, normal_range: range, result_flag: flag, result_note: note, sample_type: sample }); }, [value, unit, range, flag, note, sample]);

    return (
        <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-semibold text-slate-800 text-sm">{order.lab_name}</div>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${order.status === "resulted" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {order.status === "resulted" ? "มีผลแล้ว" : "รอผล"}
                    </span>
                    {dirty && <span className="text-[10px] font-bold text-amber-600" title="ยังไม่บันทึก">●</span>}
                    <button disabled={busy} onClick={() => run(() => removeLabOrder(order.id, vn))}
                        className="h-7 w-7 rounded-lg hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
            <input list="visit-sample-types" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="ชนิดตัวอย่าง (Sample Type) — เช่น Clotted blood / Urine"
                className="mb-2 w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="ค่าผล"
                    className={`h-9 rounded-lg border bg-white px-2.5 text-sm focus:outline-none ${abn ? "border-rose-300 text-rose-700 font-semibold" : "border-slate-200 focus:border-blue-500"}`} />
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="หน่วย"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                <input value={range} onChange={(e) => setRange(e.target.value)} placeholder="ค่าปกติ"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                <select value={flag} onChange={(e) => setFlag(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-blue-500 focus:outline-none">
                    {FLAGS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ)"
                className="mt-2 w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
    );
}

function LabReportInfo({ vn, orders, report, busy, run }: {
    vn: string; orders: LabOrder[]; report: LabReport; busy: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaMap = (report.lab_report_meta || {}) as Record<string, any>;
    const sampleTypes = useMemo(() => {
        const set = new Set<string>();
        orders.forEach((o) => set.add(o.sample_type || ""));
        const arr = [...set];
        return arr.length ? arr : [""];
    }, [orders]);
    const [active, setActive] = useState(sampleTypes[0] ?? "");

    // legacy fallback (ฟิลด์เดิมระดับ visit) เมื่อกลุ่มนั้นยังไม่มี per-sample meta
    const legacy = {
        lab_no: report.lab_no, collected_at: report.lab_collected_at, received_at: report.lab_received_at, comment: report.lab_comment,
        reported_by_name: report.lab_reported_by_name, reported_by_license: report.lab_reported_by_license, reported_at: report.lab_reported_at,
        approved_by_name: report.lab_approved_by_name, approved_by_license: report.lab_approved_by_license, approved_at: report.lab_approved_at,
    };
    const initFor = (st: string) => {
        const m = metaMap[st] || {};
        return Object.keys(m).length === 0 ? legacy : m;
    };

    return (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 bg-blue-50/50">
                <FileText className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">ข้อมูลใบรายงานผล (Laboratory Report)</h3>
            </div>
            <div className="p-4 space-y-3">
                {sampleTypes.length > 1 && (
                    <div>
                        <label className="text-[11px] font-semibold text-blue-700">เลือกชนิดตัวอย่าง — แต่ละชนิด = คนละใบ (LAB No. แยกกัน)</label>
                        <select value={active} onChange={(e) => setActive(e.target.value)}
                            className="w-full h-9 rounded-lg border border-blue-200 bg-blue-50/40 px-2 text-sm font-semibold focus:border-blue-500 focus:outline-none">
                            {sampleTypes.map((st) => <option key={st} value={st}>{st || "— ไม่ระบุชนิดตัวอย่าง —"}</option>)}
                        </select>
                    </div>
                )}
                <MetaForm key={active} vn={vn} sampleType={active} initial={initFor(active)} busy={busy} run={run} />
            </div>
        </div>
    );
}

function MetaForm({ vn, sampleType, initial, busy, run }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vn: string; sampleType: string; initial: any; busy: boolean; run: (fn: () => Promise<unknown>) => void;
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
    const inp = "w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm focus:border-blue-500 focus:outline-none";
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
            <button disabled={busy} onClick={() => run(() => saveVisitReportMeta(vn, sampleType, f))}
                className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึกใบนี้ ({sampleType || "ไม่ระบุชนิด"})
            </button>
        </div>
    );
}
