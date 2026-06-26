"use client";

import { useState, useEffect, useRef, useCallback, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    ArrowLeft, Loader2, AlertCircle, CheckCircle, Send,
    Droplet, AlertTriangle, ChevronRight, Heart, Stethoscope,
    Plus, X, Activity, Calendar,
    Sparkles, Bandage, FileText, HeartPulse, TestTube, ChevronDown, Check,
} from "lucide-react";
import { SERVICE_LABEL, type ServiceCategory, type TriageLevel } from "@/lib/visit-service-types";
import {
    addAllergy, removeAllergy,
    addChronicDisease, removeChronicDisease,
} from "@/lib/actions/patient-history";
import { type RoomStatus } from "@/lib/room-types";

interface Allergy {
    id: string;
    allergen_name: string;
    allergen_type: string;
    severity: string;
    reaction?: string | null;
}
interface Chronic {
    id: string;
    disease_name: string;
    is_controlled?: boolean | null;
}

const ALLERGEN_TYPES = [
    { value: "drug", label: "ยา" },
    { value: "food", label: "อาหาร" },
    { value: "environmental", label: "สิ่งแวดล้อม" },
    { value: "latex", label: "ยาง" },
    { value: "other", label: "อื่นๆ" },
];

const SEVERITIES = [
    { value: "mild", label: "เล็กน้อย", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    { value: "moderate", label: "ปานกลาง", color: "bg-orange-100 text-orange-800 border-orange-300" },
    { value: "severe", label: "รุนแรง", color: "bg-red-100 text-red-800 border-red-300" },
    { value: "life_threatening", label: "อันตรายถึงชีวิต", color: "bg-red-200 text-red-900 border-red-500" },
];

const severityColor: Record<string, string> = Object.fromEntries(SEVERITIES.map(s => [s.value, s.color]));

const SERVICE_OPTIONS: {
    value: ServiceCategory;
    label: string;
    icon: React.ElementType;
    text: string;
    bg: string;
    ring: string;
}[] = [
    { value: "general_med", label: "เวชกรรมทั่วไป", icon: Stethoscope, text: "text-blue-700", bg: "bg-blue-50", ring: "ring-blue-500" },
    { value: "aesthetic", label: "ความงาม / หัตถการ", icon: Sparkles, text: "text-pink-700", bg: "bg-pink-50", ring: "ring-pink-500" },
    { value: "wound_care", label: "ทำแผล / ล้างแผล", icon: Bandage, text: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-500" },
    { value: "med_cert", label: "ขอใบรับรองแพทย์", icon: FileText, text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-500" },
    { value: "checkup", label: "ตรวจสุขภาพ", icon: HeartPulse, text: "text-purple-700", bg: "bg-purple-50", ring: "ring-purple-500" },
    { value: "std_test", label: "ตรวจเลือด STD", icon: TestTube, text: "text-rose-700", bg: "bg-rose-50", ring: "ring-rose-500" },
];

const NHSO_LABEL: Record<string, string> = {
    none: "ไม่ระบุ",
    uc: "บัตรทอง (UC)",
    sso: "ประกันสังคม",
    gov_officer: "ข้าราชการ",
    private_ins: "ประกันเอกชน",
    self_pay: "จ่ายเอง",
};

const MARITAL_LABEL: Record<string, string> = {
    single: "โสด", married: "สมรส", divorced: "หย่า", widowed: "หม้าย",
    โสด: "โสด", สมรส: "สมรส", หย่า: "หย่า", หม้าย: "หม้าย",
};

function calcAgeFull(dob: string | null): { y: number; m: number; d: number; display: string } {
    if (!dob) return { y: 0, m: 0, d: 0, display: "—" };
    const birth = new Date(dob + "T00:00:00");
    const now = new Date();
    let y = now.getFullYear() - birth.getFullYear();
    let m = now.getMonth() - birth.getMonth();
    let d = now.getDate() - birth.getDate();
    if (d < 0) {
        m--;
        const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        d += prevMonth.getDate();
    }
    if (m < 0) { y--; m += 12; }
    y = Math.max(0, y); m = Math.max(0, m); d = Math.max(0, d);
    const parts: string[] = [];
    if (y > 0) parts.push(`${y} ปี`);
    if (m > 0) parts.push(`${m} เดือน`);
    if (y === 0 && (d > 0 || parts.length === 0)) parts.push(`${d} วัน`);
    return { y, m, d, display: parts.join(" ") };
}

export default function ScreeningDetailPage({ params }: { params: Promise<{ vn: string }> }) {
    const router = useRouter();
    const supabase = createClient();
    const resolved = use(params);
    const vn = decodeURIComponent(resolved.vn);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [saving, setSaving] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [visit, setVisit] = useState<any | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [patient, setPatient] = useState<any | null>(null);
    const [allergies, setAllergies] = useState<Allergy[]>([]);
    const [chronic, setChronic] = useState<Chronic[]>([]);

    /* Form state */
    const [serviceCategory, setServiceCategory] = useState<ServiceCategory>("general_med");
    const [chiefComplaint, setChiefComplaint] = useState("");
    const [painScore, setPainScore] = useState<number | "">("");
    const [triageLevel, setTriageLevel] = useState<TriageLevel>("normal");
    const [nurseNote, setNurseNote] = useState("");
    const [pastHistory, setPastHistory] = useState("");
    const [doctorId, setDoctorId] = useState<string | "">("");
    const [assistantId, setAssistantId] = useState<string | "">("");
    const [rooms, setRooms] = useState<RoomStatus[]>([]);
    const [selectedRoomId, setSelectedRoomId] = useState<string | "">("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [doctors, setDoctors] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [assistants, setAssistants] = useState<any[]>([]);

    const [vitals, setVitals] = useState({
        bp_systolic: "", bp_diastolic: "",
        pulse_rate: "", temperature: "",
        o2_saturation: "",
        weight_kg: "", height_cm: "",
        dtx: "",  // capillary blood glucose
        lmp_date: "",  // last menstrual period
    });

    /* Quick-add forms */
    const [showAddAllergy, setShowAddAllergy] = useState(false);
    const [allergyForm, setAllergyForm] = useState({
        allergen_name: "", allergen_type: "drug", severity: "moderate", reaction: "",
    });
    const [showAddChronic, setShowAddChronic] = useState(false);
    const [chronicForm, setChronicForm] = useState({ disease_name: "", is_controlled: "" as "" | "true" | "false" });

    const bmi = useMemo(() => {
        const w = Number(vitals.weight_kg);
        const h = Number(vitals.height_cm);
        return w > 0 && h > 0 ? (w / Math.pow(h / 100, 2)).toFixed(1) : null;
    }, [vitals.weight_kg, vitals.height_cm]);

    const age = useMemo(() => calcAgeFull(patient?.dob || null), [patient?.dob]);
    const isWomanOfChildbearingAge = useMemo(
        () => patient?.gender === "F" && age.y >= 12 && age.y <= 55,
        [patient?.gender, age.y]
    );

    /* Load data */
    const loadData = useCallback(async () => {
        setLoading(true);
        const [visitRes, doctorsRes, roomsRes, assistantsRes] = await Promise.all([
            supabase.from("visits").select(`
                vn, hn, visit_date, visit_time, status, service_category,
                chief_complaint, pain_score, triage_level, nurse_note,
                bp_systolic, bp_diastolic, pulse_rate, temperature, weight_kg, height_cm,
                doctor_id, assistant_id, room_id,
                patients!inner(hn, prefix, first_name, last_name, gender, dob, blood_group, allergy_summary, disease_summary, past_history, phone, thai_id_card, nhso_rights, occupation, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, marital_status)
            `).eq("vn", vn).maybeSingle(),
            supabase.from("staff").select("id, profile_id, profiles(full_name, role)")
                .in("role", ["doctor", "owner"]).eq("is_active", true),
            supabase.from("v_room_current_status").select("*").order("display_order"),
            supabase.from("staff").select("id, profile_id, profiles(full_name, role)")
                .in("role", ["assistant", "nurse", "staff"]).eq("is_active", true),
        ]);

        if (!visitRes.data) {
            setError("ไม่พบ Visit นี้");
            setLoading(false);
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = visitRes.data as any;
        setVisit(v);
        const pt = Array.isArray(v.patients) ? v.patients[0] : v.patients;
        setPatient(pt);
        setPastHistory(pt?.past_history || "");
        setServiceCategory(v.service_category || "general_med");
        setChiefComplaint(v.chief_complaint || "");
        setPainScore(v.pain_score ?? "");
        setTriageLevel(v.triage_level || "normal");
        setNurseNote(v.nurse_note || "");
        setDoctorId(v.doctor_id || "");
        setAssistantId(v.assistant_id || "");
        setVitals({
            bp_systolic: v.bp_systolic?.toString() || "",
            bp_diastolic: v.bp_diastolic?.toString() || "",
            pulse_rate: v.pulse_rate?.toString() || "",
            temperature: v.temperature?.toString() || "",
            o2_saturation: "",
            weight_kg: v.weight_kg?.toString() || "",
            height_cm: v.height_cm?.toString() || "",
            dtx: "",
            lmp_date: "",
        });
        setDoctors(doctorsRes.data || []);
        setAssistants(assistantsRes.data || []);
        setRooms((roomsRes.data || []) as RoomStatus[]);
        setSelectedRoomId(v.room_id || "");

        // Load allergies + chronic
        const [allergyRes, chronicRes] = await Promise.all([
            supabase.from("patient_allergies").select("*").eq("hn", pt.hn).eq("is_active", true),
            supabase.from("patient_chronic_diseases").select("*").eq("hn", pt.hn),
        ]);
        setAllergies((allergyRes.data || []) as Allergy[]);
        setChronic((chronicRes.data || []) as Chronic[]);

        setLoading(false);
    }, [supabase, vn]);

    useEffect(() => { loadData(); }, [loadData]);

    function setVital(key: keyof typeof vitals, value: string) {
        setVitals(prev => ({ ...prev, [key]: value }));
    }

    /* Reload เฉพาะ allergies + chronic — ไม่แตะ form state */
    async function reloadHistoryOnly() {
        if (!patient?.hn) return;
        const [allergyRes, chronicRes] = await Promise.all([
            supabase.from("patient_allergies").select("*").eq("hn", patient.hn).eq("is_active", true),
            supabase.from("patient_chronic_diseases").select("*").eq("hn", patient.hn),
        ]);
        setAllergies((allergyRes.data || []) as Allergy[]);
        setChronic((chronicRes.data || []) as Chronic[]);
    }

    /* Allergy + Chronic handlers */
    async function handleAddAllergy() {
        if (!allergyForm.allergen_name.trim()) return;
        const res = await addAllergy(patient.hn, {
            allergen_name: allergyForm.allergen_name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            allergen_type: allergyForm.allergen_type as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            severity: allergyForm.severity as any,
            reaction: allergyForm.reaction || undefined,
        });
        if (res.success) {
            setAllergyForm({ allergen_name: "", allergen_type: "drug", severity: "moderate", reaction: "" });
            setShowAddAllergy(false);
            reloadHistoryOnly();
        }
    }

    async function handleRemoveAllergy(id: string) {
        if (!confirm("ลบรายการแพ้นี้?")) return;
        await removeAllergy(id, patient.hn);
        reloadHistoryOnly();
    }

    async function handleAddChronic() {
        if (!chronicForm.disease_name.trim()) return;
        const res = await addChronicDisease(patient.hn, {
            disease_name: chronicForm.disease_name,
            is_controlled: chronicForm.is_controlled === "" ? null : chronicForm.is_controlled === "true",
        });
        if (res.success) {
            setChronicForm({ disease_name: "", is_controlled: "" });
            setShowAddChronic(false);
            reloadHistoryOnly();
        }
    }

    async function handleRemoveChronic(id: string) {
        if (!confirm("ลบโรคประจำตัวนี้?")) return;
        await removeChronicDisease(id, patient.hn);
        reloadHistoryOnly();
    }

    async function handleSave(sendToDoctor: boolean, roomIdOverride?: string) {
        if (!visit) return;

        // Validate required fields before sending to doctor
        if (sendToDoctor) {
            const missing: string[] = [];
            if (!chiefComplaint.trim()) missing.push("อาการสำคัญ (CC)");
            if (!vitals.bp_systolic) missing.push("BP Sys");
            if (!vitals.bp_diastolic) missing.push("BP Dia");
            if (!vitals.pulse_rate) missing.push("Pulse");
            if (!vitals.temperature) missing.push("Temp");
            if (!vitals.o2_saturation) missing.push("O₂Sat");
            if (!vitals.weight_kg) missing.push("Weight");
            if (!vitals.height_cm) missing.push("Height");

            if (missing.length > 0) {
                setError(`กรุณากรอกข้อมูลให้ครบก่อนส่งตรวจ: ${missing.join(", ")}`);
                window.scrollTo({ top: 0, behavior: "smooth" });
                return;
            }
        }

        setSaving(true);
        setError("");

        const toNum = (v: string) => v === "" ? null : Number(v);
        const newStatus = sendToDoctor ? "with_doctor" : visit.status;

        const { data: { user } } = await supabase.auth.getUser();
        const { data: nurseStaff } = user
            ? await supabase.from("staff").select("id").eq("profile_id", user.id).maybeSingle()
            : { data: null };

        const effectiveRoomId = roomIdOverride ?? selectedRoomId;

        const { error: updErr } = await supabase.from("visits").update({
            service_category: serviceCategory,
            chief_complaint: chiefComplaint || null,
            pain_score: painScore === "" ? null : Number(painScore),
            triage_level: triageLevel,
            nurse_note: nurseNote || null,
            bp_systolic: toNum(vitals.bp_systolic),
            bp_diastolic: toNum(vitals.bp_diastolic),
            pulse_rate: toNum(vitals.pulse_rate),
            temperature: toNum(vitals.temperature),
            o2_saturation: toNum(vitals.o2_saturation),
            weight_kg: toNum(vitals.weight_kg),
            height_cm: toNum(vitals.height_cm),
            doctor_id: doctorId || null,
            assistant_id: assistantId || null,
            room_id: effectiveRoomId || null,
            nurse_id: nurseStaff?.id || null,
            status: newStatus,
        }).eq("vn", vn);

        if (updErr) { setError(updErr.message); setSaving(false); return; }

        // อัปเดต Past History (PH) ระดับผู้ป่วย ถ้ามีการแก้
        if ((pastHistory || "") !== (patient?.past_history || "")) {
            await supabase.from("patients").update({ past_history: pastHistory || null }).eq("hn", visit.hn);
        }

        if (vitals.bp_systolic || vitals.pulse_rate || vitals.temperature || vitals.weight_kg || vitals.dtx) {
            await supabase.from("vital_signs").insert({
                vn, hn: visit.hn,
                bp_systolic: toNum(vitals.bp_systolic),
                bp_diastolic: toNum(vitals.bp_diastolic),
                pulse_rate: toNum(vitals.pulse_rate),
                temperature: toNum(vitals.temperature),
                o2_saturation: toNum(vitals.o2_saturation),
                weight_kg: toNum(vitals.weight_kg),
                height_cm: toNum(vitals.height_cm),
                recorded_by: user?.id,
            });
        }

        if (sendToDoctor) {
            // Update queue_entry status (or create if missing)
            const { data: existingQueue } = await supabase
                .from("queue_entries")
                .select("id, queue_number")
                .eq("vn", vn)
                .maybeSingle();

            if (existingQueue) {
                // มี queue แล้ว → แค่ update status
                await supabase.from("queue_entries")
                    .update({ status: "with_doctor" })
                    .eq("id", existingQueue.id);
            } else {
                // ไม่มี queue → สร้างใหม่ (เผื่อ visit เก่าหรือ data import)
                const { data: profile } = user
                    ? await supabase.from("profiles").select("clinic_id").eq("id", user.id).single()
                    : { data: null };

                if (profile?.clinic_id) {
                    const { data: queueNum } = await supabase.rpc("fn_next_number", {
                        p_clinic_id: profile.clinic_id,
                        p_type: "QUEUE",
                        p_prefix: "A",
                    });
                    await supabase.from("queue_entries").insert({
                        clinic_id: profile.clinic_id,
                        hn: visit.hn,
                        vn,
                        queue_number: queueNum || "A01",
                        queue_type: "walk_in",
                        status: "with_doctor",
                    });
                }
            }

            if (newStatus !== visit.status) {
                await supabase.from("visit_status_logs").insert({
                    vn, old_status: visit.status, new_status: newStatus,
                    changed_by: user?.id,
                    note: "ซักประวัติเสร็จ ส่งตรวจ",
                });
            }
        }

        setSaving(false);
        setSuccess(sendToDoctor ? "✓ ส่งตรวจเรียบร้อย!" : "✓ บันทึกแล้ว");
        setTimeout(() => {
            if (sendToDoctor) router.push("/dashboard/screening");
            else loadData();
        }, 800);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        );
    }

    if (!visit || !patient) {
        return (
            <div className="max-w-2xl mx-auto p-8 text-center">
                <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-2" />
                <p className="text-slate-600">{error || "ไม่พบ Visit"}</p>
                <Link href="/dashboard/screening">
                    <Button variant="outline" className="mt-4 rounded-xl">← กลับคิวซักประวัติ</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-fade-in max-w-7xl mx-auto pb-24">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link href="/dashboard/screening">
                    <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex-1">
                    <h1 className="text-lg font-bold text-slate-800">ซักประวัติ + วัด Vital Signs</h1>
                    <p className="text-xs text-slate-500">บันทึกข้อมูลเบื้องต้น</p>
                </div>
                <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{vn}</span>
            </div>

            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0" /> {success}
                </div>
            )}

            {/* ════ 2-Column Layout ════ */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">

            {/* ╔════════ RIGHT (sticky on desktop) — Patient + History ════════╗ */}
            <div className="lg:order-2 lg:sticky lg:top-4 space-y-4">

            {/* ════ Patient Card ════ */}
            <div className="gonix-card-premium p-4 bg-gradient-to-br from-blue-50/60 to-white">
                {/* Avatar + name centered on sidebar layout */}
                <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60 mb-3">
                    <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-black text-xl shadow-md shadow-blue-500/25 shrink-0">
                        {patient.first_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-lg font-bold text-slate-800 leading-tight">
                            {patient.prefix} {patient.first_name} {patient.last_name}
                        </div>
                        <div className="text-sm font-mono font-bold text-blue-700 mt-0.5">{patient.hn}</div>
                    </div>
                </div>

                <div className="space-y-2">
                    {/* Demographics row */}
                    <div className="text-base text-slate-700 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="text-sm text-slate-500">เพศ</span>
                            <strong>{patient.gender === "M" ? "ชาย" : patient.gender === "F" ? "หญิง" : "—"}</strong>
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="text-sm text-slate-500">อายุ</span>
                            <strong className="text-blue-800">{age.display}</strong>
                        </span>
                        {patient.blood_group && (
                            <>
                                <span className="text-slate-300">·</span>
                                <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                                    <Droplet className="h-3.5 w-3.5" /> {patient.blood_group}
                                </span>
                            </>
                        )}
                    </div>

                    {/* Contact + ID grid */}
                    <div className="grid grid-cols-1 gap-1 text-sm">
                        {patient.thai_id_card && (
                            <div className="flex items-baseline gap-2">
                                <span className="text-slate-500 shrink-0 w-20">เลขบัตร</span>
                                <span className="font-mono text-slate-700">{patient.thai_id_card}</span>
                            </div>
                        )}
                        {patient.phone && (
                            <div className="flex items-baseline gap-2">
                                <span className="text-slate-500 shrink-0 w-20">โทรศัพท์</span>
                                <span className="font-mono text-slate-700">{patient.phone}</span>
                            </div>
                        )}
                        {patient.nhso_rights && (
                            <div className="flex items-baseline gap-2">
                                <span className="text-slate-500 shrink-0 w-20">สิทธิ์</span>
                                <span className="text-slate-700 font-semibold">{NHSO_LABEL[patient.nhso_rights] || patient.nhso_rights}</span>
                            </div>
                        )}
                        {patient.occupation && (
                            <div className="flex items-baseline gap-2">
                                <span className="text-slate-500 shrink-0 w-20">อาชีพ</span>
                                <span className="text-slate-700">{patient.occupation}</span>
                            </div>
                        )}
                        {patient.marital_status && (
                            <div className="flex items-baseline gap-2">
                                <span className="text-slate-500 shrink-0 w-20">สถานภาพ</span>
                                <span className="text-slate-700">{MARITAL_LABEL[patient.marital_status] || patient.marital_status}</span>
                            </div>
                        )}
                    </div>

                    {/* Emergency Contact */}
                    {(patient.emergency_contact_name || patient.emergency_contact_phone) && (
                        <div className="mt-2 pt-2 border-t border-slate-200/60">
                            <div className="text-[13px] font-bold text-slate-600 mb-1 flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> ติดต่อฉุกเฉิน
                            </div>
                            <div className="text-sm">
                                {patient.emergency_contact_name && (
                                    <span className="font-semibold text-slate-800">{patient.emergency_contact_name}</span>
                                )}
                                {patient.emergency_contact_relation && (
                                    <span className="text-slate-500 text-xs ml-1">({patient.emergency_contact_relation})</span>
                                )}
                                {patient.emergency_contact_phone && (
                                    <div className="font-mono text-slate-700 text-sm mt-0.5">{patient.emergency_contact_phone}</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Allergies + Chronic Diseases */}
                    <div className="mt-3 pt-3 border-t border-slate-200/60 space-y-3">

                        {/* Allergies */}
                        <div className="flex items-start gap-2 flex-wrap pt-1">
                            <span className="text-[17px] font-bold text-red-700 shrink-0 mt-0.5 inline-flex items-center gap-1.5">
                                <AlertTriangle className="h-5 w-5" /> แพ้
                            </span>
                            {allergies.map(a => (
                                <span key={a.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[15px] font-bold ${severityColor[a.severity] || severityColor.moderate}`}>
                                    {a.allergen_name}
                                    <span className="opacity-70 text-[11px] font-semibold">({SEVERITIES.find(s => s.value === a.severity)?.label || a.severity})</span>
                                    <button onClick={() => handleRemoveAllergy(a.id)} className="ml-0.5 hover:bg-black/10 rounded-full p-0.5">
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                            {/* Legacy free-text fallback */}
                            {patient.allergy_summary && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-300 bg-red-50 text-red-800 text-[14px] italic">
                                    {patient.allergy_summary}
                                    <span className="text-[10px] opacity-70 not-italic">(จากข้อมูลผู้ป่วย)</span>
                                </span>
                            )}
                            {allergies.length === 0 && !patient.allergy_summary && (
                                <span className="text-sm text-slate-400 italic mt-1">ไม่มี</span>
                            )}
                            <button onClick={() => setShowAddAllergy(!showAddAllergy)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-dashed border-red-300 text-[13px] font-semibold text-red-600 hover:bg-red-50">
                                <Plus className="h-3 w-3" /> เพิ่ม
                            </button>
                        </div>

                        {/* Add Allergy form */}
                        {showAddAllergy && (
                            <div className="mt-2 p-3 rounded-lg bg-red-50/60 border border-red-200 space-y-2">
                                <Input value={allergyForm.allergen_name}
                                    onChange={e => setAllergyForm(p => ({ ...p, allergen_name: e.target.value }))}
                                    placeholder="ชื่อสารที่แพ้ *"
                                    className="h-9 text-sm rounded-lg" />
                                <Input value={allergyForm.reaction}
                                    onChange={e => setAllergyForm(p => ({ ...p, reaction: e.target.value }))}
                                    placeholder="อาการ (ถ้ามี) เช่น ผื่น"
                                    className="h-9 text-sm rounded-lg" />
                                <div className="grid grid-cols-2 gap-2">
                                    <select value={allergyForm.allergen_type}
                                        onChange={e => setAllergyForm(p => ({ ...p, allergen_type: e.target.value }))}
                                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
                                        {ALLERGEN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                    <select value={allergyForm.severity}
                                        onChange={e => setAllergyForm(p => ({ ...p, severity: e.target.value }))}
                                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
                                        {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" onClick={handleAddAllergy} className="h-9 rounded-lg gap-1 bg-red-600 hover:bg-red-700 flex-1">
                                        <Plus className="h-3.5 w-3.5" /> เพิ่ม
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setShowAddAllergy(false)} className="h-9 rounded-lg">
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Chronic diseases */}
                        <div className="flex items-start gap-2 flex-wrap pt-1">
                            <span className="text-[17px] font-bold text-amber-700 shrink-0 mt-0.5 inline-flex items-center gap-1.5">
                                <Heart className="h-5 w-5" /> โรคประจำ
                            </span>
                            {chronic.map(c => (
                                <span key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-[15px] font-bold">
                                    {c.disease_name}
                                    {c.is_controlled !== null && c.is_controlled !== undefined && (
                                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${c.is_controlled ? "bg-emerald-200 text-emerald-800" : "bg-amber-200 text-amber-900"}`}>
                                            {c.is_controlled ? "controlled" : "uncontrolled"}
                                        </span>
                                    )}
                                    <button onClick={() => handleRemoveChronic(c.id)} className="ml-0.5 hover:bg-black/10 rounded-full p-0.5">
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                            {/* Legacy free-text fallback */}
                            {patient.disease_summary && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-[14px] italic">
                                    {patient.disease_summary}
                                    <span className="text-[10px] opacity-70 not-italic">(จากข้อมูลผู้ป่วย)</span>
                                </span>
                            )}
                            {chronic.length === 0 && !patient.disease_summary && (
                                <span className="text-sm text-slate-400 italic mt-1">ไม่มี</span>
                            )}
                            <button onClick={() => setShowAddChronic(!showAddChronic)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-dashed border-amber-300 text-[13px] font-semibold text-amber-700 hover:bg-amber-50">
                                <Plus className="h-3 w-3" /> เพิ่ม
                            </button>
                        </div>

                        {/* Add Chronic form */}
                        {showAddChronic && (
                            <div className="mt-2 p-3 rounded-lg bg-amber-50/60 border border-amber-200 space-y-2">
                                <Input value={chronicForm.disease_name}
                                    onChange={e => setChronicForm(p => ({ ...p, disease_name: e.target.value }))}
                                    placeholder="ชื่อโรค เช่น เบาหวาน ความดัน"
                                    className="h-9 text-sm rounded-lg" />
                                <select value={chronicForm.is_controlled}
                                    onChange={e => setChronicForm(p => ({ ...p, is_controlled: e.target.value as "" | "true" | "false" }))}
                                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
                                    <option value="">— ไม่ระบุการควบคุมอาการ —</option>
                                    <option value="true">คุมได้</option>
                                    <option value="false">คุมไม่ได้</option>
                                </select>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" onClick={handleAddChronic} className="h-9 rounded-lg gap-1 bg-amber-600 hover:bg-amber-700 flex-1">
                                        <Plus className="h-3.5 w-3.5" /> เพิ่ม
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setShowAddChronic(false)} className="h-9 rounded-lg">
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ════ Past History (PH) — แก้ไขได้ตอนซักประวัติ ════ */}
            <div className="gonix-card-premium p-4">
                <label className="text-sm font-bold text-slate-700 mb-2 block">ประวัติเจ็บป่วยในอดีต (PH)</label>
                <textarea
                    value={pastHistory}
                    onChange={e => setPastHistory(e.target.value)}
                    rows={2}
                    placeholder="โรค/ผ่าตัด/การรักษาที่ผ่านมา — บันทึกพร้อมตอนส่งตรวจ"
                    className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">บันทึกลงประวัติผู้ป่วย (ใช้ร่วมกับทะเบียน/เวชระเบียน)</p>
            </div>

            {/* ════ Action button — ส่งตรวจ ════ */}
            <div className="gonix-card-premium p-4 space-y-3">
                {triageLevel !== "normal" && (
                    <div className={`text-center px-3 py-1.5 rounded-lg text-sm font-bold ${
                        triageLevel === "emergency" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}>
                        {triageLevel === "emergency" ? "🚨 ฉุกเฉิน" : "⚠ เร่งด่วน"}
                    </div>
                )}
                <div className="text-xs text-slate-500 text-center">
                    <Stethoscope className="h-3.5 w-3.5 inline mr-1 text-slate-400" />
                    ส่งให้ {SERVICE_LABEL[serviceCategory]}
                </div>
                <Button disabled={saving} onClick={() => {
                    // Validate vitals + CC + ห้อง ก่อนส่งตรวจ
                    const missing: string[] = [];
                    if (!chiefComplaint.trim()) missing.push("อาการสำคัญ (CC)");
                    if (!vitals.bp_systolic) missing.push("BP Sys");
                    if (!vitals.bp_diastolic) missing.push("BP Dia");
                    if (!vitals.pulse_rate) missing.push("Pulse");
                    if (!vitals.temperature) missing.push("Temp");
                    if (!vitals.o2_saturation) missing.push("O₂Sat");
                    if (!vitals.weight_kg) missing.push("Weight");
                    if (!vitals.height_cm) missing.push("Height");
                    if (!selectedRoomId) missing.push("ห้องตรวจ");
                    if (missing.length > 0) {
                        setError(`กรุณากรอกข้อมูลให้ครบก่อนส่งตรวจ: ${missing.join(", ")}`);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                        return;
                    }
                    setError("");
                    handleSave(true);
                }}
                    className="w-full rounded-xl gap-2 h-12 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-md text-base font-bold">
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    ส่งตรวจ <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            </div>
            {/* ╚════════ END RIGHT column ════════╝ */}

            {/* ╔════════ LEFT — Form ════════╗ */}
            <div className="lg:order-1 space-y-4">

            {/* ════ Visit Info ════ */}
            <div className="gonix-card-premium p-5 space-y-5">
                {/* CC full-width */}
                <div className="space-y-1.5">
                    <Label className="text-[15px] font-bold text-slate-800">อาการสำคัญ (CC) <span className="text-red-500">*</span></Label>
                    <textarea value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)}
                        placeholder="ปวดหัว มีไข้ 2 วัน, ทำแผลที่ขา..."
                        rows={2}
                        className={`w-full rounded-lg border px-3 py-2 text-base focus:outline-none focus:ring-2 focus:border-blue-500 resize-none ${
                            !chiefComplaint.trim()
                                ? "border-red-300 focus:ring-red-500/30 bg-red-50/30"
                                : "border-slate-300 focus:ring-blue-500/30"
                        }`} />
                </div>

                {/* Service Category + Pain Score in same row */}
                <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
                    <div className="space-y-1.5">
                        <Label className="text-[15px] font-bold text-slate-800">ประเภทบริการ</Label>
                        <ServiceCategoryPicker value={serviceCategory} onChange={setServiceCategory} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[15px] font-bold text-slate-800">Pain Score</Label>
                        <div className="flex flex-wrap items-center gap-1">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                <button key={n} type="button" onClick={() => setPainScore(painScore === n ? "" : n)}
                                    className={`h-10 w-10 rounded-lg text-sm font-bold transition-all ${
                                        painScore === n
                                            ? n >= 7 ? "bg-red-600 text-white" : n >= 4 ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"
                                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                    }`}>
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <hr className="border-slate-200" />

                {/* Vital Signs */}
                <div>
                    <div className="flex items-baseline justify-between mb-2">
                        <Label className="text-[15px] font-bold text-slate-800 flex items-center gap-1">
                            <Activity className="h-3 w-3" /> Vital Signs
                        </Label>
                        {bmi && (
                            <span className="text-xs text-slate-600">
                                BMI: <strong className="text-blue-700">{bmi}</strong>{" "}
                                <span className="text-[10px] text-slate-500">
                                    {Number(bmi) < 18.5 ? "(ต่ำกว่ามาตรฐาน)" :
                                     Number(bmi) < 23 ? "(ปกติ)" :
                                     Number(bmi) < 25 ? "(เกิน)" :
                                     Number(bmi) < 30 ? "(อ้วน)" : "(อ้วนมาก)"}
                                </span>
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <VitalInput required label="BP Sys" thaiLabel="ความดันบน" unit="mmHg" value={vitals.bp_systolic} onChange={v => setVital("bp_systolic", v)} />
                        <VitalInput required label="BP Dia" thaiLabel="ความดันล่าง" unit="mmHg" value={vitals.bp_diastolic} onChange={v => setVital("bp_diastolic", v)} />
                        <VitalInput required label="Pulse" thaiLabel="ชีพจร" unit="/min" value={vitals.pulse_rate} onChange={v => setVital("pulse_rate", v)} />
                        <VitalInput required label="Temp" thaiLabel="อุณหภูมิ" unit="°C" value={vitals.temperature} onChange={v => setVital("temperature", v)} step="0.1" />
                        <VitalInput required label="O₂Sat" thaiLabel="ออกซิเจน" unit="%" value={vitals.o2_saturation} onChange={v => setVital("o2_saturation", v)} />
                        <VitalInput label="DTX" thaiLabel="น้ำตาลในเลือด" unit="mg/dL" value={vitals.dtx} onChange={v => setVital("dtx", v)} />
                        <VitalInput required label="Weight" thaiLabel="น้ำหนัก" unit="kg" value={vitals.weight_kg} onChange={v => setVital("weight_kg", v)} step="0.1" />
                        <VitalInput required label="Height" thaiLabel="ส่วนสูง" unit="cm" value={vitals.height_cm} onChange={v => setVital("height_cm", v)} />
                    </div>
                </div>

                {/* LMP — for women of childbearing age */}
                {isWomanOfChildbearingAge && (
                    <div className="rounded-lg bg-pink-50/60 border border-pink-200 p-3 space-y-1.5">
                        <Label className="text-[15px] font-bold text-pink-700 flex items-center gap-1.5">
                            <Calendar className="h-4 w-4" /> ประจำเดือนครั้งสุดท้าย (LMP)
                        </Label>
                        <div className="flex items-center gap-2">
                            <Input type="date" value={vitals.lmp_date}
                                onChange={e => setVital("lmp_date", e.target.value)}
                                className="h-9 rounded-lg max-w-[200px]" />
                            <span className="text-[11px] text-pink-700">⚠ สำคัญสำหรับการสั่งยา/X-ray</span>
                        </div>
                    </div>
                )}

                <hr className="border-slate-200" />

                {/* Triage + Doctor */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-[15px] font-bold text-slate-800">ความเร่งด่วน</Label>
                        <div className="flex gap-1.5">
                            {([
                                { v: "normal", l: "ปกติ", c: "bg-slate-200 text-slate-700" },
                                { v: "urgent", l: "เร่งด่วน", c: "bg-amber-500 text-white" },
                                { v: "emergency", l: "ฉุกเฉิน", c: "bg-red-600 text-white" },
                            ] as { v: TriageLevel; l: string; c: string }[]).map(t => (
                                <button key={t.v} type="button" onClick={() => setTriageLevel(t.v)}
                                    className={`flex-1 h-11 rounded-lg text-sm font-bold transition-all ${
                                        triageLevel === t.v ? t.c + " shadow-sm" : "bg-slate-50 text-slate-400 border border-slate-200 hover:bg-slate-100"
                                    }`}>
                                    {t.l}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[15px] font-bold text-slate-800">ห้องตรวจ <span className="text-red-500">*</span></Label>
                        <select
                            value={selectedRoomId}
                            onChange={e => setSelectedRoomId(e.target.value)}
                            className={`flex h-9 w-full rounded-lg border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ${
                                !selectedRoomId ? "border-red-300 bg-red-50/30" : "border-slate-300"
                            }`}
                        >
                            <option value="">— เลือกห้องตรวจ —</option>
                            {rooms.map((r) => {
                                const doctorPart = r.doctor_name
                                    ? ` · 🟢 ${r.doctor_name} (อยู่ห้อง)`
                                    : r.assigned_doctors && r.assigned_doctors.length > 0
                                        ? ` · ${r.assigned_doctors.map(d => d.name).join(", ")}`
                                        : " · ยังไม่มีหมอ";
                                const queuePart = r.waiting_count > 0 ? ` · รอ ${r.waiting_count}` : "";
                                return (
                                    <option key={r.room_id} value={r.room_id}>
                                        {r.room_name}{doctorPart}{queuePart}
                                    </option>
                                );
                            })}
                        </select>
                        {rooms.length === 0 && (
                            <p className="text-[11px] text-amber-700">⚠ ยังไม่มีห้องตรวจ — ติดต่อ Admin สร้างห้องก่อน</p>
                        )}
                    </div>
                </div>

                {/* Assistant (สำหรับคำนวณ commission ผู้ช่วย) */}
                <div className="space-y-1.5">
                    <Label className="text-[15px] font-bold text-slate-800">
                        ผู้ช่วยหัตถการ <span className="text-[11px] font-normal text-slate-400">(ถ้ามี — ใช้คำนวณค่า DF ผู้ช่วย)</span>
                    </Label>
                    <select
                        value={assistantId}
                        onChange={e => setAssistantId(e.target.value)}
                        className="flex h-10 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    >
                        <option value="">— ไม่ระบุ —</option>
                        {assistants.map((a) => {
                            const p = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
                            return (
                                <option key={a.id} value={a.id}>
                                    {p?.full_name || "—"}{p?.role ? ` (${p.role})` : ""}
                                </option>
                            );
                        })}
                    </select>
                </div>

                {/* Nurse Note */}
                <div className="space-y-1.5">
                    <Label className="text-[15px] font-bold text-slate-800">หมายเหตุพยาบาล</Label>
                    <textarea value={nurseNote} onChange={e => setNurseNote(e.target.value)}
                        placeholder="ข้อสังเกต, ยาที่กิน, ภาวะที่ต้องระวัง..."
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none" />
                </div>
            </div>

            </div>
            {/* ╚════════ END LEFT column ════════╝ */}

            </div>
            {/* ╚════════ END 2-Column Layout ════════╝ */}

        </div>
    );
}

function ServiceCategoryPicker({
    value, onChange,
}: { value: ServiceCategory; onChange: (v: ServiceCategory) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const current = SERVICE_OPTIONS.find(o => o.value === value) || SERVICE_OPTIONS[0];
    const CurrentIcon = current.icon;

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            {/* Trigger button */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`group flex items-center gap-2.5 w-full h-11 rounded-lg border-2 px-3 text-left transition-all ${
                    open
                        ? `${current.bg} border-current ${current.text}`
                        : `bg-white border-slate-300 hover:border-slate-400 ${current.text}`
                }`}
            >
                <div className={`h-7 w-7 rounded-md ${current.bg} flex items-center justify-center shrink-0 ${current.text}`}>
                    <CurrentIcon className="h-4 w-4" />
                </div>
                <span className="flex-1 text-base font-semibold text-slate-800 truncate">
                    {current.label}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown menu */}
            {open && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden py-1">
                    {SERVICE_OPTIONS.map(opt => {
                        const Icon = opt.icon;
                        const isSelected = opt.value === value;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => { onChange(opt.value); setOpen(false); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                                    isSelected ? `${opt.bg}` : "hover:bg-slate-50"
                                }`}
                            >
                                <div className={`h-8 w-8 rounded-md ${opt.bg} flex items-center justify-center shrink-0 ${opt.text}`}>
                                    <Icon className="h-4 w-4" />
                                </div>
                                <span className={`flex-1 text-sm font-semibold ${isSelected ? opt.text : "text-slate-700"}`}>
                                    {opt.label}
                                </span>
                                {isSelected && <Check className={`h-4 w-4 ${opt.text}`} />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function VitalInput({
    label, thaiLabel, unit, value, onChange, step, required,
}: {
    label: string;
    thaiLabel?: string;
    unit: string;
    value: string;
    onChange: (v: string) => void;
    step?: string;
    required?: boolean;
}) {
    const isEmpty = required && !value;
    return (
        <div className="space-y-1">
            <div className="px-1 flex items-baseline gap-1.5 flex-wrap leading-none">
                <span className="text-[13px] font-bold text-slate-700">
                    {label}
                    {required && <span className="text-red-500 ml-0.5">*</span>}
                </span>
                {thaiLabel && <span className="text-[11px] text-slate-500">{thaiLabel}</span>}
            </div>
            <div className="relative">
                <input
                    type="number"
                    step={step || "1"}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className={`h-11 w-full rounded-lg border bg-white pl-3 pr-11 text-base font-bold text-slate-800 tabular-nums focus:outline-none focus:ring-2 focus:border-blue-500 ${
                        isEmpty
                            ? "border-red-300 focus:ring-red-500/30 bg-red-50/30"
                            : "border-slate-300 focus:ring-blue-500/30"
                    }`}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">{unit}</span>
            </div>
        </div>
    );
}
