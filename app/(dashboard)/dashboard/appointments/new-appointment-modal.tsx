"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Loader2, CalendarPlus, Search, CheckCircle } from "lucide-react";
import { createAppointment } from "@/lib/actions/appointments";
import { getOnDutyDoctors, type OnDutyDoctor } from "@/lib/actions/doctor-shifts";
import { bangkokDate } from "@/lib/utils/date";

interface Patient {
    hn: string;
    first_name: string;
    last_name: string;
    phone: string | null;
}

interface Doctor {
    id: string;
    profiles: { full_name: string } | { full_name: string }[];
}

interface Props {
    onClose: () => void;
    doctors: Doctor[];
}

const VISIT_TYPES = [
    { value: "appointment", label: "นัดตรวจทั่วไป" },
    { value: "follow_up", label: "ตรวจตามนัด (Follow Up)" },
    { value: "aesthetic", label: "เสริมความงาม" },
    { value: "wound_care", label: "ทำแผล" },
    { value: "health_check", label: "ตรวจสุขภาพ" },
    { value: "procedure", label: "ทำหัตถการ" },
];

export default function NewAppointmentModal({ onClose, doctors }: Props) {
    const supabase = createClient();
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    // Patient search
    const [patientQuery, setPatientQuery] = useState("");
    const [patients, setPatients] = useState<Patient[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

    // Form fields
    const [apptDate, setApptDate] = useState(bangkokDate());
    const [apptStart, setApptStart] = useState("09:00");
    const [duration, setDuration] = useState(30);
    const [apptType, setApptType] = useState("appointment");
    const [doctorId, setDoctorId] = useState("");
    const [note, setNote] = useState("");

    // หมอที่เข้าเวรในวันที่เลือก (เพื่อกรอง/เตือน)
    const [onDuty, setOnDuty] = useState<OnDutyDoctor[]>([]);
    useEffect(() => {
        if (!apptDate) { setOnDuty([]); return; }
        let alive = true;
        getOnDutyDoctors(apptDate).then((d) => { if (alive) setOnDuty(d); }).catch(() => { if (alive) setOnDuty([]); });
        return () => { alive = false; };
    }, [apptDate]);

    const onDutyMap = new Map(onDuty.map((d) => [d.doctor_staff_id, d]));
    const selectedOnDuty = doctorId ? onDutyMap.get(doctorId) : undefined;
    const doctorNotOnDuty = !!doctorId && !selectedOnDuty;
    const timeOutsideShift = !!doctorId && !!selectedOnDuty && !!apptStart &&
        !selectedOnDuty.shifts.some((s) => apptStart >= s.start_time && apptStart < s.end_time);

    // Computed end time
    const computeEnd = (start: string, dur: number) => {
        const [h, m] = start.split(":").map(Number);
        const total = h * 60 + m + dur;
        return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    };

    const searchPatients = useCallback(async (q: string) => {
        setPatientQuery(q);
        setSelectedPatient(null);
        if (q.length < 2) { setPatients([]); return; }
        const { data } = await supabase
            .from("patients")
            .select("hn, first_name, last_name, phone")
            .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,hn.ilike.%${q}%,phone.ilike.%${q}%`)
            .eq("is_active", true)
            .limit(8);
        setPatients(data || []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleSubmit() {
        if (!selectedPatient) { setError("กรุณาเลือกผู้ป่วย"); return; }
        if (!apptDate || !apptStart) { setError("กรุณาระบุวันและเวลา"); return; }

        setSaving(true);
        setError("");
        try {
            await createAppointment({
                hn: selectedPatient.hn,
                appt_date: apptDate,
                appt_start: apptStart + ":00+07",
                appt_end: computeEnd(apptStart, duration) + ":00+07",
                duration_min: duration,
                appt_type: apptType,
                note,
                doctor_id: doctorId || undefined,
            });
            setSaved(true);
            setTimeout(() => onClose(), 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center">
                            <CalendarPlus className="h-5 w-5 text-violet-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-800">นัดหมายใหม่</h2>
                            <p className="text-xs text-slate-400">New Appointment</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                        <X className="h-4 w-4 text-slate-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5">
                    {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-200">{error}</div>}

                    {/* Patient Search */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold text-slate-700">ผู้ป่วย <span className="text-red-500">*</span></Label>
                        {selectedPatient ? (
                            <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
                                <div>
                                    <p className="font-bold text-violet-800 text-sm">{selectedPatient.first_name} {selectedPatient.last_name}</p>
                                    <p className="text-xs text-violet-500">HN: {selectedPatient.hn} · {selectedPatient.phone || "-"}</p>
                                </div>
                                <button onClick={() => { setSelectedPatient(null); setPatientQuery(""); }} className="text-slate-400 hover:text-red-500">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="ค้นหาชื่อ, HN, เบอร์โทร..."
                                    className="pl-9 rounded-xl"
                                    value={patientQuery}
                                    onChange={e => searchPatients(e.target.value)}
                                />
                                {patients.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                                        {patients.map(p => (
                                            <button key={p.hn} onClick={() => { setSelectedPatient(p); setPatients([]); setPatientQuery(`${p.first_name} ${p.last_name}`); }}
                                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-violet-50 border-b last:border-0">
                                                <div className="font-medium text-slate-800">{p.first_name} {p.last_name}</div>
                                                <div className="text-xs text-slate-400">HN: {p.hn} · {p.phone || "-"}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Date & Time */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-sm font-semibold text-slate-700">วันที่นัด <span className="text-red-500">*</span></Label>
                            <Input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)} className="rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm font-semibold text-slate-700">เวลานัด <span className="text-red-500">*</span></Label>
                            <Input type="time" value={apptStart} onChange={e => setApptStart(e.target.value)} className="rounded-xl" />
                        </div>
                    </div>

                    {/* Duration */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-semibold text-slate-700">ระยะเวลาประมาณ</Label>
                        <div className="flex gap-2">
                            {[15, 30, 45, 60].map(d => (
                                <button key={d} onClick={() => setDuration(d)}
                                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${duration === d ? "bg-violet-600 text-white border-transparent" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>
                                    {d}m
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-slate-400">สิ้นสุด: {computeEnd(apptStart, duration)} น.</p>
                    </div>

                    {/* Type */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-semibold text-slate-700">ประเภทการนัด</Label>
                        <select value={apptType} onChange={e => setApptType(e.target.value)}
                            className="w-full h-10 rounded-xl border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                            {VISIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>

                    {/* Doctor */}
                    {doctors.length > 0 && (
                        <div className="space-y-1.5">
                            <Label className="text-sm font-semibold text-slate-700">แพทย์ (ถ้ามี)</Label>
                            <select value={doctorId} onChange={e => setDoctorId(e.target.value)}
                                className="w-full h-10 rounded-xl border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                                <option value="">-- ไม่ระบุ --</option>
                                {doctors.map(doc => {
                                    const profile = Array.isArray(doc.profiles) ? doc.profiles[0] : doc.profiles;
                                    const od = onDutyMap.get(doc.id);
                                    const suffix = od ? ` · เวร ${od.earliest}–${od.latest}` : " · ไม่เข้าเวร";
                                    return <option key={doc.id} value={doc.id}>{profile?.full_name}{suffix}</option>;
                                })}
                            </select>
                            {doctorNotOnDuty && (
                                <p className="text-[11px] text-amber-600 flex items-center gap-1">
                                    ⚠️ แพทย์ท่านนี้ไม่ได้ลงเวรวันที่ {apptDate} — นัดได้แต่โปรดตรวจสอบ
                                </p>
                            )}
                            {timeOutsideShift && (
                                <p className="text-[11px] text-amber-600 flex items-center gap-1">
                                    ⚠️ เวลานัด {apptStart} อยู่นอกช่วงเวร ({selectedOnDuty?.earliest}–{selectedOnDuty?.latest})
                                </p>
                            )}
                        </div>
                    )}

                    {/* Note */}
                    <div className="space-y-1.5">
                        <Label className="text-sm font-semibold text-slate-700">หมายเหตุ</Label>
                        <Input placeholder="เช่น นัดฉีดยา, ตรวจสุขภาพประจำปี..." value={note} onChange={e => setNote(e.target.value)} className="rounded-xl" />
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3 rounded-b-2xl">
                    <button onClick={onClose} disabled={saving}
                        className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-medium text-sm hover:bg-slate-50">
                        ยกเลิก
                    </button>
                    <button onClick={handleSubmit} disabled={saving || saved}
                        className={`flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${saved ? "bg-emerald-600 text-white" : "bg-violet-600 hover:bg-violet-700 text-white"}`}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> :
                            saved ? <CheckCircle className="h-4 w-4" /> :
                                <CalendarPlus className="h-4 w-4" />}
                        {saved ? "บันทึกแล้ว!" : saving ? "กำลังบันทึก..." : "บันทึกนัดหมาย"}
                    </button>
                </div>
            </div>
        </div>
    );
}
