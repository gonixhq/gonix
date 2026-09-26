"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock, Loader2, AlertTriangle } from "lucide-react";
import { scheduleWithAppointment, checkSlotConflicts, type SlotConflict } from "@/lib/actions/pre-order";
import { toast } from "@/lib/toast";

// นัดวันทำ → ลงปฏิทินนัดหมาย (หน้า "นัดหมาย") อัตโนมัติ + เตือนนัดชน + แจ้งลูกค้าทาง LINE
export default function ScheduleBox({ poId, doctors, current, onDone }: {
    poId: string;
    doctors: { id: string; name: string }[];
    current?: { date: string; start: string; duration: number; doctor_id: string | null; apptId: string | null } | null;
    onDone: () => void;
}) {
    const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }); })();
    const [date, setDate] = useState(current?.date || tomorrow);
    const [start, setStart] = useState(current?.start || "13:00");
    const [dur, setDur] = useState(String(current?.duration || 60));
    const [doctor, setDoctor] = useState(current?.doctor_id || "");
    const [conf, setConf] = useState<{ conflicts: SlotConflict[]; dayCount: number } | null>(null);
    const [pending, startT] = useTransition();

    useEffect(() => {
        if (!date || !start) return;
        const t = setTimeout(() => {
            checkSlotConflicts({ date, start, duration_min: Number(dur) || 30, doctor_id: doctor || null }, current?.apptId).then(setConf).catch(() => setConf(null));
        }, 300);
        return () => clearTimeout(t);
    }, [date, start, dur, doctor, current?.apptId]);

    const sameDoc = (conf?.conflicts || []).filter(c => c.same_doctor);
    function save() {
        if (sameDoc.length > 0 && !confirm(`แพทย์ที่เลือกมีนัดชนช่วงนี้ ${sameDoc.length} นัด — ยืนยันนัดซ้อน?`)) return;
        startT(async () => {
            const r = await scheduleWithAppointment(poId, { date, start, duration_min: Number(dur) || 30, doctor_id: doctor || null });
            if (!r.ok) { toast.error(r.error); return; }
            toast.success(current ? "เลื่อนนัดแล้ว — อัปเดตปฏิทินนัดหมาย" : "นัดแล้ว — ลงปฏิทินนัดหมาย + แจ้งลูกค้าทาง LINE");
            onDone();
        });
    }

    const inp = "h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm";
    return (
        <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
            <div className="text-xs font-bold text-blue-800 inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> {current ? "เลื่อนนัด" : "นัดวันทำหัตถการ"} <span className="font-normal text-blue-600">(ลงปฏิทินนัดหมายอัตโนมัติ)</span></div>
            <div className="grid grid-cols-2 gap-2">
                <input type="date" value={date} min={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" })} onChange={e => setDate(e.target.value)} className={inp} />
                <input type="time" value={start} onChange={e => setStart(e.target.value)} className={inp} />
                <select value={dur} onChange={e => setDur(e.target.value)} className={inp}>
                    {[30, 45, 60, 90, 120, 180].map(m => <option key={m} value={m}>{m} นาที</option>)}
                </select>
                <select value={doctor} onChange={e => setDoctor(e.target.value)} className={inp}>
                    <option value="">— แพทย์ (ไม่ระบุ) —</option>
                    {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
            </div>
            {conf && (
                <div className={`text-[11px] rounded-lg px-2 py-1.5 ${conf.conflicts.length ? "bg-amber-50 text-amber-800 border border-amber-200" : "text-slate-500"}`}>
                    {conf.conflicts.length === 0 ? `ว่าง · วันนั้นมีนัดแล้ว ${conf.dayCount} นัด` : (
                        <>
                            <div className="font-bold inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> มีนัดชนช่วงเวลานี้ {conf.conflicts.length} นัด</div>
                            {conf.conflicts.slice(0, 4).map((c, i) => <div key={i} className={c.same_doctor ? "text-rose-700 font-semibold" : ""}>• {c.time} {c.patient}{c.doctor ? ` · ${c.doctor}` : ""}{c.same_doctor ? " (แพทย์คนเดียวกัน)" : ""}</div>)}
                        </>
                    )}
                </div>
            )}
            <button onClick={save} disabled={pending || !date || !start} className="w-full h-9 rounded-lg bg-blue-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} {current ? "บันทึกวันนัดใหม่" : "บันทึกนัด"}
            </button>
        </div>
    );
}
