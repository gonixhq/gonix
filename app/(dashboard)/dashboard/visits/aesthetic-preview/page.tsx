"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, Trash2 } from "lucide-react";

const steps = ["ประเมิน", "แผนวันนี้", "บันทึกหัตถการ", "ผลและติดตาม", "ตรวจทาน"];
type Treatment = { id: number; kind: string; product: string; site: string; side: string; qty: string; lot: string; expiry: string };
const blankTreatment = (id: number): Treatment => ({ id, kind: "Botox", product: "", site: "", side: "", qty: "", lot: "", expiry: "" });
const fieldClass = "mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-blue-600 disabled:opacity-40";

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
    return <label className="block text-sm font-medium text-slate-600">{label}<textarea rows={3} className={fieldClass} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} /></label>;
}

export default function AestheticPreview() {
    const [step, setStep] = useState(0);
    const [reviewed, setReviewed] = useState(false);
    const [concern, setConcern] = useState("");
    const [assessment, setAssessment] = useState("");
    const [plan, setPlan] = useState("");
    const [deferred, setDeferred] = useState("");
    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [outcome, setOutcome] = useState("");
    const [care, setCare] = useState("");
    const [followup, setFollowup] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [finished, setFinished] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    function updateTreatment(id: number, patch: Partial<Treatment>) {
        setTreatments(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row));
    }
    const checks = [
        { label: "ทบทวนประวัติ", ok: reviewed, step: 0 },
        { label: "ปัญหาและการประเมิน", ok: !!concern.trim() && !!assessment.trim(), step: 0 },
        { label: "แผนที่ตกลงทำวันนี้", ok: !!plan.trim(), step: 1 },
        { label: "รายละเอียดรายการทำจริง", ok: treatments.length > 0 && treatments.every(t => t.product.trim() && t.site.trim() && t.side && Number(t.qty) > 0 && t.lot.trim() && t.expiry), step: 2 },
        { label: "ผลหลังทำและคำแนะนำ", ok: !!outcome.trim() && !!care.trim(), step: 3 },
        { label: "แผนติดตาม", ok: !!followup.trim(), step: 3 },
    ];
    const complete = checks.every(c => c.ok);
    return <main className="mx-auto max-w-7xl space-y-5 rounded-3xl bg-gradient-to-br from-slate-100/80 via-blue-50/60 to-white/70 p-4 text-slate-700 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/dashboard/doctor-station" className="inline-flex items-center gap-2 text-sm"><ArrowLeft size={16} /> กลับห้องแพทย์</Link>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800">ต้นแบบ • ข้อมูลจำลอง • ไม่บันทึกเข้าระบบ</span>
        </div>
        <header className="rounded-2xl border border-white bg-white/80 p-5 shadow-sm backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="mb-1 text-xs font-medium text-blue-700">AESTHETIC CONSULTATION</p><h1 className="text-2xl font-semibold text-slate-900">ตรวจความงาม</h1><p className="mt-2 text-sm">คนไข้จำลอง A · อายุ 35 ปี · ทดลองลำดับการกรอก Botox / Filler</p></div>
                <button className={buttonClass} onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>ประวัติครั้งก่อน</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm"><span>แพ้ยา: <strong className="font-medium text-amber-700">{reviewed ? "ทบทวนแล้ว (จำลอง)" : "ยังไม่ได้ทบทวน"}</strong></span><span>โรคประจำตัว: รอซักประวัติ</span><span>ยาที่ใช้: รอซักประวัติ</span></div>
            {showHistory && <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed"><p className="font-medium">ประวัติจำลอง · ครั้งก่อน</p><p className="mt-1">มาปรึกษาปัญหาริ้วรอย ยังไม่ได้ทำหัตถการ ต้องการกลับมาประเมินแผนอีกครั้ง</p><p className="mt-2 text-xs text-slate-500">ต้นแบบนี้ยังไม่เชื่อมรูปถ่ายหรือประวัติจริง</p></div>}
        </header>
        <nav aria-label="ขั้นตอนการตรวจ" className="flex flex-wrap gap-2">{steps.map((label, i) => <button key={label} aria-current={step === i ? "step" : undefined} onClick={() => { setStep(i); setFinished(false); setConfirmed(false); }} className={`${buttonClass} ${step === i ? "!border-blue-700 !bg-blue-700 !text-white" : ""}`}><span className="opacity-70">0{i + 1}</span>{label}</button>)}</nav>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <section className="min-w-0 rounded-2xl border border-white bg-white/85 p-5 shadow-sm sm:p-7">
                <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Sparkles size={20} /></span><div><p className="text-xs text-slate-500">ขั้นตอน {step + 1} / 5</p><h2 className="text-xl font-semibold text-slate-900">{steps[step]}</h2></div></div>
                {step === 0 && <div className="space-y-5">
                    <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-1" /> ทดลองยืนยันว่าทบทวนประวัติแพ้ยา โรคประจำตัว และยาที่ใช้แล้ว</label>
                    <TextField label="ปัญหาและเป้าหมายของคนไข้" value={concern} onChange={setConcern} placeholder="คนไข้กังวลอะไร บริเวณใด และคาดหวังอะไร" />
                    <TextField label="การประเมินของแพทย์" value={assessment} onChange={setAssessment} placeholder="บันทึกสิ่งที่ตรวจพบและข้อพิจารณาของเคสนี้" />
                </div>}
                {step === 1 && <div className="space-y-5"><TextField label="แผนที่ตกลงทำวันนี้" value={plan} onChange={setPlan} placeholder="ระบุแผนที่พูดคุยและตกลงกับคนไข้" /><TextField label="แนะนำไว้ / ยังไม่ทำวันนี้" value={deferred} onChange={setDeferred} placeholder="แยกสิ่งที่ยังไม่ทำออกจากรายการทำจริง" /><p className="text-sm text-slate-500">ขั้นตอนถัดไปจึงบันทึกผลิตภัณฑ์และปริมาณที่ใช้จริง</p></div>}
                {step === 2 && <div className="space-y-5">
                    {treatments.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">ยังไม่มีรายการทำจริง เริ่มเพิ่ม Botox หรือ Filler ด้านล่าง</div>}
                    {treatments.map((t, index) => <div key={t.id} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                        <div className="flex items-center justify-between"><h3 className="font-medium">รายการ {index + 1}</h3><button aria-label={`ลบรายการ ${index + 1}`} className={buttonClass} onClick={() => setTreatments(rows => rows.filter(row => row.id !== t.id))}><Trash2 size={16} /></button></div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="text-sm">หัตถการ<select className={fieldClass} value={t.kind} onChange={e => updateTreatment(t.id, { kind: e.target.value, qty: "" })}><option>Botox</option><option>Filler</option></select></label>
                            <label className="text-sm">ผลิตภัณฑ์<input className={fieldClass} value={t.product} onChange={e => updateTreatment(t.id, { product: e.target.value })} placeholder="ชื่อผลิตภัณฑ์จำลอง" /></label>
                            <label className="text-sm">ตำแหน่ง<input className={fieldClass} value={t.site} onChange={e => updateTreatment(t.id, { site: e.target.value })} placeholder="ระบุบริเวณที่ทำ" /></label>
                            <label className="text-sm">ด้าน<select className={fieldClass} value={t.side} onChange={e => updateTreatment(t.id, { side: e.target.value })}><option value="">เลือก</option><option>ซ้าย</option><option>ขวา</option><option>กึ่งกลาง</option><option>ไม่ระบุด้าน</option></select></label>
                            <label className="text-sm">ปริมาณ ({t.kind === "Botox" ? "unit" : "ml"})<input type="number" min="0" step="any" className={fieldClass} value={t.qty} onChange={e => updateTreatment(t.id, { qty: e.target.value })} /></label>
                            <label className="text-sm">Lot<input className={fieldClass} value={t.lot} onChange={e => updateTreatment(t.id, { lot: e.target.value })} /></label>
                            <label className="text-sm">วันหมดอายุ<input type="date" className={fieldClass} value={t.expiry} onChange={e => updateTreatment(t.id, { expiry: e.target.value })} /></label>
                        </div>
                    </div>)}
                    <button className={buttonClass} onClick={() => setTreatments(rows => [...rows, blankTreatment(Date.now())])}><Plus size={16} /> เพิ่มรายการทำจริง</button>
                    <p className="text-xs leading-relaxed text-slate-500">ยังไม่เชื่อมสต๊อก บิล หรือแผนผังใบหน้า รายละเอียดที่กรอกจะแสดงในสรุปโดยไม่ต้องพิมพ์ซ้ำ</p>
                </div>}
                {step === 3 && <div className="space-y-5"><TextField label="ผลหลังทำ / อาการที่สังเกต" value={outcome} onChange={setOutcome} placeholder="บันทึกตามที่ประเมินจริง" /><TextField label="คำแนะนำที่ให้" value={care} onChange={setCare} /><TextField label="แผนติดตาม" value={followup} onChange={setFollowup} placeholder="ระบุแผนติดตาม หรือเหตุผลหากไม่นัด" /></div>}
                {step === 4 && <div className="space-y-5">
                    {[["ปัญหา", concern], ["การประเมิน", assessment], ["ทำวันนี้", plan], ["แนะนำไว้", deferred], ["ผลหลังทำ", outcome], ["คำแนะนำ", care], ["ติดตาม", followup]].map(([label, value]) => <div key={label}><p className="mb-1 text-xs font-medium text-slate-500">{label}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{value || "— ยังไม่ได้ระบุ —"}</p></div>)}
                    <div className="space-y-2 border-y border-slate-100 py-4"><h3 className="text-sm font-medium">รายการทำจริง</h3>{treatments.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีรายการ</p>}{treatments.map(t => <p key={t.id} className="break-words text-sm leading-relaxed">{t.kind} · {t.product || "ยังไม่ระบุผลิตภัณฑ์"} · {t.site || "ยังไม่ระบุตำแหน่ง"} {t.side} · {t.qty || "—"} {t.kind === "Botox" ? "unit" : "ml"}<br /><span className="text-slate-500">Lot {t.lot || "—"} · หมดอายุ {t.expiry || "—"}</span></p>)}</div>
                    <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" /> ตรวจทานข้อมูลจำลองแล้ว</label>
                    <button disabled={!complete || !confirmed} className={`${buttonClass} !bg-blue-700 !text-white`} onClick={() => setFinished(true)}><Check size={16} /> ทดลองจบการตรวจ</button>
                    {finished && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">ทดลองครบแล้ว ข้อมูลนี้ไม่ได้บันทึกเป็นเวชระเบียนหรือส่งคิดเงิน</p>}
                </div>}
                <div className="mt-8 flex justify-between gap-3 border-t border-slate-100 pt-5"><button className={buttonClass} disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> ย้อนกลับ</button>{step < 4 && <button className={`${buttonClass} !border-blue-700 !bg-blue-700 !text-white`} onClick={() => setStep(step + 1)}>ถัดไป <ArrowRight size={16} /></button>}</div>
            </section>
            <aside className="space-y-4 lg:sticky lg:top-4"><div className="rounded-2xl border border-white bg-white/80 p-5"><h2 className="font-semibold">ตรวจความครบถ้วน</h2><p className="mt-1 text-xs text-slate-500">รายการทดลองสำหรับเคสทำหัตถการ</p><div className="mt-4 space-y-2">{checks.map(c => <button key={c.label} onClick={() => setStep(c.step)} className="flex w-full items-center gap-3 rounded-lg py-2 text-left text-sm hover:bg-slate-50"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${c.ok ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{c.ok && <Check size={12} />}</span>{c.label}</button>)}</div></div><p className="px-2 text-xs leading-relaxed text-slate-500">ข้อมูลอยู่เฉพาะขณะเปิดหน้านี้ รีเฟรชแล้วเริ่มใหม่ ใช้ข้อมูลสมมติเท่านั้น</p></aside>
        </div>
    </main>;
}
