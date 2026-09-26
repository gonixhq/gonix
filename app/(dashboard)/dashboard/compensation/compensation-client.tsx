"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
    Wallet, Clock, LogIn, LogOut, Loader2, Download, Plus, CalendarClock, Trash2, ListChecks, Scale, Printer, BadgeCheck,
    ChevronLeft, ChevronRight, Users, Coins, HandCoins, AlertTriangle, Settings2, Undo2, X,
} from "lucide-react";
import {
    getStaffCompensation, setStaffPay, getMyTimeStatus, clockIn, clockOut, addManualTimeLog,
    getTimeLogsForDate, deleteTimeLog, getPlanVsActual, getMonthlyAttendance,
    recordCompensationPayout, payAllForMonth, deleteCompensationPayout,
    type CompRow, type MyTimeStatus, type TimeLogRow, type AttendanceRow, type MonthlyAttendanceRow,
} from "@/lib/actions/compensation";
import { type ScheduleStaff } from "@/lib/actions/doctor-shifts";
import { bangkokDate } from "@/lib/utils/date";
import { toast } from "@/lib/toast";

const ROLE_LABEL: Record<string, string> = {
    owner: "เจ้าของ", admin: "แอดมิน", doctor: "แพทย์", dentist: "ทันตแพทย์",
    nurse: "พยาบาล", pharmacist: "เภสัชกร", physio: "กายภาพ", receptionist: "ต้อนรับ",
    accountant: "บัญชี", assistant: "ผู้ช่วย", staff: "พนักงาน",
};
const roleLabel = (r: string) => ROLE_LABEL[r] || r || "พนักงาน";
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const bahtShort = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
const monthLabel = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" }); };
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
const shiftDay = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

type Tab = "pay" | "time" | "setup";

function Pill({ tone, children }: { tone: "red" | "amber" | "green" | "cyan" | "slate" | "blue"; children: React.ReactNode }) {
    const map = {
        red: "bg-red-100 text-red-700", amber: "bg-amber-100 text-amber-700", green: "bg-emerald-100 text-emerald-700",
        cyan: "bg-[#00FFCC]/15 text-[#0EA5A0]", slate: "bg-slate-100 text-slate-500", blue: "bg-blue-100 text-blue-700",
    };
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${map[tone]}`}>{children}</span>;
}

function Stat({ icon: Icon, label, value, sub, tone = "slate" }: { icon: React.ElementType; label: string; value: string; sub?: React.ReactNode; tone?: "slate" | "green" | "blue" | "violet" }) {
    const c = { slate: "bg-slate-100 text-slate-600", green: "bg-emerald-100 text-emerald-600", blue: "bg-blue-100 text-blue-600", violet: "bg-violet-100 text-violet-600" }[tone];
    return (
        <div className="gonix-card-premium p-4 flex items-start gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${c}`}><Icon className="h-5 w-5" /></div>
            <div className="min-w-0">
                <div className="text-xs text-slate-500 font-semibold">{label}</div>
                <div className="text-xl font-black tabular-nums text-slate-800 leading-tight">{value}</div>
                {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
            </div>
        </div>
    );
}

