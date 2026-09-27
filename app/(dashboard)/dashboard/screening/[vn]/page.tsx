"use client";

import { useState, useEffect, useRef, useCallback, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../../visits/[vn]/visit-workspace.module.css";
import { MaskedId } from "@/components/ui/masked-id";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    ArrowLeft, Loader2, AlertCircle, CheckCircle, Send,
    Droplet, AlertTriangle, ChevronRight, Heart, Stethoscope,
    Plus, X, Activity, Calendar,
    Sparkles, Bandage, FileText, HeartPulse, TestTube, ChevronDown, Check, Printer,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { SERVICE_LABEL, type ServiceCategory, type TriageLevel } from "@/lib/visit-service-types";
import { MED_CERT_TYPES } from "@/lib/med-cert-types";
import { setMedCertDraftType } from "@/lib/actions/med-cert";
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

/** ตัวอย่างอาการสำคัญตามประเภทบริการ */
const CC_PLACEHOLDER: Record<string, string> = {
    general_med: "ปวดหัว มีไข้ 2 วัน, ไอ เจ็บคอ...",
    aesthetic: "ปรึกษาริ้วรอยหน้าผาก, ฉีด Botox ซ้ำ, ทำ HIFU ยกกระชับ...",
    wound_care: "ทำแผลที่ขา, ล้างแผลหลังผ่าตัด...",
    med_cert: "ขอใบรับรองแพทย์สมัครงาน / ใบขับขี่...",
    checkup: "ตรวจสุขภาพประจำปี...",
    std_test: "ตรวจเลือดคัดกรอง HIV / ซิฟิลิส...",
};
/** บริการที่ไม่ค่อยใช้ Pain score / ความเร่งด่วน → ย่อเก็บ */
const LIGHT_TRIAGE = new Set(["aesthetic", "med_cert", "checkup", "std_test"]);

/** คำถามคัดกรองก่อนหัตถการความงาม */
const PRE_ITEMS: { key: string; label: string; femaleOnly?: boolean }[] = [
    { key: "pregnant", label: "ตั้งครรภ์ / อาจตั้งครรภ์", femaleOnly: true },
    { key: "breastfeeding", label: "ให้นมบุตร", femaleOnly: true },
    { key: "anticoagulant", label: "ทานยาละลายลิ่มเลือด / แอสไพริน / วิตามิน E / น้ำมันปลา (7 วัน)" },
    { key: "anesthetic_allergy", label: "แพ้ยาชา (Lidocaine) / แพ้ไข่-โปรตีน" },
    { key: "local_infection", label: "มีแผล / การติดเชื้อ / สิวอักเสบ บริเวณที่จะทำ" },
    { key: "keloid", label: "เป็นแผลเป็นนูน (คีลอยด์) ง่าย" },
    { key: "autoimmune", label: "โรคภูมิคุ้มกัน / กล้ามเนื้ออ่อนแรง (MG)" },
];
type PreScreen = Record<string, boolean | string | undefined> & { last_treatment?: string; none_confirmed?: boolean };

/** เกณฑ์ค่าผิดปกติ (ผู้ใหญ่) → เตือนสีส้ม/แดง */
function vitalFlag(key: string, raw: string): { level: "warn" | "danger"; text: string } | null {
    const v = Number(raw);
    if (raw === "" || !Number.isFinite(v)) return null;
    switch (key) {
        case "bp_systolic": return v >= 180 ? { level: "danger", text: "สูงมาก" } : v >= 140 ? { level: "warn", text: "สูง" } : v < 90 ? { level: "warn", text: "ต่ำ" } : null;
        case "bp_diastolic": return v >= 110 ? { level: "danger", text: "สูงมาก" } : v >= 90 ? { level: "warn", text: "สูง" } : v < 60 ? { level: "warn", text: "ต่ำ" } : null;
        case "pulse_rate": return v >= 130 || v < 40 ? { level: "danger", text: v < 40 ? "ช้ามาก" : "เร็วมาก" } : v > 100 ? { level: "warn", text: "เร็ว" } : v < 50 ? { level: "warn", text: "ช้า" } : null;
        case "temperature": return v >= 39 ? { level: "danger", text: "ไข้สูง" } : v >= 37.5 ? { level: "warn", text: "มีไข้" } : v < 35.5 ? { level: "warn", text: "ต่ำ" } : null;
        case "o2_saturation": return v < 90 ? { level: "danger", text: "ต่ำมาก" } : v < 95 ? { level: "warn", text: "ต่ำ" } : null;
        case "dtx": return v < 70 ? { level: "danger", text: "น้ำตาลต่ำ" } : v > 250 ? { level: "danger", text: "สูงมาก" } : v > 180 ? { level: "warn", text: "สูง" } : null;
        default: return null;
    }
}

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
    const [submitAttempted, setSubmitAttempted] = useState(false);
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
    const [medCertType, setMedCertType] = useState("treatment");
    const [chiefComplaint, setChiefComplaint] = useState("");
    const [painScore, setPainScore] = useState<number | "">("");
    const [triageLevel, setTriageLevel] = useState<TriageLevel>("normal");
    const [nurseNote, setNurseNote] = useState("");
    const [pastHistory, setPastHistory] = useState("");
    const [doctorId, setDoctorId] = useState<string | "">("");
    const [rooms, setRooms] = useState<RoomStatus[]>([]);
    const [selectedRoomId, setSelectedRoomId] = useState<string | "">("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [doctors, setDoctors] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    // ค่าครั้งก่อน (visit ล่าสุดที่มี vital) + ยืนยันประวัติ + คัดกรองก่อนหัตถการ
    const [prev, setPrev] = useState<{ date: string; bp_systolic: number | null; bp_diastolic: number | null; pulse_rate: number | null; weight_kg: number | null; height_cm: number | null; temperature: number | null } | null>(null);
    const [nkda, setNkda] = useState(false);
    const [noChronic, setNoChronic] = useState(false);
    const [preScreen, setPreScreen] = useState<PreScreen>({});
    const [showTriage, setShowTriage] = useState(false);
    const [precheck, setPrecheck] = useState(false);   // หน้าต่างตรวจก่อนส่ง (แทน confirm ของเบราว์เซอร์)
    const vitalsRef = useRef<HTMLDivElement>(null);

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

    const historySummary = (value: unknown) => { const text = String(value ?? "").trim(); return /^[-–—\s]*$/.test(text) ? "" : text; };
    const allergySummary = historySummary(patient?.allergy_summary);
    const diseaseSummary = historySummary(patient?.disease_summary);

    /* Load data */
    const loadData = useCallback(async () => {
        setLoading(true);
        const [visitRes, doctorsRes, roomsRes] = await Promise.all([
            supabase.from("visits").select(`
                vn, hn, visit_date, visit_time, status, service_category,
                chief_complaint, pain_score, triage_level, nurse_note,
                bp_systolic, bp_diastolic, pulse_rate, temperature, weight_kg, height_cm, o2_saturation, dtx, lmp_date, pre_screening,
                doctor_id, room_id,
                patients!inner(hn, prefix, first_name, last_name, gender, dob, blood_group, allergy_summary, disease_summary, past_history, phone, thai_id_card, nhso_rights, occupation, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, marital_status, nkda, no_chronic)
            `).eq("vn", vn).maybeSingle(),
            supabase.from("staff").select("id, profile_id, profiles(full_name, role)")
                .in("role", ["doctor", "owner"]).eq("is_active", true),
            supabase.from("v_room_current_status").select("*").order("display_order"),
        ]);

        if (!visitRes.data) {
            toast.error("ไม่พบ Visit นี้");
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
        // โหลดประเภทใบรับรองจาก draft (ถ้ามี)
        if (v.service_category === "med_cert") {
            supabase.from("medical_certificates").select("cert_type").eq("vn", vn).maybeSingle()
                .then(({ data }) => { if (data?.cert_type) setMedCertType(data.cert_type as string); });
        }
        setChiefComplaint(v.chief_complaint || "");
        setPainScore(v.pain_score ?? "");
        setTriageLevel(v.triage_level || "normal");
        setNurseNote(v.nurse_note || "");
        setDoctorId(v.doctor_id || "");
        // ค่าครั้งก่อน → โชว์ใต้ช่อง + เติมส่วนสูงให้ (ผู้ใหญ่ส่วนสูงไม่ค่อยเปลี่ยน)
        const { data: pv } = await supabase.from("visits").select("visit_date, bp_systolic, bp_diastolic, pulse_rate, weight_kg, height_cm, temperature")
            .eq("hn", v.hn).neq("vn", vn).not("bp_systolic", "is", null).order("visit_date", { ascending: false }).limit(1).maybeSingle();
        setPrev(pv ? { date: pv.visit_date as string, bp_systolic: pv.bp_systolic, bp_diastolic: pv.bp_diastolic, pulse_rate: pv.pulse_rate, weight_kg: pv.weight_kg, height_cm: pv.height_cm, temperature: pv.temperature } : null);
        setNkda(!!pt?.nkda);
        setNoChronic(!!pt?.no_chronic);
        setPreScreen((v.pre_screening as PreScreen) || {});
        setVitals({
            bp_systolic: v.bp_systolic?.toString() || "",
            bp_diastolic: v.bp_diastolic?.toString() || "",
            pulse_rate: v.pulse_rate?.toString() || "",
            temperature: v.temperature?.toString() || "",
            o2_saturation: v.o2_saturation?.toString() || "",
            weight_kg: v.weight_kg?.toString() || "",
            height_cm: v.height_cm?.toString() || (pv?.height_cm ? String(pv.height_cm) : ""),
            dtx: v.dtx?.toString() || "",
            lmp_date: v.lmp_date || "",
        });
        setDoctors(doctorsRes.data || []);
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

    /** ยืนยัน "ถามแล้ว ไม่มี" (แพ้ / โรคประจำตัว) — บันทึกลงประวัติผู้ป่วยทันที */
    async function confirmNone(kind: "nkda" | "no_chronic", value: boolean) {
        if (!patient?.hn) return;
        const { error } = await supabase.from("patients").update({ [kind]: value, history_reviewed_at: new Date().toISOString() }).eq("hn", patient.hn);
        if (error) { toast.error(error.message); return; }
        if (kind === "nkda") setNkda(value); else setNoChronic(value);
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
            if (nkda) confirmNone("nkda", false);
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
            if (noChronic) confirmNone("no_chronic", false);
            reloadHistoryOnly();
        }
    }

    async function handleRemoveChronic(id: string) {
        if (!confirm("ลบโรคประจำตัวนี้?")) return;
        await removeChronicDisease(id, patient.hn);
        reloadHistoryOnly();
    }

    const allergyPending = allergies.length === 0 && !allergySummary && !nkda;
    const prePending = serviceCategory === "aesthetic" && !preScreen.none_confirmed && !PRE_ITEMS.some(i => preScreen[i.key]);

    async function handleSave(sendToDoctor: boolean, roomIdOverride?: string, skipPrecheck = false): Promise<boolean> {
        if (!visit) return false;

        // Validate required fields before sending to doctor
        if (sendToDoctor) {
            setSubmitAttempted(true);
            const missing: string[] = [];
            if (!vitals.bp_systolic) missing.push("BP Sys");
            if (!vitals.bp_diastolic) missing.push("BP Dia");
            if (!vitals.pulse_rate) missing.push("Pulse");
            if (!vitals.weight_kg) missing.push("Weight");
            if (!vitals.height_cm) missing.push("Height");

            if (missing.length > 0) {
                toast.error(`กรุณากรอกข้อมูลให้ครบก่อนส่งตรวจ: ${missing.join(", ")}`);
                window.scrollTo({ top: 0, behavior: "smooth" });
                return false;
            }
            // ยังไม่ยืนยันประวัติแพ้ / ยังไม่คัดกรอง → เปิดหน้าต่างตรวจก่อนส่ง (ไม่บล็อก — ส่งต่อได้)
            if (!skipPrecheck && (allergyPending || prePending)) { setPrecheck(true); return false; }
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
            dtx: toNum(vitals.dtx),
            lmp_date: vitals.lmp_date || null,
            pre_screening: serviceCategory === "aesthetic" ? preScreen : null,
            doctor_id: doctorId || null,
            room_id: effectiveRoomId || null,
            nurse_id: nurseStaff?.id || null,
            status: newStatus,
        }).eq("vn", vn);

        if (updErr) { toast.error(updErr.message); setSaving(false); return false; }

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
                dtx: toNum(vitals.dtx),
                recorded_by: nurseStaff?.id || null,   // FK → staff (เดิมใส่ profile id → insert ไม่ผ่าน)
            });
        }

        // sync ประเภทใบรับรอง draft (กรณี visit ใบรับรอง)
        if (serviceCategory === "med_cert") {
            try { await setMedCertDraftType(vn, visit.hn, medCertType); } catch {}
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
        toast.success(sendToDoctor ? "ส่งตรวจเรียบร้อย!" : "บันทึกแล้ว");
        setTimeout(() => {
            if (sendToDoctor) router.push("/dashboard/screening");
            else loadData();
        }, 800);
        return true;
    }

    // บันทึก vital ก่อน แล้วเปิดพิมพ์ฟอร์มใบรับรอง (ข้อมูล vital จะขึ้นในฟอร์ม)
    async function saveAndPrintCert(lang: "th" | "en") {
        const missing: string[] = [];
        if (!vitals.weight_kg) missing.push("Weight");
        if (!vitals.height_cm) missing.push("Height");
        if (!vitals.bp_systolic) missing.push("BP");
        if (!vitals.pulse_rate) missing.push("Pulse");
        if (missing.length > 0) {
            toast.error(`กรอก Vital ก่อนพิมพ์ (ข้อมูลจะได้ขึ้นในฟอร์ม): ${missing.join(", ")}`);
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        const ok = await handleSave(false);
        if (ok) window.open(`/print/med-cert/${vn}?lang=${lang}`, "_blank");
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
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
        <div className={`${styles.workspace} space-y-4 max-w-7xl mx-auto p-3 sm:p-5 pb-24`}>
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link href="/dashboard/screening">
                    <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex-1">
                    <h1 className="text-lg font-semibold text-slate-800">ซักประวัติ + วัด Vital Signs</h1>
                    <p className="text-xs text-slate-600">บันทึกข้อมูลเบื้องต้น</p>
                </div>
                <span className="font-mono text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded">{vn}</span>
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

            {/* ════ Patient Card ════ */}
            <div className="rounded-2xl border border-white/90 bg-white/80 backdrop-blur-xl shadow-sm p-4">
                {/* Avatar + name centered on sidebar layout */}
                <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60 mb-3">
                    <div className="h-11 w-11 rounded-xl bg-slate-800 flex items-center justify-center text-white font-semibold text-xl shadow-md shadow-blue-500/25 shrink-0">
                        {patient.first_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-lg font-semibold text-slate-800 leading-tight">
                            {patient.prefix} {patient.first_name} {patient.last_name}
                        </div>
                        <div className="text-sm font-mono font-semibold text-blue-700 mt-0.5">{patient.hn}</div>
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

<details className="mt-2"><summary className="cursor-pointer text-sm text-blue-700">ข้อมูลคนไข้เพิ่มเติม</summary>
                    {/* Contact + ID grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                        {patient.thai_id_card && (
                            <div className="flex items-baseline gap-2">
                                <span className="text-slate-500 shrink-0 w-20">เลขบัตร</span>
                                <MaskedId value={patient.thai_id_card} className="text-slate-700" />
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
                            <div className="text-[13px] font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
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

                    </details>
                </div>
            </div>

            {/* ════ 2-Column Layout ════ */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">

            {/* ╔════════ RIGHT (sticky on desktop) — Patient + History ════════╗ */}
            <div className="xl:order-2 space-y-4">

            <div className="rounded-2xl border border-white/90 bg-white/80 backdrop-blur-xl shadow-sm p-4"><div>
                    <h3 className="text-sm font-semibold text-slate-700">ประวัติแพ้ & โรคประจำตัว</h3>
                    {/* Allergies + Chronic Diseases */}
                    <div className="mt-2 space-y-3">

                        {/* Allergies */}
                        <div className="flex items-start gap-2 flex-wrap pt-1">
                            <span className={`text-sm font-semibold ${allergies.length || allergySummary ? "text-red-700" : "text-slate-600"} shrink-0 mt-0.5 inline-flex items-center gap-1.5`}>
                                <AlertTriangle className="h-5 w-5" /> แพ้
                            </span>
                            {allergies.map(a => (
                                <span key={a.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[15px] font-semibold ${severityColor[a.severity] || severityColor.moderate}`}>
                                    {a.allergen_name}
                                    <span className="text-xs font-semibold">({SEVERITIES.find(s => s.value === a.severity)?.label || a.severity})</span>
                                    <button onClick={() => handleRemoveAllergy(a.id)} className="ml-0.5 hover:bg-black/10 rounded-full p-0.5">
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                            {/* Legacy free-text fallback */}
                            {allergySummary && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-300 bg-red-50 text-red-800 text-[14px] italic">
                                    {allergySummary}
                                    <span className="text-xs not-italic">(จากข้อมูลผู้ป่วย)</span>
                                </span>
                            )}
                            {allergies.length === 0 && !allergySummary && (nkda ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 text-[13px] font-semibold">
                                    <Check className="h-3.5 w-3.5" /> ไม่มีประวัติแพ้ (ถามแล้ว)
                                    <button onClick={() => confirmNone("nkda", false)} className="ml-0.5 hover:bg-black/10 rounded-full p-0.5" aria-label="ยกเลิก"><X className="h-3 w-3" /></button>
                                </span>
                            ) : (<>
                                <span className="text-sm text-amber-700 mt-1 font-semibold">ยังไม่ได้ถาม</span>
                                <button onClick={() => confirmNone("nkda", true)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-300 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-50">
                                    <Check className="h-3 w-3" /> ไม่มีประวัติแพ้
                                </button>
                            </>))}
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
                            <span className={`text-sm font-semibold ${chronic.length || diseaseSummary ? "text-amber-700" : "text-slate-600"} shrink-0 mt-0.5 inline-flex items-center gap-1.5`}>
                                <Heart className="h-5 w-5" /> โรคประจำ
                            </span>
                            {chronic.map(c => (
                                <span key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-[15px] font-semibold">
                                    {c.disease_name}
                                    {c.is_controlled !== null && c.is_controlled !== undefined && (
                                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.is_controlled ? "bg-emerald-200 text-emerald-800" : "bg-amber-200 text-amber-900"}`}>
                                            {c.is_controlled ? "controlled" : "uncontrolled"}
                                        </span>
                                    )}
                                    <button onClick={() => handleRemoveChronic(c.id)} className="ml-0.5 hover:bg-black/10 rounded-full p-0.5">
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                            {/* Legacy free-text fallback */}
                            {diseaseSummary && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-[14px] italic">
                                    {diseaseSummary}
                                    <span className="text-xs not-italic">(จากข้อมูลผู้ป่วย)</span>
                                </span>
                            )}
                            {chronic.length === 0 && !diseaseSummary && (noChronic ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 text-[13px] font-semibold">
                                    <Check className="h-3.5 w-3.5" /> ไม่มีโรคประจำตัว (ถามแล้ว)
                                    <button onClick={() => confirmNone("no_chronic", false)} className="ml-0.5 hover:bg-black/10 rounded-full p-0.5" aria-label="ยกเลิก"><X className="h-3 w-3" /></button>
                                </span>
                            ) : (<>
                                <span className="text-sm text-amber-700 mt-1 font-semibold">ยังไม่ได้ถาม</span>
                                <button onClick={() => confirmNone("no_chronic", true)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-300 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-50">
                                    <Check className="h-3 w-3" /> ไม่มีโรคประจำตัว
                                </button>
                            </>))}
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
            <div className="rounded-2xl border border-white/90 bg-white/80 backdrop-blur-xl shadow-sm p-4">
                <label className="text-sm font-semibold text-slate-700 mb-2 block">ประวัติเจ็บป่วยในอดีต (PH)</label>
                <textarea
                    value={pastHistory}
                    onChange={e => setPastHistory(e.target.value)}
                    rows={2}
                    placeholder="โรค/ผ่าตัด/การรักษาที่ผ่านมา — บันทึกพร้อมตอนส่งตรวจ"
                    className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-xs text-slate-600 mt-1">บันทึกลงประวัติผู้ป่วย (ใช้ร่วมกับทะเบียน/เวชระเบียน)</p>
            </div>


            </div>
            {/* ╚════════ END RIGHT column ════════╝ */}

            {/* ╔════════ LEFT — Form ════════╗ */}
            <div className="xl:order-1 space-y-4">

            {/* ════ Visit Info ════ */}
            <div className="rounded-2xl border border-white/90 bg-white/80 backdrop-blur-xl shadow-sm p-5 space-y-5">
                <h2 className="text-base font-semibold text-slate-800">อาการและการคัดกรอง</h2>
                {/* CC full-width */}
                <div className="space-y-1.5">
                    <Label className="text-[15px] font-semibold text-slate-800">อาการสำคัญ (CC)</Label>
                    <textarea value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)}
                        placeholder={CC_PLACEHOLDER[serviceCategory] || CC_PLACEHOLDER.general_med}
                        rows={2}
                        className={`w-full rounded-lg border px-3 py-2 text-base focus:outline-none focus:ring-2 focus:border-blue-500 resize-none ${
                            "border-slate-300 focus:ring-blue-500/30"
                        }`} />
                </div>

                {/* ประเภทบริการ + ห้องตรวจ */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    <div className="space-y-1.5">
                        <Label className="text-[15px] font-semibold text-slate-800">ประเภทบริการ</Label>
                        <ServiceCategoryPicker value={serviceCategory} onChange={setServiceCategory} />
                        {serviceCategory === "med_cert" && (
                            <div className="mt-2">
                                <Label className="text-xs font-semibold text-emerald-800">ประเภทใบรับรอง</Label>
                                <select value={medCertType} onChange={e => setMedCertType(e.target.value)}
                                    className="mt-1 w-full h-11 rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 text-sm font-semibold text-slate-700">
                                    {MED_CERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[15px] font-semibold text-slate-800">ห้องตรวจ (เลือกได้)</Label>
                        <select
                            value={selectedRoomId}
                            onChange={e => {
                                const rid = e.target.value;
                                setSelectedRoomId(rid);
                                // ตั้งแพทย์ตามห้อง: หมอที่อยู่ในห้องตอนนี้ ก่อน แล้วค่อยหมอประจำห้อง
                                const room = rooms.find(r => r.room_id === rid);
                                const docId = room?.doctor_staff_id || room?.assigned_doctors?.[0]?.staff_id || "";
                                if (docId) setDoctorId(docId);
                            }}
                            className={`flex h-11 w-full rounded-lg border-2 bg-white px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ${
                                "border-slate-300"
                            }`}
                        >
                            <option value="">— ไม่ระบุห้องตรวจ —</option>
                            {rooms.map((r) => {
                                const doctorPart = r.doctor_name
                                    ? ` · ${r.doctor_name} (อยู่ห้อง)`
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
                            <p className="text-xs text-amber-700">ยังไม่มีห้องตรวจ — ติดต่อ Admin สร้างห้องก่อน</p>
                        )}
                    </div>
                </div>

                <hr className="border-slate-200" />

                {/* Vital Signs */}
                <div>
                    <div className="flex items-baseline justify-between mb-2">
                        <Label className="text-[15px] font-semibold text-slate-800 flex items-center gap-1">
                            <Activity className="h-3 w-3" /> Vital Signs{prev && <span title={`ค่าครั้งก่อนจาก visit วันที่ ${prev.date}`} className="ml-1 text-xs font-normal text-slate-400">(เทียบครั้งก่อน {new Date(prev.date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })})</span>}
                        </Label>
                        {bmi && (
                            <span className="text-xs text-slate-600">
                                BMI: <strong className="text-blue-700">{bmi}</strong>{" "}
                                <span className="text-xs text-slate-600">
                                    {Number(bmi) < 18.5 ? "(ต่ำกว่ามาตรฐาน)" :
                                     Number(bmi) < 23 ? "(ปกติ)" :
                                     Number(bmi) < 25 ? "(เกิน)" :
                                     Number(bmi) < 30 ? "(อ้วน)" : "(อ้วนมาก)"}
                                </span>
                            </span>
                        )}
                    </div>
                    <div ref={vitalsRef} className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                        onKeyDown={e => {
                            // Enter → ช่องถัดไป (กรอกด้วยคีย์บอร์ดล้วน)
                            if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
                            e.preventDefault();
                            const all = Array.from(vitalsRef.current?.querySelectorAll("input") || []);
                            const i = all.indexOf(e.target);
                            if (i >= 0 && all[i + 1]) all[i + 1].focus(); else (e.target as HTMLInputElement).blur();
                        }}>
                        <VitalInput required showError={submitAttempted} label="BP Sys" thaiLabel="ความดันบน" unit="mmHg" value={vitals.bp_systolic} onChange={v => setVital("bp_systolic", v)} prev={prev?.bp_systolic} flag={vitalFlag("bp_systolic", vitals.bp_systolic)} />
                        <VitalInput required showError={submitAttempted} label="BP Dia" thaiLabel="ความดันล่าง" unit="mmHg" value={vitals.bp_diastolic} onChange={v => setVital("bp_diastolic", v)} prev={prev?.bp_diastolic} flag={vitalFlag("bp_diastolic", vitals.bp_diastolic)} />
                        <VitalInput required showError={submitAttempted} label="Pulse" thaiLabel="ชีพจร" unit="/min" value={vitals.pulse_rate} onChange={v => setVital("pulse_rate", v)} prev={prev?.pulse_rate} flag={vitalFlag("pulse_rate", vitals.pulse_rate)} />
                        <VitalInput label="Temp" thaiLabel="อุณหภูมิ" unit="°C" value={vitals.temperature} onChange={v => setVital("temperature", v)} step="0.1" prev={prev?.temperature} flag={vitalFlag("temperature", vitals.temperature)} />
                        <VitalInput label="O₂Sat" thaiLabel="ออกซิเจน" unit="%" value={vitals.o2_saturation} onChange={v => setVital("o2_saturation", v)} flag={vitalFlag("o2_saturation", vitals.o2_saturation)} />
                        <VitalInput label="DTX" thaiLabel="น้ำตาลในเลือด" unit="mg/dL" value={vitals.dtx} onChange={v => setVital("dtx", v)} flag={vitalFlag("dtx", vitals.dtx)} />
                        <VitalInput required showError={submitAttempted} label="Weight" thaiLabel="น้ำหนัก" unit="kg" value={vitals.weight_kg} onChange={v => setVital("weight_kg", v)} step="0.1" prev={prev?.weight_kg} />
                        <VitalInput required showError={submitAttempted} label="Height" thaiLabel="ส่วนสูง" unit="cm" value={vitals.height_cm} onChange={v => setVital("height_cm", v)} prev={prev?.height_cm} />
                    </div>
                </div>

                {/* LMP — for women of childbearing age */}
                {isWomanOfChildbearingAge && (
                    <div className="rounded-lg bg-pink-50/60 border border-pink-200 p-3 space-y-1.5">
                        <Label className="text-[15px] font-semibold text-pink-700 flex items-center gap-1.5">
                            <Calendar className="h-4 w-4" /> ประจำเดือนครั้งสุดท้าย (LMP)
                        </Label>
                        <div className="flex items-center gap-2">
                            <Input type="date" value={vitals.lmp_date}
                                onChange={e => setVital("lmp_date", e.target.value)}
                                className="h-9 rounded-lg max-w-[200px]" />
                            <span className="text-xs text-pink-700">สำคัญสำหรับการสั่งยา/X-ray</span>
                        </div>
                    </div>
                )}

                {serviceCategory === "aesthetic" && (() => {
                    const items = PRE_ITEMS.filter(i => !i.femaleOnly || isWomanOfChildbearingAge);
                    const hits = items.filter(i => preScreen[i.key]);
                    return (
                        <div className={`rounded-xl border p-3 space-y-2 ${hits.length ? "border-amber-300 bg-amber-50/60" : "border-pink-200 bg-pink-50/40"}`}>
                            <div className="flex flex-wrap items-center gap-2">
                                <Label className="text-[15px] font-semibold text-pink-800 flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> คัดกรองก่อนหัตถการ</Label>
                                {hits.length > 0 && <span className="text-xs font-semibold text-amber-800">⚠ ข้อควรระวัง {hits.length} ข้อ — แจ้งแพทย์</span>}
                                <span className="flex-1" />
                                {!hits.length && (
                                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                                        <input type="checkbox" checked={!!preScreen.none_confirmed} onChange={e => setPreScreen(p => ({ ...p, none_confirmed: e.target.checked }))} className="h-4 w-4" /> ถามครบแล้ว ไม่มีข้อใด
                                    </label>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                                {items.map(i => (
                                    <label key={i.key} className={`flex items-start gap-2 text-sm ${preScreen[i.key] ? "text-amber-900 font-semibold" : "text-slate-700"}`}>
                                        <input type="checkbox" checked={!!preScreen[i.key]} onChange={e => setPreScreen(p => ({ ...p, [i.key]: e.target.checked, none_confirmed: false }))} className="h-4 w-4 mt-0.5" />
                                        {i.label}
                                    </label>
                                ))}
                            </div>
                            <Input value={String(preScreen.last_treatment || "")} onChange={e => setPreScreen(p => ({ ...p, last_treatment: e.target.value }))}
                                placeholder="ทำหัตถการครั้งล่าสุด (ที่นี่/ที่อื่น) เช่น Botox หน้าผาก 4 เดือนก่อน" className="h-9 rounded-lg text-sm bg-white" />
                        </div>
                    );
                })()}

                <hr className="border-slate-200" />

                {/* Pain score + ความเร่งด่วน (ย่อเก็บสำหรับบริการที่ไม่ค่อยใช้) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {LIGHT_TRIAGE.has(serviceCategory) && !showTriage && painScore === "" && triageLevel === "normal" ? (
                        <div>
                            <button type="button" onClick={() => setShowTriage(true)} className="text-xs text-blue-700 hover:underline">+ Pain score / ความเร่งด่วน (ถ้ามี)</button>
                        </div>
                    ) : (
                    <div className="space-y-1.5">
                        <Label className="text-[15px] font-semibold text-slate-800">Pain Score</Label>
                        <div className="grid grid-cols-6 sm:grid-cols-11 gap-1 max-w-xl">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                <button key={n} type="button" onClick={() => setPainScore(painScore === n ? "" : n)}
                                    className={`h-10 rounded-lg text-sm font-semibold transition-all ${
                                        painScore === n
                                            ? n >= 7 ? "bg-red-600 text-white" : n >= 4 ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"
                                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                    }`}>
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>
                    )}
                    {LIGHT_TRIAGE.has(serviceCategory) && !showTriage && triageLevel === "normal" && painScore === "" ? null : (
                    <div className="space-y-1.5">
                        <Label className="text-[15px] font-semibold text-slate-800">ความเร่งด่วน</Label>
                        <div className="flex gap-1.5">
                            {([
                                { v: "normal", l: "ปกติ", c: "bg-slate-200 text-slate-700" },
                                { v: "urgent", l: "เร่งด่วน", c: "bg-amber-500 text-white" },
                                { v: "emergency", l: "ฉุกเฉิน", c: "bg-red-600 text-white" },
                            ] as { v: TriageLevel; l: string; c: string }[]).map(t => (
                                <button key={t.v} type="button" onClick={() => setTriageLevel(t.v)}
                                    className={`flex-1 h-11 rounded-lg text-sm font-semibold transition-all ${
                                        triageLevel === t.v ? t.c + " shadow-sm" : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                                    }`}>
                                    {t.l}
                                </button>
                            ))}
                        </div>
                    </div>
                    )}
                </div>

                {/* Nurse Note */}
                <div className="space-y-1.5">
                    <Label className="text-[15px] font-semibold text-slate-800">หมายเหตุพยาบาล</Label>
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
            {/* ════ Action button — ส่งตรวจ ════ */}
            {serviceCategory === "med_cert" && (
                <div className="rounded-2xl border border-white/90 bg-white/80 shadow-sm p-3">
                {serviceCategory === "med_cert" && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 space-y-1.5">
                        <div className="text-xs font-semibold text-emerald-800 flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> พิมพ์ฟอร์มใบรับรอง (ให้หมอกรอก/เซ็นมือ)</div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <Button disabled={saving} onClick={() => saveAndPrintCert("th")} variant="outline" className="rounded-lg h-9 text-xs font-semibold border-emerald-300 text-emerald-700 hover:bg-emerald-100">บันทึก & พิมพ์ ไทย</Button>
                            <Button disabled={saving} onClick={() => saveAndPrintCert("en")} variant="outline" className="rounded-lg h-9 text-xs font-semibold border-emerald-300 text-emerald-700 hover:bg-emerald-100">Save & Print EN</Button>
                        </div>
                        <p className="text-xs text-slate-600">บันทึก Vital ก่อน → ข้อมูล น้ำหนัก/ส่วนสูง/ความดัน/ชีพจร จะขึ้นในฟอร์ม</p>
                    </div>
                )}
                </div>
            )}
            {precheck && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => setPrecheck(false)}>
                    <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                            <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
                            <div className="flex-1">
                                <h3 className="font-bold text-slate-800">ตรวจสอบก่อนส่งตรวจ</h3>
                                <p className="text-xs text-slate-500">ข้อมูลความปลอดภัยที่ยังไม่ได้ยืนยัน</p>
                            </div>
                            <button onClick={() => setPrecheck(false)} className="text-slate-400 hover:text-slate-600" aria-label="ปิด"><X className="h-5 w-5" /></button>
                        </div>

                        {allergyPending ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                                <div className="text-sm font-semibold text-amber-900 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> ยังไม่ได้ถามประวัติแพ้ยา / แพ้สาร</div>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => confirmNone("nkda", true)} className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1"><Check className="h-4 w-4" /> ถามแล้ว ไม่มีประวัติแพ้</button>
                                    <button onClick={() => { setPrecheck(false); setShowAddAllergy(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="h-9 px-3 rounded-lg border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 inline-flex items-center gap-1"><Plus className="h-4 w-4" /> มีประวัติแพ้ — บันทึก</button>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle className="h-4 w-4" /> ประวัติแพ้ยืนยันแล้ว</div>
                        )}

                        {serviceCategory === "aesthetic" && (prePending ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                                <div className="text-sm font-semibold text-amber-900 flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> ยังไม่ได้ทำคัดกรองก่อนหัตถการ</div>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => setPreScreen(p => ({ ...p, none_confirmed: true }))} className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1"><Check className="h-4 w-4" /> ถามครบแล้ว ไม่มีข้อใด</button>
                                    <button onClick={() => setPrecheck(false)} className="h-9 px-3 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50">กลับไปติ๊กคัดกรอง</button>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle className="h-4 w-4" /> คัดกรองก่อนหัตถการแล้ว</div>
                        ))}

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button onClick={() => setPrecheck(false)} className="h-10 px-4 rounded-xl text-sm text-slate-600 hover:bg-slate-100">กลับไปแก้ไข</button>
                            <Button disabled={saving} onClick={() => { setPrecheck(false); void handleSave(true, undefined, true); }}
                                className={`h-10 rounded-xl px-5 gap-1.5 text-sm font-semibold ${allergyPending || prePending ? "bg-slate-600 hover:bg-slate-700" : "bg-blue-700 hover:bg-blue-800"}`}>
                                <Send className="h-4 w-4" /> {allergyPending || prePending ? "ส่งตรวจต่อ (ยังไม่ครบ)" : "ส่งตรวจ"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* แถบส่งตรวจ — แถวเดียว ค้างด้านล่าง */}
            <div className="sticky bottom-3 z-30 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-xl shadow-lg px-3 py-2.5 flex flex-wrap items-center gap-2">
            {(() => {
                const flags = (["bp_systolic", "bp_diastolic", "pulse_rate", "temperature", "o2_saturation", "dtx"] as const).map(k => vitalFlag(k, vitals[k])).filter(Boolean) as { level: string; text: string }[];
                const danger = flags.some(f => f.level === "danger");
                const preHits = serviceCategory === "aesthetic" ? PRE_ITEMS.filter(i => preScreen[i.key]).length : 0;
                const allergyOk = allergies.length > 0 || !!allergySummary || nkda;
                const room = rooms.find(r => r.room_id === selectedRoomId);
                const chip = "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold";
                return (
                    <div className="flex flex-1 min-w-0 flex-wrap items-center gap-1.5">
                        <span className={`${chip} ${danger ? "bg-red-100 text-red-800" : flags.length ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                            BP {vitals.bp_systolic || "—"}/{vitals.bp_diastolic || "—"} · P {vitals.pulse_rate || "—"}{flags.length ? ` · ⚠ ${flags.map(f => f.text).join(", ")}` : ""}
                        </span>
                        {bmi && <span className={`${chip} bg-slate-100 text-slate-700`}>BMI {bmi}</span>}
                        <span className={`${chip} ${allergies.length || allergySummary ? "bg-red-100 text-red-800" : nkda ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            {allergies.length || allergySummary ? `แพ้: ${[...allergies.map(a => a.allergen_name), allergySummary].filter(Boolean).join(", ")}` : nkda ? "ไม่มีประวัติแพ้" : "ยังไม่ได้ถามประวัติแพ้"}
                        </span>
                        {serviceCategory === "aesthetic" && <span className={`${chip} ${preHits ? "bg-amber-100 text-amber-800" : preScreen.none_confirmed ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{preHits ? `คัดกรอง: ระวัง ${preHits} ข้อ` : preScreen.none_confirmed ? "คัดกรองผ่าน" : "ยังไม่คัดกรอง"}</span>}
                        {room && <span className={`${chip} bg-blue-50 text-blue-800`}>{room.room_name}</span>}
                        {!allergyOk && <span className="text-[11px] text-amber-700">← กดยืนยันที่กล่องประวัติแพ้</span>}
                    </div>
                );
            })()}
                {triageLevel !== "normal" && (
                    <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold ${triageLevel === "emergency" ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>
                        {triageLevel === "emergency" ? "ฉุกเฉิน" : "เร่งด่วน"}
                    </span>
                )}
                <Button disabled={saving} onClick={() => void handleSave(true)} title={`ส่งให้ ${SERVICE_LABEL[serviceCategory]}`}
                    className="shrink-0 ml-auto rounded-xl px-5 gap-2 h-10 bg-blue-700 hover:bg-blue-800 shadow-md text-sm font-semibold">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    ส่งตรวจ <span className="hidden sm:inline font-normal opacity-80">· {SERVICE_LABEL[serviceCategory]}</span> <ChevronRight className="h-4 w-4" />
                </Button>
            </div>


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
                className={`group flex items-center gap-2.5 w-full min-h-11 py-2 rounded-lg border-2 px-3 text-left transition-all ${
                    open
                        ? `${current.bg} border-current ${current.text}`
                        : `bg-white border-slate-300 hover:border-slate-400 ${current.text}`
                }`}
            >
                <div className={`h-7 w-7 rounded-md ${current.bg} flex items-center justify-center shrink-0 ${current.text}`}>
                    <CurrentIcon className="h-4 w-4" />
                </div>
                <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800 whitespace-normal leading-snug">
                    {current.label}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
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
    label, thaiLabel, unit, value, onChange, step, required, showError = false, prev, flag,
}: {
    label: string;
    thaiLabel?: string;
    unit: string;
    value: string;
    onChange: (v: string) => void;
    step?: string;
    required?: boolean;
    showError?: boolean;
    prev?: number | null;
    flag?: { level: "warn" | "danger"; text: string } | null;
}) {
    const isEmpty = !!(showError && required && !value);
    return (
        <div className="space-y-1">
            <div className="px-1 flex items-baseline gap-1.5 flex-wrap leading-none">
                <span className="text-[13px] font-semibold text-slate-700">
                    {label}
                    {required && <span className="text-red-500 ml-0.5">*</span>}
                </span>
                {thaiLabel && <span className="text-xs text-slate-600">{thaiLabel}</span>}
            </div>
            <div className="relative">
                <input
                    type="number"
                    aria-label={`${thaiLabel || label} (${unit})`}
                    aria-required={required}
                    aria-invalid={isEmpty}
                    inputMode="decimal"
                    step={step || "1"}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className={`h-11 w-full rounded-lg border bg-white pl-3 pr-14 text-base font-semibold tabular-nums focus:outline-none focus:ring-2 focus:border-blue-500 ${
                        isEmpty
                            ? "border-red-300 focus:ring-red-500/30 bg-red-50/30 text-slate-800"
                            : flag?.level === "danger" ? "border-red-500 bg-red-50 text-red-700 focus:ring-red-500/30"
                            : flag?.level === "warn" ? "border-amber-400 bg-amber-50 text-amber-800 focus:ring-amber-500/30"
                            : "border-slate-300 focus:ring-blue-500/30 text-slate-800"
                    }`}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600">{unit}</span>
            </div>
            {(flag || prev != null) && (
                <div className="px-1 flex items-center justify-between gap-1 text-[11px] leading-tight">
                    {flag ? <span className={flag.level === "danger" ? "font-bold text-red-600" : "font-semibold text-amber-700"}>⚠ {flag.text}</span> : <span />}
                    {prev != null && <span className="text-slate-400">ครั้งก่อน {prev}</span>}
                </div>
            )}
        </div>
    );
}
