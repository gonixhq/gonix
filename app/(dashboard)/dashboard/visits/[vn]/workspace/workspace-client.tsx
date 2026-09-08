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
const emptySheet: ChartSheet = { id: 1, name: "Face 1", background: "/face-chart.png", strokes: [], pins: [] };
export default function Workspace({ visit, patient, vitals, drugs, history, catalog, orders, panels, initialSheets, clinicId }: any) {
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
    const allergy = allergies.join(", ") || patient.allergy_summary || "ยังไม่ระบุ";
    const diseases = (patient.patient_chronic_diseases || []).map((d: any) => d.disease_name).join(", ") || patient.disease_summary || "ยังไม่ระบุ";
    const vital = (key: string) => vitals?.[key] ?? visit[key] ?? "—";
    const drugSummary = drugs.map((d: any) => ({ ...d, item_name: (Array.isArray(d.inventory) ? d.inventory[0] : d.inventory)?.item_name || "ยา", total_cost: Number(d.total_cost || 0) }));
    return <main className={`${styles.workspace} mx-auto max-w-[1600px] space-y-3 p-3`}>
        <div className="flex flex-wrap justify-between gap-2 text-xs"><Link href={`/dashboard/visits/${vn}`} onClick={e => { if (dirty && !window.confirm("มีบันทึกที่ยังไม่ได้บันทึก ต้องการออกหรือไม่?")) e.preventDefault(); }}>← หน้าตรวจเดิม</Link><span className="text-blue-700">หน้าตรวจใหม่ · เชื่อมข้อมูลจริง</span></div>
        <header className="rounded-2xl border border-white bg-white/85 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold text-slate-900">{name}</h1><p className="mt-1 text-xs text-slate-500">HN {patient.hn} · {patient.gender === "F" ? "หญิง" : patient.gender === "M" ? "ชาย" : "ไม่ระบุเพศ"} · {age} · VN {vn} · {visit.status}</p></div><div className="flex flex-wrap items-center gap-2"><button className={`${button} !bg-blue-700 !text-white`} disabled={!editable || busy || !dirty} onClick={() => void save()}>{busy ? "กำลังบันทึก…" : "บันทึกการตรวจ"}</button>{!dirty && editable && <VisitStatusActions vn={vn} currentStatus={visit.status} hasDrugs={drugs.length > 0} serviceCategory="aesthetic" summary={{ patientName: name, drugs: drugSummary, totalDrugCost: drugSummary.reduce((sum: number, d: any) => sum + d.total_cost, 0), labOrders: orders, aesthetic: { treatmentNotes: notes, strokesCount: sheets.reduce((n, s) => n + s.strokes.length, 0), pinsCount: sheets.reduce((n, s) => n + s.pins.length, 0), pins: sheets.flatMap(s => s.pins.map(p => ({ label: `${p.amount} cc`, color: "blue" }))), beforePhotosCount: sheets.filter(s => s.storagePath).length, afterPhotosCount: 0 } }} />}</div></div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-2 text-sm"><span>แพ้ยา: <strong className="font-medium text-red-700">{allergy}</strong></span><span>โรคประจำตัว: {diseases}</span><span>ยาที่ใช้ประจำ: ยังไม่มีข้อมูลในส่วนนี้</span></div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">{[["BP", `${vital("bp_systolic")}/${vital("bp_diastolic")}`, "mmHg"], ["PR", vital("pulse_rate"), "bpm"], ["Temp", vital("temperature"), "°C"], ["SpO₂", vital("o2_saturation"), "%"], ["น้ำหนัก", vital("weight_kg"), "kg"], ["ส่วนสูง", vital("height_cm"), "cm"]].map(([label, value, unit]) => <span key={label}><span className="text-xs text-slate-500">{label} </span>{value} <span className="text-xs text-slate-500">{unit}</span></span>)}<span className="text-xs text-slate-500">{vitals?.recorded_at ? `วัด ${new Date(vitals.recorded_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` : "ไม่ระบุเวลาวัด"}</span></div>
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-xs text-blue-700">ข้อมูลคนไข้เพิ่มเติม</summary><div className="mt-2 flex flex-wrap gap-4"><span>โทรศัพท์ {patient.phone || "—"}</span><span>เลขบัตร <MaskedId value={patient.thai_id_card} /></span><span>ติดต่อฉุกเฉิน {patient.emergency_contact_name || "—"} {patient.emergency_contact_phone || ""}</span><span>ประวัติอดีต {patient.past_history || "—"}</span></div></details>
        </header>
        <div role="status" className="text-sm text-blue-800">{message || (dirty ? "มีบันทึกการตรวจหรือแผ่นวาดที่ยังไม่ได้บันทึก" : "ข้อมูลที่บันทึกแล้ว")}{!editable && " · visit นี้เปิดอ่านเท่านั้น"}</div>
        <nav className="flex flex-wrap gap-2" aria-label="เมนูหน้าตรวจ">{tabs.map((label, i) => <button key={label} className={`${button} ${tab === i ? "!bg-blue-700 !text-white" : ""}`} aria-pressed={tab === i} onClick={() => setTab(i)}>{label}</button>)}</nav>
        <section className="rounded-2xl border border-white bg-white/85 p-4">
            <div hidden={tab !== 0} className="space-y-3"><h2 className="text-lg font-semibold">บันทึกการตรวจ</h2><p className="text-sm text-slate-500">อาการสำคัญ: {visit.chief_complaint || "—"}</p><textarea disabled={!editable || busy} aria-label="บันทึกการตรวจ" className="min-h-[360px] w-full rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ประวัติ การประเมิน และแผนการรักษา" />{visit.soap_o || visit.soap_p ? <details><summary>บันทึกเดิม (SOAP)</summary><p className="whitespace-pre-wrap">{visit.soap_o}\n{visit.soap_p}</p></details> : null}</div>
            <div hidden={tab !== 1}><fieldset disabled={!editable || busy} className="min-w-0"><div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]"><div className="min-w-0 space-y-3"><h2 className="text-lg font-semibold">บันทึกหัตถการ</h2><div className="flex gap-2">{["สินค้า", "คอร์ส / บริการ"].map(label => <button key={label} className={`${button} flex-1 ${catalogView === label ? "!bg-blue-700 !text-white" : ""}`} onClick={() => setCatalogView(label)}>{label}</button>)}</div><div hidden={catalogView !== "สินค้า"}><InjectionRecorder vn={vn} searchable /></div><div hidden={catalogView !== "คอร์ส / บริการ"}><PackageUsagePanel hn={patient.hn} vn={vn} /></div></div><div className={!editable || busy ? "pointer-events-none opacity-70" : ""}><ChartPad initial={initialSheets.length ? initialSheets : [emptySheet]} onCount={ignoreCount} onChange={onSheets} onUpload={upload} /></div></div></fieldset>{records.face_chart && <details className="mt-4"><summary>แผนผังเดิมก่อนเปลี่ยนหน้าตรวจ</summary><FaceChartRender data={records.face_chart} width={240} /></details>}</div>
            <div hidden={tab !== 2}><fieldset disabled={!editable}><LabOrderForm vn={vn} hn={patient.hn} cc={visit.chief_complaint || ""} catalog={catalog} orders={orders} panels={panels} report={visit} /></fieldset></div>
            <div hidden={tab !== 3} className="space-y-4"><fieldset disabled={!editable}><DrugOrderForm vn={vn} hn={patient.hn} allergens={allergies} defaultIcd10={visit.icd10_primary || ""} defaultDiagnosisText={visit.diagnosis_text || ""} /></fieldset><h3 className="font-semibold">ยาที่บันทึกแล้ว</h3>{drugSummary.map((d: any) => <p key={d.id} className="text-sm">{d.item_name} · {d.qty} {d.unit} · {d.sig_text}</p>)}</div>
            <div hidden={tab !== 4} className="space-y-4"><h2 className="text-lg font-semibold">ประวัติ & ผล Lab</h2>{history.length === 0 && <p>ไม่มี visit ก่อนหน้า</p>}{history.map((past: any) => <article key={past.vn} className="space-y-2 rounded-xl border border-slate-200 p-4"><Link className="text-blue-700" href={`/dashboard/visits/${past.vn}${past.service_category === "aesthetic" ? "/workspace" : ""}`} target="_blank">{past.visit_date} · {past.vn} ↗</Link><p className="text-sm">{past.chief_complaint}</p><p className="whitespace-pre-wrap text-sm">{past.aesthetic_records?.treatment_notes || past.soap_p || "ไม่มีบันทึก"}</p>{(past.lab_orders || []).map((lab: any, i: number) => <p key={i} className="text-sm">{lab.lab_name}: {lab.result_value ?? "ยังไม่มีผล"} {lab.result_unit} · {lab.status}</p>)}</article>)}</div>
        </section>
        <p className="text-xs text-slate-500">ยา Lab และคอร์สใช้ปุ่มบันทึก/ยืนยันของแต่ละส่วน แผ่นวาดกับบันทึกแพทย์ใช้ปุ่มบันทึกการตรวจด้านบน</p>
    </main>;
}
