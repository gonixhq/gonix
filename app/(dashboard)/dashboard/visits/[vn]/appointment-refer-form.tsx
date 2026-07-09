"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { CalendarCheck, Loader2, CheckCircle, Save, ArrowRightCircle, Clock, Printer } from "lucide-react";
import { bangkokDate } from "@/lib/utils/date";

interface AppointmentReferFormProps {
    vn: string;
    hn: string;
    doctorId?: string;
    /** ซ่อน section "ส่งต่อ (Refer)" — ใช้สำหรับ aesthetic visit */
    showRefer?: boolean;
    /** ซ่อน section "นัดหมาย" — กรณีนัดที่ checkout แทน */
    showAppointment?: boolean;
}

interface ExistingAppt {
    id: string;
    appt_date: string;
    appt_start: string;
    appt_end: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    patients?: any;
    status: string;
}

export default function AppointmentReferForm({ vn, hn, doctorId, showRefer = true, showAppointment = true }: AppointmentReferFormProps) {
    const router = useRouter();
    const supabase = createClient();

    // Appointment state
    const [apptDate, setApptDate] = useState("");
    const [apptTime, setApptTime] = useState("");
    const [apptReason, setApptReason] = useState("");
    const [apptLoading, setApptLoading] = useState(false);
    const [apptSaved, setApptSaved] = useState(false);
    const [apptError, setApptError] = useState("");

    // Doctor's existing queue for selected date
    const [queuePreview, setQueuePreview] = useState<ExistingAppt[]>([]);
    const [queueLoading, setQueueLoading] = useState(false);

    // Refer state
    const [referHospital, setReferHospital] = useState("");
    const [referReason, setReferReason] = useState("");
    const [referLoading, setReferLoading] = useState(false);
    const [referSaved, setReferSaved] = useState(false);
    const [referError, setReferError] = useState("");

    // Load doctor queue when date changes
    useEffect(() => {
        if (!apptDate || !doctorId) return;
        setQueueLoading(true);
        supabase
            .from("appointments")
            .select("id, appt_date, appt_start, appt_end, status, patients(first_name, last_name)")
            .eq("doctor_id", doctorId)
            .eq("appt_date", apptDate)
            .neq("status", "cancelled")
            .order("appt_start")
            .limit(10)
            .then(({ data }) => {
                setQueuePreview((data || []) as ExistingAppt[]);
                setQueueLoading(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apptDate, doctorId]);

    /** Calculate appt_end = start + 30 min (handles minute overflow) */
    function calcEndTime(start: string): string {
        if (!start) return "08:30";
        const [h, m] = start.split(":").map((x) => parseInt(x) || 0);
        const totalMin = h * 60 + m + 30;
        const endH = Math.floor(totalMin / 60) % 24;
        const endM = totalMin % 60;
        return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
    }

    async function saveAppointment() {
        if (!apptDate) return;
        setApptLoading(true);
        setApptError("");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");

            const { data: pt } = await supabase.from("patients").select("clinic_id").eq("hn", hn).single();
            if (!pt?.clinic_id) throw new Error("Patient clinic_id not found");

            const start = apptTime || "08:00";
            const { error: err } = await supabase.from("appointments").insert({
                clinic_id: pt.clinic_id,
                hn,
                doctor_id: doctorId || null,
                appt_date: apptDate,
                appt_start: start,
                appt_end: calcEndTime(start),
                appt_type: "follow_up",
                note: apptReason || null,
                booked_via: "doctor_station",
                created_by: user.id,
                source_vn: vn,
            });

            if (err) throw err;
            setApptSaved(true);
            router.refresh();
        } catch (e: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyErr = e as any;
            const msg = anyErr?.message || anyErr?.details || anyErr?.hint || "เกิดข้อผิดพลาด";
            setApptError(msg);
            console.error("[appointment] save error:", e);
        } finally {
            setApptLoading(false);
        }
    }

    async function saveReferral() {
        if (!referHospital) return;
        setReferLoading(true);
        setReferError("");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");

            // Look up staff.id (doctor_id FK → staff)
            const { data: staff } = await supabase
                .from("staff")
                .select("id")
                .eq("profile_id", user.id)
                .maybeSingle();
            const doctorStaffId = staff?.id || null;

            const { error: err } = await supabase.from("referrals").insert({
                vn,
                hn,
                doctor_id: doctorStaffId,
                destination_hospital: referHospital,
                referral_reason: referReason || null,
            });

            if (err) {
                if (err.code === "42P01") { setReferSaved(true); return; }
                throw err;
            }
            setReferSaved(true);
            router.refresh();
        } catch (e: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyErr = e as any;
            const msg = anyErr?.message || anyErr?.details || anyErr?.hint || "เกิดข้อผิดพลาด";
            setReferError(msg);
            console.error("[referral] save error:", e);
        } finally {
            setReferLoading(false);
        }
    }

    void vn;

    return (
        <div className="space-y-8">
            {/* ── Appointment Section ──────────────────────────────── */}
            {showAppointment && (
            <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b">
                    <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <CalendarCheck className="h-4 w-4 text-blue-600" />
                        นัดหมายครั้งต่อไป
                    </h2>
                    {apptDate && (
                        <Button
                            onClick={saveAppointment}
                            disabled={apptLoading || apptSaved}
                            size="sm"
                            className={apptSaved
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                : "bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20"}
                        >
                            {apptLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> :
                                apptSaved ? <CheckCircle className="h-4 w-4 mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                            {apptSaved ? "บันทึกแล้ว" : "บันทึกการนัด"}
                        </Button>
                    )}
                </div>

                {apptError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{apptError}</p>}

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="appt_date">วันที่นัด</Label>
                        <Input
                            id="appt_date" type="date"
                            value={apptDate}
                            onChange={e => { setApptDate(e.target.value); setApptSaved(false); }}
                            min={bangkokDate()}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="appt_time">เวลา</Label>
                        <Input
                            id="appt_time" type="time"
                            value={apptTime}
                            onChange={e => { setApptTime(e.target.value); setApptSaved(false); }}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="appt_reason">เหตุผลนัดหมาย</Label>
                    <Input
                        id="appt_reason"
                        value={apptReason}
                        onChange={e => { setApptReason(e.target.value); setApptSaved(false); }}
                        placeholder="เหตุผลนัดหมาย"
                    />
                </div>

                {/* Queue preview for selected date */}
                {apptDate && (
                    <div className="bg-slate-50 border rounded-md p-3">
                        <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            คิวนัดของแพทย์วันที่ {new Date(apptDate).toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                        </p>
                        {queueLoading ? (
                            <p className="text-xs text-slate-400 text-center py-4">กำลังโหลด...</p>
                        ) : queuePreview.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-4">ไม่มีคิวนัดในวันนั้น — ว่างทั้งวัน</p>
                        ) : (
                            <div className="space-y-1.5">
                                {queuePreview.map(appt => {
                                    const pt = Array.isArray(appt.patients) ? appt.patients[0] : appt.patients;
                                    return (
                                        <div key={appt.id} className="flex items-center gap-3 text-sm">
                                            <span className="font-mono text-xs text-slate-500 w-12 shrink-0">{appt.appt_start?.slice(0, 5)}</span>
                                            <span className="text-slate-700">{pt?.first_name} {pt?.last_name}</span>
                                            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${appt.status === "confirmed" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                                                {appt.status === "confirmed" ? "ยืนยัน" : appt.status}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
            )}

            {/* ── Referral Section ──────────────────────────────────── */}
            {showRefer && (
                <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between pb-3 border-b">
                        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                            <ArrowRightCircle className="h-4 w-4 text-orange-600" />
                            ส่งต่อ (Refer)
                        </h2>
                        <div className="flex items-center gap-1.5">
                            {referSaved && (
                                <a href={`/print/referral/${vn}`} target="_blank" rel="noopener noreferrer">
                                    <Button size="sm" variant="outline" className="gap-1.5"><Printer className="h-4 w-4" /> พิมพ์หนังสือส่งตัว</Button>
                                </a>
                            )}
                            {referHospital && (
                                <Button
                                    onClick={saveReferral}
                                    disabled={referLoading || referSaved}
                                    size="sm"
                                    className={referSaved
                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                        : "bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20"}
                                >
                                    {referLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> :
                                        referSaved ? <CheckCircle className="h-4 w-4 mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                                    {referSaved ? "บันทึกแล้ว" : "บันทึกการส่งต่อ"}
                                </Button>
                            )}
                        </div>
                    </div>

                    {referError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{referError}</p>}

                    <div className="space-y-1.5">
                        <Label htmlFor="refer_hospital">รพ. ส่งต่อ (ตามสิทธิ์)</Label>
                        <Input
                            id="refer_hospital"
                            list="common-hospitals"
                            value={referHospital}
                            onChange={e => { setReferHospital(e.target.value); setReferSaved(false); }}
                            placeholder="พิมพ์หรือเลือกจากรายการ"
                        />
                        <datalist id="common-hospitals">
                            {["โรงพยาบาลศิริราช", "โรงพยาบาลรามาธิบดี", "โรงพยาบาลจุฬาลงกรณ์", "โรงพยาบาลราชวิถี", "โรงพยาบาลตำรวจ", "โรงพยาบาลพระมงกุฎเกล้า", "สถาบันมะเร็งแห่งชาติ", "โรงพยาบาลศูนย์ประจำจังหวัด"].map(h => <option key={h} value={h} />)}
                        </datalist>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="refer_reason">เหตุผลส่งต่อ</Label>
                        <textarea
                            id="refer_reason"
                            value={referReason}
                            onChange={e => { setReferReason(e.target.value); setReferSaved(false); }}
                            rows={3}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="เหตุผลส่งต่อ"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
