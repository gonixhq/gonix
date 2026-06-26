import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SectionBanner } from "@/components/ui/section-banner";
import EditPatientForm from "./edit-patient-form";
import MedicalHistoryManager from "./medical-history-manager";
import VisitsGrid from "./visits-grid";
import LoyaltyCard from "./loyalty-card";
import PatientPackagesTab from "./patient-packages-tab";
import PatientPhotosTab from "./patient-photos-tab";
import PatientAttachmentsTab from "./patient-attachments-tab";
import AuditLogList from "./audit-log-list";
import { VitalsTrend } from "./vitals-trend";
import { VisitTimeline } from "./visit-timeline";
import {
    ArrowLeft, User, Phone, Mail, Calendar, Heart, Stethoscope,
    AlertTriangle, Activity, Clock, Pencil, MapPin, ShieldCheck,
    Droplet, Users, IdCard, Printer, Sparkles, Image as ImageIcon, Paperclip,
} from "lucide-react";
import type { AestheticPhoto, AestheticRecords } from "@/lib/aesthetic-types";

// สี + ลำดับความรุนแรงของการแพ้ (ใช้ในแบนเนอร์ patient safety)
const ALLERGY_SEVERITY_CLS: Record<string, string> = {
    mild: "bg-yellow-100 text-yellow-800 border-yellow-300",
    moderate: "bg-orange-100 text-orange-800 border-orange-300",
    severe: "bg-red-100 text-red-800 border-red-300",
    life_threatening: "bg-red-200 text-red-900 border-red-400 ring-1 ring-red-400",
};
const ALLERGY_SEVERITY_LABEL: Record<string, string> = {
    mild: "เล็กน้อย", moderate: "ปานกลาง", severe: "รุนแรง", life_threatening: "อันตรายถึงชีวิต",
};
const SEVERITY_RANK: Record<string, number> = { life_threatening: 0, severe: 1, moderate: 2, mild: 3 };

