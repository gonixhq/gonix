import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
    Stethoscope, Clock, AlertTriangle, Heart, ArrowRight, Flame,
    Droplet, ShieldCheck, FileText, UserCircle2,
} from "lucide-react";
import { bangkokDate } from "@/lib/utils/date";
import { SERVICE_LABEL, type ServiceCategory } from "@/lib/visit-service-types";
import { getMyCurrentRoom } from "@/lib/actions/room-sessions";
import { listRoomStatuses } from "@/lib/actions/rooms";
import { ROOM_COLOR_STYLES, type RoomColor } from "@/lib/room-types";
import RoomCheckinBar from "./room-checkin-bar";
import RoomCheckinEmpty from "./room-checkin-empty";
import CancelVisitButton from "./cancel-visit-button";

const SPECIALTY_EXTRA: Record<string, string> = {
    pediatrics: "กุมารเวช",
    dentistry: "ทันตกรรม",
    physiotherapy: "กายภาพบำบัด",
    cardiology: "โรคหัวใจ",
    dermatology: "ผิวหนัง",
};

function getSpecialtyLabel(key: string): string {
    if (key in SERVICE_LABEL) return SERVICE_LABEL[key as ServiceCategory];
    if (key in SPECIALTY_EXTRA) return SPECIALTY_EXTRA[key];
    return key;
}

const ROLE_PREFIX: Record<string, string> = {
    doctor: "นพ./พญ.",
    dentist: "ทพ./ทพญ.",
    nurse: "พยาบาล",
    pharmacist: "เภสัชกร",
    physio: "นักกายภาพบำบัด",
    owner: "เจ้าของคลินิก",
    admin: "ผู้ดูแลระบบ",
    receptionist: "เจ้าหน้าที่",
    accountant: "ผู้ดูแลการเงิน",
};

const CLINICIAN_ROLES = ["doctor", "dentist", "physio"];
const ADMIN_VIEW_ROLES = ["owner", "admin"];

