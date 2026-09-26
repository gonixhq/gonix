"use client";

import { useState, useTransition } from "react";
import { Clock, CheckCircle2, Loader2, Plus, Trash2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { getDayAttendanceDetail, recordStaffTime, removeStaffTime, type DayAttendanceRow } from "@/lib/actions/compensation";
import { toast } from "@/lib/toast";

const shiftDay = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const thaiDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const ROLE_LABEL: Record<string, string> = { doctor: "แพทย์", dentist: "ทันตแพทย์", nurse: "พยาบาล", assistant: "ผู้ช่วย", owner: "เจ้าของ", admin: "ผู้จัดการ" };

// เวลาเข้า-ออกงานจริง → ใช้คิดค่าชั่วโมง (หน้าค่าตอบแทน: ชม.จริง × อัตรา) — ตอกบัตรเองก็ขึ้นที่นี่
export default function AttendancePanel({ today, initialRows }: { today: string; initialRows: DayAttendanceRow[] }) {
    const [date, setDate] = useState(today);
    const [rows, setRows] = useState(initialRows);
    const [loading, startLoad] = useTransition();
    const [pending, startSave] = useTransition();
    const [editing, setEditing] = useState<string | null>(null);
    const [t, setT] = useState({ start: "", end: "" });

    function load(d: string) {
        setDate(d); setEditing(null);
        startLoad(async () => { setRows(await getDayAttendanceDetail(d)); });
    }
    function save(staffId: string, start: string, end: string) {
        startSave(async () => {
            const res = await recordStaffTime({ staff_id: staffId, work_date: date, start_time: start, end_time: end });
            if (!res.success) { toast.error(res.error || "บันทึกไม่สำเร็จ"); return; }
            toast.success("บันทึกเวลาแล้ว"); setEditing(null);
            setRows(await getDayAttendanceDetail(date));
        });
    }
    function remove(id: string) {
        if (!confirm("ลบเวลาที่บันทึกนี้?")) return;
        startSave(async () => {
            const res = await removeStaffTime(id);
            if (!res.success) { toast.error(res.error || "ลบไม่สำเร็จ"); return; }
            setRows(await getDayAttendanceDetail(date));
        });
    }

    return (
        <section className="rounded-2xl bg-white/85 border border-white/90 shadow-sm overflow-hidden max-w-6xl mx-auto">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                <Clock className="h-4 w-4 text-blue-700" />
                <div className="flex-1 min-w-[200px]">
                    <h2 className="text-sm font-bold text-slate-800">เวลาเข้า-ออกงานจริง</h2>
                    <p className="text-xs text-slate-500">ใช้คิดค่าชั่วโมงแพทย์/พนักงานรายชั่วโมง · กด &quot;มาตามเวร&quot; ได้เลยถ้ามาตรงเวร · ตอกบัตรเองจะขึ้นอัตโนมัติ</p>
                </div>
                <div className="inline-flex items-center gap-1">
                    <button onClick={() => load(shiftDay(date, -1))} className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center" aria-label="วันก่อน"><ChevronLeft className="h-4 w-4" /></button>
                    <input type="date" value={date} max={today} onChange={(e) => e.target.value && load(e.target.value)} className="h-8 rounded-lg border border-slate-300 px-2 text-xs" />
                    <button onClick={() => load(shiftDay(date, 1))} disabled={date >= today} className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center disabled:opacity-40" aria-label="วันถัดไป"><ChevronRight className="h-4 w-4" /></button>
                </div>
            </div>
            <div className="px-4 py-1 text-xs text-slate-400">{thaiDay(date)}</div>
            {loading ? (
                <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : rows.length === 0 ? (
                <p className="px-4 pb-6 pt-2 text-sm text-slate-400">ไม่มีเวรหรือเวลาทำงานในวันนี้</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {rows.map((r) => {
                        const missing = !!r.planned && r.logs.length === 0;
                        return (
                            <li key={r.staff_id} className="px-4 py-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <div className="min-w-[160px] flex-1">
                                        <div className="text-sm font-semibold text-slate-800">{r.name} <span className="text-xs font-normal text-slate-400">{ROLE_LABEL[r.role] || r.role}</span></div>
                                        <div className="text-xs text-slate-500">เวร: {r.planned ? `${r.planned.start}–${r.planned.end}` : <span className="text-amber-600">ไม่ได้ลงเวร</span>}</div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {r.logs.map((l) => (
                                            <span key={l.id} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs tabular-nums ${l.out ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-blue-800"}`}>
                                                {l.in}–{l.out ?? "ยังไม่ออก"} {l.source === "clock" ? "· ตอกบัตร" : ""}
                                                <button onClick={() => remove(l.id)} disabled={pending} className="text-slate-400 hover:text-rose-600" aria-label="ลบ"><Trash2 className="h-3 w-3" /></button>
                                            </span>
                                        ))}
                                        {missing && <span className="text-xs text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> ยังไม่มีเวลาจริง</span>}
                                        {(r.late_min > 5 || r.early_min > 5) && <span className="text-xs text-rose-600">{r.late_min > 5 ? `สาย ${r.late_min} น.` : ""}{r.late_min > 5 && r.early_min > 5 ? " · " : ""}{r.early_min > 5 ? `ออกก่อน ${r.early_min} น.` : ""}</span>}
                                    </div>
                                    <div className="text-sm font-bold tabular-nums text-slate-700 w-20 text-right">{r.hours > 0 ? `${r.hours} ชม.` : "—"}</div>
                                    <div className="flex items-center gap-1.5">
                                        {missing && r.planned && (
                                            <button onClick={() => save(r.staff_id, r.planned!.start, r.planned!.end)} disabled={pending}
                                                className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> มาตามเวร
                                            </button>
                                        )}
                                        {editing !== r.staff_id && (
                                            <button onClick={() => { setEditing(r.staff_id); setT({ start: r.planned?.start || "", end: r.planned?.end || "" }); }}
                                                className="h-8 px-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
                                                <Plus className="h-3.5 w-3.5" /> กรอกเวลา
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {editing === r.staff_id && (
                                    <div className="mt-2 flex items-center gap-2 flex-wrap rounded-xl bg-slate-50 border border-slate-200 p-2">
                                        <label className="text-xs text-slate-600">เข้า <input type="time" value={t.start} onChange={(e) => setT({ ...t, start: e.target.value })} className="ml-1 h-8 rounded-lg border border-slate-300 px-2 text-sm" /></label>
                                        <label className="text-xs text-slate-600">ออก <input type="time" value={t.end} onChange={(e) => setT({ ...t, end: e.target.value })} className="ml-1 h-8 rounded-lg border border-slate-300 px-2 text-sm" /></label>
                                        <button onClick={() => save(r.staff_id, t.start, t.end)} disabled={pending || !t.start || !t.end}
                                            className="h-8 px-3 rounded-lg bg-blue-700 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1">
                                            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} บันทึก</button>
                                        <button onClick={() => setEditing(null)} className="h-8 px-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100">ยกเลิก</button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
