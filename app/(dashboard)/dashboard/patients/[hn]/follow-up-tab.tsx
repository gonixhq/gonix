"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Loader2, AlertTriangle } from "lucide-react";
import { getPatientFollowUps, type PatientFollowUp } from "@/lib/actions/follow-up";

const SEV_DOT: Record<string, string> = { green: "bg-emerald-400", yellow: "bg-amber-400", red: "bg-rose-500" };
const SEV_LABEL: Record<string, string> = { green: "ปกติ", yellow: "เฝ้าระวัง", red: "ด่วน" };
const STATUS_LABEL: Record<string, string> = { pending: "รอติดตาม", contacted: "ติดต่อแล้ว", unreachable: "ติดต่อไม่ได้", callback: "รอโทรกลับ", done: "เสร็จ", cancelled: "ยกเลิก" };
const ACTION_LABEL: Record<string, string> = { status_change: "อัปเดตสถานะ", severity: "ปรับระดับ", escalate: "แจ้งแพทย์", note: "บันทึกอาการ", review_sent: "ส่งลิงก์รีวิว", referral_sent: "เสนอ referral" };

export default function FollowUpTab({ hn }: { hn: string }) {
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<PatientFollowUp[]>([]);

    useEffect(() => { (async () => { setTasks(await getPatientFollowUps(hn)); setLoading(false); })(); }, [hn]);

    if (loading) return <div className="py-10 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
    if (tasks.length === 0) return <div className="gonix-card-premium p-8 text-center text-slate-400 text-sm">ยังไม่มีประวัติการติดตามผล</div>;

    return (
        <div className="space-y-3">
            {tasks.map(t => (
                <div key={t.id} className="gonix-card-premium overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                        <span className={`h-2.5 w-2.5 rounded-full ${SEV_DOT[t.severity] || SEV_DOT.green}`} />
                        <ClipboardList className="h-4 w-4 text-slate-400" />
                        <span className="font-bold text-slate-800 text-sm">{t.service_name || "ติดตามผล"}</span>
                        <span className="text-xs text-slate-400">ครบกำหนด {new Date(t.due_date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</span>
                        <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{STATUS_LABEL[t.status] || t.status}</span>
                        {t.escalated_at && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> แจ้งแพทย์แล้ว</span>}
                    </div>
                    <div className="p-4 space-y-2">
                        {t.symptom_note && <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase">อาการ/Feedback</span><div className="mt-0.5">{t.symptom_note}</div></div>}
                        <div className="text-[11px] text-slate-500">ระดับ: <span className="font-bold">{SEV_LABEL[t.severity] || t.severity}</span></div>
                        {t.logs.length > 0 && (
                            <div className="border-t border-slate-100 pt-2 space-y-1">
                                {t.logs.map(l => (
                                    <div key={l.id} className="text-[11px] text-slate-500 flex items-start gap-2">
                                        <span className="text-slate-400 shrink-0">{new Date(l.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
                                        <span className="font-bold text-slate-600">{ACTION_LABEL[l.action] || l.action}</span>
                                        {l.status && <span>→ {STATUS_LABEL[l.status] || l.status}</span>}
                                        {l.severity && <span>→ {SEV_LABEL[l.severity] || l.severity}</span>}
                                        {l.note && <span className="italic">“{l.note}”</span>}
                                        {l.actor_name && <span className="text-slate-400 ml-auto shrink-0">{l.actor_name}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
