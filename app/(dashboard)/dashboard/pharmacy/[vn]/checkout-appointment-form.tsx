"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { CalendarCheck, Loader2, CheckCircle, Save, ChevronDown, ChevronUp } from "lucide-react";
import { bangkokDate } from "@/lib/utils/date";

interface Props {
    vn: string;
    hn: string;
}

export default function CheckoutAppointmentForm({ vn, hn }: Props) {
    const router = useRouter();
    const supabase = createClient();

    const [collapsed, setCollapsed] = useState(true);
    const [apptDate, setApptDate] = useState("");
    const [apptTime, setApptTime] = useState("");
    const [apptReason, setApptReason] = useState("");
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    // Existing appointments from this visit (if any)
    const [existing, setExisting] = useState<{ id: string; appt_date: string; appt_start: string; note: string | null }[]>([]);

    useEffect(() => {
        supabase
            .from("appointments")
            .select("id, appt_date, appt_start, note")
            .eq("source_vn", vn)
            .neq("status", "cancelled")
            .order("appt_date", { ascending: true })
            .then(({ data }) => setExisting(data || []));
    }, [vn, supabase]);

    function calcEndTime(start: string): string {
        if (!start) return "08:30";
        const [h, m] = start.split(":").map(x => parseInt(x) || 0);
        const total = h * 60 + m + 30;
        const endH = Math.floor(total / 60) % 24;
        const endM = total % 60;
        return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    }

    async function handleSave() {
        if (!apptDate) {
            setError("กรุณาเลือกวันที่นัด");
            return;
        }
        if (!apptTime) {
            setError("กรุณาเลือกเวลานัด");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const { data: userData } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from("profiles")
                .select("clinic_id").eq("id", userData.user?.id || "").single();

            const { data, error: err } = await supabase.from("appointments").insert({
                clinic_id: profile?.clinic_id,
                hn,
                source_vn: vn,
                appt_date: apptDate,
                appt_start: apptTime,
                appt_end: calcEndTime(apptTime),
                note: apptReason || null,
                status: "confirmed",
                created_by: userData.user?.id,
            }).select("id, appt_date, appt_start, note").single();

            if (err) {
                if (err.code === "42P01") { setSaved(true); return; }
                throw err;
            }
            setSaved(true);
            if (data) setExisting(prev => [...prev, data]);
            setApptDate("");
            setApptTime("");
            setApptReason("");
            router.refresh();
        } catch (e) {
            const anyErr = e as { message?: string };
            setError(anyErr.message || "บันทึกไม่สำเร็จ");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="gonix-card-premium overflow-hidden">
            <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-200/60 bg-cyan-50/60 hover:bg-cyan-100/40 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-cyan-700" />
                    <h2 className="text-sm font-bold text-cyan-900">นัดหมายครั้งต่อไป</h2>
                    {existing.length > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                            ✓ นัดแล้ว {existing.length}
                        </span>
                    )}
                </div>
                {collapsed ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
            </button>

            {!collapsed && (
                <div className="p-4 space-y-3">
                    {existing.length > 0 && (
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">นัดที่บันทึกแล้ว</Label>
                            {existing.map(a => (
                                <div key={a.id} className="flex items-center gap-3 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
                                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-slate-800">
                                            {new Date(a.appt_date).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
                                            <span className="ml-2 font-mono text-emerald-700">{a.appt_start?.slice(0, 5)} น.</span>
                                        </div>
                                        {a.note && <div className="text-[12px] text-slate-600 truncate">{a.note}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {error && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">วันที่นัด</Label>
                            <Input
                                type="date"
                                value={apptDate}
                                onChange={e => { setApptDate(e.target.value); setSaved(false); }}
                                min={bangkokDate()}
                                className="rounded-lg"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">เวลา</Label>
                            <Input
                                type="time"
                                value={apptTime}
                                onChange={e => { setApptTime(e.target.value); setSaved(false); }}
                                className="rounded-lg"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">เหตุผลนัด</Label>
                        <Input
                            value={apptReason}
                            onChange={e => { setApptReason(e.target.value); setSaved(false); }}
                            placeholder="เช่น นัดทำหัตถการครั้งที่ 2, ติดตามอาการ..."
                            className="rounded-lg"
                        />
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={loading || !apptDate || !apptTime}
                        className={`w-full rounded-lg h-11 gap-1.5 ${
                            saved
                                ? "bg-emerald-600 hover:bg-emerald-700"
                                : "bg-cyan-600 hover:bg-cyan-700"
                        } text-white font-bold disabled:opacity-50`}
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> :
                            saved ? <CheckCircle className="h-4 w-4" /> :
                                <Save className="h-4 w-4" />}
                        {saved ? "บันทึกการนัดสำเร็จ" : "บันทึกการนัดหมาย"}
                    </Button>
                </div>
            )}
        </div>
    );
}
