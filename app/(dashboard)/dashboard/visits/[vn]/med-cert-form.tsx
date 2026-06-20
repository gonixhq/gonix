"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { FileText, Loader2, CheckCircle, Save } from "lucide-react";

interface MedCertFormProps {
    vn: string;
    hn: string;
}

const medCertTypes = [
    { value: "none", label: "-- ไม่ออกใบรับรอง --" },
    { value: "sick_leave", label: "ใบรับรองแพทย์ — ลาป่วย" },
    { value: "fit_for_work", label: "ใบรับรองแพทย์ — ร่างกายปกติ / พร้อมทำงาน" },
    { value: "fitness", label: "ใบรับรองแพทย์ — ตรวจสุขภาพทั่วไป" },
    { value: "driving", label: "ใบรับรองแพทย์ — ขอใบขับขี่" },
    { value: "insurance", label: "ใบรับรองแพทย์ — ประกัน" },
    { value: "other", label: "ใบรับรองแพทย์ — อื่นๆ" },
];

export default function MedCertForm({ vn, hn }: MedCertFormProps) {
    const router = useRouter();
    const supabase = createClient();

    const [certType, setCertType] = useState("none");
    const [doctorOpinion, setDoctorOpinion] = useState("");
    const [restDays, setRestDays] = useState("");
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    const needsCert = certType !== "none";

    async function handleSave() {
        if (!needsCert) return;
        setLoading(true);
        setError("");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Unauthorized");

            // Look up staff.id (doctor_id FK references staff, not auth.users)
            const { data: staff } = await supabase
                .from("staff")
                .select("id")
                .eq("profile_id", user.id)
                .maybeSingle();
            const doctorStaffId = staff?.id || null;

            const { error: err } = await supabase.from("medical_certificates").insert({
                vn,
                hn,
                doctor_id: doctorStaffId,
                cert_type: certType,
                doctor_opinion: doctorOpinion || null,
                rest_days: restDays ? parseInt(restDays) : null,
            });

            if (err) {
                if (err.code === "42P01") { setSaved(true); return; }
                throw err;
            }
            setSaved(true);
            router.refresh();
        } catch (e: unknown) {
            // Supabase Postgrest errors are plain objects, not Error instances
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyErr = e as any;
            const msg = anyErr?.message || anyErr?.details || anyErr?.hint || "เกิดข้อผิดพลาด";
            setError(msg);
            console.error("[med-cert] save error:", e);
        } finally {
            setLoading(false);
        }
    }

    void hn;

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-amber-600" />
                    ใบรับรองแพทย์
                </h2>
                {needsCert && (
                    <Button onClick={handleSave} disabled={loading || saved} size="sm">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> :
                            saved ? <CheckCircle className="h-4 w-4 mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                        {saved ? "บันทึกแล้ว" : "บันทึก"}
                    </Button>
                )}
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}

            {/* Type selector */}
            <div className="space-y-1.5">
                <Label htmlFor="cert_type">ประเภทใบรับรองแพทย์</Label>
                <select
                    id="cert_type"
                    value={certType}
                    onChange={e => { setCertType(e.target.value); setSaved(false); }}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {medCertTypes.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </select>
            </div>

            {needsCert && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Rest days (for sick leave) */}
                    {certType === "sick_leave" && (
                        <div className="space-y-1.5">
                            <Label htmlFor="rest_days">จำนวนวันพัก (วัน)</Label>
                            <input
                                id="rest_days"
                                type="number"
                                min={1}
                                value={restDays}
                                onChange={e => { setRestDays(e.target.value); setSaved(false); }}
                                placeholder="เช่น 3"
                                className="flex w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>
                    )}

                    {/* Doctor opinion */}
                    <div className="space-y-1.5">
                        <Label htmlFor="doctor_opinion">ความเห็นของแพทย์</Label>
                        <textarea
                            id="doctor_opinion"
                            value={doctorOpinion}
                            onChange={e => { setDoctorOpinion(e.target.value); setSaved(false); }}
                            rows={4}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="ความเห็นแพทย์"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
