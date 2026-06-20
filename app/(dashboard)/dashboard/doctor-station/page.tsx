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

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const fromDate = bangkokDate(twoDaysAgo);

    // ── Doctor identity ──
    const { data: { user } } = await supabase.auth.getUser();
    const { data: currentProfile } = user
        ? await supabase.from("profiles").select("full_name, role").eq("id", user.id).single()
        : { data: null };
    const { data: currentStaff } = user
        ? await supabase.from("staff").select("specialties").eq("profile_id", user.id).maybeSingle()
        : { data: null };

    const doctorName = currentProfile?.full_name || "—";
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
        .gte("visit_date", fromDate)
        .eq("status", "with_doctor")
        .order("created_at", { ascending: true });

    if (currentSession) {
        // หมอ check-in → เห็นเฉพาะคิวห้องตัวเอง
        visitsQuery = visitsQuery.eq("room_id", currentSession.room_id);
    }
    // ถ้าเป็น admin view โดยไม่ check-in → เห็นทุก visit (no filter)

    const { data: visits } = await visitsQuery;

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
        <div className="space-y-5 max-w-7xl mx-auto animate-fade-in">
            {/* Sub-header — compact context line (Top Navbar already shows page title) */}
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500 flex-wrap pt-1">
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
                <div className={`rounded-2xl border backdrop-blur-md px-4 py-2.5 flex items-center justify-between gap-2 transition-all ${
                    counts.emergency > 0
                        ? "bg-gradient-to-br from-red-50 to-rose-50/60 border-red-200 shadow-sm shadow-red-100"
                        : "bg-white/50 border-slate-200/60"
                }`}>
                    <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                            counts.emergency > 0 ? "bg-red-100" : "bg-slate-100/60"
                        }`}>
                            <Flame className={`h-3.5 w-3.5 ${counts.emergency > 0 ? "text-red-600 animate-pulse" : "text-slate-400"}`} />
                        </div>
                        <span className={`text-sm font-bold ${counts.emergency > 0 ? "text-red-800" : "text-slate-500"}`}>ฉุกเฉิน</span>
                    </div>
                    <span className={`text-xl font-black tabular-nums ${counts.emergency > 0 ? "text-red-700" : "text-slate-300"}`}>{counts.emergency}</span>
                </div>
                <div className={`rounded-2xl border backdrop-blur-md px-4 py-2.5 flex items-center justify-between gap-2 transition-all ${
                    counts.urgent > 0
                        ? "bg-gradient-to-br from-amber-50 to-orange-50/60 border-amber-200 shadow-sm shadow-amber-100"
                        : "bg-white/50 border-slate-200/60"
                }`}>
                    <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                            counts.urgent > 0 ? "bg-amber-100" : "bg-slate-100/60"
                        }`}>
                            <AlertTriangle className={`h-3.5 w-3.5 ${counts.urgent > 0 ? "text-amber-600" : "text-slate-400"}`} />
                        </div>
                        <span className={`text-sm font-bold ${counts.urgent > 0 ? "text-amber-800" : "text-slate-500"}`}>เร่งด่วน</span>
                    </div>
                    <span className={`text-xl font-black tabular-nums ${counts.urgent > 0 ? "text-amber-700" : "text-slate-300"}`}>{counts.urgent}</span>
                </div>
                <div className={`rounded-2xl border backdrop-blur-md px-4 py-2.5 flex items-center justify-between gap-2 transition-all ${
                    counts.normal > 0
                        ? "bg-gradient-to-br from-emerald-50 to-blue-50/60 border-emerald-200 shadow-sm shadow-emerald-100"
                        : "bg-white/50 border-slate-200/60"
                }`}>
                    <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                            counts.normal > 0 ? "bg-emerald-100" : "bg-slate-100/60"
                        }`}>
                            <ShieldCheck className={`h-3.5 w-3.5 ${counts.normal > 0 ? "text-emerald-600" : "text-slate-400"}`} />
                        </div>
                        <span className={`text-sm font-bold ${counts.normal > 0 ? "text-emerald-800" : "text-slate-500"}`}>ปกติ</span>
                    </div>
                    <span className={`text-xl font-black tabular-nums ${counts.normal > 0 ? "text-emerald-700" : "text-slate-300"}`}>{counts.normal}</span>
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {list.map((v) => {
                        const p = Array.isArray(v.patients) ? v.patients[0] : v.patients;
                        const allergies = (p?.patient_allergies || []).filter((a: { is_active: boolean }) => a.is_active);
                        const chronics = p?.patient_chronic_diseases || [];
                        const allergySummary = p?.allergy_summary?.trim() || null;
                        const diseaseSummary = p?.disease_summary?.trim() || null;
                        const triage = (v.triage_level || "normal") as "normal" | "urgent" | "emergency";
                        const wait = waitMinutes(v.created_at);

                        const triageMeta = {
                            normal: { bg: "bg-emerald-100", text: "text-emerald-700", label: "ปกติ", icon: ShieldCheck, ring: "ring-emerald-100", accent: "from-emerald-500 to-emerald-600", btnShadow: "shadow-emerald-500/30" },
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
                                className={`gonix-card-premium overflow-hidden p-5 hover:shadow-xl hover:-translate-y-0.5 transition-all group relative ${triage === "emergency" ? "ring-2 ring-red-300/50" : ""}`}
                            >
                                {/* Subtle accent glow on hover */}
                                <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-30 transition-opacity ${
                                    triage === "emergency" ? "bg-red-300" : triage === "urgent" ? "bg-amber-300" : "bg-blue-300"
                                }`} />
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className={`shrink-0 flex flex-col items-center justify-center px-2.5 py-1 rounded-xl bg-gradient-to-br ${triageMeta.accent} text-white shadow-md min-w-[56px] ring-1 ring-white/20`}>
                                            <div className="text-[8px] font-bold uppercase tracking-[0.15em] opacity-80 leading-none">คิว</div>
                                            <div className="text-lg font-black font-mono tracking-wide leading-tight mt-0.5">
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
                                    <div className="flex flex-wrap items-center gap-2 mb-3 px-3 py-2.5 rounded-xl bg-red-50/70 border border-red-200/70">
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
                                                <span className="text-[14px] font-bold text-amber-800 self-center inline-flex items-center gap-1.5">
                                                    <Heart className="h-4 w-4" /> โรคประจำตัว
                                                </span>
                                                {chronics.map((c: { id: string; disease_name: string }) => (
                                                    <span key={c.id} className="text-[14px] px-2.5 py-1 rounded-md font-bold bg-amber-100 text-amber-800">
                                                        {c.disease_name}
                                                    </span>
                                                ))}
                                                {diseaseSummary && (
                                                    <span className="text-[14px] px-2.5 py-1 rounded-md font-bold bg-amber-100 text-amber-800">
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

                                <div className="grid grid-cols-5 gap-2 mb-3">
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
                                                    className={`h-full rounded-full ${v.pain_score >= 7 ? "bg-red-500" : v.pain_score >= 4 ? "bg-amber-500" : "bg-emerald-500"}`}
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
                                        <div className="rounded-lg bg-blue-50/60 border border-blue-200/60 px-2.5 py-1.5 text-xs flex items-start gap-2">
                                            <FileText className="h-3 w-3 text-blue-700 shrink-0 mt-0.5" />
                                            <span className="text-blue-900/80 leading-snug">{v.nurse_note}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/60">
                                    <div className="flex items-center gap-2 text-[13px] text-slate-600 font-medium flex-wrap">
                                        <span className="font-mono font-semibold text-slate-700">{v.vn}</span>
                                        <span className="text-slate-300">·</span>
                                        <span className="font-semibold">{visitTypeLabel[v.visit_type] || v.visit_type}</span>
                                        <span className="text-slate-300">·</span>
                                        <span className="tabular-nums">{v.visit_time?.slice(0, 5) || "—"} น.</span>
                                        {v.visit_date && v.visit_date !== today && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-[10px]">
                                                ⌚ ค้างจากวันก่อน
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
                                            className={`rounded-lg gap-1 bg-gradient-to-r ${triageMeta.accent} text-white shadow-md ${triageMeta.btnShadow} ring-1 ring-white/20 group-hover:shadow-lg`}
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
        <div className={`rounded-lg px-2 py-2 flex flex-col items-center justify-center gap-0.5 ${abnormal ? "bg-red-50 ring-1 ring-red-200" : hasValue ? "bg-slate-50" : "bg-slate-50/50"}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-none">{label}</div>
            <div className={`text-sm font-bold leading-tight tabular-nums ${abnormal ? "text-red-700" : hasValue ? "text-slate-800" : "text-slate-300"}`}>
                {hasValue ? `${value}${unit || ""}` : "—"}
            </div>
        </div>
    );
}
