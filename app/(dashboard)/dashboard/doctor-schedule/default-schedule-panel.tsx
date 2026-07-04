"use client";

import { useState, useEffect, useCallback } from "react";
import { X, CalendarCog, Loader2, Plus, Trash2, PlayCircle, Pencil, Users, Zap } from "lucide-react";
import {
    getDefaultSchedule, setStaffDefaultSchedule, clearStaffDefaultSchedule,
    previewApplyDefault, applyDefaultSchedule, deleteShiftsForStaffMonth,
    type DefaultScheduleStaff, type DefaultSlot,
} from "@/lib/actions/default-schedule";
import type { ScheduleStaff, ScheduleRoom } from "@/lib/actions/doctor-shifts";

// จ–อา (แสดง) → ค่า getDay()
const WD = [{ v: 1, l: "จ." }, { v: 2, l: "อ." }, { v: 3, l: "พ." }, { v: 4, l: "พฤ." }, { v: 5, l: "ศ." }, { v: 6, l: "ส." }, { v: 0, l: "อา." }];
const wdLabel = (v: number) => WD.find((w) => w.v === v)?.l || "";
const roleLabelMap: Record<string, string> = { owner: "เจ้าของ", admin: "แอดมิน", doctor: "แพทย์", dentist: "ทันตแพทย์", nurse: "พยาบาล", pharmacist: "เภสัชกร", physio: "กายภาพ", receptionist: "ต้อนรับ", accountant: "บัญชี", assistant: "ผู้ช่วย", staff: "พนักงาน" };

