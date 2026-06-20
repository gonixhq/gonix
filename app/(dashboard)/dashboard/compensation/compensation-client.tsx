"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Wallet, Clock, LogIn, LogOut, Loader2, Download, Plus, Coins, CalendarClock, Trash2, ListChecks, Scale, Printer, BadgeCheck,
} from "lucide-react";
import {
    getStaffCompensation, setStaffPay, getMyTimeStatus, clockIn, clockOut, addManualTimeLog,
    getTimeLogsForDate, deleteTimeLog, getPlanVsActual, getMonthlyAttendance,
    recordCompensationPayout, payAllForMonth, deleteCompensationPayout,
    type CompRow, type MyTimeStatus, type TimeLogRow, type AttendanceRow, type MonthlyAttendanceRow,
} from "@/lib/actions/compensation";
import { type ScheduleStaff } from "@/lib/actions/doctor-shifts";
import { bangkokDate } from "@/lib/utils/date";

const ROLE_LABEL: Record<string, string> = {
    owner: "เจ้าของ", admin: "แอดมิน", doctor: "แพทย์", dentist: "ทันตแพทย์",
    nurse: "พยาบาล", pharmacist: "เภสัชกร", physio: "กายภาพ", receptionist: "ต้อนรับ",
    accountant: "บัญชี", assistant: "ผู้ช่วย", staff: "พนักงาน",
};
const roleLabel = (r: string) => ROLE_LABEL[r] || r || "พนักงาน";
const baht = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
const monthLabel = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
};