export default async function DoctorStationPage() {
    await gatePermission("visits.view");
    const supabase = await createClient();
    const today = bangkokDate();

    // ── Doctor identity ──
    const { data: { user } } = await supabase.auth.getUser();
    const { data: currentProfile } = user
        ? await supabase.from("profiles").select("full_name, role, clinic_id").eq("id", user.id).single()
        : { data: null };
    const { data: currentStaff } = user
        ? await supabase.from("staff").select("specialties").eq("profile_id", user.id).maybeSingle()
        : { data: null };

    if (!currentProfile?.clinic_id) throw new Error("ไม่พบข้อมูลคลินิกของผู้ใช้งาน");

    const doctorName = currentProfile.full_name || "—";
    const doctorRole = currentProfile?.role || "";
    const rolePrefix = ROLE_PREFIX[doctorRole] || "";
    const isClinician = CLINICIAN_ROLES.includes(doctorRole);
    const isAdminView = ADMIN_VIEW_ROLES.includes(doctorRole);

    // ── Room session + available rooms ──
    const [currentSession, roomStatuses] = await Promise.all([
        getMyCurrentRoom(),
        listRoomStatuses(),
    ]);

    // ถ้าเป็นหมอแต่ยังไม่ check-in → แสดงหน้าเลือกห้อง
    if (isClinician && !currentSession) {
        return (
            <RoomCheckinEmpty
                doctorName={doctorName}
                rolePrefix={rolePrefix}
                rooms={roomStatuses}
            />
        );
    }

    // ── Filter visits ──
    let visitsQuery = supabase
        .from("visits")
        .select(`
            vn, visit_date, visit_time, status, chief_complaint, present_illness, pain_score,
            triage_level, nurse_note, visit_type, room_id,
            weight_kg, height_cm, temperature, bp_systolic, bp_diastolic, pulse_rate, o2_saturation,
            assigned_doctor_id,
            created_at,
            patients!inner(
                hn, prefix, first_name, last_name, gender, dob, blood_group, nhso_rights,
                allergy_summary, disease_summary,
                patient_allergies(id, allergen_name, severity, is_active),
                patient_chronic_diseases(id, disease_name)
            ),
            queue_entries(queue_number)
        `)
        // คิวที่ยังรอแพทย์ต้องไม่หายเมื่อข้ามวัน
        .eq("clinic_id", currentProfile.clinic_id)
        .eq("status", "with_doctor")
        .order("created_at", { ascending: true });

    if (currentSession) {
        // หมอ check-in → เห็นเฉพาะคิวห้องตัวเอง
        visitsQuery = visitsQuery.eq("room_id", currentSession.room_id);
    }
    // ถ้าเป็น admin view โดยไม่ check-in → เห็นทุก visit (no filter)

    const { data: visits, error: visitsError } = await visitsQuery;
    if (visitsError) throw new Error("โหลดคิวห้องแพทย์ไม่สำเร็จ กรุณาลองใหม่");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (visits || []) as any[];

    const triageRank = { emergency: 0, urgent: 1, normal: 2 };
    list.sort((a, b) => {
        const ra = triageRank[(a.triage_level as keyof typeof triageRank) || "normal"];
        const rb = triageRank[(b.triage_level as keyof typeof triageRank) || "normal"];
        if (ra !== rb) return ra - rb;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const counts = {
        emergency: list.filter((v) => v.triage_level === "emergency").length,
        urgent: list.filter((v) => v.triage_level === "urgent").length,
        normal: list.filter((v) => v.triage_level === "normal" || !v.triage_level).length,
    };

    function calcAge(dob: string | null): string {
        if (!dob) return "—";
        const y = new Date().getFullYear() - new Date(dob).getFullYear();
        return `${y}`;
    }

    function waitMinutes(createdAt: string): number {
        return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    }

    function painLabel(score: number): string {
        if (score >= 7) return "รุนแรง";
        if (score >= 4) return "ปานกลาง";
        if (score >= 1) return "เล็กน้อย";
        return "ไม่ปวด";
    }

    const visitTypeLabel: Record<string, string> = {
        opd: "OPD", aesthetic: "ความงาม", follow_up: "นัด",
        wound_care: "ทำแผล", health_check: "ตรวจสุขภาพ", med_cert: "ใบรับรอง",
        procedure: "หัตถการ",
    };

    // Header label
    const roomColor = (currentSession?.color || "blue") as RoomColor;
    const roomColorStyle = ROOM_COLOR_STYLES[roomColor];
    const headerTitle = currentSession
        ? currentSession.room_name
        : isAdminView ? "ทุกห้องตรวจ (Admin View)" : "ห้องตรวจรวม";

    return (
        <div className="space-y-5 max-w-7xl mx-auto animate-fade-in rounded-3xl bg-gradient-to-br from-slate-100/70 via-blue-50/40 to-white/60 p-3 sm:p-6">
            {/* Sub-header — compact context line (Top Navbar already shows page title) */}
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500 flex-wrap rounded-2xl border border-white/90 bg-white/65 backdrop-blur-xl px-4 py-3 shadow-sm">
                <span className={`inline-flex items-center gap-1.5 font-bold ${currentSession ? roomColorStyle.text : "text-blue-700"}`}>
                    <Stethoscope className="h-4 w-4" />
                    {headerTitle}
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1">
                    <UserCircle2 className="h-3.5 w-3.5" />
                    <span className="font-semibold text-slate-700">
                        {rolePrefix && <>{rolePrefix} </>}{doctorName}
                    </span>
                </span>
                <span className="text-slate-300">·</span>
                <span>คิวรอตรวจ <span className="font-bold text-slate-700">{list.length}</span> คน · เรียงตามความเร่งด่วน</span>
            </div>

            {/* Check-in bar — แสดงเฉพาะตอน check-in อยู่ */}
            {currentSession && (
                <RoomCheckinBar
                    currentSession={currentSession}
                    rooms={roomStatuses}
                />
            )}

            {/* Triage summary — glass cards with soft shadow */}
            <div className="grid grid-cols-3 gap-3">
                <div className={`rounded-2xl border backdrop-blur-xl px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2 shadow-sm ${
                    counts.emergency > 0
                        ? "bg-white/70 border-white/90"
                        : "bg-white/60 border-white/90"
                }`}>
                    <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                            counts.emergency > 0 ? "bg-red-100" : "bg-slate-100/80"
                        }`}>
                            <Flame className={`h-3.5 w-3.5 ${counts.emergency > 0 ? "text-red-600 " : "text-slate-400"}`} />
                        </div>
                        <span className={`text-sm font-bold ${counts.emergency > 0 ? "text-red-800" : "text-slate-500"}`}>ฉุกเฉิน</span>
                    </div>
                    <span className={`text-xl font-semibold tabular-nums ${counts.emergency > 0 ? "text-red-700" : "text-slate-300"}`}>{counts.emergency}</span>
                </div>
                <div className={`rounded-2xl border backdrop-blur-xl px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2 shadow-sm ${
                    counts.urgent > 0
                        ? "bg-white/70 border-white/90"
                        : "bg-white/60 border-white/90"
                }`}>
                    <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                            counts.urgent > 0 ? "bg-amber-100" : "bg-slate-100/80"
                        }`}>
                            <AlertTriangle className={`h-3.5 w-3.5 ${counts.urgent > 0 ? "text-amber-600" : "text-slate-400"}`} />
                        </div>
                        <span className={`text-sm font-bold ${counts.urgent > 0 ? "text-amber-800" : "text-slate-500"}`}>เร่งด่วน</span>
                    </div>
                    <span className={`text-xl font-semibold tabular-nums ${counts.urgent > 0 ? "text-amber-700" : "text-slate-300"}`}>{counts.urgent}</span>
                </div>
                <div className={`rounded-2xl border backdrop-blur-xl px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2 shadow-sm ${
                    counts.normal > 0
                        ? "bg-white/70 border-white/90"
                        : "bg-white/60 border-white/90"
                }`}>
                    <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                            counts.normal > 0 ? "bg-blue-100/70" : "bg-slate-100/80"
                        }`}>
                            <ShieldCheck className={`h-3.5 w-3.5 ${counts.normal > 0 ? "text-blue-600" : "text-slate-400"}`} />
                        </div>
                        <span className={`text-sm font-bold ${counts.normal > 0 ? "text-blue-800" : "text-slate-500"}`}>ปกติ</span>
                    </div>
                    <span className={`text-xl font-semibold tabular-nums ${counts.normal > 0 ? "text-blue-700" : "text-slate-300"}`}>{counts.normal}</span>
                </div>
            </div>

            {/* Patient cards */}
            {list.length === 0 ? (
                <EmptyState
                    icon={Stethoscope}
                    title="ไม่มีคิวรอตรวจ"
                    description={currentSession
                        ? `ห้อง ${currentSession.room_name} ยังไม่มีผู้ป่วยส่งเข้า — รอพยาบาลส่งคิว`
                        : "พยาบาลคัดกรองคนไข้เรียบร้อยจะเข้ามาที่นี่อัตโนมัติ"}
                />
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {list.map((v) => {
                        const p = Array.isArray(v.patients) ? v.patients[0] : v.patients;
                        const allergies = (p?.patient_allergies || []).filter((a: { is_active: boolean }) => a.is_active);
                        const chronics = p?.patient_chronic_diseases || [];
                        const allergySummary = p?.allergy_summary?.trim() || null;
                        const diseaseSummary = p?.disease_summary?.trim() || null;
                        const triage = (v.triage_level || "normal") as "normal" | "urgent" | "emergency";
                        const wait = waitMinutes(v.created_at);

                        const triageMeta = {
                            normal: { bg: "bg-blue-100/70", text: "text-blue-700", label: "ปกติ", icon: ShieldCheck, ring: "ring-blue-100", accent: "from-emerald-500 to-emerald-600", btnShadow: "shadow-emerald-500/30" },
                            urgent: { bg: "bg-amber-100", text: "text-amber-700", label: "เร่งด่วน", icon: AlertTriangle, ring: "ring-amber-200", accent: "from-amber-400 to-orange-500", btnShadow: "shadow-amber-500/30" },
                            emergency: { bg: "bg-red-200", text: "text-red-900", label: "ฉุกเฉิน!", icon: Flame, ring: "ring-red-300", accent: "from-red-500 to-red-600", btnShadow: "shadow-red-500/30" },
                        }[triage];
                        const TriageIcon = triageMeta.icon;

                        const queueEntry = Array.isArray(v.queue_entries) ? v.queue_entries[0] : v.queue_entries;
                        const queueNumber = queueEntry?.queue_number || null;

                        return (
                            <Link
                                key={v.vn}
                                href={`/dashboard/visits/${v.vn}`}
                                className={`block overflow-hidden rounded-2xl border border-white/90 bg-white/75 backdrop-blur-xl p-4 sm:p-5 shadow-[0_4px_24px_rgba(30,58,95,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] hover:bg-white/90 hover:border-blue-200/80 hover:shadow-[0_8px_32px_rgba(30,58,95,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 transition-[background-color,border-color,box-shadow] group relative ${triage === "emergency" ? "ring-2 ring-red-300/50" : ""}`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className={`shrink-0 flex flex-col items-center justify-center px-2.5 py-2 rounded-xl bg-slate-800 text-white min-w-[56px] border border-slate-700`}>
                                            <div className="text-[8px] font-bold uppercase tracking-[0.15em] opacity-80 leading-none">คิว</div>
                                            <div className="text-lg font-semibold font-mono tracking-wide leading-tight mt-0.5">
                                                {queueNumber || "—"}
                                            </div>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-lg font-bold text-slate-800 truncate group-hover:text-blue-900 transition-colors leading-tight">
                                                {p?.prefix}{p?.first_name} {p?.last_name}
                                            </h3>
                                            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                                                <span className="font-mono">{p?.hn}</span>
                                                <span>·</span>
                                                <span>{p?.gender === "M" ? "ชาย" : p?.gender === "F" ? "หญิง" : "—"}</span>
                                                <span>·</span>
                                                <span>{calcAge(p?.dob)} ปี</span>
                                                {p?.blood_group && (
                                                    <>
                                                        <span>·</span>
                                                        <span className="inline-flex items-center gap-0.5 text-red-700 font-semibold">
                                                            <Droplet className="h-2.5 w-2.5" /> {p.blood_group}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <Badge className={`${triageMeta.bg} ${triageMeta.text} border-0 gap-1 ring-1 ${triageMeta.ring}`}>
                                            <TriageIcon className="h-3 w-3" />
                                            {triageMeta.label}
                                        </Badge>
                                        <div className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold">
                                            <Clock className="h-3 w-3" />
                                            รอ {wait} นาที
                                        </div>
                                    </div>
                                </div>

                                {(allergies.length > 0 || chronics.length > 0 || allergySummary || diseaseSummary) && (
                                    <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80">
                                        {(allergies.length > 0 || allergySummary) && (
                                            <>
                                                <span className="text-[14px] font-bold text-red-700 self-center inline-flex items-center gap-1.5">
                                                    <AlertTriangle className="h-4 w-4" /> แพ้
                                                </span>
                                                {allergies.map((a: { id: string; allergen_name: string; severity: string }) => (
                                                    <span
                                                        key={a.id}
                                                        className={`text-[14px] px-2.5 py-1 rounded-md font-bold ${a.severity === "severe" || a.severity === "life_threatening" ? "bg-red-200 text-red-900 ring-1 ring-red-300" : "bg-red-100 text-red-700"}`}
                                                    >
                                                        {a.allergen_name}
                                                    </span>
                                                ))}
                                                {allergySummary && (
                                                    <span className="text-[14px] px-2.5 py-1 rounded-md font-bold bg-red-100 text-red-700">
                                                        {allergySummary}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                        {(chronics.length > 0 || diseaseSummary) && (
                                            <>
                                                {(allergies.length > 0 || allergySummary) && <span className="w-px self-stretch bg-red-200 mx-0.5" />}
                                                <span className="text-[14px] font-semibold text-slate-700 self-center inline-flex items-center gap-1.5">
                                                    <Heart className="h-4 w-4" /> โรคประจำตัว
                                                </span>
                                                {chronics.map((c: { id: string; disease_name: string }) => (
                                                    <span key={c.id} className="text-[14px] px-2.5 py-1 rounded-md font-bold bg-slate-200/70 text-slate-700">
                                                        {c.disease_name}
                                                    </span>
                                                ))}
                                                {diseaseSummary && (
                                                    <span className="text-[14px] px-2.5 py-1 rounded-md font-bold bg-slate-200/70 text-slate-700">
                                                        {diseaseSummary}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                <div className="mb-3">
                                    <div className="text-xs font-bold text-slate-500 mb-1">อาการสำคัญ (CC)</div>
                                    <div className="text-base font-bold text-slate-800 leading-snug">
                                        {v.chief_complaint || <span className="text-slate-400 italic font-normal">ไม่ได้บันทึก</span>}
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
                                    <VitalChip value={v.temperature} unit="°C" label="TEMP" abnormal={v.temperature && (v.temperature > 37.5 || v.temperature < 36)} />
                                    <VitalChip value={v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : null} label="BP" abnormal={(v.bp_systolic && (v.bp_systolic > 140 || v.bp_systolic < 90)) || (v.bp_diastolic && (v.bp_diastolic > 90 || v.bp_diastolic < 60))} />
                                    <VitalChip value={v.pulse_rate} label="PR" abnormal={v.pulse_rate && (v.pulse_rate > 100 || v.pulse_rate < 60)} />
                                    <VitalChip value={v.o2_saturation} unit="%" label="O₂" abnormal={v.o2_saturation && v.o2_saturation < 95} />
                                    <VitalChip value={v.weight_kg} unit="kg" label="WT" />
                                </div>

                                <div className="space-y-2">
                                    {typeof v.pain_score === "number" && v.pain_score > 0 && (
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-slate-500">ความเจ็บปวด:</span>
                                            <div className={`flex-1 h-1.5 rounded-full overflow-hidden bg-slate-200 max-w-[120px]`}>
                                                <div
                                                    className={`h-full rounded-full ${v.pain_score >= 7 ? "bg-red-500" : v.pain_score >= 4 ? "bg-amber-500" : "bg-blue-500"}`}
                                                    style={{ width: `${v.pain_score * 10}%` }}
                                                />
                                            </div>
                                            <span className={`font-bold tabular-nums ${v.pain_score >= 7 ? "text-red-600" : v.pain_score >= 4 ? "text-amber-600" : "text-slate-700"}`}>
                                                {v.pain_score}/10
                                            </span>
                                            <span className={`text-[11px] font-semibold ${v.pain_score >= 7 ? "text-red-600" : v.pain_score >= 4 ? "text-amber-600" : "text-slate-500"}`}>
                                                ({painLabel(v.pain_score)})
                                            </span>
                                        </div>
                                    )}

                                    {v.nurse_note && (
                                        <div className="rounded-xl bg-slate-50/80 border border-slate-200/60 px-2.5 py-1.5 text-xs flex items-start gap-2">
                                            <FileText className="h-3 w-3 text-blue-700 shrink-0 mt-0.5" />
                                            <span className="text-blue-900/80 leading-snug">{v.nurse_note}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-200/70">
                                    <div className="flex items-center gap-2 text-[13px] text-slate-600 font-medium flex-wrap">
                                        <span className="font-mono font-semibold text-slate-700">{v.vn}</span>
                                        <span className="text-slate-300">·</span>
                                        <span className="font-semibold">{visitTypeLabel[v.visit_type] || v.visit_type}</span>
                                        <span className="text-slate-300">·</span>
                                        <span className="tabular-nums">{v.visit_time?.slice(0, 5) || "—"} น.</span>
                                        {v.visit_date && v.visit_date !== today && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-[10px]">
                                                ค้างจาก {new Date(`${v.visit_date}T00:00:00+07:00`).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" })}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <CancelVisitButton
                                            vn={v.vn}
                                            patientName={`${p?.prefix || ""}${p?.first_name || ""} ${p?.last_name || ""}`.trim()}
                                        />
                                        <Button
                                            size="sm"
                                            className={`rounded-xl gap-1 bg-blue-700 hover:bg-blue-800 text-white shadow-sm focus-visible:ring-blue-600`}
                                        >
                                            เริ่มตรวจ <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                                        </Button>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function VitalChip({
    value, unit, label, abnormal,
}: {
    value: number | string | null;
    unit?: string;
    label: string;
    abnormal?: boolean | null;
}) {
    const hasValue = value !== null && value !== undefined && value !== "";
    return (
        <div className={`rounded-xl border border-slate-200/60 px-2 py-2.5 flex flex-col items-center justify-center gap-0.5 ${abnormal ? "bg-red-50 ring-1 ring-red-200" : hasValue ? "bg-white/65" : "bg-white/40"}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-none">{label}</div>
            <div className={`text-sm font-bold leading-tight tabular-nums ${abnormal ? "text-red-700" : hasValue ? "text-slate-800" : "text-slate-300"}`}>
                {hasValue ? `${value}${unit || ""}` : "—"}
            </div>
        </div>
    );
}
