"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ChartPad from "../../aesthetic-preview/chart-pad";
import InjectionRecorder from "../injection-recorder";
import DrugOrderForm from "../drug-order-form";
import LabOrderForm from "../lab-order-form";
import PackageUsagePanel from "../package-usage-panel";
import VisitStatusActions from "../visit-status-actions";
import { FaceChartRender } from "@/app/print/visits/[vn]/face-chart-render";
import { MaskedId } from "@/components/ui/masked-id";
import { createClient } from "@/lib/supabase/client";
import { saveVisitWorkspace } from "@/lib/actions/visit-workspace";
import type { ChartSheet } from "@/lib/visit-workspace-types";
import styles from "../visit-workspace.module.css";

const button = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-40";
const tabs = ["บันทึกการตรวจ", "บันทึกหัตถการ", "สั่ง Lab", "สั่งยา", "ประวัติ & ผล Lab"];
const statusLabels: Record<string, string> = { waiting: "รอรับบริการ", triaged: "รอตรวจ", with_doctor: "กำลังตรวจ", with_nurse: "อยู่ห้องพยาบาล", waiting_medicine: "รอรับยา", waiting_payment: "รอชำระเงิน", completed: "เสร็จสิ้น", cancelled: "ยกเลิก", pending: "รอดำเนินการ", ordered: "สั่งตรวจแล้ว", collected: "เก็บตัวอย่างแล้ว", processing: "กำลังตรวจวิเคราะห์", resulted: "มีผลตรวจแล้ว" };
function LabResults({ labs }: { labs: any[] }) {
    return labs.length ? <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">รายการตรวจ</th><th className="p-3">ผล / หน่วย</th><th className="p-3">ค่าอ้างอิง</th><th className="p-3">สถานะ</th></tr></thead><tbody>{labs.map((lab, i) => <tr key={lab.id || i} className="border-t border-slate-100"><td className="p-3">{lab.lab_name}</td><td className="p-3">{lab.result_value === null || lab.result_value === undefined || lab.result_value === "" ? "ยังไม่มีผล" : <>{lab.result_value} {lab.result_unit} {lab.result_flag && <span className="ml-1 font-medium">({lab.result_flag})</span>}</>}</td><td className="p-3">{lab.normal_range || "—"}</td><td className="p-3">{statusLabels[lab.status] || lab.status}</td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">ยังไม่มีรายการ Lab ใน visit นี้</p>;
}
const PRE_LABEL: Record<string, string> = {
    pregnant: "ตั้งครรภ์/อาจตั้งครรภ์", breastfeeding: "ให้นมบุตร", anticoagulant: "ทานยาละลายลิ่มเลือด/แอสไพริน/น้ำมันปลา",
    anesthetic_allergy: "แพ้ยาชา/ไข่-โปรตีน", local_infection: "มีแผล/ติดเชื้อบริเวณที่ทำ", keloid: "คีลอยด์ง่าย", autoimmune: "โรคภูมิคุ้มกัน/MG",
};
const emptySheet: ChartSheet = { id: 1, name: "Face 1", background: "/face-chart.png", strokes: [], pins: [] };
export default function Workspace({ visit, patient, vitals, drugs, history, catalog, orders, panels, initialSheets, clinicId, statusLogs = [] }: any) {
    const router = useRouter();
    const vn = visit.vn as string;
    const records = visit.aesthetic_records || {};
    const [tab, setTab] = useState(0);
    const [catalogView, setCatalogView] = useState("สินค้า");
    const [notes, setNotes] = useState<string>(records.treatment_notes || "");
    const [sheets, setSheets] = useState<ChartSheet[]>(initialSheets.length ? initialSheets : [emptySheet]);
    const [revision, setRevision] = useState<string | null>(records.workspace_revision || null);
    const [previousNotes, setPreviousNotes] = useState<string>(records.treatment_notes || "");
    const [saved, setSaved] = useState(JSON.stringify({ notes: records.treatment_notes || "", sheets: initialSheets.length ? initialSheets : [emptySheet] }));
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const lock = useRef(false);
    const editable = ["waiting", "triaged", "with_doctor", "with_nurse"].includes(visit.status);
    const dirty = JSON.stringify({ notes, sheets }) !== saved;
    const onSheets = useCallback((next: ChartSheet[]) => setSheets(next), []);
    const ignoreCount = useCallback(() => {}, []);
    useEffect(() => {
        const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);
    async function save() {
        if (lock.current) return;
        lock.current = true; setBusy(true); setMessage("");
        const snapshot = JSON.stringify({ notes, sheets });
        try {
            const result = await saveVisitWorkspace(vn, { notes, sheets, revision, previousNotes });
            if (!result.success) { setMessage(result.error); return; }
            setRevision(result.revision); setPreviousNotes(notes); setSaved(snapshot); setMessage("บันทึกการตรวจและแผ่นวาดแล้ว"); router.refresh();
        } catch { setMessage("บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองใหม่"); }
        finally { lock.current = false; setBusy(false); }
    }
    async function upload(file: File) {
        if (!editable) throw Error("visit นี้ไม่เปิดให้แก้ไข");
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw Error("รองรับภาพ JPG, PNG และ WebP");
        if (file.size > 10 * 1024 * 1024) throw Error("ภาพใหญ่เกิน 10 MB");
        const db = createClient();
        const path = `${clinicId}/visits/${vn}/workspace/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
        const { error } = await db.storage.from("clinic-assets").upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw Error("อัปโหลดไม่สำเร็จ กรุณาลองใหม่");
        const { data, error: signError } = await db.storage.from("clinic-assets").createSignedUrl(path, 3600);
        if (signError || !data) { await db.storage.from("clinic-assets").remove([path]); throw Error("เปิดภาพไม่สำเร็จ"); }
        return { storagePath: path, background: data.signedUrl };
    }
    const name = `${patient.prefix || ""}${patient.first_name || ""} ${patient.last_name || ""}`;
    const age = patient.dob ? (() => { const birth = new Date(patient.dob); const today = new Date(); let years = today.getFullYear() - birth.getFullYear(); if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) years--; return `${years} ปี`; })() : "ไม่ระบุอายุ";
    const allergies = (patient.patient_allergies || []).filter((a: any) => a.is_active).map((a: any) => a.allergen_name);
    const historyText = (value: unknown) => { const text = String(value ?? "").trim(); return /^[-–—\s]*$/.test(text) ? "ยังไม่ระบุ" : text; };
    const allergy = (() => { const t = historyText(allergies.join(", ") || patient.allergy_summary); return t === "ยังไม่ระบุ" && patient.nkda ? "ไม่มีประวัติแพ้ (ถามแล้ว)" : t; })();
    const diseases = (() => { const t = historyText((patient.patient_chronic_diseases || []).map((d: any) => d.disease_name).join(", ") || patient.disease_summary); return t === "ยังไม่ระบุ" && patient.no_chronic ? "ไม่มี (ถามแล้ว)" : t; })();
    const vital = (key: string) => vitals?.[key] ?? visit[key] ?? "—";
    const drugSummary = drugs.map((d: any) => ({ ...d, item_name: (Array.isArray(d.inventory) ? d.inventory[0] : d.inventory)?.item_name || "ยา", total_cost: Number(d.total_cost || 0) }));
    return <main className={`${styles.workspace} mx-auto max-w-[1600px] space-y-3 p-3`}>
        <div className="flex flex-wrap justify-between gap-2 text-xs"><Link href="/dashboard/doctor-station" onClick={e => { if (dirty && !window.confirm("มีบันทึกที่ยังไม่ได้บันทึก ต้องการออกหรือไม่?")) e.preventDefault(); }}>← ห้องแพทย์</Link><Link href={`/dashboard/patients/${patient.hn}`} target="_blank" className="text-blue-700">ประวัติคนไข้ ↗</Link></div>
        <header className="rounded-2xl border border-white bg-white/85 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold text-slate-900">{name}</h1><p className="mt-1 text-xs text-slate-500">HN {patient.hn} · {patient.gender === "F" ? "หญิง" : patient.gender === "M" ? "ชาย" : "ไม่ระบุเพศ"} · {age} · VN {vn} · {statusLabels[visit.status] || visit.status}</p></div><div className="flex shrink-0 flex-wrap items-center gap-2 [&>button]:!w-auto [&>button]:px-3 [&>button]:whitespace-nowrap"><button className={`${button} !bg-blue-700 !text-white`} disabled={!editable || busy || !dirty} onClick={() => void save()}>{busy ? "กำลังบันทึก…" : "บันทึกการตรวจ"}</button>{!dirty && editable && <VisitStatusActions vn={vn} currentStatus={visit.status} hasDrugs={drugs.length > 0} serviceCategory="aesthetic" summary={{ patientName: name, drugs: drugSummary, totalDrugCost: drugSummary.reduce((sum: number, d: any) => sum + d.total_cost, 0), labOrders: orders, aesthetic: { treatmentNotes: notes, strokesCount: sheets.reduce((n, s) => n + s.strokes.length, 0), pinsCount: sheets.reduce((n, s) => n + s.pins.length, 0), pins: sheets.flatMap(s => s.pins.map(p => ({ label: `${p.amount}`, color: "blue" }))), beforePhotosCount: sheets.filter(s => s.storagePath).length, afterPhotosCount: 0 } }} />}</div></div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-2 text-sm"><span>แพ้ยา: <strong className={`font-medium ${allergy === "ยังไม่ระบุ" ? "text-amber-700" : allergy.startsWith("ไม่มี") ? "text-emerald-700" : "text-red-700"}`}>{allergy}</strong></span><span>โรคประจำตัว: {diseases}</span></div>
            {visit.pre_screening && (() => {
                const pre = visit.pre_screening as Record<string, unknown>;
                const hits = Object.keys(PRE_LABEL).filter(k => pre[k]);
                return <div className={`mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border px-3 py-2 text-sm ${hits.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                    <strong>คัดกรองก่อนหัตถการ:</strong>
                    {hits.length ? hits.map(k => <span key={k} className="rounded-md bg-amber-200/70 px-2 py-0.5 text-xs font-semibold">⚠ {PRE_LABEL[k]}</span>) : <span>ไม่มีข้อห้าม/ข้อควรระวัง</span>}
                    {pre.last_treatment ? <span className="text-xs text-slate-600">· ครั้งล่าสุด: {String(pre.last_treatment)}</span> : null}
                </div>;
            })()}
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                <h2 className="text-sm font-medium text-blue-800">อาการสำคัญ (CC)</h2>
                <p className="mt-1 whitespace-pre-wrap break-words text-lg font-semibold leading-relaxed text-slate-900">{visit.chief_complaint?.trim() || "ยังไม่ระบุอาการสำคัญ"}</p>
            </div>
            <section aria-label="Vital Signs" className="mt-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-700">Vital Signs</h2>
                    <span className="text-xs text-slate-600">{vitals?.recorded_at ? `วัด ${new Date(vitals.recorded_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` : "ไม่ระบุเวลาวัด"}</span>
                </div>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    {[["ความดัน (BP)", `${vital("bp_systolic")}/${vital("bp_diastolic")}`, "mmHg"], ["ชีพจร (PR)", vital("pulse_rate"), "bpm"], ["อุณหภูมิ", vital("temperature"), "°C"], ["ออกซิเจน (SpO₂)", vital("o2_saturation"), "%"], ["น้ำหนัก", vital("weight_kg"), "kg"], ["ส่วนสูง", vital("height_cm"), "cm"]].map(([label, value, unit]) => {
                        const missing = value === "—" || value === "—/—" || value === "";
                        const n = (k: string) => Number(vital(k));
                        const flag = missing ? null
                            : label === "ความดัน (BP)" ? (n("bp_systolic") >= 180 || n("bp_diastolic") >= 110 ? "danger" : n("bp_systolic") >= 140 || n("bp_diastolic") >= 90 || n("bp_systolic") < 90 ? "warn" : null)
                            : label === "ชีพจร (PR)" ? (n("pulse_rate") >= 130 || n("pulse_rate") < 40 ? "danger" : n("pulse_rate") > 100 || n("pulse_rate") < 50 ? "warn" : null)
                            : label === "อุณหภูมิ" ? (n("temperature") >= 39 ? "danger" : n("temperature") >= 37.5 ? "warn" : null)
                            : label === "ออกซิเจน (SpO₂)" ? (n("o2_saturation") < 90 ? "danger" : n("o2_saturation") < 95 ? "warn" : null) : null;
                        return <div key={label} className={`min-w-0 rounded-xl border px-3 py-2.5 ${flag === "danger" ? "border-red-400 bg-red-50" : flag === "warn" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white/90"}`}>
                            <dt className="text-xs font-medium text-slate-600">{label}</dt>
                            <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                                {missing ? <span className="text-sm text-slate-500">ยังไม่บันทึก</span> : <><span className={`text-xl font-semibold tabular-nums ${flag === "danger" ? "text-red-700" : flag === "warn" ? "text-amber-800" : "text-slate-900"}`}>{value}</span><span className="text-xs text-slate-600">{unit}</span></>}
                            </dd>
                        </div>;
                    })}
                </dl>
            </section>
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-xs text-blue-700">ข้อมูลคนไข้เพิ่มเติม</summary><div className="mt-2 flex flex-wrap gap-4"><span>โทรศัพท์ {patient.phone || "—"}</span><span>เลขบัตร <MaskedId value={patient.thai_id_card} /></span><span>ติดต่อฉุกเฉิน {patient.emergency_contact_name || "—"} {patient.emergency_contact_phone || ""}</span><span>ประวัติอดีต {patient.past_history || "—"}</span></div></details>
        </header>
        {(message || dirty || !editable) && <div role="status" className={`rounded-xl px-3 py-2 text-sm ${dirty ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-blue-50 text-blue-800"}`}>{message || (dirty ? "● มีบันทึกการตรวจหรือแผ่นวาดที่ยังไม่ได้บันทึก — กด “บันทึกการตรวจ”" : "")}{!editable && "visit นี้เปิดอ่านเท่านั้น"}</div>}
        <nav className="flex flex-wrap gap-2" aria-label="เมนูหน้าตรวจ">{tabs.map((label, i) => <button key={label} className={`${button} ${tab === i ? "!bg-blue-700 !text-white" : ""}`} aria-pressed={tab === i} onClick={() => setTab(i)}>{label}</button>)}</nav>
        <section className="rounded-2xl border border-white bg-white/85 p-4">
            {/* แท็บ 0–1 ใช้แผ่นวาดชุดเดียวกัน (mount ครั้งเดียว) — วาดที่แท็บไหนก็เป็นชุดเดียว */}
            <div hidden={tab > 1} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
                <div className="min-w-0">
                    <div hidden={tab !== 0} className="space-y-3">            <h2 className="text-lg font-semibold">บันทึกการตรวจ</h2><textarea disabled={!editable || busy} aria-label="บันทึกการตรวจ" className="min-h-[420px] w-full rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ประวัติ การประเมิน และแผนการรักษา" />{visit.soap_o || visit.soap_p ? <details><summary>บันทึกเดิม (SOAP)</summary><p className="whitespace-pre-wrap">{visit.soap_o}\n{visit.soap_p}</p></details> : null}</div>
                    <div hidden={tab !== 1}><fieldset disabled={!editable || busy} className="min-w-0"><div className="min-w-0 space-y-3"><h2 className="text-lg font-semibold">บันทึกหัตถการ</h2><div className="flex gap-2">{["สินค้า", "คอร์ส / บริการ"].map(label => <button key={label} className={`${button} flex-1 ${catalogView === label ? "!bg-blue-700 !text-white" : ""}`} onClick={() => setCatalogView(label)}>{label}</button>)}</div><div hidden={catalogView !== "สินค้า"}><InjectionRecorder vn={vn} searchable onAdded={line => { setNotes(prev => (prev.trim() ? prev.replace(/\s*$/, "") + "\n" : "") + "- " + line); setMessage("เพิ่มรายการฉีดลงบันทึกการตรวจแล้ว (กดบันทึกการตรวจ)"); }} /></div><div hidden={catalogView !== "คอร์ส / บริการ"}><PackageUsagePanel hn={patient.hn} vn={vn} /></div></div></fieldset></div>
                </div>
                <div className="min-w-0 lg:sticky lg:top-4"><div className={!editable || busy ? "pointer-events-none opacity-70" : ""}><ChartPad initial={initialSheets.length ? initialSheets : [emptySheet]} onCount={ignoreCount} onChange={onSheets} onUpload={upload} /></div></div>
            </div>
            {tab <= 1 && records.face_chart && <details className="mt-4"><summary>แผนผังเดิมก่อนเปลี่ยนหน้าตรวจ</summary><FaceChartRender data={records.face_chart} width={240} /></details>}
            <div hidden={tab !== 2}><fieldset disabled={!editable}><LabOrderForm compact vn={vn} hn={patient.hn} cc={visit.chief_complaint || ""} catalog={catalog} orders={orders} panels={panels} report={visit} /></fieldset></div>
            <div hidden={tab !== 3} className="space-y-4"><fieldset disabled={!editable}><DrugOrderForm compact showDiagnosis={false} vn={vn} hn={patient.hn} allergens={[...allergies, ...String(patient.allergy_summary || "").split(/[,;/\n]+/).map(a => a.trim()).filter(Boolean)]} defaultIcd10={visit.icd10_primary || ""} defaultDiagnosisText={visit.diagnosis_text || ""} /></fieldset><h3 className="font-semibold">ยาที่บันทึกแล้ว ({drugSummary.length})</h3>{drugSummary.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">ยังไม่มีคำสั่งยาที่บันทึกใน visit นี้</p>}{drugSummary.map((d: any) => <p key={d.id} className="text-sm">{d.item_name} · {d.qty} {d.unit} · {d.sig_text}</p>)}</div>
            <div hidden={tab !== 4} className="space-y-4">{statusLogs.length > 0 && <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3"><h2 className="mb-2 text-sm font-semibold text-blue-800">สถานะการเข้ารับบริการวันนี้</h2><div className="flex flex-wrap items-center gap-1.5 text-xs">{statusLogs.map((l: any, i: number) => <span key={l.id} className="inline-flex items-center gap-1">{i > 0 && <span className="text-slate-300">→</span>}<span className="rounded-lg border border-slate-200 bg-white px-2 py-1"><b>{statusLabels[l.new_status] || l.new_status}</b> <span className="font-mono text-slate-500">{new Date(l.changed_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}</span></span></span>)}</div></div>}<h2 className="text-lg font-semibold">ผล Lab ของ visit นี้</h2><LabResults labs={orders} /><h2 className="border-t border-slate-100 pt-4 text-lg font-semibold">ประวัติการตรวจครั้งก่อน</h2>{history.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีประวัติการตรวจครั้งก่อน</p>}{history.map((past: any) => { const note = past.aesthetic_records?.treatment_notes || past.soap_p; const labs = past.lab_orders || []; return <article key={past.vn} className="space-y-1.5 rounded-xl border border-slate-200 px-4 py-3"><div className="flex flex-wrap items-baseline gap-x-2"><Link className="font-semibold text-blue-700" href={`/dashboard/visits/${past.vn}`} target="_blank">{new Date(past.visit_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })} ↗</Link><span className="font-mono text-xs text-slate-400">{past.vn}</span>{past.service_category === "aesthetic" && <span className="rounded bg-pink-50 px-1.5 text-[11px] font-semibold text-pink-700">ความงาม</span>}{past.chief_complaint && <span className="text-sm text-slate-700">· {past.chief_complaint}</span>}</div>{note ? <p className="whitespace-pre-wrap text-sm text-slate-800">{note}</p> : <p className="text-xs italic text-slate-400">ไม่มีบันทึกการตรวจ</p>}{labs.length > 0 && <LabResults labs={labs} />}</article>; })}</div>
        </section>
        <p className="text-[11px] text-slate-400">บันทึกการตรวจ + แผ่นวาด → ปุ่ม “บันทึกการตรวจ” ด้านบน · ฉีด / Lab / ยา / คอร์ส → บันทึกในแต่ละส่วน</p>
    </main>;
}