function Pill({ tone, children }: { tone: "red" | "amber" | "green" | "cyan" | "slate"; children: React.ReactNode }) {
    const map = {
        red: "bg-red-100 text-red-700",
        amber: "bg-amber-100 text-amber-700",
        green: "bg-emerald-100 text-emerald-700",
        cyan: "bg-[#00FFCC]/15 text-[#0EA5A0]",
        slate: "bg-slate-100 text-slate-500",
    };
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${map[tone]}`}>{children}</span>;
}

export default function CompensationClient({
    initialMonth, initialRows, staff,
}: {
    initialMonth: string;
    initialRows: CompRow[];
    staff: ScheduleStaff[];
}) {
    const [month, setMonth] = useState(initialMonth);
    const [rows, setRows] = useState<CompRow[]>(initialRows);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [payingId, setPayingId] = useState<string | null>(null);
    const [payingAll, setPayingAll] = useState(false);
    const [adjustMap, setAdjustMap] = useState<Record<string, string>>({});

    // self clock
    const [status, setStatus] = useState<MyTimeStatus | null>(null);
    const [clocking, setClocking] = useState(false);

    // manual entry
    const [mStaff, setMStaff] = useState(staff[0]?.id || "");
    const [mDate, setMDate] = useState(initialMonth + "-" + bangkokDate().slice(8, 10));
    const [mStart, setMStart] = useState("09:00");
    const [mEnd, setMEnd] = useState("17:00");
    const [mSaving, setMSaving] = useState(false);

    // บันทึกเวลาตอกบัตร + เทียบแผน-จริง ของวัน mDate
    const [logs, setLogs] = useState<TimeLogRow[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);

    // เทียบแผน-จริง: โหมดรายวัน/รายเดือน
    const [attMode, setAttMode] = useState<"day" | "month">("day");
    const [monthly, setMonthly] = useState<MonthlyAttendanceRow[]>([]);
    const [monthlyLoading, setMonthlyLoading] = useState(false);
    const loadMonthly = useCallback(async (mo: string) => {
        setMonthlyLoading(true);
        try { setMonthly(await getMonthlyAttendance(mo)); }
        finally { setMonthlyLoading(false); }
    }, []);

    const reload = useCallback(async (m: string) => {
        setLoading(true);
        try { setRows(await getStaffCompensation(m)); }
        finally { setLoading(false); }
    }, []);

    const loadLogs = useCallback(async (d: string) => {
        setLogsLoading(true);
        try {
            const [lg, att] = await Promise.all([getTimeLogsForDate(d), getPlanVsActual(d)]);
            setLogs(lg);
            setAttendance(att);
        } finally { setLogsLoading(false); }
    }, []);

    useEffect(() => { if (month !== initialMonth) reload(month); }, [month, initialMonth, reload]);
    useEffect(() => { getMyTimeStatus().then(setStatus).catch(() => setStatus(null)); }, []);
    useEffect(() => { loadLogs(mDate); }, [mDate, loadLogs]);
    useEffect(() => { if (attMode === "month") loadMonthly(month); }, [attMode, month, loadMonthly]);

    async function handleClock() {
        if (!status?.hasStaff) return;
        setClocking(true);
        try {
            if (status.open) await clockOut(); else await clockIn();
            setStatus(await getMyTimeStatus());
            await reload(month);
            await loadLogs(mDate);
        } finally { setClocking(false); }
    }

    async function handleTypeChange(staffId: string, payType: string) {
        try {
            await setStaffPay(staffId, { pay_type: payType });
            await reload(month);
        } catch (e) { setError(e instanceof Error ? e.message : "เปลี่ยนประเภทไม่สำเร็จ"); }
    }

    async function handleAmountSave(staffId: string, payType: string, value: string) {
        const n = Number(value);
        if (isNaN(n) || n < 0) return;
        const row = rows.find((r) => r.staff_id === staffId);
        if (payType === "monthly") {
            if (row && row.monthly_salary === n) return;
            try { await setStaffPay(staffId, { monthly_salary: n }); await reload(month); }
            catch (e) { setError(e instanceof Error ? e.message : "บันทึกเงินเดือนไม่สำเร็จ"); }
        } else {
            if (row && row.hourly_rate === n) return;
            try { await setStaffPay(staffId, { hourly_rate: n }); await reload(month); }
            catch (e) { setError(e instanceof Error ? e.message : "บันทึกเรทไม่สำเร็จ"); }
        }
    }

    async function handleManualAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!mStaff) { setError("เลือกพนักงานก่อน"); return; }
        if (mEnd <= mStart) { setError("เวลาออกต้องหลังเวลาเข้า"); return; }
        setMSaving(true);
        setError("");
        try {
            await addManualTimeLog({ staff_id: mStaff, work_date: mDate, start_time: mStart, end_time: mEnd });
            await reload(month);
            await loadLogs(mDate);
        } catch (err) {
            setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
        } finally { setMSaving(false); }
    }

    async function handleDeleteLog(id: string) {
        await deleteTimeLog(id);
        setLogs((prev) => prev.filter((l) => l.id !== id));
        await reload(month);
    }

    async function handlePay(staffId: string) {
        setPayingId(staffId);
        setError("");
        try {
            const adj = Number(adjustMap[staffId] || 0);
            await recordCompensationPayout(staffId, month, { adjustment: isNaN(adj) ? 0 : adj });
            setAdjustMap((m) => { const n = { ...m }; delete n[staffId]; return n; });
            await reload(month);
        } catch (e) { setError(e instanceof Error ? e.message : "บันทึกจ่ายไม่สำเร็จ"); }
        finally { setPayingId(null); }
    }

    async function handleUndoPay(staffId: string) {
        setPayingId(staffId);
        try { await deleteCompensationPayout(staffId, month); await reload(month); }
        catch (e) { setError(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ"); }
        finally { setPayingId(null); }
    }

    async function handlePayAll() {
        if (!confirm("บันทึกจ่ายค่าตอบแทนทุกคนที่ยังไม่จ่ายในเดือนนี้?")) return;
        setPayingAll(true);
        setError("");
        try {
            const res = await payAllForMonth(month);
            await reload(month);
            alert(`บันทึกจ่าย ${res.count ?? 0} รายการแล้ว`);
        } catch (e) { setError(e instanceof Error ? e.message : "ปิดยอดไม่สำเร็จ"); }
        finally { setPayingAll(false); }
    }

    function exportCSV() {
        const header = ["พนักงาน", "ตำแหน่ง", "ประเภท", "อัตรา", "ชม.แผน", "ชม.จริง", "ชม.คิดเงิน", "ค่าจ้าง", "DF", "รวม"];
        const lines = rows.map((r) => {
            const typeLabel = r.pay_type === "monthly" ? "เงินเดือน" : "รายชม.";
            const amount = r.pay_type === "monthly" ? r.monthly_salary : r.hourly_rate;
            return [r.name, roleLabel(r.role), typeLabel, amount, r.planned_hours, r.actual_hours, r.pay_hours, r.time_pay, r.df, r.total].join(",");
        });
        const csv = "﻿" + [header.join(","), ...lines].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `compensation_${month}.csv`; a.click();
        URL.revokeObjectURL(url);
    }

    const totals = rows.reduce((acc, r) => ({ time: acc.time + r.time_pay, df: acc.df + r.df, total: acc.total + r.total }), { time: 0, df: 0, total: 0 });

    return (
        <div className="space-y-5 animate-fade-in max-w-6xl mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-2xl flex items-center justify-center bg-[#10B981]/10">
                        <Wallet className="h-5 w-5 text-[#10B981]" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight leading-tight">ค่าตอบแทนพนักงาน</h1>
                        <p className="text-xs text-slate-500">{monthLabel(month)} · ค่าจ้าง + DF รวมยอด</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {status?.hasStaff && (
                        <button onClick={handleClock} disabled={clocking}
                            className={`inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-60 ${status.open ? "bg-red-500 hover:bg-red-600" : ""}`}
                            style={status.open ? undefined : { background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                            {clocking ? <Loader2 className="h-4 w-4 animate-spin" /> : status.open ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                            {status.open ? "ตอกบัตรออก" : "ตอกบัตรเข้า"}
                        </button>
                    )}
                    <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                    <button onClick={exportCSV} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
                        <Download className="h-4 w-4" /> CSV
                    </button>
                    <button onClick={handlePayAll} disabled={payingAll}
                        className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-60"
                        style={{ background: "linear-gradient(90deg, #10B981, #0EA5A0)" }}>
                        {payingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} ปิดยอดทั้งเดือน
                    </button>
                </div>
            </div>

            {status && !status.hasStaff && (
                <div className="rounded-xl px-4 py-2 text-xs bg-slate-50 border border-slate-200 text-slate-500">บัญชีนี้ไม่ได้ผูกกับข้อมูลพนักงาน จึงตอกบัตรไม่ได้</div>
            )}
            {status?.open && (
                <div className="rounded-xl px-4 py-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> กำลังทำงาน — ตอกบัตรเข้าเมื่อ {new Date(status.open.clock_in).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
                </div>
            )}
            {error && <div className="rounded-xl px-4 py-2.5 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>}

            {/* Summary table */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2">
                    <Coins className="h-4 w-4 text-[#10B981]" />
                    <h2 className="text-sm font-bold text-slate-800">สรุปค่าตอบแทน</h2>
                    <span className="text-xs text-slate-400">({rows.length} คน)</span>
                </div>
                {loading ? (
                    <div className="py-12 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60">
                                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    <th className="text-left px-4 py-2.5">พนักงาน</th>
                                    <th className="text-right px-3 py-2.5">อัตราจ้าง</th>
                                    <th className="text-right px-3 py-2.5 hidden sm:table-cell">ชม.แผน</th>
                                    <th className="text-right px-3 py-2.5">ชม.จริง</th>
                                    <th className="text-right px-3 py-2.5">ค่าจ้าง</th>
                                    <th className="text-right px-3 py-2.5 hidden sm:table-cell">DF</th>
                                    <th className="text-right px-4 py-2.5">รวม</th>
                                    <th className="text-center px-3 py-2.5">สถานะ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.staff_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                                        <td className="px-4 py-2.5">
                                            <div className="font-bold text-slate-800 flex items-center gap-2">
                                                {r.name}
                                                {r.absent_days > 0 && (
                                                    <span className="text-[10px] font-bold text-red-600 bg-red-50 rounded-full px-1.5 py-0.5">ขาด {r.absent_days} วัน</span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                                {roleLabel(r.role)}
                                                <a href={`/print/payslip/${month}/${r.staff_id}`} target="_blank" rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-0.5 text-[#2B54F0] hover:underline font-semibold">
                                                    <Printer className="h-3 w-3" /> ใบจ่าย
                                                </a>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <select
                                                    value={r.pay_type}
                                                    onChange={(e) => handleTypeChange(r.staff_id, e.target.value)}
                                                    className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20"
                                                >
                                                    <option value="hourly">/ชม.</option>
                                                    <option value="monthly">/เดือน</option>
                                                </select>
                                                <input
                                                    key={`${r.staff_id}-${r.pay_type}`}
                                                    type="number" min={0} step={r.pay_type === "monthly" ? 500 : 10}
                                                    defaultValue={r.pay_type === "monthly" ? r.monthly_salary : r.hourly_rate}
                                                    onBlur={(e) => handleAmountSave(r.staff_id, r.pay_type, e.target.value)}
                                                    className="w-24 h-8 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20"
                                                />
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 hidden sm:table-cell">{r.planned_hours}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums">
                                            <span className={r.has_actual ? "text-slate-800 font-semibold" : "text-slate-300"}>{r.has_actual ? r.actual_hours : "—"}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-700">{baht(r.time_pay)}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 hidden sm:table-cell">{baht(r.df)}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums font-black text-[#10B981]">
                                            {baht(r.total + (r.is_paid ? 0 : Number(adjustMap[r.staff_id] || 0)))}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            {r.is_paid ? (
                                                <div className="inline-flex items-center gap-1.5">
                                                    <Pill tone="green">จ่ายแล้ว</Pill>
                                                    <button onClick={() => handleUndoPay(r.staff_id)} disabled={payingId === r.staff_id} title="ยกเลิกการจ่าย" className="text-[10px] text-slate-400 hover:text-red-500">ยกเลิก</button>
                                                </div>
                                            ) : r.total > 0 ? (
                                                <div className="inline-flex items-center gap-1">
                                                    <input
                                                        type="number" value={adjustMap[r.staff_id] ?? ""}
                                                        onChange={(e) => setAdjustMap((m) => ({ ...m, [r.staff_id]: e.target.value }))}
                                                        placeholder="ปรับ" title="ปรับยอด +/- เช่น -500 หักขาดงาน"
                                                        className="w-14 h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-right text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20"
                                                    />
                                                    <button onClick={() => handlePay(r.staff_id)} disabled={payingId === r.staff_id}
                                                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 disabled:opacity-50">
                                                        {payingId === r.staff_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <BadgeCheck className="h-3 w-3" />} จ่าย
                                                    </button>
                                                </div>
                                            ) : <span className="text-slate-300 text-xs">—</span>}
                                        </td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">ไม่มีข้อมูล</td></tr>
                                )}
                            </tbody>
                            {rows.length > 0 && (
                                <tfoot>
                                    <tr className="border-t-2 border-slate-200 bg-slate-50/40 font-bold">
                                        <td className="px-4 py-2.5 text-slate-700" colSpan={4}>รวมทั้งหมด</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{baht(totals.time)}</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 hidden sm:table-cell">{baht(totals.df)}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-[#10B981] font-black">{baht(totals.total)}</td>
                                        <td className="px-3 py-2.5" />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
                <p className="text-[11px] text-slate-400 px-5 py-2 border-t border-slate-100">
                    * ค่าจ้าง: รายชม. = (ชม.จริงถ้ามีตอกบัตร ไม่งั้นใช้ ชม.แผนจากตารางเวร) × เรท · เงินเดือน = เหมาจ่ายคงที่ — เลือกประเภท/อัตราในช่อง &quot;อัตราจ้าง&quot;
                </p>
            </div>

            {/* Manual time entry */}
            <form onSubmit={handleManualAdd} className="gonix-card-premium p-4">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" /> กรอกเวลาทำงานจริง (กรณีไม่ได้ตอกบัตร)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    <div className="lg:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-500">พนักงาน</label>
                        <select value={mStaff} onChange={(e) => setMStaff(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20">
                            {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {roleLabel(s.role)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] font-semibold text-slate-500">วันที่</label>
                        <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                    </div>
                    <div>
                        <label className="text-[11px] font-semibold text-slate-500">เข้า</label>
                        <input type="time" value={mStart} onChange={(e) => setMStart(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                    </div>
                    <div>
                        <label className="text-[11px] font-semibold text-slate-500">ออก</label>
                        <input type="time" value={mEnd} onChange={(e) => setMEnd(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20" />
                    </div>
                </div>
                <div className="mt-2.5">
                    <button type="submit" disabled={mSaving} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-60" style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                        {mSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} บันทึกเวลา
                    </button>
                </div>
            </form>

            {/* บันทึกเวลาตอกบัตร (ของวัน mDate) */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-[#2B54F0]" />
                    <h2 className="text-sm font-bold text-slate-800">บันทึกเวลาตอกบัตร</h2>
                    <span className="text-xs text-slate-400">{mDate} · {logs.length} รายการ</span>
                </div>
                {logsLoading ? (
                    <div className="py-10 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : logs.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีบันทึกเวลาในวันนี้</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {logs.map((l) => (
                            <div key={l.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                                <div className="h-9 w-9 rounded-xl bg-[#2B54F0]/10 flex items-center justify-center shrink-0">
                                    <Clock className="h-4 w-4 text-[#2B54F0]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-slate-800 truncate">{l.staff_name}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                                        <span className="font-mono">
                                            {fmtTime(l.clock_in)} – {l.clock_out ? fmtTime(l.clock_out) : <span className="text-emerald-600 font-semibold">ยังไม่ออก</span>}
                                        </span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${l.source === "clock" ? "bg-[#00FFCC]/15 text-[#0EA5A0]" : "bg-slate-100 text-slate-500"}`}>
                                            {l.source === "clock" ? "ตอกบัตร" : "กรอกเอง"}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-sm font-bold tabular-nums text-slate-700 shrink-0">{l.hours != null ? `${l.hours} ชม.` : "—"}</div>
                                <button onClick={() => handleDeleteLog(l.id)} title="ลบ" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* เทียบแผน vs จริง */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2">
                    <Scale className="h-4 w-4 text-[#2B54F0]" />
                    <h2 className="text-sm font-bold text-slate-800">เทียบแผน vs จริง</h2>
                    <span className="text-xs text-slate-400">{attMode === "day" ? mDate : monthLabel(month)}</span>
                    <div className="ml-auto inline-flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                        <button onClick={() => setAttMode("day")} className={`h-7 px-2.5 rounded-md text-xs font-bold ${attMode === "day" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-500"}`}>รายวัน</button>
                        <button onClick={() => setAttMode("month")} className={`h-7 px-2.5 rounded-md text-xs font-bold ${attMode === "month" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-500"}`}>รายเดือน</button>
                    </div>
                </div>

                {attMode === "day" ? (
                    logsLoading ? (
                        <div className="py-10 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                    ) : attendance.length === 0 ? (
                        <div className="py-10 text-center text-sm text-slate-400">ไม่มีเวร/บันทึกเวลาในวันนี้</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {attendance.map((r) => {
                                const late = r.late_min >= 5;
                                const early = r.early_min >= 5;
                                const ontime = !r.absent && !r.extra && !r.working && !late && !early && !!r.planned && !!r.actual;
                                return (
                                    <div key={r.staff_id} className="flex items-center gap-3 px-5 py-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-slate-800 truncate">
                                                {r.name} <span className="text-[11px] font-normal text-slate-400">· {roleLabel(r.role)}</span>
                                            </div>
                                            <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                                                <span>แผน: <span className="font-mono">{r.planned ?? "—"}</span></span>
                                                <span className="text-slate-300">|</span>
                                                <span>จริง: <span className="font-mono">{r.actual ?? "—"}</span></span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                            {r.absent && <Pill tone="red">ขาดงาน</Pill>}
                                            {r.extra && <Pill tone="slate">นอกเวร</Pill>}
                                            {r.working && <Pill tone="cyan">กำลังทำงาน</Pill>}
                                            {late && <Pill tone="amber">สาย {r.late_min} น.</Pill>}
                                            {early && <Pill tone="amber">ออกก่อน {r.early_min} น.</Pill>}
                                            {ontime && <Pill tone="green">ตรงเวลา</Pill>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    monthlyLoading ? (
                        <div className="py-10 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                    ) : monthly.length === 0 ? (
                        <div className="py-10 text-center text-sm text-slate-400">ไม่มีข้อมูลในเดือนนี้</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/60">
                                    <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        <th className="text-left px-4 py-2.5">พนักงาน</th>
                                        <th className="text-center px-3 py-2.5">เข้าเวร</th>
                                        <th className="text-center px-3 py-2.5">มาทำงาน</th>
                                        <th className="text-center px-3 py-2.5">ขาด</th>
                                        <th className="text-center px-3 py-2.5">สาย</th>
                                        <th className="text-right px-4 py-2.5">ชม.จริง</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {monthly.map((r) => (
                                        <tr key={r.staff_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                                            <td className="px-4 py-2.5">
                                                <div className="font-bold text-slate-800">{r.name}</div>
                                                <div className="text-[11px] text-slate-400">{roleLabel(r.role)}</div>
                                            </td>
                                            <td className="px-3 py-2.5 text-center tabular-nums text-slate-500">{r.planned_days}</td>
                                            <td className="px-3 py-2.5 text-center tabular-nums font-semibold text-slate-700">{r.worked_days}</td>
                                            <td className="px-3 py-2.5 text-center tabular-nums">
                                                {r.absent_days > 0 ? <span className="text-red-600 font-bold">{r.absent_days}</span> : <span className="text-slate-300">0</span>}
                                            </td>
                                            <td className="px-3 py-2.5 text-center tabular-nums">
                                                {r.late_days > 0 ? <span className="text-amber-600 font-bold" title={`รวม ${r.total_late_min} นาที`}>{r.late_days}</span> : <span className="text-slate-300">0</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-700">{r.actual_hours}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
