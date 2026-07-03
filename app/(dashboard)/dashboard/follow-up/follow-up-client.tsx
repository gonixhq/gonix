"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Phone, MessageCircle, ChevronLeft, ChevronRight, Calendar, Loader2, AlertTriangle, Check, PhoneOff, RotateCcw, Circle, Star, UserPlus, Copy } from "lucide-react";
import { updateFollowUpStatus, setFollowUpSeverity, escalateFollowUp, logFollowUpAction, type FollowUpTask, type FollowUpStatus, type Severity } from "@/lib/actions/follow-up";

function shiftDate(d: string, delta: number) { const dt = new Date(d + "T00:00:00"); dt.setDate(dt.getDate() + delta); return dt.toLocaleDateString("sv-SE"); }
function dateThai(d: string) { return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }

const SEV_DOT: Record<Severity, string> = { green: "bg-emerald-400", yellow: "bg-amber-400", red: "bg-rose-500" };
const SEV_RING: Record<Severity, string> = { green: "border-l-emerald-400", yellow: "border-l-amber-400", red: "border-l-rose-500" };
const SEV_LABEL: Record<Severity, string> = { green: "ปกติ", yellow: "เฝ้าระวัง", red: "ด่วน" };
const STATUS_LABEL: Record<string, string> = { pending: "รอติดตาม", contacted: "ติดต่อแล้ว", unreachable: "ติดต่อไม่ได้", callback: "รอโทรกลับ", done: "เสร็จ", cancelled: "ยกเลิก" };

export default function FollowUpClient({ tasks, date, today, reviewUrl }: { tasks: FollowUpTask[]; date: string; today: string; reviewUrl: string | null }) {
    const router = useRouter();
    const overdueCount = tasks.filter(t => t.due_date < today).length;
    const redCount = tasks.filter(t => t.severity === "red").length;

    return (
        <div className="space-y-5 animate-fade-in max-w-4xl mx-auto pb-10">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><ClipboardList className="h-6 w-6 text-[#2B54F0]" /> ติดตามผลหลังการรักษา</h1>
                    <p className="text-xs text-slate-500 mt-1">{dateThai(date)} · {tasks.length} ราย{overdueCount > 0 && <span className="text-amber-600"> · เลยกำหนด {overdueCount}</span>}{redCount > 0 && <span className="text-rose-600"> · ด่วน {redCount}</span>}</p>
                </div>
                <div className="flex items-center gap-1.5">
                    <Link href={`/dashboard/follow-up?date=${shiftDate(date, -1)}`}><button className="h-9 w-9 rounded-lg border border-slate-300 bg-white flex items-center justify-center"><ChevronLeft className="h-4 w-4" /></button></Link>
                    <div className="px-3 h-9 rounded-lg border border-slate-300 bg-white flex items-center gap-2 font-bold text-sm"><Calendar className="h-4 w-4 text-slate-500" />{date === today ? "วันนี้" : dateThai(date)}</div>
                    <Link href={`/dashboard/follow-up?date=${shiftDate(date, 1)}`}><button className="h-9 w-9 rounded-lg border border-slate-300 bg-white flex items-center justify-center"><ChevronRight className="h-4 w-4" /></button></Link>
                </div>
            </div>

            {tasks.length === 0 ? (
                <div className="gonix-card-premium p-10 text-center text-slate-400">ไม่มีคิวติดตามผล{date === today ? "วันนี้" : "วันนี้"} 🎉</div>
            ) : (
                <div className="space-y-3">
                    {tasks.map(t => <TaskCard key={t.id} task={t} today={today} reviewUrl={reviewUrl} onChanged={() => router.refresh()} />)}
                </div>
            )}
        </div>
    );
}

