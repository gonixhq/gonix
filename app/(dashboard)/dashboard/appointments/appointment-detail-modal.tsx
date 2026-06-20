"use client";

import { useState } from "react";
import Link from "next/link";
import {
    X, Loader2, CalendarClock, Save, User, Phone, Stethoscope,
    CheckCircle, XCircle, Ban, UserCheck, ExternalLink,
} from "lucide-react";
import { updateAppointment, updateAppointmentStatus } from "@/lib/actions/appointments";

interface Doctor {
    id: string;
    profiles: { full_name: string } | { full_name: string }[];
}

interface ApptForModal {
    id: string;
    appt_date: string;
    appt_start?: string | null;
    appt_end?: string | null;
    appt_type?: string | null;
    status: string;
    note?: string | null;
    doctor_id?: string | null;
    hn?: string | null;
    patients?: { first_name: string; last_name: string; phone?: string } | { first_name: string; last_name: string; phone?: string }[];
}

const VISIT_TYPES = [
    { value: "appointment", label: "นัดตรวจทั่วไป" },
    { value: "follow_up", label: "ตรวจตามนัด (Follow Up)" },
    { value: "aesthetic", label: "เสริมความงาม" },
    { value: "wound_care", label: "ทำแผล" },
    { value: "health_check", label: "ตรวจสุขภาพ" },
    { value: "procedure", label: "ทำหัตถการ" },
];

const STATUS_BTNS = [
    { value: "confirmed", label: "ยืนยัน", icon: UserCheck, cls: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
    { value: "completed", label: "มาแล้ว", icon: CheckCircle, cls: "bg-blue-50 text-blue-700 hover:bg-blue-100" },
    { value: "no_show", label: "ไม่มา", icon: Ban, cls: "bg-slate-100 text-slate-600 hover:bg-slate-200" },
    { value: "cancelled", label: "ยกเลิก", icon: XCircle, cls: "bg-red-50 text-red-600 hover:bg-red-100" },
];

function diffMinutes(start?: string | null, end?: string | null): number {
    if (!start || !end) return 30;
    const [sh, sm] = start.slice(0, 5).split(":").map(Number);
    const [eh, em] = end.slice(0, 5).split(":").map(Number);
    const d = (eh * 60 + em) - (sh * 60 + sm);
    return d > 0 ? d : 30;
}

export default function AppointmentDetailModal({
    appt, doctors, onClose, onSaved,
}: {
    appt: ApptForModal;
    doctors: Doctor[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const pt = Array.isArray(appt.patients) ? appt.patients[0] : appt.patients;
    const [date, setDate] = useState(appt.appt_date);
    const [startT, setStartT] = useState((appt.appt_start || "09:00").slice(0, 5));
    const [duration, setDuration] = useState(diffMinutes(appt.appt_start, appt.appt_end));
    const [apptType, setApptType] = useState(appt.appt_type || "appointment");
    const [doctorId, setDoctorId] = useState(appt.doctor_id || "");
    const [note, setNote] = useState(appt.note || "");
    const [saving, setSaving] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const computeEnd = () => {
        const [h, m] = startT.split(":").map(Number);
        const total = h * 60 + m + duration;
        return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    };

    async function handleSave() {
        setSaving(true);
        setError("");
        try {
            await updateAppointment(appt.id, { appt_date: date, appt_start: startT, duration_min: duration, appt_type: apptType, doctor_id: doctorId || null, note });
            onSaved();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
        } finally { setSaving(false); }
    }

    async function handleStatus(status: string) {
        setBusy(true);
        setError("");
        try {
            await updateAppointmentStatus(appt.id, status);
            onSaved();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
        } finally { setBusy(false); }
    }

    const inputCls = "w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/20";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-[#2B54F0]/10 flex items-center justify-center">
                            <CalendarClock className="h-5 w-5 text-[#2B54F0]" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-800">รายละเอียดนัด</h2>
                            <p className="text-xs text-slate-400">แก้ไข/เปลี่ยนสถานะ</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                        <X className="h-4 w-4 text-slate-500" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-200">{error}</div>}

                    {/* Patient */}
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-center justify-between">
                        <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-sm inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" />{pt ? `${pt.first_name} ${pt.last_name}` : "—"}</p>
                            <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1.5">
                                {appt.hn && <span>HN: {appt.hn}</span>}
                                {pt?.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{pt.phone}</span>}
                            </p>
                        </div>
                        {appt.hn && (
                            <Link href={`/dashboard/patients/${appt.hn}`} className="text-[#2B54F0] hover:underline text-xs font-semibold inline-flex items-center gap-0.5 shrink-0">
                                ดูประวัติ <ExternalLink className="h-3 w-3" />
                            </Link>
                        )}
                    </div>

                    {/* Date + time */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-500">วันที่</label>
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-500">เวลา</label>
                            <input type="time" value={startT} onChange={(e) => setStartT(e.target.value)} className={inputCls} />
                        </div>
                    </div>

                    {/* Duration */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-500">ระยะเวลา</label>
                        <div className="flex gap-2">
                            {[15, 30, 45, 60].map((d) => (
                                <button key={d} onClick={() => setDuration(d)}
                                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${duration === d ? "bg-[#2B54F0] text-white border-transparent" : "bg-white text-slate-600 border-slate-200 hover:border-[#2B54F0]/40"}`}>
                                    {d}m
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-slate-400">สิ้นสุด: {computeEnd()} น.</p>
                    </div>

                    {/* Type */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-500">ประเภทการนัด</label>
                        <select value={apptType} onChange={(e) => setApptType(e.target.value)} className={inputCls}>
                            {VISIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>

                    {/* Doctor */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-500">แพทย์</label>
                        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={inputCls}>
                            <option value="">— ไม่ระบุ —</option>
                            {doctors.map((doc) => {
                                const p = Array.isArray(doc.profiles) ? doc.profiles[0] : doc.profiles;
                                return <option key={doc.id} value={doc.id}>{p?.full_name}</option>;
                            })}
                        </select>
                    </div>

                    {/* Note */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-500">หมายเหตุ</label>
                        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น นัดฉีดยา..." className={inputCls} />
                    </div>

                    {/* Status quick actions */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-slate-500 inline-flex items-center gap-1"><Stethoscope className="h-3 w-3" /> เปลี่ยนสถานะ (สถานะปัจจุบัน: {appt.status})</label>
                        <div className="grid grid-cols-4 gap-1.5">
                            {STATUS_BTNS.map((s) => {
                                const Icon = s.icon;
                                return (
                                    <button key={s.value} onClick={() => handleStatus(s.value)} disabled={busy || saving}
                                        className={`inline-flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[10px] font-bold transition-colors disabled:opacity-50 ${s.cls}`}>
                                        <Icon className="h-3.5 w-3.5" /> {s.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3 rounded-b-2xl">
                    <button onClick={onClose} disabled={saving || busy} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-medium text-sm hover:bg-slate-50">ปิด</button>
                    <button onClick={handleSave} disabled={saving || busy}
                        className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
                        style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึกการแก้ไข
                    </button>
                </div>
            </div>
        </div>
    );
}