export default async function PatientDetailPage({
    params,
}: {
    params: Promise<{ hn: string }>;
}) {
    const { hn } = await params;
    const supabase = await createClient();

    const [patientRes, allergiesRes, chronicRes, visitsRes, auditRes, activePackagesRes, aestheticVisitsRes, attachCountRes, allVisitsRes] = await Promise.all([
        supabase.from("patients")
            .select("*, updater:profiles!patients_updated_by_fkey(full_name)")
            .eq("hn", hn).single(),
        supabase.from("patient_allergies").select("*").eq("hn", hn).eq("is_active", true),
        supabase.from("patient_chronic_diseases").select("*").eq("hn", hn),
        supabase.from("visits").select("vn, visit_date, status, chief_complaint, icd10_primary")
            .eq("hn", hn).order("visit_date", { ascending: false }).limit(20),
        supabase.from("patient_audit_logs")
            .select("*, changer:profiles!patient_audit_logs_changed_by_fkey(full_name)")
            .eq("hn", hn).order("changed_at", { ascending: false }).limit(50),
        supabase.from("patient_packages").select("id", { count: "exact", head: true })
            .eq("hn", hn).eq("status", "active"),
        supabase.from("visits")
            .select("vn, visit_date, aesthetic_records")
            .eq("hn", hn)
            .eq("service_category", "aesthetic")
            .order("visit_date", { ascending: false })
            .limit(50),
        supabase.from("visit_attachments")
            .select("id", { count: "exact", head: true })
            .eq("hn", hn).eq("is_deleted", false),
        supabase.from("visits")
            .select("vn, visit_date, chief_complaint")
            .eq("hn", hn)
            .order("visit_date", { ascending: false })
            .limit(50),
    ]);

    const attachmentsCount = attachCountRes.count || 0;
    const allVisitOptions = (allVisitsRes.data || []).map(v => ({
        vn: v.vn,
        visit_date: v.visit_date,
        chief_complaint: v.chief_complaint,
    }));
    const activePackagesCount = activePackagesRes.count || 0;

    // Build photo-aware visit list (only aesthetic visits — for photo tab)
    const aestheticPhotoVisits = (aestheticVisitsRes.data || []).map(v => {
        const records = (v.aesthetic_records || {}) as AestheticRecords;
        return {
            vn: v.vn,
            visit_date: v.visit_date,
            before: (records.photos?.before || []) as AestheticPhoto[],
            after: (records.photos?.after || []) as AestheticPhoto[],
        };
    });
    const totalAestheticPhotos = aestheticPhotoVisits.reduce(
        (s, v) => s + v.before.length + v.after.length, 0
    );

    const patient = patientRes.data;
    if (!patient) notFound();

    // Look up address (subdistrict / district / province / postal)
    let fullAddress: string | null = null;
    if (patient.subdistrict_code) {
        const { data: addr } = await supabase.from("address_ref")
            .select("subdistrict_name, district_name, province_name, postal_code")
            .eq("subdistrict_code", patient.subdistrict_code).maybeSingle();
        if (addr) {
            fullAddress = `ต.${addr.subdistrict_name} อ.${addr.district_name} จ.${addr.province_name} ${addr.postal_code}`;
        }
    }

    const allergies = allergiesRes.data || [];
    const chronic = chronicRes.data || [];
    const visits = visitsRes.data || [];
    const auditLogs = auditRes.data || [];

    // Look up ICD-10 names for all visits' primary codes
    const visitIcdCodes = Array.from(new Set(visits.map(v => v.icd10_primary).filter(Boolean) as string[]));
    let visitIcdMap: Record<string, string> = {};
    if (visitIcdCodes.length > 0) {
        const { data: icdRows } = await supabase
            .from("icd10")
            .select("code, description_th, description_en")
            .in("code", visitIcdCodes);
        visitIcdMap = Object.fromEntries(
            (icdRows || []).map(r => [r.code, r.description_th || r.description_en || ""])
        );
    }

    // สรุป ICD-10 ที่พบบ่อย (การวินิจฉัยซ้ำๆ ของผู้ป่วยรายนี้)
    const icdFreq = new Map<string, number>();
    for (const v of visits) {
        const code = v.icd10_primary as string | null;
        if (code) icdFreq.set(code, (icdFreq.get(code) || 0) + 1);
    }
    const topIcd = [...icdFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    // สัญญาณชีพข้ามเวลา (trend) — เรียงเก่า→ใหม่
    const { data: vitalsData } = await supabase
        .from("vital_signs")
        .select("recorded_at, bp_systolic, bp_diastolic, weight_kg, bmi")
        .eq("hn", hn)
        .order("recorded_at", { ascending: true })
        .limit(30);
    const vitals = vitalsData || [];

    function calculateAge(dob: string | null): string {
        if (!dob) return "—";
        const birth = new Date(dob);
        const now = new Date();
        let years = now.getFullYear() - birth.getFullYear();
        let months = now.getMonth() - birth.getMonth();
        let days = now.getDate() - birth.getDate();
        if (days < 0) { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
        if (months < 0) { years--; months += 12; }
        const parts: string[] = [];
        if (years > 0) parts.push(`${years} ปี`);
        if (months > 0) parts.push(`${months} เดือน`);
        if (years === 0 && (days > 0 || parts.length === 0)) parts.push(`${days} วัน`);
        return parts.join(" ");
    }

    const genderLabel: Record<string, string> = { M: "ชาย", F: "หญิง", other: "อื่นๆ" };
    const nhsoLabel: Record<string, string> = {
        none: "ไม่ระบุ", uc: "UC (บัตรทอง)", sso: "ประกันสังคม",
        gov_officer: "ข้าราชการ", private_ins: "ประกันเอกชน", self_pay: "จ่ายเอง",
    };
    const maritalLabel: Record<string, string> = {
        single: "โสด", married: "สมรส", divorced: "หย่า", widowed: "หม้าย",
        โสด: "โสด", สมรส: "สมรส", หย่า: "หย่า", หม้าย: "หม้าย",
    };
    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
            {/* Back link */}
            <Link
                href="/dashboard/patients"
                className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
            >
                <ArrowLeft className="h-4 w-4" /> กลับไปทะเบียนผู้ป่วย
            </Link>

            {/* ⚠️ Allergy banner — sticky บนสุด (patient safety) */}
            {(allergies.length > 0 || patient.allergy_summary) && (
                <div className="sticky top-2 z-30 rounded-2xl bg-red-50/95 backdrop-blur border-2 border-red-300 p-3.5 shadow-lg shadow-red-500/10 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl bg-red-200 flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-extrabold text-red-900 mb-1.5">⚠️ ประวัติแพ้ยา / สารก่อภูมิแพ้</div>
                        {allergies.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {[...allergies]
                                    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
                                    .map((a) => (
                                        <span
                                            key={a.id}
                                            className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border ${ALLERGY_SEVERITY_CLS[a.severity] || "bg-red-100 text-red-800 border-red-300"}`}
                                            title={a.reaction ? `อาการ: ${a.reaction}` : undefined}
                                        >
                                            {a.allergen_name}
                                            {a.severity && <span className="opacity-70">· {ALLERGY_SEVERITY_LABEL[a.severity] || a.severity}</span>}
                                        </span>
                                    ))}
                            </div>
                        )}
                        {patient.allergy_summary && (
                            <p className="text-xs text-red-800 mt-1.5 whitespace-pre-wrap break-words">{patient.allergy_summary}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Hero header — Sidebar Layout */}
            <div className="gonix-card-premium relative overflow-hidden">
                {/* Background gradient orb */}
                <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-gradient-to-br from-[#00FFCC]/20 to-[#2B54F0]/15 blur-3xl pointer-events-none" />

                <div className="relative grid grid-cols-1 md:grid-cols-[280px_1fr]">
                    {/* ── LEFT SIDEBAR — Essential only ── */}
                    <div className="p-5 md:border-r border-slate-200/60 flex items-center">
                        <div className="flex flex-col items-center justify-center text-center w-full">
                            {/* Name */}
                            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight leading-tight">
                                {patient.prefix} {patient.first_name} {patient.last_name}
                            </h1>

                            {/* โรคประจำตัว — chips เห็นตลอด (risk factor) */}
                            {chronic.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                                    {chronic.map((c) => (
                                        <span
                                            key={c.id}
                                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300"
                                            title={c.is_controlled ? "ควบคุมได้" : "เฝ้าระวัง"}
                                        >
                                            <Activity className="h-3 w-3" />
                                            {c.disease_name}
                                            {c.is_controlled && <span className="text-emerald-600">✓</span>}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* HN — large prominent (brand) */}
                            <div className="mt-3 px-4 py-2 rounded-xl border" style={{ background: "rgba(43,84,240,0.06)", borderColor: "rgba(43,84,240,0.18)" }}>
                                <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-center" style={{ color: "rgba(43,84,240,0.7)" }}>
                                    Hospital Number
                                </div>
                                <div className="text-2xl font-black tracking-tight font-mono leading-none mt-1" style={{ color: "#2B54F0" }}>
                                    {patient.hn}
                                </div>
                            </div>

                            {/* Quick info: เพศ · อายุ · กรุ๊ปเลือด */}
                            <div className="text-sm text-slate-600 mt-3 flex items-center justify-center gap-1.5 flex-wrap">
                                <span>{genderLabel[patient.gender] || "—"}</span>
                                <span className="text-slate-300">·</span>
                                <span>{calculateAge(patient.dob)}</span>
                                {patient.blood_group && (
                                    <>
                                        <span className="text-slate-300">·</span>
                                        <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                                            <Droplet className="h-3 w-3" /> {patient.blood_group}
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* CTA Full-width */}
                            <Link href={`/print/patient-card/${patient.hn}?noauto=1`} target="_blank" className="w-full mt-4">
                                <Button className="w-full rounded-xl bg-gradient-to-r from-[#2B54F0] to-[#00A6C0] hover:opacity-90 shadow-md text-white gap-2 h-10">
                                    <Printer className="h-4 w-4" /> เปิด OPD Card
                                </Button>
                            </Link>

                            {/* Footer info */}
                            <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" />
                                ลงทะเบียน {patient.first_visit_date
                                    ? new Date(patient.first_visit_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })
                                    : "—"}
                            </p>
                        </div>
                    </div>

                    {/* ── RIGHT — Loyalty Card (interactive) ── */}
                    <LoyaltyCard hn={patient.hn} visitCount={patient.visit_count || 0} />
                </div>
            </div>

            {/* Blocked warning (highest priority) */}
            {patient.is_blocked && (
                <div className="rounded-2xl bg-red-100/80 border-2 border-red-400 p-4 flex items-start gap-3 shadow-md">
                    <div className="h-10 w-10 rounded-xl bg-red-200 flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-800" />
                    </div>
                    <div className="flex-1">
                        <div className="text-sm font-bold text-red-900 mb-1">🚫 ผู้ป่วยถูกระงับการเข้ารับบริการ</div>
                        {patient.block_reason && (
                            <div className="text-sm text-red-800">เหตุผล: {patient.block_reason}</div>
                        )}
                    </div>
                </div>
            )}


            {/* Tabs */}
            <Tabs defaultValue="info">
                <TabsList className="bg-white/70 backdrop-blur-md border border-white/80 shadow-sm h-12 p-1.5 rounded-2xl gap-1">
                    <TabsTrigger value="info" className="rounded-xl px-4 py-2 font-bold text-slate-500 hover:text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 transition-all">
                        ข้อมูลทั่วไป
                    </TabsTrigger>
                    <TabsTrigger value="medical" className="rounded-xl px-4 py-2 gap-1.5 font-bold text-slate-500 hover:text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 transition-all">
                        ประวัติการแพทย์
                    </TabsTrigger>
                    <TabsTrigger value="visits" className="rounded-xl px-4 py-2 font-bold text-slate-500 hover:text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 transition-all">
                        Visits
                        {visits.length > 0 && (
                            <span className="ml-1 h-5 min-w-[20px] px-1.5 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center data-[state=active]:bg-white/25 data-[state=active]:text-white">
                                {visits.length}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="packages" className="rounded-xl px-4 py-2 gap-1.5 font-bold text-slate-500 hover:text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 transition-all">
                        <Sparkles className="h-3.5 w-3.5" /> คอสบริการ
                        {activePackagesCount > 0 && (
                            <span className="ml-1 h-5 min-w-[20px] px-1.5 rounded-full bg-rose-200 text-rose-700 text-xs font-bold flex items-center justify-center data-[state=active]:bg-white/25 data-[state=active]:text-white">
                                {activePackagesCount}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="photos" className="rounded-xl px-4 py-2 gap-1.5 font-bold text-slate-500 hover:text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 transition-all">
                        <ImageIcon className="h-3.5 w-3.5" /> รูปก่อน-หลัง
                        {totalAestheticPhotos > 0 && (
                            <span className="ml-1 h-5 min-w-[20px] px-1.5 rounded-full bg-amber-200 text-amber-700 text-xs font-bold flex items-center justify-center data-[state=active]:bg-white/25 data-[state=active]:text-white">
                                {totalAestheticPhotos}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="attachments" className="rounded-xl px-4 py-2 gap-1.5 font-bold text-slate-500 hover:text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 transition-all">
                        <Paperclip className="h-3.5 w-3.5" /> ไฟล์แนบ
                        {attachmentsCount > 0 && (
                            <span className="ml-1 h-5 min-w-[20px] px-1.5 rounded-full bg-blue-200 text-blue-700 text-xs font-bold flex items-center justify-center data-[state=active]:bg-white/25 data-[state=active]:text-white">
                                {attachmentsCount}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="edit" className="rounded-xl px-4 py-2 gap-1.5 font-bold text-slate-500 hover:text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 transition-all">
                        <Pencil className="h-3.5 w-3.5" /> แก้ไข
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="rounded-xl px-4 py-2 gap-1.5 font-bold text-slate-500 hover:text-slate-700 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 transition-all">
                        <Clock className="h-3.5 w-3.5" /> Log
                        {auditLogs.length > 0 && (
                            <span className="ml-0.5 text-xs opacity-70">({auditLogs.length})</span>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* ── Info Tab ── */}
                <TabsContent value="info" className="space-y-5 mt-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="gonix-card-premium overflow-hidden">
                            <SectionBanner icon={IdCard} title="ข้อมูลส่วนตัว" color="teal" />
                            <div className="p-5 space-y-3.5 text-sm">
                                <InfoRow icon={Calendar} label="วันเกิด" value={patient.dob ? `${new Date(patient.dob).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}` : "—"} />
                                <InfoRow icon={Users} label="สถานภาพ" value={maritalLabel[patient.marital_status] || "—"} />
                                <InfoRow icon={User} label="อาชีพ" value={patient.occupation || "—"} />
                                <InfoRow icon={User} label="เชื้อชาติ" value={patient.race || "—"} />
                                <InfoRow icon={User} label="สัญชาติ" value={patient.nationality || "—"} />
                                <InfoRow icon={IdCard} label="เลขบัตร ปชช." value={patient.thai_id_card || "—"} mono />
                                {patient.passport_no && <InfoRow icon={IdCard} label="Passport" value={patient.passport_no} mono />}
                            </div>
                        </div>

                        <div className="gonix-card-premium overflow-hidden">
                            <SectionBanner icon={Phone} title="ข้อมูลติดต่อ" color="sky" />
                            <div className="p-5 space-y-3.5 text-sm">
                                <InfoRow icon={Phone} label="โทรศัพท์" value={patient.phone || "—"} mono />
                                <InfoRow icon={Mail} label="อีเมล" value={patient.email || "—"} />
                                <InfoRow icon={MapPin} label="ที่อยู่" value={patient.address_detail || "—"} />
                                {fullAddress && <InfoRow icon={MapPin} label="ตำบล/อำเภอ/จังหวัด" value={fullAddress} />}
                                {patient.line_user_id && <InfoRow icon={User} label="LINE" value={patient.line_user_id} mono />}
                            </div>
                        </div>

                        <div className="gonix-card-premium overflow-hidden">
                            <SectionBanner icon={Heart} title="สิทธิ์การรักษา" color="green" />
                            <div className="p-5 space-y-3.5 text-sm">
                                <InfoRow icon={Heart} label="สิทธิ์" value={nhsoLabel[patient.nhso_rights] || "ไม่ระบุ"} />
                                {patient.nhso_main_hospital && <InfoRow icon={Stethoscope} label="รพ.หลัก" value={patient.nhso_main_hospital} />}
                                <InfoRow icon={ShieldCheck} label="PDPA" value={patient.pdpa_consent ? "✓ ยินยอมแล้ว" : "✗ ยังไม่ยินยอม"} />
                                <InfoRow icon={ShieldCheck} label="Review Consent" value={patient.review_consent ? "✓ ยินยอมเผยแพร่ผล" : "✗ ไม่ยินยอม"} />
                            </div>
                        </div>

                        <div className="gonix-card-premium overflow-hidden">
                            <SectionBanner icon={AlertTriangle} title="ผู้ติดต่อฉุกเฉิน" color="rose" />
                            <div className="p-5 space-y-3.5 text-sm">
                                <InfoRow icon={User} label="ชื่อ" value={patient.emergency_contact_name || "—"} />
                                <InfoRow icon={Users} label="ความสัมพันธ์" value={patient.emergency_contact_relation || "—"} />
                                <InfoRow icon={Phone} label="เบอร์โทร" value={patient.emergency_contact_phone || "—"} mono />
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* ── Medical Tab ── */}
                <TabsContent value="medical" className="space-y-5 mt-5">
                    {/* Quick summary from registration (free-text) */}
                    {(patient.allergy_summary || patient.disease_summary) && (
                        <div className="gonix-card-premium overflow-hidden">
                            <SectionBanner icon={Heart} title="สรุปจากการลงทะเบียน" description="ข้อความที่กรอกครั้งแรกตอนสมัคร" />
                            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                {patient.allergy_summary && (
                                    <div>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">ประวัติแพ้</div>
                                        <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{patient.allergy_summary}</p>
                                    </div>
                                )}
                                {patient.disease_summary && (
                                    <div>
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">โรคประจำตัว</div>
                                        <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{patient.disease_summary}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <MedicalHistoryManager hn={patient.hn} allergies={allergies} chronic={chronic} />
                </TabsContent>

                {/* ── Visits Tab ── */}
                <TabsContent value="visits" className="mt-5 space-y-5">
                    {topIcd.length > 0 && (
                        <div className="gonix-card-premium p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <Activity className="h-4 w-4 text-[#2B54F0]" />
                                <h3 className="text-sm font-bold text-slate-800">การวินิจฉัยที่พบบ่อย</h3>
                                <span className="text-xs text-slate-400">(จาก {visits.length} visit)</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {topIcd.map(([code, count]) => (
                                    <span key={code} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-slate-700">
                                        <span className="font-mono font-bold text-blue-700">{code}</span>
                                        {visitIcdMap[code] && <span className="text-slate-600 max-w-[200px] truncate">{visitIcdMap[code]}</span>}
                                        <span className="font-bold text-blue-700">×{count}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    <VitalsTrend vitals={vitals} />
                    <VisitTimeline visits={visits} icdMap={visitIcdMap} />
                    <VisitsGrid visits={visits} icdMap={visitIcdMap} />
                </TabsContent>

                {/* ── Packages Tab ── */}
                <TabsContent value="packages" className="mt-5">
                    <PatientPackagesTab hn={patient.hn} />
                </TabsContent>

                {/* ── Photos Tab (Before/After across all aesthetic visits) ── */}
                <TabsContent value="photos" className="mt-5">
                    <PatientPhotosTab hn={patient.hn} visits={aestheticPhotoVisits} />
                </TabsContent>

                {/* ── Attachments Tab (All visits combined) ── */}
                <TabsContent value="attachments" className="mt-5">
                    <PatientAttachmentsTab hn={patient.hn} visits={allVisitOptions} />
                </TabsContent>

                {/* ── Edit Tab ── */}
                <TabsContent value="edit" className="mt-5">
                    <EditPatientForm patient={patient} />
                </TabsContent>

                {/* ── Audit Tab ── */}
                <TabsContent value="audit" className="mt-5">
                    <div className="gonix-card-premium overflow-hidden">
                        <SectionBanner icon={Clock} title="บันทึกการแก้ไขข้อมูล" />
                        {auditLogs.length === 0 ? (
                            <div className="text-center py-12 text-sm text-slate-400">ยังไม่มีประวัติการแก้ไข</div>
                        ) : (
                            <AuditLogList logs={auditLogs} />
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function InfoRow({
    icon: Icon, label, value, mono,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <div className="flex items-start gap-3">
            <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2">
                <span className="text-xs text-slate-500 shrink-0">{label}</span>
                <span className={`text-slate-800 font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
            </div>
        </div>
    );
}