export default function DefaultSchedulePanel({
    staff, rooms, month, monthLabel, onClose, onChanged,
}: {
    staff: ScheduleStaff[];
    rooms: ScheduleRoom[];
    month: string;
    monthLabel: string;
    onClose: () => void;
    onChanged: () => void;
}) {
    const [list, setList] = useState<DefaultScheduleStaff[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState("");

    // editor
    const [editStaffId, setEditStaffId] = useState<string>("");
    const [slots, setSlots] = useState<DefaultSlot[]>([]);
    const [wdSel, setWdSel] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
    const [start, setStart] = useState("09:00");
    const [end, setEnd] = useState("17:00");
    const [roomId, setRoomId] = useState("");
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { setList(await getDefaultSchedule()); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    function startEdit(s?: { staff_id?: string; slots?: DefaultScheduleStaff["slots"] }) {
        setError("");
        setEditStaffId(s?.staff_id || "");
        setSlots(s?.slots ? s.slots.map((x) => ({ weekday: x.weekday, start_time: x.start_time, end_time: x.end_time, room_id: x.room_id })) : []);
        setWdSel(new Set([1, 2, 3, 4, 5])); setStart("09:00"); setEnd("17:00"); setRoomId("");
    }
    function addSlots() {
        if (end <= start) { setError("เวลาสิ้นสุดต้องหลังเวลาเริ่ม"); return; }
        if (wdSel.size === 0) { setError("เลือกวันอย่างน้อย 1 วัน"); return; }
        setError("");
        setSlots((prev) => {
            const next = [...prev];
            for (const wd of wdSel) {
                if (!next.some((x) => x.weekday === wd && x.start_time === start && x.end_time === end)) {
                    next.push({ weekday: wd, start_time: start, end_time: end, room_id: roomId || null });
                }
            }
            return next.sort((a, b) => a.weekday === b.weekday ? a.start_time.localeCompare(b.start_time) : (a.weekday === 0 ? 7 : a.weekday) - (b.weekday === 0 ? 7 : b.weekday));
        });
    }
    async function saveDefault() {
        if (!editStaffId) { setError("เลือกพนักงานก่อน"); return; }
        setSaving(true); setError("");
        const r = await setStaffDefaultSchedule(editStaffId, slots);
        setSaving(false);
        if (!r.success) { setError(r.error || "บันทึกไม่สำเร็จ"); return; }
        setEditStaffId(""); setSlots([]);
        await load();
    }
    async function removeDefault(staffId: string) {
        if (!confirm("ลบเวรมาตรฐานของพนักงานคนนี้?")) return;
        setBusy(staffId); setError("");
        const r = await clearStaffDefaultSchedule(staffId);
        setBusy(null);
        if (!r.success) { setError(r.error || "ลบไม่สำเร็จ"); return; }
        await load();
    }
    async function apply(staffId?: string) {
        setBusy(staffId || "all"); setError("");
        const p = await previewApplyDefault(month, staffId);
        if (p.added === 0 && p.skipped === 0) { setBusy(null); alert("ไม่มีเวรให้ลง (ยังไม่ได้ตั้งเวรมาตรฐาน?)"); return; }
        const ok = confirm(`Apply เวรมาตรฐานเข้า ${monthLabel}\n\nจะเพิ่ม ${p.added} เวร` + (p.skipped ? ` · ข้าม ${p.skipped} วัน (เวรซ้อน)` : "") + `\n\nยืนยัน?`);
        if (!ok) { setBusy(null); return; }
        const r = await applyDefaultSchedule(month, staffId);
        setBusy(null);
        if (!r.success) { setError(r.error || "apply ไม่สำเร็จ"); return; }
        alert(`ลงเวรแล้ว ${r.added} เวร`);
        onChanged();
    }
    async function deleteMonth(staffId: string, name: string) {
        if (!confirm(`ลบเวรทั้งหมดของ ${name} ใน ${monthLabel}?`)) return;
        setBusy(staffId); setError("");
        const r = await deleteShiftsForStaffMonth(staffId, month);
        setBusy(null);
        if (!r.success) { setError(r.error || "ลบไม่สำเร็จ"); return; }
        alert(`ลบ ${r.count} เวรแล้ว`);
        onChanged();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2"><CalendarCog className="h-5 w-5 text-[#2B54F0]" /> เวรมาตรฐาน (Default Schedule)</h2>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"><X className="h-4 w-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {error && <div className="rounded-xl px-3 py-2 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>}

                    {/* Apply All */}
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-[#2B54F0]/5 border border-[#2B54F0]/20 p-3">
                        <div className="text-sm text-slate-600">ลงเวรมาตรฐานทุกคนเข้า <b>{monthLabel}</b> ในคลิกเดียว</div>
                        <button onClick={() => apply(undefined)} disabled={busy === "all" || list.length === 0}
                            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-50 shrink-0" style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Apply All
                        </button>
                    </div>

                    {/* Editor */}
                    {(
                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
                            <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" /> ตั้ง/แก้เวรมาตรฐาน</div>
                            <div>
                                <label className="text-[11px] font-semibold text-slate-500">พนักงาน</label>
                                <select value={editStaffId} onChange={(e) => startEdit(e.target.value ? (list.find((l) => l.staff_id === e.target.value) || { staff_id: e.target.value }) : undefined)}
                                    className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                                    <option value="">— เลือกพนักงาน —</option>
                                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {roleLabelMap[s.role] || s.role}</option>)}
                                </select>
                            </div>
                            {editStaffId && (
                                <>
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-500">วันในสัปดาห์</label>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {WD.map((w) => {
                                                const on = wdSel.has(w.v);
                                                return <button key={w.v} type="button" onClick={() => setWdSel((prev) => { const n = new Set(prev); if (n.has(w.v)) n.delete(w.v); else n.add(w.v); return n; })}
                                                    className={`h-8 w-10 rounded-lg text-xs font-bold ${on ? "bg-[#2B54F0] text-white" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{w.l}</button>;
                                            })}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div><label className="text-[11px] font-semibold text-slate-500">เริ่ม</label>
                                            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm" /></div>
                                        <div><label className="text-[11px] font-semibold text-slate-500">สิ้นสุด</label>
                                            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm" /></div>
                                        <div><label className="text-[11px] font-semibold text-slate-500">ห้อง</label>
                                            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm">
                                                <option value="">— ไม่ระบุ —</option>
                                                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                            </select></div>
                                    </div>
                                    <button type="button" onClick={addSlots} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"><Plus className="h-4 w-4" /> เพิ่มช่วงเวลา</button>

                                    {slots.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {slots.map((s, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1">
                                                    <b className="text-[#2B54F0]">{wdLabel(s.weekday)}</b> {s.start_time}–{s.end_time}
                                                    <button type="button" onClick={() => setSlots((prev) => prev.filter((_, x) => x !== i))} className="text-slate-400 hover:text-rose-600"><X className="h-3 w-3" /></button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <button onClick={saveDefault} disabled={saving} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-50" style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} บันทึกเวรมาตรฐาน
                                        </button>
                                        <button onClick={() => { setEditStaffId(""); setSlots([]); }} className="h-9 px-3 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100">ยกเลิก</button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Current defaults */}
                    <div>
                        <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> เวรมาตรฐานที่ตั้งไว้ ({list.length})</div>
                        {loading ? (
                            <div className="py-8 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                        ) : list.length === 0 ? (
                            <div className="text-sm text-slate-400 py-6 text-center">ยังไม่มีเวรมาตรฐาน — เลือกพนักงานด้านบนเพื่อตั้ง</div>
                        ) : (
                            <div className="space-y-2">
                                {list.map((s) => (
                                    <div key={s.staff_id} className="rounded-xl border border-slate-200 p-3">
                                        <div className="flex items-start justify-between gap-2 flex-wrap">
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold text-slate-800">{s.name} <span className="text-[11px] font-normal text-slate-400">· {roleLabelMap[s.role] || s.role}</span></div>
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {s.slots.map((sl, i) => (
                                                        <span key={i} className="text-[11px] bg-sky-50 text-sky-700 rounded px-1.5 py-0.5"><b>{wdLabel(sl.weekday)}</b> {sl.start_time}–{sl.end_time}{sl.room_name ? ` · ${sl.room_name}` : ""}</span>
                                                    ))}
                                                </div>
                                                {s.updated_by_name && <div className="text-[10px] text-slate-400 mt-1">แก้ล่าสุด: {s.updated_by_name} · {s.updated_at ? new Date(s.updated_at).toLocaleDateString("th-TH", { dateStyle: "short" }) : ""}</div>}
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button onClick={() => apply(s.staff_id)} disabled={busy === s.staff_id} title="Apply เดือนนี้" className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                                                    {busy === s.staff_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />} Apply
                                                </button>
                                                <button onClick={() => startEdit(s)} title="แก้ไข" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>
                                                <button onClick={() => removeDefault(s.staff_id)} title="ลบเวรมาตรฐาน" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                                            </div>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-slate-100">
                                            <button onClick={() => deleteMonth(s.staff_id, s.name)} className="text-[11px] font-semibold text-rose-500 hover:text-rose-700">ลบเวรของคนนี้ทั้งเดือน ({monthLabel})</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