export default function CompensationClient({
    initialMonth, initialRows, staff,
}: {
    initialMonth: string;
    initialRows: CompRow[];
    staff: ScheduleStaff[];
}) {
    const [tab, setTab] = useState<Tab>("pay");
    const [month, setMonth] = useState(initialMonth);
    const [rows, setRows] = useState<CompRow[]>(initialRows);
    const [loading, setLoading] = useState(false);
    const [payingId, setPayingId] = useState<string | null>(null);
    const [payingAll, setPayingAll] = useState(false);
    const [payTarget, setPayTarget] = useState<CompRow | null>(null);

    // ตอกบัตรตัวเอง
    const [status, setStatus] = useState<MyTimeStatus | null>(null);
    const [clocking, setClocking] = useState(false);

    // เวลาทำงาน
    const [day, setDay] = useState(initialMonth === bangkokDate().slice(0, 7) ? bangkokDate() : `${initialMonth}-01`);
    const [mStaff, setMStaff] = useState(staff[0]?.id || "");
    const [mStart, setMStart] = useState("09:00");
    const [mEnd, setMEnd] = useState("17:00");
    const [mSaving, setMSaving] = useState(false);
    const [logs, setLogs] = useState<TimeLogRow[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [attMode, setAttMode] = useState<"day" | "month">("day");
    const [monthly, setMonthly] = useState<MonthlyAttendanceRow[]>([]);
    const [monthlyLoading, setMonthlyLoading] = useState(false);

    const reload = useCallback(async (m: string) => {
        setLoading(true);
        try { setRows(await getStaffCompensation(m)); }
        catch (e) { toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
        finally { setLoading(false); }
    }, []);
    const loadLogs = useCallback(async (d: string) => {
        setLogsLoading(true);
        try {
            const [lg, att] = await Promise.all([getTimeLogsForDate(d), getPlanVsActual(d)]);
            setLogs(lg); setAttendance(att);
        } finally { setLogsLoading(false); }
    }, []);
    const loadMonthly = useCallback(async (mo: string) => {
        setMonthlyLoading(true);
        try { setMonthly(await getMonthlyAttendance(mo)); }
        finally { setMonthlyLoading(false); }
    }, []);

    useEffect(() => { if (month !== initialMonth) reload(month); }, [month, initialMonth, reload]);
    useEffect(() => { getMyTimeStatus().then(setStatus).catch(() => setStatus(null)); }, []);
    useEffect(() => { if (tab === "time") loadLogs(day); }, [tab, day, loadLogs]);
    useEffect(() => { if (tab === "time" && attMode === "month") loadMonthly(month); }, [tab, attMode, month, loadMonthly]);

    async function run(fn: () => Promise<unknown>, ok?: string) {
        try { await fn(); if (ok) toast.success(ok); await reload(month); }
        catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); }
    }

    async function handleClock() {
        if (!status?.hasStaff) return;
        setClocking(true);
        try {
            if (status.open) await clockOut(); else await clockIn();
            setStatus(await getMyTimeStatus());
            await reload(month);
            if (tab === "time") await loadLogs(day);
        } catch (e) { toast.error(e instanceof Error ? e.message : "ตอกบัตรไม่สำเร็จ"); }
        finally { setClocking(false); }
    }

    async function handleAmountSave(r: CompRow, value: string) {
        const n = Number(value);
        if (isNaN(n) || n < 0) return;
        if (r.pay_type === "monthly") { if (r.monthly_salary === n) return; await run(() => setStaffPay(r.staff_id, { monthly_salary: n }), "บันทึกเงินเดือนแล้ว"); }
        else { if (r.hourly_rate === n && r.rate_source === "staff") return; await run(() => setStaffPay(r.staff_id, { hourly_rate: n }), "บันทึกค่าจ้าง/ชม. แล้ว"); }
    }

    async function handleManualAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!mStaff) { toast.error("เลือกพนักงานก่อน"); return; }
        if (mEnd <= mStart) { toast.error("เวลาออกต้องหลังเวลาเข้า"); return; }
        setMSaving(true);
        try {
            await addManualTimeLog({ staff_id: mStaff, work_date: day, start_time: mStart, end_time: mEnd });
            toast.success("บันทึกเวลาแล้ว");
            await Promise.all([reload(month), loadLogs(day)]);
        } catch (err) { toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
        finally { setMSaving(false); }
    }

    async function handleDeleteLog(id: string) {
        if (!confirm("ลบเวลาที่บันทึกนี้?")) return;
        await deleteTimeLog(id);
        setLogs((prev) => prev.filter((l) => l.id !== id));
        await reload(month);
    }

    async function confirmPay(r: CompRow, adj: number, other: number) {
        setPayingId(r.staff_id);
        try {
            await recordCompensationPayout(r.staff_id, month, { adjustment: adj, other_deduction: other });
            toast.success(`บันทึกจ่าย ${r.name} แล้ว`);
            setPayTarget(null);
            await reload(month);
        } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกจ่ายไม่สำเร็จ"); }
        finally { setPayingId(null); }
    }

    async function handleUndoPay(r: CompRow) {
        if (!confirm(`ยกเลิกการจ่ายของ ${r.name}?`)) return;
        setPayingId(r.staff_id);
        try { await deleteCompensationPayout(r.staff_id, month); await reload(month); }
        catch (e) { toast.error(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ"); }
        finally { setPayingId(null); }
    }

    async function handlePayAll() {
        const pending = rows.filter(r => !r.is_paid && (r.total > 0 || r.df_carry_out < 0));
        if (pending.length === 0) { toast.error("ไม่มีรายการที่ต้องปิดยอด"); return; }
        if (!confirm(`ปิดยอด ${monthLabel(month)}\nบันทึกจ่าย ${pending.length} คน ยอดสุทธิรวม ${baht(pending.reduce((s, r) => s + r.net, 0))}?`)) return;
        setPayingAll(true);
        try {
            const res = await payAllForMonth(month);
            toast.success(`ปิดยอดแล้ว ${res.count ?? 0} คน`);
            await reload(month);
        } catch (e) { toast.error(e instanceof Error ? e.message : "ปิดยอดไม่สำเร็จ"); }
        finally { setPayingAll(false); }
    }

    function exportCSV() {
        const header = ["พนักงาน", "ตำแหน่ง", "ประเภท", "อัตรา", "ชม.แผน", "ชม.จริง", "ชม.คิดเงิน", "ค่าจ้าง", "DF/คอม", "คอมทีม", "ก่อนหัก", "หัก 3%", "ปกส.", "หักอื่น", "สุทธิ", "สถานะ"];
        const lines = rows.map((r) => [
            r.name, roleLabel(r.role), r.pay_type === "monthly" ? "เงินเดือน" : "รายชม.", r.pay_type === "monthly" ? r.monthly_salary : r.hourly_rate,
            r.planned_hours, r.actual_hours, r.pay_hours, r.time_pay, r.df, r.team_comm, r.total, r.wht, r.sso, r.other_deduction, r.net, r.is_paid ? "จ่ายแล้ว" : "ยังไม่จ่าย",
        ].join(","));
        const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `compensation_${month}.csv`; a.click();
    }

    const sum = useMemo(() => rows.reduce((a, r) => ({
        time: a.time + r.time_pay, df: a.df + r.df + r.team_comm, pending: a.pending + r.df_pending,
        net: a.net + r.net, paid: a.paid + (r.is_paid ? 1 : 0), payable: a.payable + (r.total > 0 ? 1 : 0),
    }), { time: 0, df: 0, pending: 0, net: 0, paid: 0, payable: 0 }), [rows]);

    // สิ่งที่ควรจัดการก่อนปิดยอด
    const noRate = rows.filter(r => r.pay_type === "hourly" && r.hourly_rate === 0);
    const noHours = rows.filter(r => r.pay_type === "hourly" && r.hourly_rate > 0 && r.pay_hours === 0);
    const pendingDf = rows.filter(r => r.df_pending > 0);
    const allPaid = rows.length > 0 && rows.every(r => r.is_paid || (r.total <= 0 && r.df_carry_out >= 0));

    return (
        <div className="space-y-4 animate-fade-in max-w-6xl mx-auto pb-10">
            {/* ── Header ── */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 pt-1">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-2xl flex items-center justify-center bg-[#10B981]/10 shrink-0"><Wallet className="h-5 w-5 text-[#10B981]" /></div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-black text-slate-800 tracking-tight leading-tight">ค่าตอบแทนพนักงาน</h1>
                        <p className="text-xs text-slate-500">ค่าจ้างตามเวลา + DF/คอม + คอมทีม → หักภาษี/ปกส. → จ่ายสุทธิ</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center gap-1 rounded-xl bg-white border border-slate-200 p-1">
                        <button onClick={() => setMonth(shiftMonth(month, -1))} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center" aria-label="เดือนก่อน"><ChevronLeft className="h-4 w-4" /></button>
                        <span className="px-2 text-sm font-bold text-slate-700 min-w-[130px] text-center">{monthLabel(month)}</span>
                        <button onClick={() => setMonth(shiftMonth(month, 1))} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center" aria-label="เดือนถัดไป"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                    <button onClick={exportCSV} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
                        <Download className="h-4 w-4" /> CSV
                    </button>
                    <button onClick={handlePayAll} disabled={payingAll || allPaid}
                        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-50"
                        style={{ background: "linear-gradient(90deg, #10B981, #0EA5A0)" }}>
                        {payingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} {allPaid ? "ปิดยอดครบแล้ว" : "ปิดยอดทั้งเดือน"}
                    </button>
                </div>
            </div>

            {/* ── ตอกบัตรของฉัน ── */}
            {status?.hasStaff && (
                <div className={`rounded-2xl px-4 py-2.5 flex items-center gap-3 flex-wrap border ${status.open ? "bg-emerald-50 border-emerald-200" : "bg-white/70 border-slate-200"}`}>
                    <Clock className={`h-4 w-4 ${status.open ? "text-emerald-600" : "text-slate-400"}`} />
                    <span className="text-sm text-slate-700 flex-1">
                        {status.open ? <>กำลังทำงาน — เข้างานเมื่อ <b>{fmtTime(status.open.clock_in)} น.</b></> : "ยังไม่ได้ตอกบัตรเข้างานวันนี้"}
                    </span>
                    <button onClick={handleClock} disabled={clocking}
                        className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white disabled:opacity-60 ${status.open ? "bg-red-500 hover:bg-red-600" : "bg-[#2B54F0] hover:bg-[#2344c8]"}`}>
                        {clocking ? <Loader2 className="h-4 w-4 animate-spin" /> : status.open ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                        {status.open ? "ตอกบัตรออก" : "ตอกบัตรเข้า"}
                    </button>
                </div>
            )}

            {/* ── สรุป ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat icon={Users} label="พนักงาน" value={`${rows.length} คน`} sub={`จ่ายแล้ว ${sum.paid}/${sum.payable} คน`} />
                <Stat icon={Clock} label="ค่าจ้างตามเวลา/เงินเดือน" value={bahtShort(sum.time)} tone="blue" />
                <Stat icon={HandCoins} label="DF / คอม (อนุมัติแล้ว)" value={bahtShort(sum.df)} tone="violet"
                    sub={sum.pending > 0 ? <Link href={`/dashboard/commissions?month=${month}`} className="text-amber-600 font-semibold hover:underline">+{bahtShort(sum.pending)} รออนุมัติ ›</Link> : "รวมคอมทีม"} />
                <Stat icon={Coins} label="ยอดจ่ายสุทธิ" value={bahtShort(sum.net)} tone="green" sub="หลังหักภาษี 3% / ปกส." />
            </div>

            {/* ── สิ่งที่ควรจัดการ ── */}
            {(noRate.length > 0 || noHours.length > 0 || pendingDf.length > 0) && (
                <div className="rounded-2xl bg-amber-50/80 border border-amber-200 px-4 py-3 space-y-1.5">
                    <div className="text-sm font-bold text-amber-900 inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> ตรวจก่อนปิดยอด</div>
                    {noRate.length > 0 && (
                        <div className="text-xs text-amber-800">• ยังไม่ตั้งค่าจ้าง/ชม.: {noRate.map(r => r.name).join(", ")} — <button onClick={() => setTab("setup")} className="underline font-semibold">ตั้งค่าค่าจ้าง</button></div>
                    )}
                    {noHours.length > 0 && (
                        <div className="text-xs text-amber-800">• ไม่มีเวลาทำงาน/เวรในเดือนนี้: {noHours.map(r => r.name).join(", ")} — <button onClick={() => setTab("time")} className="underline font-semibold">บันทึกเวลา</button></div>
                    )}
                    {pendingDf.length > 0 && (
                        <div className="text-xs text-amber-800">• DF/คอมรออนุมัติ {pendingDf.length} คน (ยังไม่นับเข้ายอดจ่าย) — <Link href={`/dashboard/commissions?month=${month}`} className="underline font-semibold">ไปอนุมัติ</Link></div>
                    )}
                </div>
            )}

            {/* ── Tabs ── */}
            <div className="inline-flex rounded-2xl bg-white/70 border border-slate-200/70 p-1 gap-1">
                {([["pay", "สรุปการจ่าย", Coins], ["time", "เวลาทำงาน", CalendarClock], ["setup", "ตั้งค่าค่าจ้าง", Settings2]] as const).map(([k, l, Icon]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold transition-all ${tab === k ? "bg-[#2B54F0] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}>
                        <Icon className="h-4 w-4" /> {l}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="gonix-card-premium py-16 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : tab === "pay" ? (
                /* ═══════ สรุปการจ่าย ═══════ */
                <div className="gonix-card-premium overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/70 text-[11px] font-bold text-slate-500">
                                <tr>
                                    <th className="text-left px-4 py-3">พนักงาน</th>
                                    <th className="text-right px-3 py-3">ค่าจ้าง</th>
                                    <th className="text-right px-3 py-3">DF / คอม</th>
                                    <th className="text-right px-3 py-3 hidden md:table-cell">รายการหัก</th>
                                    <th className="text-right px-3 py-3">สุทธิ</th>
                                    <th className="text-right px-4 py-3">สถานะ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => {
                                    const deduction = r.wht + r.sso + r.other_deduction;
                                    const dfAll = r.df + r.team_comm;
                                    return (
                                        <tr key={r.staff_id} className={`border-t border-slate-100 ${r.is_paid ? "bg-emerald-50/30" : "hover:bg-slate-50/50"}`}>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                                    {r.name}
                                                    {r.absent_days > 0 && <Pill tone="red">ขาด {r.absent_days} วัน</Pill>}
                                                </div>
                                                <div className="text-[11px] text-slate-400">{roleLabel(r.role)}</div>
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">
                                                <div className="font-semibold text-slate-700">{baht(r.time_pay)}</div>
                                                <div className="text-[10px] text-slate-400">
                                                    {r.pay_type === "monthly" ? "เงินเดือน" : r.hourly_rate === 0 ? <span className="text-amber-600">ยังไม่ตั้งอัตรา</span> : `${r.pay_hours} ชม. × ${bahtShort(r.hourly_rate)}${r.has_actual ? "" : " (ตามเวร)"}`}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">
                                                <div className={`font-semibold ${dfAll > 0 ? "text-violet-700" : "text-slate-300"}`}>{baht(dfAll)}</div>
                                                {r.team_comm > 0 && <div className="text-[10px] text-blue-700">รวมคอมทีม {bahtShort(r.team_comm)}</div>}
                                                {r.df_pending > 0 && <div className="text-[10px] text-amber-600 font-semibold">+{bahtShort(r.df_pending)} รออนุมัติ</div>}
                                                {r.df_carry_in < 0 && <div className="text-[10px] text-rose-600" title="คืนเงินเดือนก่อน">หักยกมา {bahtShort(r.df_carry_in)}</div>}
                                                {r.df_carry_out < 0 && <div className="text-[10px] text-rose-600" title="คอมไม่พอหัก">ยกไปเดือนหน้า {bahtShort(r.df_carry_out)}</div>}
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell">
                                                {deduction > 0 ? (
                                                    <>
                                                        <div className="text-rose-600">−{baht(deduction)}</div>
                                                        <div className="text-[10px] text-slate-400">
                                                            {[r.wht > 0 && `ภาษี ${bahtShort(r.wht)}`, r.sso > 0 && `ปกส. ${bahtShort(r.sso)}`, r.other_deduction > 0 && `อื่น ${bahtShort(r.other_deduction)}`].filter(Boolean).join(" · ")}
                                                        </div>
                                                    </>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">
                                                <div className="font-black text-[#10B981] text-base">{baht(r.net)}</div>
                                                {deduction > 0 && <div className="text-[10px] text-slate-400">ก่อนหัก {bahtShort(r.total)}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                {r.is_paid ? (
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <Pill tone="green">จ่ายแล้ว</Pill>
                                                        <a href={`/print/payslip/${month}/${r.staff_id}`} target="_blank" rel="noopener noreferrer" title="พิมพ์ใบจ่าย" className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-[#2B54F0] hover:bg-blue-50"><Printer className="h-3.5 w-3.5" /></a>
                                                        <button onClick={() => handleUndoPay(r)} disabled={payingId === r.staff_id} title="ยกเลิกการจ่าย" className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"><Undo2 className="h-3.5 w-3.5" /></button>
                                                    </div>
                                                ) : r.total > 0 || r.df_carry_out < 0 ? (
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <a href={`/print/payslip/${month}/${r.staff_id}`} target="_blank" rel="noopener noreferrer" title="ดูใบจ่าย" className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-slate-500 hover:bg-slate-100"><Printer className="h-3.5 w-3.5" /></a>
                                                        <button onClick={() => setPayTarget(r)} disabled={payingId === r.staff_id}
                                                            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-bold bg-[#10B981] text-white hover:bg-[#0e9f6e] disabled:opacity-50">
                                                            {payingId === r.staff_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />} จ่าย
                                                        </button>
                                                    </div>
                                                ) : <span className="text-xs text-slate-300">ไม่มียอด</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">ไม่มีข้อมูล</td></tr>}
                            </tbody>
                            {rows.length > 0 && (
                                <tfoot>
                                    <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold">
                                        <td className="px-4 py-3 text-slate-700">รวม</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-slate-700">{baht(sum.time)}</td>
                                        <td className="px-3 py-3 text-right tabular-nums text-violet-700">{baht(sum.df)}</td>
                                        <td className="px-3 py-3 hidden md:table-cell" />
                                        <td className="px-3 py-3 text-right tabular-nums text-[#10B981] font-black text-base">{baht(sum.net)}</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    <p className="text-[11px] text-slate-400 px-5 py-2.5 border-t border-slate-100">
                        ค่าจ้างรายชม. = ชม.จริง (ตอกบัตร/บันทึกเวลา) × อัตรา · ถ้าไม่มีเวลาจริงใช้ชม.ตามตารางเวร · DF/คอม นับเฉพาะที่อนุมัติแล้วใน <Link href={`/dashboard/commissions?month=${month}`} className="underline">หน้าคอมมิชชั่น</Link> · คอมทีมอนุมัติที่ <Link href={`/dashboard/finance/team-commission?month=${month}`} className="underline">หน้าคอมทีม</Link>
                    </p>
                </div>
            ) : tab === "setup" ? (
                /* ═══════ ตั้งค่าค่าจ้าง ═══════ */
                <div className="gonix-card-premium overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 text-xs text-slate-500">
                        ตั้งประเภทการจ่าย/อัตรา และรายการหักรายคน · พิมพ์แล้วคลิกนอกช่องเพื่อบันทึก · คนที่ปิดยอดเดือนนี้แล้วแก้การหักไม่ได้
                    </div>
                    <div className="divide-y divide-slate-100">
                        {rows.map((r) => (
                            <div key={r.staff_id} className="px-5 py-3.5 flex items-center gap-4 flex-wrap">
                                <div className="flex-1 min-w-[180px]">
                                    <div className="font-bold text-slate-800">{r.name}</div>
                                    <div className="text-[11px] text-slate-400">{roleLabel(r.role)}</div>
                                </div>
                                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                                    {(["hourly", "monthly"] as const).map(t => (
                                        <button key={t} onClick={() => r.pay_type !== t && run(() => setStaffPay(r.staff_id, { pay_type: t }), "เปลี่ยนประเภทแล้ว")}
                                            className={`h-8 px-3 rounded-md text-xs font-bold ${r.pay_type === t ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                                            {t === "hourly" ? "รายชั่วโมง" : "เงินเดือน"}
                                        </button>
                                    ))}
                                </div>
                                <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                                    <input key={`${r.staff_id}-${r.pay_type}-${r.hourly_rate}-${r.monthly_salary}`}
                                        type="number" min={0} step={r.pay_type === "monthly" ? 500 : 10}
                                        defaultValue={r.pay_type === "monthly" ? r.monthly_salary : (r.rate_source === "clinic" ? "" : r.hourly_rate)}
                                        placeholder={r.rate_source === "clinic" ? String(r.hourly_rate) : "0"}
                                        onBlur={(e) => e.target.value !== "" && handleAmountSave(r, e.target.value)}
                                        className={`w-28 h-9 rounded-lg border bg-white px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20 ${r.pay_type === "hourly" && r.hourly_rate === 0 ? "border-amber-400" : "border-slate-200"}`} />
                                    <span className="w-16">{r.pay_type === "monthly" ? "บาท/เดือน" : "บาท/ชม."}</span>
                                </label>
                                <div className="w-24 text-[11px]">
                                    {r.rate_source === "clinic" && <span className="text-blue-600" title="แพทย์ไม่ได้ตั้งเรทรายคน — ใช้ค่าชั่วโมงแพทย์ของคลินิก (อัตราการเงิน)">ใช้อัตราคลินิก</span>}
                                    {r.pay_type === "hourly" && r.hourly_rate === 0 && <span className="text-amber-600">ยังไม่ตั้งอัตรา</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer" title="หักภาษี ณ ที่จ่าย 3%">
                                        <input type="checkbox" checked={r.wht_enabled} disabled={r.is_paid} onChange={(e) => run(() => setStaffPay(r.staff_id, { wht_enabled: e.target.checked }))} className="h-4 w-4 accent-blue-600" /> หักภาษี 3%
                                    </label>
                                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer" title="ประกันสังคม 5% เพดาน 750">
                                        <input type="checkbox" checked={r.sso_enabled} disabled={r.is_paid} onChange={(e) => run(() => setStaffPay(r.staff_id, { sso_enabled: e.target.checked }))} className="h-4 w-4 accent-blue-600" /> ประกันสังคม
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-slate-400 px-5 py-2.5 border-t border-slate-100">แพทย์ที่ไม่ตั้งอัตรารายคน ใช้ค่าชั่วโมงแพทย์ของคลินิก (ตั้งที่ <Link href="/dashboard/settings/finance-rates" className="underline">อัตราการเงิน</Link>) · ประกันสังคม 5% สูงสุด ฿750/เดือน</p>
                </div>
            ) : (
                /* ═══════ เวลาทำงาน ═══════ */
                <div className="space-y-4">
                    <div className="gonix-card-premium p-4 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="inline-flex items-center gap-1 rounded-xl bg-slate-50 border border-slate-200 p-1">
                                <button onClick={() => setDay(shiftDay(day, -1))} className="h-8 w-8 rounded-lg hover:bg-white flex items-center justify-center" aria-label="วันก่อน"><ChevronLeft className="h-4 w-4" /></button>
                                <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-8 bg-transparent px-1 text-sm font-semibold text-slate-700" />
                                <button onClick={() => setDay(shiftDay(day, 1))} className="h-8 w-8 rounded-lg hover:bg-white flex items-center justify-center" aria-label="วันถัดไป"><ChevronRight className="h-4 w-4" /></button>
                            </div>
                            <span className="text-sm text-slate-500">{dayLabel(day)}</span>
                            <Link href="/dashboard/doctor-schedule" className="ml-auto text-xs text-blue-700 hover:underline">ตารางเวรแพทย์ + มาตามเวร ›</Link>
                        </div>
                        <form onSubmit={handleManualAdd} className="flex items-end gap-2 flex-wrap rounded-xl bg-slate-50 border border-slate-200 p-3">
                            <label className="text-xs text-slate-500 flex-1 min-w-[200px]">พนักงาน
                                <select value={mStaff} onChange={(e) => setMStaff(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
                                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {roleLabel(s.role)}</option>)}
                                </select>
                            </label>
                            <label className="text-xs text-slate-500">เข้า<input type="time" value={mStart} onChange={(e) => setMStart(e.target.value)} className="mt-1 block h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm" /></label>
                            <label className="text-xs text-slate-500">ออก<input type="time" value={mEnd} onChange={(e) => setMEnd(e.target.value)} className="mt-1 block h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm" /></label>
                            <button type="submit" disabled={mSaving} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-bold text-white bg-[#2B54F0] disabled:opacity-60">
                                {mSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} บันทึกเวลา
                            </button>
                        </form>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-4">
                        {/* บันทึกเวลาของวัน */}
                        <div className="gonix-card-premium overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                                <ListChecks className="h-4 w-4 text-[#2B54F0]" />
                                <h2 className="text-sm font-bold text-slate-800">เวลาเข้า-ออกงาน</h2>
                                <span className="text-xs text-slate-400">{logs.length} รายการ</span>
                            </div>
                            {logsLoading ? (
                                <div className="py-10 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                            ) : logs.length === 0 ? (
                                <div className="py-10 text-center text-sm text-slate-400">ยังไม่มีบันทึกเวลาในวันนี้</div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {logs.map((l) => (
                                        <div key={l.id} className="flex items-center gap-3 px-5 py-2.5">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-slate-800 truncate">{l.staff_name}</div>
                                                <div className="text-xs text-slate-500 flex items-center gap-2">
                                                    <span className="tabular-nums">{fmtTime(l.clock_in)} – {l.clock_out ? fmtTime(l.clock_out) : <span className="text-emerald-600 font-semibold">ยังไม่ออก</span>}</span>
                                                    <Pill tone={l.source === "clock" ? "cyan" : "slate"}>{l.source === "clock" ? "ตอกบัตร" : "กรอกเอง"}</Pill>
                                                </div>
                                            </div>
                                            <div className="text-sm font-bold tabular-nums text-slate-700">{l.hours != null ? `${l.hours} ชม.` : "—"}</div>
                                            <button onClick={() => handleDeleteLog(l.id)} title="ลบ" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* แผน vs จริง */}
                        <div className="gonix-card-premium overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                                <Scale className="h-4 w-4 text-[#2B54F0]" />
                                <h2 className="text-sm font-bold text-slate-800">เวร vs เวลาจริง</h2>
                                <div className="ml-auto inline-flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                                    <button onClick={() => setAttMode("day")} className={`h-7 px-2.5 rounded-md text-xs font-bold ${attMode === "day" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-500"}`}>วันนี้</button>
                                    <button onClick={() => setAttMode("month")} className={`h-7 px-2.5 rounded-md text-xs font-bold ${attMode === "month" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-500"}`}>ทั้งเดือน</button>
                                </div>
                            </div>
                            {attMode === "day" ? (
                                logsLoading ? <div className="py-10 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                                : attendance.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">ไม่มีเวร/บันทึกเวลาในวันนี้</div>
                                : (
                                    <div className="divide-y divide-slate-100">
                                        {attendance.map((r) => {
                                            const late = r.late_min >= 5, early = r.early_min >= 5;
                                            const ontime = !r.absent && !r.extra && !r.working && !late && !early && !!r.planned && !!r.actual;
                                            return (
                                                <div key={r.staff_id} className="flex items-center gap-3 px-5 py-2.5">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-bold text-slate-800 truncate">{r.name}</div>
                                                        <div className="text-xs text-slate-500 tabular-nums">เวร {r.planned ?? "—"} · จริง {r.actual ?? "—"}</div>
                                                    </div>
                                                    <div className="flex items-center gap-1 flex-wrap justify-end">
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
                            ) : monthlyLoading ? <div className="py-10 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                            : monthly.length === 0 ? <div className="py-10 text-center text-sm text-slate-400">ไม่มีข้อมูลในเดือนนี้</div>
                            : (
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/60 text-[11px] font-bold text-slate-500">
                                        <tr><th className="text-left px-4 py-2">พนักงาน</th><th className="px-2 py-2">เวร</th><th className="px-2 py-2">มา</th><th className="px-2 py-2">ขาด</th><th className="px-2 py-2">สาย</th><th className="text-right px-4 py-2">ชม.จริง</th></tr>
                                    </thead>
                                    <tbody>
                                        {monthly.map((r) => (
                                            <tr key={r.staff_id} className="border-t border-slate-100 text-center">
                                                <td className="px-4 py-2 text-left font-semibold text-slate-800">{r.name}</td>
                                                <td className="px-2 py-2 tabular-nums text-slate-500">{r.planned_days}</td>
                                                <td className="px-2 py-2 tabular-nums font-semibold">{r.worked_days}</td>
                                                <td className="px-2 py-2 tabular-nums">{r.absent_days > 0 ? <span className="text-red-600 font-bold">{r.absent_days}</span> : <span className="text-slate-300">0</span>}</td>
                                                <td className="px-2 py-2 tabular-nums">{r.late_days > 0 ? <span className="text-amber-600 font-bold" title={`รวม ${r.total_late_min} นาที`}>{r.late_days}</span> : <span className="text-slate-300">0</span>}</td>
                                                <td className="px-4 py-2 text-right tabular-nums font-bold">{r.actual_hours}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {payTarget && <PayModal row={payTarget} month={month} busy={payingId === payTarget.staff_id} onClose={() => setPayTarget(null)} onConfirm={confirmPay} />}
        </div>
    );
}

/** ยืนยันการจ่ายรายคน — ปรับยอด (+/−) และหักอื่นๆ (มาสาย/ขาด/เบิกล่วงหน้า) ก่อนบันทึก */
function PayModal({ row: r, month, busy, onClose, onConfirm }: {
    row: CompRow; month: string; busy: boolean; onClose: () => void; onConfirm: (r: CompRow, adj: number, other: number) => void;
}) {
    const [adj, setAdj] = useState("");
    const [other, setOther] = useState("");
    const a = Number(adj) || 0, o = Math.max(0, Number(other) || 0);
    const gross = r.total + a;
    const net = Math.round((gross - r.wht - r.sso - o) * 100) / 100;
    const line = (label: string, v: number, cls = "text-slate-700") => (
        <div className="flex justify-between text-sm py-1"><span className="text-slate-500">{label}</span><span className={`tabular-nums font-semibold ${cls}`}>{baht(v)}</span></div>
    );
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
                <div className="flex items-center mb-3">
                    <div className="flex-1">
                        <h2 className="text-base font-bold text-slate-800">บันทึกจ่าย · {r.name}</h2>
                        <p className="text-xs text-slate-500">{monthLabel(month)}</p>
                    </div>
                    <button onClick={onClose} aria-label="ปิด"><X className="h-4 w-4 text-slate-400" /></button>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-2 divide-y divide-slate-100">
                    {line("ค่าจ้างตามเวลา/เงินเดือน", r.time_pay)}
                    {line("DF / คอม", r.df, "text-violet-700")}
                    {r.team_comm > 0 && line("คอมทีม", r.team_comm, "text-blue-700")}
                    {a !== 0 && line("ปรับยอด", a, a < 0 ? "text-rose-600" : "text-emerald-700")}
                    {r.wht > 0 && line("หักภาษี ณ ที่จ่าย 3%", -r.wht, "text-rose-600")}
                    {r.sso > 0 && line("หักประกันสังคม", -r.sso, "text-rose-600")}
                    {o > 0 && line("หักอื่นๆ", -o, "text-rose-600")}
                    <div className="flex justify-between py-2"><span className="font-bold text-slate-800">จ่ายสุทธิ</span><span className="tabular-nums font-black text-lg text-[#10B981]">{baht(net)}</span></div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                    <label className="text-xs text-slate-500">ปรับยอด (+/−)
                        <input type="number" value={adj} onChange={e => setAdj(e.target.value)} placeholder="เช่น 500 โบนัส" className="mt-1 w-full h-9 rounded-lg border border-slate-200 px-2 text-sm text-right tabular-nums" />
                    </label>
                    <label className="text-xs text-slate-500">หักอื่นๆ (มาสาย/ขาด/เบิก)
                        <input type="number" min={0} value={other} onChange={e => setOther(e.target.value)} placeholder="0" className="mt-1 w-full h-9 rounded-lg border border-slate-200 px-2 text-sm text-right tabular-nums" />
                    </label>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">ภาษี 3% คิดจากยอดก่อนปรับ · ยืนยันแล้วยอดจะล็อก (ยกเลิกได้ภายหลัง)</p>
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="h-10 px-4 rounded-xl text-sm text-slate-600">ยกเลิก</button>
                    <button onClick={() => onConfirm(r, a, o)} disabled={busy}
                        className="h-10 px-5 rounded-xl text-sm font-bold text-white bg-[#10B981] hover:bg-[#0e9f6e] disabled:opacity-50 inline-flex items-center gap-1.5">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} ยืนยันจ่าย {baht(net)}
                    </button>
                </div>
            </div>
        </div>
    );
}