function TaskCard({ task, today, reviewUrl, onChanged }: { task: FollowUpTask; today: string; reviewUrl: string | null; onChanged: () => void }) {
    const [pending, start] = useTransition();
    const [note, setNote] = useState(task.symptom_note || "");
    const [showNote, setShowNote] = useState(false);
    const [showSatisfied, setShowSatisfied] = useState(false);
    const isOverdue = task.due_date < today;

    function markSatisfied() {
        setShowSatisfied(true);
        start(async () => { await updateFollowUpStatus(task.id, "done", note.trim() || undefined); onChanged(); });
    }
    function copyReview() {
        const msg = `ขอบคุณที่ไว้วางใจใช้บริการค่ะ 🙏 รบกวนรีวิวให้กำลังใจเราหน่อยนะคะ${reviewUrl ? `\n${reviewUrl}` : ""}`;
        navigator.clipboard.writeText(msg);
        logFollowUpAction(task.id, "review_sent");
        alert("คัดลอกข้อความขอรีวิวแล้ว");
    }

    function act(fn: () => Promise<{ success: boolean; error?: string; lineOk?: boolean; lineErr?: string | null }>, after?: (r: { lineOk?: boolean; lineErr?: string | null }) => void) {
        start(async () => { const r = await fn(); if (!r.success) { alert(r.error || "ทำรายการไม่สำเร็จ"); return; } after?.(r); onChanged(); });
    }
    const setStatus = (s: FollowUpStatus) => act(() => updateFollowUpStatus(task.id, s, note.trim() || undefined));
    const saveNote = () => act(() => updateFollowUpStatus(task.id, task.status, note.trim()));
    const setSev = (s: Severity) => act(() => setFollowUpSeverity(task.id, s));
    const escalate = () => { if (!confirm("ส่งเตือนแพทย์เจ้าของไข้ (LINE + ในระบบ)?")) return; act(() => escalateFollowUp(task.id, note.trim() || undefined), (r) => { if (r.lineOk === false && r.lineErr) alert(`บันทึกแล้ว แต่ส่ง LINE ไม่ได้: ${r.lineErr}`); }); };

    const lineHref = task.line_user_id ? `https://line.me/R/ti/p/~${task.line_user_id}` : null; // best-effort; ถ้าไม่มีให้ใช้ปุ่มโทร

    return (
        <div className={`gonix-card-premium p-4 border-l-4 ${SEV_RING[task.severity]}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${SEV_DOT[task.severity]}`} />
                        <Link href={`/dashboard/patients/${task.hn}`} className="font-bold text-slate-800 hover:text-[#2B54F0]">{task.patient_name}</Link>
                        <span className="font-mono text-[10px] text-slate-400">{task.hn}</span>
                        {isOverdue && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">เลยกำหนด</span>}
                        {task.escalated_at && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">แจ้งแพทย์แล้ว</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>{task.service_name || "-"}</span>
                        <span>ครบกำหนด {new Date(task.due_date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
                        {task.doctor_name && <span>แพทย์: {task.doctor_name}</span>}
                        <span className="text-slate-400">· {STATUS_LABEL[task.status]}</span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    {task.phone && <a href={`tel:${task.phone}`} title={task.phone} className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100"><Phone className="h-4 w-4" /></a>}
                    {lineHref && <a href={lineHref} target="_blank" rel="noopener" title="เปิดแชท LINE" className="h-8 w-8 rounded-lg bg-[#06C755]/10 text-[#06C755] flex items-center justify-center hover:bg-[#06C755]/20"><MessageCircle className="h-4 w-4" /></a>}
                </div>
            </div>

            {/* severity picker */}
            <div className="flex items-center gap-1.5 mt-3">
                <span className="text-[10px] text-slate-400 mr-1">ระดับ:</span>
                {(["green", "yellow", "red"] as Severity[]).map(s => (
                    <button key={s} onClick={() => setSev(s)} disabled={pending}
                        className={`h-6 px-2 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${task.severity === s ? "ring-2 ring-offset-1 ring-slate-300" : "opacity-60"} ${s === "green" ? "bg-emerald-100 text-emerald-700" : s === "yellow" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                        <Circle className={`h-2 w-2 ${SEV_DOT[s]} rounded-full`} /> {SEV_LABEL[s]}
                    </button>
                ))}
                <button onClick={() => setShowNote(v => !v)} className="ml-auto text-[11px] font-bold text-slate-500 hover:text-slate-800">{showNote ? "ซ่อนบันทึก" : "บันทึกอาการ"}</button>
            </div>

            {(showNote || task.symptom_note) && (
                <div className="mt-2">
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="บันทึกอาการ/feedback ของคนไข้ (เก็บใน EMR)"
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30" />
                    <button onClick={saveNote} disabled={pending} className="mt-1 text-[11px] font-bold text-[#2B54F0]">บันทึกอาการ</button>
                </div>
            )}

            {/* status actions */}
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <button onClick={() => setStatus("contacted")} disabled={pending} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> ติดต่อแล้ว</button>
                <button onClick={() => setStatus("unreachable")} disabled={pending} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 inline-flex items-center gap-1"><PhoneOff className="h-3.5 w-3.5" /> ติดต่อไม่ได้</button>
                <button onClick={() => setStatus("callback")} disabled={pending} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 inline-flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" /> รอโทรกลับ</button>
                <button onClick={() => setStatus("done")} disabled={pending} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> เสร็จสิ้น</button>
                <button onClick={markSatisfied} disabled={pending} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-amber-400 text-white hover:bg-amber-500 inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" /> พึงพอใจ</button>
                <button onClick={escalate} disabled={pending} className="ml-auto h-8 px-2.5 rounded-lg text-[11px] font-bold bg-rose-500 text-white hover:bg-rose-600 inline-flex items-center gap-1">
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />} เตือนแพทย์
                </button>
            </div>

            {showSatisfied && (
                <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-2 flex-wrap">
                    <Star className="h-4 w-4 text-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-amber-800">จังหวะพึงพอใจ — ขอรีวิว + ชวนแนะนำเพื่อน</span>
                    <button onClick={copyReview} className="h-8 px-2.5 rounded-lg bg-white border border-amber-200 text-amber-700 text-[11px] font-bold inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> คัดลอกข้อความรีวิว</button>
                    <Link href={`/dashboard/patients/${task.hn}`} onClick={() => logFollowUpAction(task.id, "referral_sent")} className="h-8 px-2.5 rounded-lg bg-white border border-amber-200 text-amber-700 text-[11px] font-bold inline-flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" /> แนะนำเพื่อน</Link>
                    {!reviewUrl && <span className="text-[10px] text-amber-600">* ยังไม่ได้ตั้งลิงก์รีวิว (ตั้งใน tenants.review_url / mig 088)</span>}
                </div>
            )}
        </div>
    );
}
