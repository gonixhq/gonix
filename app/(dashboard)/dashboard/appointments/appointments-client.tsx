"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Clock, ChevronLeft, ChevronRight, Plus, CheckCircle, XCircle, RefreshCw,
    Calendar as CalIcon, CalendarDays, LayoutGrid, Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { bangkokDate } from "@/lib/utils/date";
import NewAppointmentModal from "./new-appointment-modal";
import AppointmentDetailModal from "./appointment-detail-modal";
import { updateAppointmentStatus } from "@/lib/actions/appointments";
import { PermissionButton } from "@/components/ui/permission-button";

type ViewMode = "week" | "month" | "day";

const statusColors: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    cancelled: "bg-red-100 text-red-600 line-through opacity-60",
    completed: "bg-slate-100 text-slate-500",
    no_show: "bg-red-50 text-red-400",
};

const statusLabels: Record<string, string> = {
    confirmed: "ยืนยัน",
    pending: "รอยืนยัน",
    cancelled: "ยกเลิก",
    completed: "เสร็จสิ้น",
    no_show: "ไม่มา",
};

// Doctor color palette
const DOCTOR_COLORS = [
    { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-300", dot: "bg-violet-500" },
    { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-300", dot: "bg-cyan-500" },
    { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-300", dot: "bg-rose-500" },
    { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300", dot: "bg-amber-500" },
    { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300", dot: "bg-emerald-500" },
    { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-300", dot: "bg-cyan-500" },
];

const THAI_DAYS_SHORT = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

interface Doctor {
    id: string;
    profiles: { full_name: string } | { full_name: string }[];
}

interface Appointment {
    id: string;
    appt_date: string;
    appt_start: string | null;
    appt_end?: string | null;
    appt_type?: string | null;
    status: string;
    note?: string | null;
    doctor_id?: string | null;
    hn?: string | null;
    patients?: { first_name: string; last_name: string; phone?: string } | { first_name: string; last_name: string; phone?: string }[];
    doctor?: Doctor | Doctor[] | null;
}

export default function AppointmentsClient({
    appointments,
    view,
    baseDateISO,
    startISO,
    endISO,
    today,
    doctors,
}: {
    appointments: Appointment[];
    view: ViewMode;
    baseDateISO: string;
    startISO: string;
    endISO: string;
    today: string;
    doctors: Doctor[];
}) {
    const router = useRouter();
    const [showModal, setShowModal] = useState(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [localAppts, setLocalAppts] = useState(appointments);
    const [doctorFilter, setDoctorFilter] = useState<string>("all");
    const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);

    // sync local state เมื่อ server ส่งข้อมูลใหม่ (หลัง router.refresh จากการแก้ไข)
    useEffect(() => { setLocalAppts(appointments); }, [appointments]);

    const baseDate = new Date(baseDateISO + "T00:00:00");

    // Doctor color map
    const doctorColorMap = useMemo(() => {
        const map: Record<string, typeof DOCTOR_COLORS[0]> = {};
        doctors.forEach((d, i) => {
            map[d.id] = DOCTOR_COLORS[i % DOCTOR_COLORS.length];
        });
        return map;
    }, [doctors]);

    const filteredAppts = useMemo(() => {
        if (doctorFilter === "all") return localAppts;
        return localAppts.filter(a => a.doctor_id === doctorFilter);
    }, [localAppts, doctorFilter]);

    // Group by date
    const byDate = useMemo(() => {
        const map: Record<string, Appointment[]> = {};
        filteredAppts.forEach(a => {
            if (!map[a.appt_date]) map[a.appt_date] = [];
            map[a.appt_date].push(a);
        });
        return map;
    }, [filteredAppts]);

    const totalAppts = filteredAppts.filter(a => a.status !== "cancelled").length;

    async function handleStatusChange(id: string, newStatus: string) {
        setUpdatingId(id);
        try {
            await updateAppointmentStatus(id, newStatus);
            setLocalAppts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
        } catch {
            // silent
        } finally {
            setUpdatingId(null);
        }
    }

    function shiftDate(direction: -1 | 1): string {
        const d = new Date(baseDate);
        if (view === "week") d.setDate(d.getDate() + direction * 7);
        else if (view === "month") d.setMonth(d.getMonth() + direction);
        else if (view === "day") d.setDate(d.getDate() + direction);
        return bangkokDate(d);
    }

    const headerLabel = useMemo(() => {
        if (view === "month") {
            return `${THAI_MONTHS[baseDate.getMonth()]} ${baseDate.getFullYear() + 543}`;
        }
        if (view === "day") {
            return baseDate.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        }
        const startDate = new Date(startISO + "T00:00:00");
        const endDate = new Date(endISO + "T00:00:00");
        return `${startDate.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} — ${endDate.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`;
    }, [view, baseDate, startISO, endISO]);

    return (
        <div className="space-y-4 animate-fade-in relative z-10 font-sans pb-10">
            {/* Sub-header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-medium text-slate-500">
                        <span className="font-bold text-blue-700">{headerLabel}</span>
                        <span className="text-slate-300 mx-2">·</span>
                        <span><span className="font-bold text-slate-700 tabular-nums">{totalAppts}</span> นัด</span>
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* View Toggle */}
                    <div className="inline-flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
                        <ViewToggleBtn active={view === "day"} href={`/dashboard/appointments?view=day&date=${baseDateISO}`} icon={CalIcon}>วัน</ViewToggleBtn>
                        <ViewToggleBtn active={view === "week"} href={`/dashboard/appointments?view=week&date=${baseDateISO}`} icon={LayoutGrid}>สัปดาห์</ViewToggleBtn>
                        <ViewToggleBtn active={view === "month"} href={`/dashboard/appointments?view=month&date=${baseDateISO}`} icon={CalendarDays}>เดือน</ViewToggleBtn>
                    </div>

                    {/* Doctor filter */}
                    {doctors.length > 1 && (
                        <select
                            value={doctorFilter}
                            onChange={e => setDoctorFilter(e.target.value)}
                            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="all">หมอทั้งหมด ({doctors.length})</option>
                            {doctors.map(d => {
                                const name = Array.isArray(d.profiles) ? d.profiles[0]?.full_name : d.profiles?.full_name;
                                return <option key={d.id} value={d.id}>{name}</option>;
                            })}
                        </select>
                    )}

                    {/* Date nav */}
                    <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-xl p-0.5 shadow-sm">
                        <Link href={`/dashboard/appointments?view=${view}&date=${shiftDate(-1)}`}>
                            <Button variant="ghost" size="sm" className="rounded-lg h-9 w-9 p-0">
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <Link href={`/dashboard/appointments?view=${view}&date=${today}`}>
                            <Button variant="ghost" size="sm" className="rounded-lg font-bold h-9 px-3 text-xs">
                                วันนี้
                            </Button>
                        </Link>
                        <Link href={`/dashboard/appointments?view=${view}&date=${shiftDate(1)}`}>
                            <Button variant="ghost" size="sm" className="rounded-lg h-9 w-9 p-0">
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>

                    {/* Add New */}
                    <PermissionButton
                        permKey="appointments.create"
                        onClick={() => setShowModal(true)}
                        className="gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 shadow-md shadow-cyan-500/20 font-bold h-10"
                    >
                        <Plus className="h-4 w-4" /> นัดใหม่
                    </PermissionButton>
                </div>
            </div>

            {/* Views */}
            {view === "month" && (
                <MonthView
                    baseDate={baseDate}
                    byDate={byDate}
                    today={today}
                    doctorColorMap={doctorColorMap}
                    onSelect={setDetailAppt}
                    onOpenDay={(key) => router.push(`/dashboard/appointments?view=day&date=${key}`)}
                />
            )}
            {view === "week" && (
                <WeekView
                    baseDate={baseDate}
                    byDate={byDate}
                    today={today}
                    doctorColorMap={doctorColorMap}
                    updatingId={updatingId}
                    onStatusChange={handleStatusChange}
                    onSelect={setDetailAppt}
                />
            )}
            {view === "day" && (
                <DayView
                    baseDate={baseDate}
                    appointments={filteredAppts.filter(a => a.appt_date === baseDateISO)}
                    doctorColorMap={doctorColorMap}
                    updatingId={updatingId}
                    onStatusChange={handleStatusChange}
                    onSelect={setDetailAppt}
                />
            )}

            {showModal && (
                <NewAppointmentModal
                    onClose={() => { setShowModal(false); router.refresh(); }}
                    doctors={doctors}
                />
            )}

            {detailAppt && (
                <AppointmentDetailModal
                    appt={detailAppt}
                    doctors={doctors}
                    onClose={() => setDetailAppt(null)}
                    onSaved={() => router.refresh()}
                />
            )}
        </div>
    );
}

function ViewToggleBtn({ active, href, icon: Icon, children }: {
    active: boolean;
    href: string;
    icon: React.ElementType;
    children: React.ReactNode;
}) {
    return (
        <Link href={href}>
            <button className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold transition-all",
                active ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-800"
            )}>
                <Icon className="h-3.5 w-3.5" />
                {children}
            </button>
        </Link>
    );
}

// ─── MONTH VIEW ──────────────────────────────────────
function MonthView({
    baseDate, byDate, today, doctorColorMap, onSelect, onOpenDay,
}: {
    baseDate: Date;
    byDate: Record<string, Appointment[]>;
    today: string;
    doctorColorMap: Record<string, typeof DOCTOR_COLORS[0]>;
    onSelect: (a: Appointment) => void;
    onOpenDay: (key: string) => void;
}) {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const firstDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Monday start

    const dates: Date[] = [];
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - firstDow);
    for (let i = 0; i < 42; i++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        dates.push(d);
    }
    // Trim trailing empty rows
    const totalRows = Math.ceil(dates.length / 7);
    const trimmed = dates.slice(0, totalRows * 7);

    return (
        <div className="gonix-card-premium overflow-hidden">
            {/* Month title */}
            <div className="px-5 py-3.5 border-b border-slate-200/60 flex items-center justify-center">
                <h2 className="text-xl font-black text-slate-800 tracking-tight">{THAI_MONTHS[month]} {year + 543}</h2>
            </div>
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-slate-200/70 bg-slate-50/40">
                {THAI_DAYS_SHORT.map((d, idx) => (
                    <div key={d} className={cn(
                        "text-center py-3 text-[11px] font-black uppercase tracking-widest",
                        idx >= 5 ? "text-rose-400/80" : "text-slate-500"
                    )}>{d}</div>
                ))}
            </div>

            {/* Date cells */}
            <div className="grid grid-cols-7 grid-rows-6">
                {trimmed.map((date, i) => {
                    const key = bangkokDate(date);
                    const dayAppts = (byDate[key] || []).filter(a => a.status !== "cancelled");
                    const isToday = key === today;
                    const isCurrentMonth = date.getMonth() === month;
                    const isLastRow = i >= trimmed.length - 7;
                    return (
                        <div
                            key={i}
                            role="button"
                            onClick={() => onOpenDay(key)}
                            className={cn(
                                "min-h-[116px] border-r border-b border-slate-100/80 p-2 transition-colors group cursor-pointer",
                                (i + 1) % 7 === 0 && "border-r-0",
                                isLastRow && "border-b-0",
                                !isCurrentMonth ? "bg-slate-50/40" : isToday ? "bg-blue-50/50" : "hover:bg-slate-50/60"
                            )}
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <span
                                    className={cn(
                                        "inline-flex items-center justify-center text-xs font-bold rounded-full h-7 w-7 transition-all",
                                        isToday ? "text-white shadow-md" : isCurrentMonth ? "text-slate-700 group-hover:bg-white group-hover:shadow-sm" : "text-slate-300"
                                    )}
                                    style={isToday ? { background: "linear-gradient(135deg, #2B54F0, #00A6C0)", boxShadow: "0 4px 12px rgba(43,84,240,0.35)" } : undefined}
                                >
                                    {date.getDate()}
                                </span>
                                {dayAppts.length > 0 && (
                                    <span className="text-[10px] font-bold text-[#2B54F0] bg-[#2B54F0]/10 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                                        {dayAppts.length}
                                    </span>
                                )}
                            </div>
                            <div className="space-y-1">
                                {dayAppts.slice(0, 3).map(a => {
                                    const pt = Array.isArray(a.patients) ? a.patients[0] : a.patients;
                                    const color = a.doctor_id ? doctorColorMap[a.doctor_id] : DOCTOR_COLORS[0];
                                    return (
                                        <button
                                            key={a.id}
                                            onClick={(e) => { e.stopPropagation(); onSelect(a); }}
                                            className={cn("w-full text-left flex items-center gap-1 text-[10px] truncate px-1.5 py-1 rounded-md font-medium hover:brightness-95 transition", color?.bg, color?.text)}
                                        >
                                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", color?.dot)} />
                                            <span className="font-mono opacity-70">{a.appt_start?.slice(0, 5)}</span>
                                            <span className="truncate">{pt?.first_name}</span>
                                        </button>
                                    );
                                })}
                                {dayAppts.length > 3 && (
                                    <div className="text-[9px] text-slate-500 px-1 font-semibold">+{dayAppts.length - 3} เพิ่ม</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── WEEK VIEW ──────────────────────────────────────
function WeekView({
    baseDate, byDate, today, doctorColorMap, updatingId, onStatusChange, onSelect,
}: {
    baseDate: Date;
    byDate: Record<string, Appointment[]>;
    today: string;
    doctorColorMap: Record<string, typeof DOCTOR_COLORS[0]>;
    updatingId: string | null;
    onStatusChange: (id: string, status: string) => void;
    onSelect: (a: Appointment) => void;
}) {
    const dow = baseDate.getDay();
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d);
    }

    return (
        <div className="gonix-card-premium p-3 overflow-x-auto">
            <div className="grid grid-cols-7 gap-2 min-w-[900px]">
                {dates.map(date => {
                    const key = bangkokDate(date);
                    const isToday = key === today;
                    const dayAppts = byDate[key] || [];
                    const activeAppts = dayAppts.filter(a => a.status !== "cancelled");
                    const dow = date.getDay();
                    const dayIdx = dow === 0 ? 6 : dow - 1;

                    return (
                        <div key={key} className={cn("flex flex-col gap-2 rounded-xl p-1.5", isToday && "bg-blue-50")}>
                            <Link
                                href={`/dashboard/appointments?view=day&date=${key}`}
                                className={cn(
                                    "rounded-xl px-2 py-2 text-center transition-all border",
                                    isToday ? "bg-gradient-to-b from-blue-500 to-cyan-600 border-transparent text-white" : "bg-white border-slate-200 hover:border-blue-300"
                                )}
                            >
                                <p className={cn("text-[10px] font-bold uppercase tracking-widest", isToday ? "text-white/80" : "text-slate-400")}>
                                    {THAI_DAYS_SHORT[dayIdx]}
                                </p>
                                <p className={cn("text-xl font-black mt-0.5", isToday ? "text-white" : "text-slate-700")}>
                                    {date.getDate()}
                                </p>
                                {activeAppts.length > 0 && (
                                    <p className={cn("text-[10px] mt-1 font-bold", isToday ? "text-white/80" : "text-slate-500")}>
                                        {activeAppts.length} นัด
                                    </p>
                                )}
                            </Link>

                            <div className="space-y-1.5 flex-1">
                                {dayAppts.length === 0 ? (
                                    <div className="h-full min-h-[60px] flex items-center justify-center rounded-xl border border-dashed border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-300 uppercase">ว่าง</p>
                                    </div>
                                ) : (
                                    dayAppts.map(appt => (
                                        <AppointmentCard
                                            key={appt.id}
                                            appt={appt}
                                            doctorColorMap={doctorColorMap}
                                            isUpdating={updatingId === appt.id}
                                            onStatusChange={onStatusChange}
                                            onSelect={onSelect}
                                            compact
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── DAY VIEW ──────────────────────────────────────
function DayView({
    baseDate, appointments, doctorColorMap, updatingId, onStatusChange, onSelect,
}: {
    baseDate: Date;
    appointments: Appointment[];
    doctorColorMap: Record<string, typeof DOCTOR_COLORS[0]>;
    updatingId: string | null;
    onStatusChange: (id: string, status: string) => void;
    onSelect: (a: Appointment) => void;
}) {
    // Hours 8AM-19PM
    const hours = Array.from({ length: 12 }, (_, i) => 8 + i);

    function timeToMinutes(t: string | null | undefined): number {
        if (!t) return 0;
        const [h, m] = t.split(":").map(Number);
        return h * 60 + (m || 0);
    }

    const grouped: Record<number, Appointment[]> = {};
    appointments.forEach(a => {
        const h = parseInt((a.appt_start || "08:00").slice(0, 2));
        if (!grouped[h]) grouped[h] = [];
        grouped[h].push(a);
    });

    return (
        <div className="gonix-card-premium overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/70 bg-slate-50/40 flex items-center justify-between">
                <div className="text-sm font-bold text-slate-800 inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-[#2B54F0]" />
                    {baseDate.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </div>
                <div className="text-xs font-semibold text-[#2B54F0] bg-[#2B54F0]/10 px-2.5 py-1 rounded-full">{appointments.filter(a => a.status !== "cancelled").length} นัดในวันนี้</div>
            </div>
            <div className="divide-y divide-slate-100">
                {hours.map(h => {
                    const slotAppts = (grouped[h] || []).sort((a, b) =>
                        timeToMinutes(a.appt_start) - timeToMinutes(b.appt_start)
                    );
                    return (
                        <div key={h} className="grid grid-cols-[80px_1fr] min-h-[80px]">
                            <div className="bg-slate-50/30 border-r border-slate-100 p-3 text-right">
                                <div className="text-sm font-bold text-slate-700">{String(h).padStart(2, "0")}:00</div>
                            </div>
                            <div className="p-2">
                                {slotAppts.length === 0 ? (
                                    <div className="h-full flex items-center text-xs text-slate-300 italic px-2">—</div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {slotAppts.map(appt => (
                                            <AppointmentCard
                                                key={appt.id}
                                                appt={appt}
                                                doctorColorMap={doctorColorMap}
                                                isUpdating={updatingId === appt.id}
                                                onStatusChange={onStatusChange}
                                                onSelect={onSelect}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── APPOINTMENT CARD ──────────────────────────────────────
function AppointmentCard({
    appt, doctorColorMap, isUpdating, onStatusChange, onSelect, compact,
}: {
    appt: Appointment;
    doctorColorMap: Record<string, typeof DOCTOR_COLORS[0]>;
    isUpdating: boolean;
    onStatusChange: (id: string, status: string) => void;
    onSelect: (a: Appointment) => void;
    compact?: boolean;
}) {
    const pt = Array.isArray(appt.patients) ? appt.patients[0] : appt.patients;
    const color = appt.doctor_id ? doctorColorMap[appt.doctor_id] : DOCTOR_COLORS[0];
    const doctorObj = Array.isArray(appt.doctor) ? appt.doctor[0] : appt.doctor;
    const doctorProfile = Array.isArray(doctorObj?.profiles) ? doctorObj?.profiles[0] : doctorObj?.profiles;
    const doctorName = doctorProfile?.full_name;
    const isCancelled = appt.status === "cancelled";

    return (
        <Card onClick={() => onSelect(appt)} className={cn(
            "relative overflow-hidden rounded-xl border border-slate-200/80 bg-white transition-all duration-200 cursor-pointer",
            isCancelled ? "opacity-60 hover:opacity-100" : "hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300"
        )}>
            {/* doctor color accent bar */}
            <span className={cn("absolute inset-y-0 left-0 w-1.5", color?.dot)} />
            <CardContent className={cn("pl-3.5", compact ? "pr-2.5 py-2" : "pr-3 py-2.5")}>
                {/* time + status */}
                <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold font-mono text-slate-600">
                        <Clock className={cn("h-3 w-3", color?.text)} />
                        {appt.appt_start?.slice(0, 5)}
                    </span>
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 border-transparent font-bold", statusColors[appt.status])}>
                        {statusLabels[appt.status] || appt.status}
                    </Badge>
                </div>

                <p className={cn(
                    "text-xs font-bold text-slate-800 line-clamp-1",
                    isCancelled && "line-through text-slate-400"
                )}>
                    {pt?.first_name} {compact ? (pt?.last_name?.charAt(0) ?? "") + "." : pt?.last_name}
                </p>

                {!compact && doctorName && (
                    <p className={cn("text-[10px] mt-0.5 font-medium inline-flex items-center gap-1", color?.text)}>
                        <Stethoscope className="h-3 w-3" /> {doctorName}
                    </p>
                )}

                {appt.note && (
                    <p className="text-[10px] text-slate-400 line-clamp-1 mt-1">{appt.note}</p>
                )}

                {!isCancelled && (appt.status === "confirmed" || appt.status === "pending") && (
                    <div className="mt-2 flex items-center gap-1.5">
                        {appt.status === "confirmed" && (
                            <>
                                <button
                                    disabled={isUpdating}
                                    onClick={(e) => { e.stopPropagation(); onStatusChange(appt.id, "completed"); }}
                                    title="มาตามนัด"
                                    className="flex-1 inline-flex items-center justify-center gap-1 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold transition-colors disabled:opacity-50"
                                >
                                    {isUpdating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                                    {!compact && <span>มาแล้ว</span>}
                                </button>
                                <button
                                    disabled={isUpdating}
                                    onClick={(e) => { e.stopPropagation(); onStatusChange(appt.id, "cancelled"); }}
                                    title="ยกเลิก"
                                    className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-colors shrink-0 disabled:opacity-50"
                                >
                                    <XCircle className="h-3 w-3" />
                                </button>
                            </>
                        )}
                        {appt.status === "pending" && (
                            <button
                                disabled={isUpdating}
                                onClick={(e) => { e.stopPropagation(); onStatusChange(appt.id, "confirmed"); }}
                                title="ยืนยันนัด"
                                className="flex-1 inline-flex items-center justify-center gap-1 h-7 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-[10px] font-bold transition-colors disabled:opacity-50"
                            >
                                {isUpdating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                                {!compact && <span>ยืนยันนัด</span>}
                            </button>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
