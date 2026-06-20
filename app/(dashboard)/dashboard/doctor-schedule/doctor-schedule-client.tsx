"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    CalendarClock, Plus, Trash2, ChevronLeft, ChevronRight,
    Stethoscope, Clock, DoorOpen, Copy, Loader2, CalendarDays, LayoutGrid, Users, CheckSquare,
} from "lucide-react";
import { bangkokDate } from "@/lib/utils/date";
import {
    getShiftsForDate, getShiftsForMonth, addShift, addShiftBulk, deleteShift, deleteShiftsForDates, copyShifts,
    type DoctorShift, type MonthShift, type ScheduleStaff, type ScheduleRoom,
} from "@/lib/actions/doctor-shifts";

const ROLE_LABEL: Record<string, string> = {
    owner: "เจ้าของ", admin: "แอดมิน", doctor: "แพทย์", dentist: "ทันตแพทย์",
    nurse: "พยาบาล", pharmacist: "เภสัชกร", physio: "กายภาพ", receptionist: "ต้อนรับ",
    accountant: "บัญชี", assistant: "ผู้ช่วย", staff: "พนักงาน",
};
const roleLabel = (r: string) => ROLE_LABEL[r] || r || "พนักงาน";

const ROLE_TONE: Record<string, { bg: string; text: string; dot: string }> = {
    owner: { bg: "bg-[#2B54F0]/10", text: "text-[#2B54F0]", dot: "bg-[#2B54F0]" },
    doctor: { bg: "bg-[#2B54F0]/10", text: "text-[#2B54F0]", dot: "bg-[#2B54F0]" },
    dentist: { bg: "bg-[#2B54F0]/10", text: "text-[#2B54F0]", dot: "bg-[#2B54F0]" },
    nurse: { bg: "bg-[#0EA5A0]/10", text: "text-[#0EA5A0]", dot: "bg-[#0EA5A0]" },
    pharmacist: { bg: "bg-[#6366F1]/10", text: "text-[#6366F1]", dot: "bg-[#6366F1]" },
    physio: { bg: "bg-[#10B981]/10", text: "text-[#10B981]", dot: "bg-[#10B981]" },
};
const tone = (r: string) => ROLE_TONE[r] || { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" };

const THAI_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_DAYS_SHORT = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const hoursOf = (s: string, e: string) => Math.round(((toMin(e) - toMin(s)) / 60) * 10) / 10;

function shiftDay(date: string, delta: number): string {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + delta);
    return bangkokDate(d);
}
function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function thaiDateLabel(date: string): string {
    const d = new Date(date + "T00:00:00");
    return `${THAI_FULL[d.getDay()]} ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function monthLabel(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}
function endOfMonth(d: string): string {
    const [y, m] = d.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${d.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}
// ลำดับแสดงผล จ.–อา. → ค่า getDay()
const WEEKDAY_POS = [1, 2, 3, 4, 5, 6, 0];

export default function DoctorScheduleClient({
    staff, rooms, today,
}: {
    staff: ScheduleStaff[];
    rooms: ScheduleRoom[];
    today: string;
}) {
    const [view, setView] = useState<"month" | "day">("month");
    const [date, setDate] = useState(today);
    const month = date.slice(0, 7);

    const [shifts, setShifts] = useState<DoctorShift[]>([]);
    const [monthShifts, setMonthShifts] = useState<MonthShift[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // add-form state
    const [docId, setDocId] = useState(staff[0]?.id || "");
    const [start, setStart] = useState("09:00");
    const [end, setEnd] = useState("17:00");
    const [roomId, setRoomId] = useState("");
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);

    // multi-day add
    const [addMode, setAddMode] = useState<"single" | "multi">("single");
    const [rangeFrom, setRangeFrom] = useState(today);
    const [rangeTo, setRangeTo] = useState(endOfMonth(today));
    const [weekdays, setWeekdays] = useState<boolean[]>(() => [false, true, true, true, true, true, false]); // getDay-indexed; default จ.–ศ.

    // copy target
    const [copyTo, setCopyTo] = useState(shiftDay(today, 1));
    const [copying, setCopying] = useState(false);

    // multi-select on month calendar
    const [selectMode, setSelectMode] = useState(false);
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [bulkSaving, setBulkSaving] = useState(false);

    const loadDay = useCallback(async (d: string) => {
        setLoading(true);
        try { setShifts(await getShiftsForDate(d)); }
        finally { setLoading(false); }
    }, []);
    const loadMonth = useCallback(async (mo: string) => {
        setLoading(true);
        try { setMonthShifts(await getShiftsForMonth(mo)); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { if (view === "day") loadDay(date); }, [view, date, loadDay]);
    useEffect(() => { if (view === "month") loadMonth(month); }, [view, month, loadMonth]);

    // วันเป้าหมายของโหมดหลายวัน (ช่วงวัน × วันในสัปดาห์ที่เลือก)
    const multiDates = useMemo(() => {
        if (addMode !== "multi") return [];
        const d = new Date(rangeFrom + "T00:00:00");
        const end = new Date(rangeTo + "T00:00:00");
        if (isNaN(d.getTime()) || isNaN(end.getTime()) || end < d) return [];
        const out: string[] = [];
        let guard = 0;
        while (d <= end && guard < 370) {
            if (weekdays[d.getDay()]) out.push(bangkokDate(d));
            d.setDate(d.getDate() + 1);
            guard++;
        }
        return out;
    }, [addMode, rangeFrom, rangeTo, weekdays]);

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!docId) { setError("เลือกพนักงานก่อน"); return; }
        if (end <= start) { setError("เวลาสิ้นสุดต้องหลังเวลาเริ่ม"); return; }
        setSaving(true);
        setError("");
        try {
            if (addMode === "multi") {
                if (multiDates.length === 0) { setError("ยังไม่ได้เลือกวัน/ช่วงวัน"); setSaving(false); return; }
                const res = await addShiftBulk({ doctor_staff_id: docId, dates: multiDates, start_time: start, end_time: end, room_id: roomId || null, note: note || null });
                setNote("");
                alert(`เพิ่มเวร ${res.count} วันแล้ว`);
                await loadDay(date);
            } else {
                await addShift({ doctor_staff_id: docId, shift_date: date, start_time: start, end_time: end, room_id: roomId || null, note: note || null });
                setNote("");
                await loadDay(date);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
        } finally { setSaving(false); }
    }

    async function handleDelete(id: string) {
        await deleteShift(id);
        setShifts((prev) => prev.filter((s) => s.id !== id));
    }

    async function handleCopy() {
        if (!copyTo || copyTo === date) { setError("เลือกวันปลายทางที่ไม่ใช่วันเดียวกัน"); return; }
        setCopying(true);
        setError("");
        try {
            const res = await copyShifts(date, copyTo);
            alert(`คัดลอกเวร ${res.copied ?? 0} รายการไปยัง ${thaiDateLabel(copyTo)} แล้ว`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "คัดลอกไม่สำเร็จ");
        } finally { setCopying(false); }
    }

    async function handleBulkAddSelected() {
        if (!docId) { setError("เลือกพนักงานก่อน"); return; }
        if (end <= start) { setError("เวลาสิ้นสุดต้องหลังเวลาเริ่ม"); return; }
        if (selectedDates.length === 0) { setError("ยังไม่ได้เลือกวัน"); return; }
        setBulkSaving(true);
        setError("");
        try {
            const res = await addShiftBulk({ doctor_staff_id: docId, dates: selectedDates, start_time: start, end_time: end, room_id: roomId || null, note: note || null });
            await loadMonth(month);
            alert(`เพิ่มเวร ${res.count} วันแล้ว`);
            setSelectedDates([]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "เพิ่มไม่สำเร็จ");
        } finally { setBulkSaving(false); }
    }

    async function handleBulkDeleteSelected() {
        if (selectedDates.length === 0) return;
        if (!confirm(`ลบเวรทั้งหมดใน ${selectedDates.length} วันที่เลือก?`)) return;
        setBulkSaving(true);
        setError("");
        try {
            const res = await deleteShiftsForDates(selectedDates);
            await loadMonth(month);
            alert(`ลบ ${res.count} เวรแล้ว`);
            setSelectedDates([]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
        } finally { setBulkSaving(false); }
    }

    // ── derived ──
    const byDate = useMemo(() => {
        const map: Record<string, MonthShift[]> = {};
        monthShifts.forEach((s) => { (map[s.shift_date] ||= []).push(s); });
        return map;
    }, [monthShifts]);

    const monthGrid = useMemo(() => {
        const [y, m] = month.split("-").map(Number);
        const first = new Date(y, m - 1, 1);
        const firstDow = first.getDay() === 0 ? 6 : first.getDay() - 1;
        const cells: Date[] = [];
        const gridStart = new Date(first); gridStart.setDate(1 - firstDow);
        for (let i = 0; i < 42; i++) { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); cells.push(d); }
        return cells;
    }, [month]);

    const summary = useMemo(() => {
        const map = new Map<string, { name: string; role: string; count: number; hours: number }>();
        monthShifts.forEach((s) => {
            let e = map.get(s.doctor_staff_id);
            if (!e) { e = { name: s.doctor_name, role: s.role, count: 0, hours: 0 }; map.set(s.doctor_staff_id, e); }
            e.count++; e.hours += hoursOf(s.start_time, s.end_time);
        });
        return [...map.values()].sort((a, b) => b.hours - a.hours);
    }, [monthShifts]);

    const isToday = date === today;
    const onDutyCount = new Set(shifts.map((s) => s.doctor_staff_id)).size;
    const currentMonth = month.split("-").map(Number)[1];

    const goPrev = () => view === "day" ? setDate(shiftDay(date, -1)) : setDate(`${shiftMonth(month, -1)}-01`);
    const goNext = () => view === "day" ? setDate(shiftDay(date, 1)) : setDate(`${shiftMonth(month, 1)}-01`);

    return (
        <div className="space-y-5 animate-fade-in max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-2xl flex items-center justify-center bg-[#2B54F0]/10">
                        <CalendarClock className="h-5 w-5 text-[#2B54F0]" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight leading-tight">ตารางเวรการทำงาน</h1>
                        <p className="text-xs text-slate-500">
                            {view === "day"
                                ? `${thaiDateLabel(date)} · ${onDutyCount} ท่าน · ${shifts.length} เวร`
                                : `${monthLabel(month)} · ${monthShifts.length} เวร · ${summary.length} คน`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* View toggle */}
                    <div className="inline-flex items-center bg-slate-100 rounded-xl p-0.5 gap-0.5">
                        <button onClick={() => setView("month")} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold ${view === "month" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-600"}`}>
                            <CalendarDays className="h-3.5 w-3.5" /> เดือน
                        </button>
                        <button onClick={() => setView("day")} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold ${view === "day" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-600"}`}>
                            <LayoutGrid className="h-3.5 w-3.5" /> วัน
                        </button>
                    </div>

                    {/* Nav */}
                    <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-xl p-0.5 shadow-sm">
                        <button onClick={goPrev} className="h-9 w-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600"><ChevronLeft className="h-4 w-4" /></button>
                        <button onClick={() => setDate(today)} className={`h-9 px-3 rounded-lg text-xs font-bold ${isToday && view === "day" ? "text-[#2B54F0]" : "text-slate-600 hover:bg-slate-100"}`}>
                            {view === "day" ? "วันนี้" : "เดือนนี้"}
                        </button>
                        <button onClick={goNext} className="h-9 w-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600"><ChevronRight className="h-4 w-4" /></button>
                    </div>

                    {view === "day" ? (
                        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
                            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                    ) : (
                        <input type="month" value={month} onChange={(e) => e.target.value && setDate(`${e.target.value}-01`)}
                            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                    )}

                    {view === "month" && (
                        <button onClick={() => { setSelectMode((m) => !m); setSelectedDates([]); }}
                            className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-bold border transition-colors ${selectMode ? "bg-[#2B54F0]/10 border-[#2B54F0]/30 text-[#2B54F0]" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                            <CheckSquare className="h-4 w-4" /> เลือกวัน
                        </button>
                    )}
                    {view === "month" && !selectMode && (
                        <button onClick={() => { if (date.slice(0, 7) !== month) setDate(`${month}-01`); setView("day"); }}
                            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-bold text-white shadow-md"
                            style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                            <Plus className="h-4 w-4" /> เพิ่มเวร
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="rounded-xl px-4 py-2.5 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>}

            {/* ══════════════ MONTH VIEW ══════════════ */}
            {view === "month" && (
                <>
                    {selectMode && (
                        <div className="gonix-card-premium p-4 space-y-3 border-2 border-[#2B54F0]/30">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-bold text-slate-800">เลือกแล้ว <span className="text-[#2B54F0]">{selectedDates.length}</span> วัน</div>
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setSelectedDates([])} className="text-xs text-slate-500 hover:text-slate-800">ล้าง</button>
                                    <button onClick={() => { setSelectMode(false); setSelectedDates([]); }} className="text-xs font-semibold text-slate-600 hover:text-slate-900">เสร็จ</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                                <div className="lg:col-span-2">
                                    <label className="text-[11px] font-semibold text-slate-500">พนักงาน</label>
                                    <select value={docId} onChange={(e) => setDocId(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20">
                                        {staff.length === 0 && <option value="">— ไม่มีรายชื่อพนักงาน —</option>}
                                        {staff.map((d) => <option key={d.id} value={d.id}>{d.name} · {roleLabel(d.role)}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[11px] font-semibold text-slate-500">เริ่ม</label>
                                    <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                                </div>
                                <div>
                                    <label className="text-[11px] font-semibold text-slate-500">สิ้นสุด</label>
                                    <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button onClick={handleBulkAddSelected} disabled={bulkSaving || selectedDates.length === 0} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-50" style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                                    {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} เพิ่มเวรให้ {selectedDates.length} วัน
                                </button>
                                <button onClick={handleBulkDeleteSelected} disabled={bulkSaving || selectedDates.length === 0} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50">
                                    <Trash2 className="h-4 w-4" /> ลบเวรในวันที่เลือก
                                </button>
                                <span className="text-xs text-slate-400">คลิกเลือกวันในปฏิทินด้านล่าง</span>
                            </div>
                        </div>
                    )}

                    <div className="gonix-card-premium overflow-hidden">
                        {/* Month title */}
                        <div className="px-5 py-3.5 border-b border-slate-200/60 flex items-center justify-center gap-2.5">
                            <button onClick={goPrev} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><ChevronLeft className="h-5 w-5" /></button>
                            <h2 className="text-xl font-black text-slate-800 tracking-tight tabular-nums min-w-[180px] text-center">{monthLabel(month)}</h2>
                            <button onClick={goNext} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><ChevronRight className="h-5 w-5" /></button>
                        </div>
                        <div className="grid grid-cols-7 border-b border-slate-200/70 bg-slate-50/40">
                            {THAI_DAYS_SHORT.map((d, i) => (
                                <div key={d} className={`text-center py-2.5 text-[11px] font-black uppercase tracking-widest ${i >= 5 ? "text-rose-400/80" : "text-slate-500"}`}>{d}</div>
                            ))}
                        </div>
                        {loading ? (
                            <div className="py-16 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                        ) : (
                            <div className="grid grid-cols-7">
                                {monthGrid.map((d, i) => {
                                    const key = bangkokDate(d);
                                    const inMonth = d.getMonth() + 1 === currentMonth;
                                    const isTd = key === today;
                                    const dayShifts = byDate[key] || [];
                                    const isLastRow = i >= 35;
                                    const selected = selectMode && selectedDates.includes(key);
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                if (selectMode) setSelectedDates((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]);
                                                else { setDate(key); setView("day"); }
                                            }}
                                            className={`min-h-[104px] text-left border-r border-b border-slate-100/80 p-1.5 transition-colors ${(i + 1) % 7 === 0 ? "border-r-0" : ""} ${isLastRow ? "border-b-0" : ""} ${selected ? "bg-[#2B54F0]/10 ring-2 ring-inset ring-[#2B54F0]" : !inMonth ? "bg-slate-50/40" : isTd ? "bg-blue-50/50" : "hover:bg-slate-50/70"}`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`inline-flex items-center justify-center text-xs font-bold rounded-full h-6 w-6 ${isTd ? "text-white" : inMonth ? "text-slate-700" : "text-slate-300"}`}
                                                    style={isTd ? { background: "linear-gradient(135deg, #2B54F0, #00A6C0)" } : undefined}>
                                                    {d.getDate()}
                                                </span>
                                                {dayShifts.length > 0 && <span className="text-[10px] font-bold text-[#2B54F0]">{dayShifts.length}</span>}
                                            </div>
                                            <div className="space-y-0.5">
                                                {dayShifts.slice(0, 3).map((s) => {
                                                    const tn = tone(s.role);
                                                    return (
                                                        <div key={s.id} className={`flex items-center gap-1 text-[10px] truncate px-1 py-0.5 rounded ${tn.bg} ${tn.text}`}>
                                                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tn.dot}`} />
                                                            <span className="font-mono opacity-70">{s.start_time}</span>
                                                            <span className="truncate">{s.doctor_name}</span>
                                                        </div>
                                                    );
                                                })}
                                                {dayShifts.length > 3 && <div className="text-[9px] text-slate-500 px-1 font-semibold">+{dayShifts.length - 3} เพิ่ม</div>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400">
                            {selectMode ? "💡 คลิกช่องวันเพื่อเลือก/ยกเลิก แล้วกดเพิ่มหรือลบเวรในแถบด้านบน" : "💡 คลิกที่ช่องวันในปฏิทินเพื่อเพิ่มหรือแก้เวรของวันนั้น"}
                        </div>
                    </div>

                    {/* Monthly summary per staff */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2">
                            <Users className="h-4 w-4 text-[#2B54F0]" />
                            <h2 className="text-sm font-bold text-slate-800">สรุปเวรรายเดือน</h2>
                            <span className="text-xs text-slate-400">({summary.length} คน)</span>
                        </div>
                        {summary.length === 0 ? (
                            <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีเวรในเดือนนี้</div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {summary.map((s, idx) => {
                                    const tn = tone(s.role);
                                    return (
                                        <div key={idx} className="flex items-center gap-3 px-5 py-2.5">
                                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${tn.bg}`}>
                                                <Stethoscope className={`h-4 w-4 ${tn.text}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-bold text-slate-800">{s.name}</span>
                                                <span className="text-[11px] text-slate-400 ml-2">{roleLabel(s.role)}</span>
                                            </div>
                                            <div className="text-xs text-slate-500 tabular-nums shrink-0">
                                                <span className="font-bold text-slate-700">{s.count}</span> เวร · <span className="font-bold text-slate-700">{s.hours}</span> ชม.
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ══════════════ DAY VIEW ══════════════ */}
            {view === "day" && (
                <>
                    <form onSubmit={handleAdd} className="gonix-card-premium p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                                {addMode === "single" ? `เพิ่มเวร · ${thaiDateLabel(date)}` : "เพิ่มเวรหลายวัน"}
                            </div>
                            <div className="inline-flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                                <button type="button" onClick={() => setAddMode("single")} className={`h-7 px-2.5 rounded-md text-xs font-bold ${addMode === "single" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-500"}`}>วันเดียว</button>
                                <button type="button" onClick={() => setAddMode("multi")} className={`h-7 px-2.5 rounded-md text-xs font-bold ${addMode === "multi" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-500"}`}>หลายวัน</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                            <div className="lg:col-span-2">
                                <label className="text-[11px] font-semibold text-slate-500">พนักงาน</label>
                                <select value={docId} onChange={(e) => setDocId(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20">
                                    {staff.length === 0 && <option value="">— ไม่มีรายชื่อพนักงาน —</option>}
                                    {staff.map((d) => <option key={d.id} value={d.id}>{d.name} · {roleLabel(d.role)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-slate-500">เริ่ม</label>
                                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-slate-500">สิ้นสุด</label>
                                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-slate-500">ห้อง (ถ้ามี)</label>
                                <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20">
                                    <option value="">— ไม่ระบุ —</option>
                                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {addMode === "multi" && (
                            <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-500">ตั้งแต่วันที่</label>
                                        <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-500">ถึงวันที่</label>
                                        <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-semibold text-slate-500">เลือกวันในสัปดาห์</label>
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {WEEKDAY_POS.map((dow, i) => {
                                            const on = weekdays[dow];
                                            return (
                                                <button type="button" key={dow}
                                                    onClick={() => setWeekdays((prev) => { const n = [...prev]; n[dow] = !n[dow]; return n; })}
                                                    className={`h-8 w-10 rounded-lg text-xs font-bold transition-colors ${on ? "bg-[#2B54F0] text-white" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"} ${i >= 5 && !on ? "text-rose-400" : ""}`}>
                                                    {THAI_DAYS_SHORT[i]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="text-xs text-slate-500">
                                    จะลงเวร <span className="font-bold text-[#2B54F0]">{multiDates.length}</span> วัน
                                    {multiDates.length === 0 && <span className="text-amber-600"> — เลือกช่วงวัน/วันในสัปดาห์</span>}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-2.5 mt-2.5">
                            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ)" className="flex-1 h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                            <button type="submit" disabled={saving || (addMode === "multi" && multiDates.length === 0)} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-60" style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {addMode === "multi" ? `เพิ่ม ${multiDates.length} วัน` : "เพิ่มเวร"}
                            </button>
                        </div>
                    </form>

                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-[#2B54F0]" />
                            <h2 className="text-sm font-bold text-slate-800">เวรวันที่เลือก</h2>
                            <span className="text-xs text-slate-400">({shifts.length})</span>
                        </div>
                        {loading ? (
                            <div className="py-12 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                        ) : shifts.length === 0 ? (
                            <div className="py-12 text-center">
                                <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-2">
                                    <Stethoscope className="h-6 w-6 text-slate-300" />
                                </div>
                                <p className="text-sm font-semibold text-slate-600">ยังไม่มีเวรในวันนี้</p>
                                <p className="text-xs text-slate-400 mt-0.5">เพิ่มเวรจากฟอร์มด้านบน</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {shifts.map((s) => {
                                    const tn = tone((staff.find((x) => x.id === s.doctor_staff_id)?.role) || "");
                                    return (
                                        <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors group">
                                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${tn.bg}`}>
                                                <Stethoscope className={`h-4 w-4 ${tn.text}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-slate-800 truncate">
                                                    {s.doctor_name}
                                                    <span className="text-[11px] font-normal text-slate-400 ml-1.5">· {hoursOf(s.start_time, s.end_time)} ชม.</span>
                                                </div>
                                                <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                                                    <span className="inline-flex items-center gap-1 font-mono"><Clock className="h-3 w-3" />{s.start_time}–{s.end_time}</span>
                                                    {s.room_name && <span className="inline-flex items-center gap-1"><DoorOpen className="h-3 w-3" />{s.room_name}</span>}
                                                    {s.note && <span className="text-slate-400">· {s.note}</span>}
                                                </div>
                                            </div>
                                            <button onClick={() => handleDelete(s.id)} title="ลบเวร" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="gonix-card-premium p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Copy className="h-4 w-4 text-[#2B54F0]" />
                            <span className="font-semibold">คัดลอกเวรวันนี้ไปยัง</span>
                        </div>
                        <input type="date" value={copyTo} onChange={(e) => setCopyTo(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                        <button onClick={handleCopy} disabled={copying || shifts.length === 0} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                            {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} คัดลอก
                        </button>
                        <span className="text-xs text-slate-400">ช่วยลดงานลงเวรซ้ำ</span>
                    </div>
                </>
            )}
        </div>
    );
}
