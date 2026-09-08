"use client";

import { useState } from "react";
import Link from "next/link";
import { MaskedId } from "@/components/ui/masked-id";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Activity, AlertTriangle, Stethoscope, Heart, Sparkles, Pill, TestTube, FileSignature, History, Calendar, User, Pencil, MapPin, FileText, ChevronRight, Clock, CheckCircle2, Search } from "lucide-react";
import { FaceChartRender } from "@/app/print/visits/[vn]/face-chart-render";
import type { FaceChartData } from "@/lib/aesthetic-types";
import VisitStatusActions from "./visit-status-actions";
import SoapForm from "./soap-form";
import DrugOrderForm from "./drug-order-form";
import SavedDrugsEditor from "./saved-drugs-editor";
import LabOrderForm from "./lab-order-form";
import MedCertForm from "./med-cert-form";
import AppointmentReferForm from "./appointment-refer-form";
import PackageUsagePanel from "./package-usage-panel";
import AestheticRecordsPanel from "./aesthetic-records-panel";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import styles from "./visit-workspace.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function VisitDetailClient({ visit, patient, drugs, vitals, statusLogs, medCert, appointments, referrals, pastVisits, labOrders, labCatalog, labPanels, icd10Name, vn, patientHasPackages, initialTab }: any) {
    const { t, language } = useLanguage();
    // Visit-type-aware tab visibility
    const isAesthetic = visit.service_category === "aesthetic";
    const showSoapTab = !isAesthetic;            // PE ไม่ใช้ใน aesthetic — บันทึกใน "หัตถการความงาม" แทน
    const showDrugsTab = !isAesthetic;           // Rx/วินิจฉัย — เคาท์เตอร์คีย์ในหน้าจ่ายเงินแทน
    const showPackagesTab = isAesthetic || !!patientHasPackages;
    const showMedCertTab = !isAesthetic;        // ใบรับรองไม่ใช่กับ aesthetic
    const defaultTab = initialTab === "lab" ? "lab" : isAesthetic ? "aesthetic" : "soap";

    // Completion indicators ( บนแท็บที่กรอกแล้ว)
    const doneSoap = !!(visit.soap_o || visit.soap_p);
    const doneDx = !!(visit.icd10_primary || visit.diagnosis_text || (drugs && drugs.length > 0));
    const doneLab = !!(labOrders && labOrders.length > 0);
    const doneMedCert = !!medCert;

    // Filter ประวัติการรักษาตาม ICD-10 / CC
    const [pastFilter, setPastFilter] = useState("");
    const filteredPast = (() => {
        const q = pastFilter.trim().toLowerCase();
        if (!q) return pastVisits;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (pastVisits || []).filter((pv: any) =>
            String(pv.icd10_primary || "").toLowerCase().includes(q) ||
            String(pv.chief_complaint || "").toLowerCase().includes(q)
        );
    })();

    const statusLabel: Record<string, string> = {
        waiting: language === "en" ? "Waiting History" : "รอซักประวัติ",
        triaged: language === "en" ? "Triaged" : "คัดกรอง",
        with_doctor: language === "en" ? "Seeing Doctor" : "กำลังตรวจ",
        with_nurse: language === "en" ? "Seeing Nurse" : "พบพยาบาล",
        waiting_medicine: language === "en" ? "Pharmacy" : "รอรับยา",
        waiting_payment: language === "en" ? "Cashier" : "รอชำระ",
        completed: language === "en" ? "Completed" : "เสร็จสิ้น",
        cancelled: language === "en" ? "Cancelled" : "ยกเลิก",
    };

    const statusVariant: Record<string, "waiting" | "with_doctor" | "completed" | "cancelled" | "warning" | "default"> = {
        waiting: "waiting", triaged: "warning", with_doctor: "with_doctor",
        completed: "completed", cancelled: "cancelled",
    };

    function calculateAge(dob: string | null): string {
        if (!dob) return "—";
        const birth = new Date(dob);
        const now = new Date();
        let ageYears = now.getFullYear() - birth.getFullYear();
        let ageMonths = now.getMonth() - birth.getMonth();
        let ageDays = now.getDate() - birth.getDate();

        if (ageDays < 0) {
            ageMonths -= 1;
            ageDays += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        }
        if (ageMonths < 0) {
            ageYears -= 1;
            ageMonths += 12;
        }

        const yrs = language === "en" ? "yrs" : "ปี";
        const mos = language === "en" ? "mos" : "เดือน";
        const ds = language === "en" ? "days" : "วัน";

        if (ageYears === 0 && ageMonths === 0) return `${ageDays} ${ds}`;
        if (ageYears === 0) return `${ageMonths} ${mos} ${ageDays} ${ds}`;
        return `${ageYears} ${yrs} ${ageMonths} ${mos}`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chronicDiseases = patient.patient_chronic_diseases?.map((d: any) => d.disease_name).join(", ") || (language === "en" ? "None" : "ไม่มี");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chronicList: string[] = (patient.patient_chronic_diseases || []).map((d: any) => d.disease_name).filter(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allergies: { allergen_name: string; severity: string }[] = (patient.patient_allergies || []).filter((a: any) => a.is_active);

    const rightsLabel = (patient.nhso_rights === 'none' || patient.nhso_rights === 'self_pay') ? (language === "en" ? "Self-Pay" : 'ชำระเงินเอง') :
        patient.nhso_rights === 'uc' ? 'บัตรทอง (UC)' :
            patient.nhso_rights === 'sss' ? 'ประกันสังคม' :
                patient.nhso_rights === 'csmbs' ? 'ข้าราชการ' : (patient.nhso_rights || "—");

    const visitTypeLabel = visit.visit_type === 'opd' ? (language === "en" ? "Outpatient" : 'ผู้ป่วยนอก') :
        visit.visit_type === 'opd_general' ? (language === "en" ? "General OPD" : 'ตรวจโรคทั่วไป') :
        visit.visit_type === 'aesthetic' ? (language === "en" ? "Aesthetic" : 'เสริมความงาม') :
            visit.visit_type === 'follow_up' ? (language === "en" ? "Follow Up" : 'ติดตามอาการ') :
                visit.visit_type === 'procedure' ? (language === "en" ? "Procedure" : 'ทำหัตถการ') : (visit.visit_type || "—");

    const tabTriggerClass = (isAesthetic ? "md:w-full " : "") + "w-auto min-w-0 shrink-0 flex items-center whitespace-normal text-left break-words leading-relaxed [&>span]:min-w-0 gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-white/80 hover:text-blue-800 data-[state=active]:bg-blue-700 data-[state=active]:text-white data-[state=active]:shadow-sm focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 transition-colors justify-start";

    // เครื่องหมายขีดเป็นข้อมูลที่ยังไม่ได้ระบุ ไม่ใช่ประวัติแพ้ยา
    const meaningfulHistory = (value: unknown) => { const text = String(value ?? "").trim(); return /^[-–—\s]*$/.test(text) ? "" : text; };
    const clinicalHeader = (
<div className="rounded-2xl border border-white/90 bg-white/75 backdrop-blur-xl overflow-hidden shadow-[0_4px_24px_rgba(30,58,95,0.06)]">
                {/* CC + Pain */}
                <div className="px-4 sm:px-5 pt-5 pb-4 flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
                            อาการสำคัญ (CC)
                        </div>
                        <div className="font-semibold text-slate-900 text-xl leading-relaxed">
                            {visit.chief_complaint || <span className="text-slate-400 italic font-medium">ไม่ได้บันทึก</span>}
                        </div>
                        {visit.present_illness && (
                            <div className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-wrap">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 mr-1.5">PI:</span>
                                {visit.present_illness}
                            </div>
                        )}
                    </div>
                    {typeof visit.pain_score === "number" && visit.pain_score > 0 && (
                        <div className="flex items-baseline gap-1.5 shrink-0 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pain</span>
                            <span className={`text-2xl font-semibold leading-none ${visit.pain_score >= 7 ? "text-red-600" : visit.pain_score >= 4 ? "text-amber-600" : "text-emerald-600"}`}>
                                {visit.pain_score}
                            </span>
                            <span className="text-xs text-slate-400">/10</span>
                        </div>
                    )}
                </div>

                {/* Allergies + Chronic (safety strip) */}
                {(() => {
                    const allergyText = allergies.length > 0
                        ? allergies.map(a => meaningfulHistory(a.allergen_name)).filter(Boolean).join(", ") || meaningfulHistory(patient.allergy_summary)
                        : meaningfulHistory(patient.allergy_summary);
                    const hasAllergy = !!allergyText;
                    const diseaseText = chronicList.map(meaningfulHistory).filter(Boolean).join(", ") || meaningfulHistory(patient.disease_summary);
                    const hasChronic = !!diseaseText;
                    const chronicText = diseaseText || (language === "en" ? "Not recorded" : "ยังไม่ระบุ");
                    return (
                        <div className={`px-5 py-2.5 border-y flex items-center gap-x-5 gap-y-1 flex-wrap text-sm ${
                            hasAllergy ? "bg-red-50/40 border-red-100" : "bg-slate-50/40 border-slate-100"
                        }`}>
                            <div className="flex items-center gap-2">
                                <AlertTriangle className={`h-4 w-4 ${hasAllergy ? "text-red-600" : "text-slate-300"}`} />
                                <span className="text-slate-600 font-semibold">แพ้:</span>
                                {hasAllergy
                                    ? <span className="text-red-700 font-semibold">{allergyText}</span>
                                    : <span className="text-slate-400">ยังไม่ระบุ</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <Heart className={`h-4 w-4 ${hasChronic ? "text-amber-600" : "text-slate-300"}`} />
                                <span className="text-slate-600 font-semibold">โรคประจำตัว:</span>
                                <span className={hasChronic ? "text-amber-700 font-semibold" : "text-slate-400"}>
                                    {chronicText}
                                </span>
                            </div>
                            {patient.past_history && (
                                <div className="flex items-center gap-2 min-w-0">
                                    <History className="h-4 w-4 text-blue-600 shrink-0" />
                                    <span className="text-slate-600 font-semibold shrink-0">{language === "en" ? "Past history (PH):" : "ประวัติอดีต (PH):"}</span>
                                    <span className="text-blue-800 font-medium break-words">{patient.past_history}</span>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Vitals inline */}
                <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    {[
                        { label: 'BP', unit: 'mmHg', value: (vitals?.bp_systolic || visit?.bp_systolic) ? `${vitals?.bp_systolic || visit?.bp_systolic || '-'}/${vitals?.bp_diastolic || visit?.bp_diastolic || '-'}` : null },
                        { label: 'PR', unit: 'bpm', value: vitals?.pulse_rate ?? visit?.pulse_rate ?? null },
                        { label: 'Temp', unit: '°C', value: vitals?.temperature ?? visit?.temperature ?? null },
                        { label: 'O2', unit: '%', value: vitals?.o2_saturation ?? visit?.o2_saturation ?? null },
                        { label: 'Wt/Ht', unit: '', value: (vitals?.weight_kg || visit?.weight_kg) ? `${vitals?.weight_kg || visit?.weight_kg || '-'}kg / ${vitals?.height_cm || visit?.height_cm || '-'}cm` : null },
                    ].map((v, i) => (
                        <div key={i} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{v.label}</span>
                            <span className={`font-semibold text-sm tabular-nums ${v.value ? "text-slate-800" : "text-slate-300"}`}>
                                {v.value || "—"}
                            </span>
                            {v.unit && v.value && <span className="text-xs text-slate-400">{v.unit}</span>}
                        </div>
                    ))}
                </div>
            </div>
    );

    return (
        <div className={`${styles.workspace} space-y-5 max-w-7xl mx-auto animate-fade-in relative z-10 p-3 sm:p-5 pb-8`}>
            {/* Back link */}
            <Link href="/dashboard/doctor-station" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> กลับห้องตรวจแพทย์
            </Link>

            {/* ════ 2-Column Layout: Top card + Tabs (left) + Patient sidebar (right) ════ */}
            <div className={isAesthetic ? "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start" : "space-y-4"}>

            {/* ╔════════ RIGHT (sticky) — Patient Detail Card ════════╗ */}
            <div className={isAesthetic ? "xl:order-2 xl:sticky xl:top-4 min-w-0" : "min-w-0"}>
                <div className={cn("rounded-2xl border border-white/90 bg-white/75 backdrop-blur-xl p-4 shadow-sm", isAesthetic ? "space-y-4" : "grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start")}>
                    {/* Header: Avatar + Name + HN + Status */}
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-200/60">
                        <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center text-white font-semibold text-base shadow-sm shrink-0">
                            {patient.first_name?.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-lg font-semibold text-slate-800 leading-snug break-words">
                                {patient.prefix || ''}{patient.first_name} {patient.last_name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-xs font-mono text-blue-700 font-semibold">{patient.hn}</span>
                                {!isAesthetic && <span className="text-xs text-slate-500">· {patient.gender === "F" ? "หญิง" : patient.gender === "M" ? "ชาย" : "ไม่ระบุเพศ"} · {calculateAge(patient.dob)} · {vn}</span>}
                                <Badge className={cn(
                                    "px-1.5 py-0 font-semibold rounded border-0 text-xs",
                                    statusVariant[visit.status] === "completed" ? "bg-emerald-100 text-emerald-700" :
                                    statusVariant[visit.status] === "with_doctor" ? "bg-indigo-100 text-indigo-700" :
                                    statusVariant[visit.status] === "waiting" ? "bg-amber-100 text-amber-700" :
                                    statusVariant[visit.status] === "cancelled" ? "bg-slate-100 text-slate-500" :
                                    "bg-slate-100 text-slate-700"
                                )}>
                                    {statusLabel[visit.status] || visit.status}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    <details open={isAesthetic || undefined} className={isAesthetic ? "" : "order-3 sm:col-span-2"}>
                        <summary className="cursor-pointer text-sm text-blue-700">ข้อมูลคนไข้เพิ่มเติม</summary>
                        <div className={isAesthetic ? "mt-3 space-y-3" : "mt-3 space-y-4"}>
                    {/* Demographics + Visit info */}
                    <div className={cn("text-sm leading-relaxed [&>div]:min-w-0 [&>div>*:last-child]:min-w-0 [&>div>*:last-child]:break-words", isAesthetic ? "space-y-2.5" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 [&>div]:grid-cols-[88px_minmax(0,1fr)]")}>
                        <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                            <span className="text-slate-500">เพศ</span>
                            <span className="text-slate-700">
                                {patient.gender === 'M' ? 'ชาย' : patient.gender === 'F' ? 'หญิง' : 'อื่นๆ'}

                            </span>
                        </div>
                        <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                            <span className="text-slate-500">อายุ</span>
                            <span className="text-slate-700">{calculateAge(patient.dob)}</span>
                        </div>
                        {patient.blood_group && (
                            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                                <span className="text-slate-500">กรุ๊ปเลือด</span>
                                <span className="text-red-700 font-semibold">{patient.blood_group}</span>
                            </div>
                        )}
                        <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                            <span className="text-slate-500">สิทธิ์</span>
                            <span className="text-slate-700">{rightsLabel}</span>
                        </div>
                        <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                            <span className="text-slate-500">ประเภท</span>
                            <span className="text-slate-700">{visitTypeLabel}</span>
                        </div>
                        {patient.thai_id_card && (
                            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                                <span className="text-slate-500">เลขบัตร</span>
                                <MaskedId value={patient.thai_id_card} className="text-slate-700 text-xs whitespace-nowrap [&>span]:whitespace-nowrap" />
                            </div>
                        )}
                        {patient.phone && (
                            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                                <span className="text-slate-500">โทรศัพท์</span>
                                <span className="font-mono text-slate-700">{patient.phone}</span>
                            </div>
                        )}
                        {patient.occupation && (
                            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                                <span className="text-slate-500">อาชีพ</span>
                                <span className="text-slate-700">{patient.occupation}</span>
                            </div>
                        )}
                        {patient.marital_status && (
                            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                                <span className="text-slate-500">สถานภาพ</span>
                                <span className="text-slate-700">{patient.marital_status}</span>
                            </div>
                        )}
                        {patient.race && (
                            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                                <span className="text-slate-500">เชื้อชาติ</span>
                                <span className="text-slate-700">{patient.race}</span>
                            </div>
                        )}
                        {patient.nationality && (
                            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                                <span className="text-slate-500">สัญชาติ</span>
                                <span className="text-slate-700">{patient.nationality}</span>
                            </div>
                        )}
                        {patient.first_visit_date && (
                            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2">
                                <span className="text-slate-500">ลงทะเบียน</span>
                                <span className="text-slate-700">
                                    {new Date(patient.first_visit_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* VN (พิมพ์ย้ายไปหน้าจ่ายยา/คิดเงิน) */}
                    {isAesthetic && <div className="pt-3 border-t border-slate-200/60">
                        <div className="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold font-mono tracking-wider text-center">
                            {vn}
                        </div>
                    </div>}

                    {/* Emergency Contact */}
                    {(patient.emergency_contact_name || patient.emergency_contact_phone) && (
                        <div className="pt-2 border-t border-slate-200/60">
                            <div className="text-xs font-semibold text-amber-700 mb-1 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> ติดต่อฉุกเฉิน
                            </div>
                            {patient.emergency_contact_name && (
                                <div className="text-xs font-semibold text-slate-800">
                                    {patient.emergency_contact_name}
                                    {patient.emergency_contact_relation && (
                                        <span className="text-slate-500 text-xs font-normal ml-1">({patient.emergency_contact_relation})</span>
                                    )}
                                </div>
                            )}
                            {patient.emergency_contact_phone && (
                                <div className="text-xs font-mono text-slate-700 mt-0.5">{patient.emergency_contact_phone}</div>
                            )}
                        </div>
                    )}

                        </div>
                    </details>
                    {/* End Examination button (small, in sidebar) */}
                    <div className={isAesthetic ? "pt-3 border-t border-slate-200/60" : "[&>button]:px-4"}>
                        <VisitStatusActions
                            vn={vn}
                            currentStatus={visit.status}
                            hasDrugs={drugs.length > 0}
                            serviceCategory={visit.service_category}
                            summary={{
                                patientName: `${patient.prefix || ""}${patient.first_name} ${patient.last_name}`,
                                icd10: visit.icd10_primary || null,
                                icd10Name: icd10Name || null,
                                diagnosisText: visit.diagnosis_text || null,
                                soap_o: visit.soap_o || null,
                                soap_p: visit.soap_p || null,
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                drugs: drugs.map((d: any) => {
                                    const inv = Array.isArray(d.inventory) ? d.inventory[0] : d.inventory;
                                    return {
                                        item_name: inv?.item_name || "—",
                                        qty: d.qty,
                                        unit: d.unit || "",
                                        sig_text: d.sig_text || "—",
                                        total_cost: d.total_cost || 0,
                                    };
                                }),
                                totalDrugCost: drugs.reduce((s: number, d: { total_cost?: number }) => s + (d.total_cost || 0), 0),
                                labOrders,
                                medCert: medCert ? {
                                    cert_type: medCert.cert_type,
                                    rest_days: medCert.rest_days,
                                    doctor_opinion: medCert.doctor_opinion,
                                } : null,
                                appointments,
                                referrals,
                                aesthetic: isAesthetic ? (() => {
                                    const ar = visit.aesthetic_records || {};
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const pinColors: Record<string, string> = { red: "#dc2626", blue: "#2563eb", black: "#111827", amber: "#f59e0b" };
                                    return {
                                        strokesCount: (ar.face_chart?.strokes?.length) || 0,
                                        pinsCount: (ar.face_chart?.pins?.length) || 0,
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        pins: (ar.face_chart?.pins || []).map((p: any) => ({
                                            label: p.label || "",
                                            color: pinColors[p.color] || "#dc2626",
                                        })),
                                        treatmentNotes: ar.treatment_notes || null,
                                        beforePhotosCount: (ar.photos?.before?.length) || 0,
                                        afterPhotosCount: (ar.photos?.after?.length) || 0,
                                    };
                                })() : undefined,
                            }}
                        />
                    </div>

                    {!isAesthetic && <div className="sm:col-span-2">{clinicalHeader}</div>}
                    {/* Link to full patient page */}
                    <Link href={`/dashboard/patients/${patient.hn}`} target="_blank"
                        className="order-4 sm:col-span-2 block w-full text-center text-xs text-blue-600 hover:text-blue-800 hover:underline pt-2 border-t border-slate-200/60">
                        ดูข้อมูลผู้ป่วยเต็ม (เปิดแท็บใหม่) →
                    </Link>
                </div>
            </div>
            {/* ╚════════ END RIGHT ════════╝ */}

            {/* ╔════════ LEFT — Top Card + Workspace Tabs ════════╗ */}
            <div className="xl:order-1 min-w-0 space-y-5">

            {isAesthetic && <Link href={`/dashboard/visits/${vn}/workspace`} className="inline-flex rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">เปิดหน้าตรวจแบบใหม่ →</Link>}
            {isAesthetic && clinicalHeader}

            {/* Main Workspace Tabs - Sidebar layout */}
            <div className="backdrop-blur-xl bg-white/65 border border-white/90 shadow-[0_4px_24px_rgba(30,58,95,0.06)] rounded-2xl p-2 sm:p-3">
                <Tabs defaultValue={defaultTab} orientation={isAesthetic ? "vertical" : "horizontal"} className="w-full">
                    <div className={isAesthetic ? "grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-3" : "space-y-3"}>
                        {/* ── LEFT SIDEBAR ── */}
                        <aside className={isAesthetic ? "md:sticky md:top-4 md:self-start" : ""}>
                            <TabsList className={cn("flex flex-wrap items-stretch justify-start gap-1 h-auto bg-slate-100/65 border border-white/90 p-1.5 rounded-xl w-full", isAesthetic && "md:flex-col md:flex-nowrap")}>
                                {showSoapTab && (
                                    <TabsTrigger value="soap" className={tabTriggerClass}>
                                        <Stethoscope className="h-4 w-4 shrink-0" />
                                        <span>{language === "en" ? "Examination Notes" : "บันทึกการตรวจ"}</span>
                                        {doneSoap && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-auto shrink-0" />}
                                    </TabsTrigger>
                                )}
                                {visit.service_category === "aesthetic" && (
                                    <TabsTrigger value="aesthetic" className={tabTriggerClass}>
                                        <Sparkles className="h-4 w-4 shrink-0" />
                                        <span>{language === "en" ? "Aesthetic" : "หัตถการความงาม"}</span>
                                    </TabsTrigger>
                                )}
                                {showDrugsTab && (
                                    <TabsTrigger value="drugs" className={tabTriggerClass}>
                                        <Pill className="h-4 w-4 shrink-0" />
                                        <span>{language === "en" ? "Prescription" : "สั่งยา"}</span>
                                        {doneDx && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-auto shrink-0" />}
                                    </TabsTrigger>
                                )}
                                <TabsTrigger value="lab" className={tabTriggerClass}>
                                    <TestTube className="h-4 w-4 shrink-0" />
                                    <span>{language === "en" ? "Lab Orders" : "สั่ง Lab"}</span>
                                    {doneLab && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-auto shrink-0" />}
                                </TabsTrigger>
                                {showMedCertTab && (
                                    <TabsTrigger value="medcert" className={tabTriggerClass}>
                                        <FileSignature className="h-4 w-4 shrink-0" />
                                        <span>{language === "en" ? "Certificate" : "ใบรับรองแพทย์"}</span>
                                        {doneMedCert && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-auto shrink-0" />}
                                    </TabsTrigger>
                                )}
                                {!isAesthetic && (
                                    <TabsTrigger value="appt" className={tabTriggerClass}>
                                        <FileSignature className="h-4 w-4 shrink-0" />
                                        <span>{language === "en" ? "Appointments & Referral" : "นัดหมาย / ส่งต่อ"}</span>
                                    </TabsTrigger>
                                )}
                                {showPackagesTab && (
                                    <TabsTrigger value="packages" className={tabTriggerClass}>
                                        <Sparkles className="h-4 w-4 shrink-0" />
                                        <span>{language === "en" ? "Packages" : "คอสบริการ"}</span>
                                    </TabsTrigger>
                                )}
                                <TabsTrigger value="timeline" className={tabTriggerClass}>
                                    <History className="h-4 w-4 shrink-0" />
                                    <span>{language === "en" ? "History" : "ประวัติ & ผล Lab"}</span>
                                </TabsTrigger>
                            </TabsList>
                        </aside>

                        {/* ── RIGHT CONTENT ── */}
                        <div className="min-w-0 bg-white/85 rounded-xl border border-slate-200/60 overflow-hidden min-h-[500px]">
                        {/* Tab 1: PE */}
                        {showSoapTab && (
                            <TabsContent forceMount value="soap" className="p-4 sm:p-5 m-0 data-[state=inactive]:hidden outline-none">
                                <SoapForm
                                    vn={vn}
                                    visitType={visit.visit_type || "opd"}
                                    defaultValues={{
                                        soap_o: visit.soap_o || "",
                                        soap_p: visit.soap_p || "",
                                        aesthetic_records: visit.aesthetic_records || {},
                                    }}
                                />
                                <div className="mt-5 border-t border-slate-100 pt-4"><DrugOrderForm diagnosisOnly compact vn={vn} hn={patient.hn} defaultIcd10={visit.icd10_primary || ""} defaultDiagnosisText={visit.diagnosis_text || ""} /></div>
                            </TabsContent>
                        )}

                        {/* Aesthetic Records (เฉพาะ aesthetic visit) */}
                        {visit.service_category === "aesthetic" && (
                            <TabsContent forceMount value="aesthetic" className="p-4 sm:p-5 m-0 data-[state=inactive]:hidden outline-none">
                                <AestheticRecordsPanel vn={vn} hn={patient.hn} initial={visit.aesthetic_records || {}} />
                            </TabsContent>
                        )}

                        {/* Tab 2: Diagnosis & Drugs */}
                        {showDrugsTab && (
                        <TabsContent forceMount value="drugs" className="p-4 sm:p-5 m-0 data-[state=inactive]:hidden outline-none">
                            <DrugOrderForm
                                compact
                                showDiagnosis={false}
                                vn={vn}
                                hn={patient.hn}
                                defaultIcd10={visit.icd10_primary || ""}
                                defaultDiagnosisText={visit.diagnosis_text || ""}
                                allergens={[
                                    ...allergies.map((a) => a.allergen_name),
                                    ...(patient.allergy_summary
                                        ? String(patient.allergy_summary).split(/[,;/\n\s]+/).filter((w: string) => w.length >= 4)
                                        : []),
                                ]}
                            />

                            {drugs.length > 0 && (
                                <div className="mt-8 pt-6 border-t border-slate-100">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="h-8 w-1 bg-gradient-to-b from-blue-700 to-slate-900 rounded-full" />
                                        <p className="text-base font-semibold text-slate-800">{language === "en" ? "Prescribed Medicines" : "รายการยาที่บันทึกแล้ว"}</p>
                                    </div>
                                    <SavedDrugsEditor drugs={drugs} vn={vn} language={language} />
                                </div>
                            )}

                        </TabsContent>
                        )}

                        {/* Tab 3: Lab */}
                        <TabsContent forceMount value="lab" className="p-4 sm:p-5 m-0 data-[state=inactive]:hidden outline-none">
                            <LabOrderForm compact={!isAesthetic} vn={vn} hn={patient.hn} cc={visit.chief_complaint || ""} catalog={labCatalog || []} orders={labOrders || []} panels={labPanels || []} report={visit} />
                        </TabsContent>

                        {/* Tab 4: Medical Certificate */}
                        {showMedCertTab && (
                            <TabsContent forceMount value="medcert" className="p-4 sm:p-5 m-0 data-[state=inactive]:hidden outline-none">
                                <MedCertForm vn={vn} hn={patient.hn} initial={medCert} />
                            </TabsContent>
                        )}

                        {/* Tab: Refer only (Appointment moved to pharmacy checkout) */}
                        {!isAesthetic && (
                            <TabsContent forceMount value="appt" className="p-4 sm:p-5 m-0 data-[state=inactive]:hidden outline-none">
                                <AppointmentReferForm
                                    vn={vn}
                                    hn={patient.hn}
                                    doctorId={visit.doctor_id || undefined}
                                    showAppointment={true}
                                    showRefer={true}
                                />
                            </TabsContent>
                        )}

                        {/* Tab 6: Service Packages */}
                        {showPackagesTab && (
                            <TabsContent forceMount value="packages" className="p-4 sm:p-5 m-0 data-[state=inactive]:hidden outline-none">
                                <PackageUsagePanel hn={patient.hn} vn={vn} />
                            </TabsContent>
                        )}

                        {/* Tab 7: History / Timeline */}
                        <TabsContent forceMount value="timeline" className="p-4 sm:p-5 m-0 data-[state=inactive]:hidden outline-none">
                            <div className="space-y-5">
                                {!isAesthetic && <div className="rounded-xl border border-slate-200 p-4"><h2 className="mb-3 font-semibold">ผล Lab ของ visit นี้</h2>{!(labOrders || []).length && <p className="text-sm text-slate-500">ยังไม่มีรายการ Lab ใน visit นี้</p>}{(labOrders || []).map((lab: { id: string; lab_name: string; result_value?: string; result_unit?: string; normal_range?: string; status: string }) => <div key={lab.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 py-2 text-sm"><span>{lab.lab_name}</span><span>{lab.result_value ?? "ยังไม่มีผล"} {lab.result_unit} · {lab.status === "resulted" ? "มีผลตรวจแล้ว" : lab.status === "ordered" ? "รอผลตรวจ" : lab.status === "cancelled" ? "ยกเลิก" : lab.status}{lab.normal_range && ` · ค่าอ้างอิง ${lab.normal_range}`}</span></div>)}</div>}
                                {/* Header */}
                                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                                    <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                                        <History className="h-5 w-5 text-blue-600" />
                                        {language === "en" ? "Visit History" : "สถานะ & ประวัติการรักษา"}
                                    </h2>
                                    <span className="text-xs text-slate-500">
                                        ครั้งนี้ + {pastVisits.length} ครั้งที่ผ่านมา
                                    </span>
                                </div>

                                {/* Today's Status Timeline */}
                                {statusLogs.length > 0 && (
                                    <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/30 to-white p-4">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-3 flex items-center gap-1.5">
                                            <Clock className="h-3.5 w-3.5" />
                                            สถานะการเข้ารับบริการวันนี้ ({statusLogs.length})
                                        </h3>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                            {statusLogs.map((log: any, i: number) => (
                                                <div key={log.id} className="inline-flex items-center gap-1.5">
                                                    <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
                                                        <Badge variant={statusVariant[log.new_status] || "default"} className="font-semibold text-xs uppercase tracking-wide px-1.5 py-0 shadow-none border-0">
                                                            {statusLabel[log.new_status] || log.new_status}
                                                        </Badge>
                                                        <span className="text-xs font-mono text-slate-500">
                                                            {new Date(log.changed_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                                                        </span>
                                                    </div>
                                                    {i < statusLogs.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                                                </div>
                                            ))}
                                        </div>
                                        {/* Show notes if any */}
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        {statusLogs.some((l: any) => l.note) && (
                                            <div className="mt-3 pt-3 border-t border-blue-100 space-y-1">
                                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                                {statusLogs.filter((l: any) => l.note).map((log: any) => (
                                                    <div key={log.id} className="text-sm text-slate-700 flex items-start gap-2">
                                                        <span className="font-semibold text-blue-700 shrink-0">{statusLabel[log.new_status] || log.new_status}:</span>
                                                        <span>{log.note}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Past Visits */}
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                            <Activity className="h-3.5 w-3.5" />
                                            {language === "en" ? "Previous Visits" : "ประวัติการรักษาก่อนหน้า"}
                                            <span className="text-slate-400 normal-case font-normal">— 10 ครั้งล่าสุด</span>
                                        </h3>
                                        {pastVisits.length > 0 && (
                                            <div className="relative">
                                                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                                <input value={pastFilter} onChange={(e) => setPastFilter(e.target.value)}
                                                    placeholder="กรอง ICD-10 / อาการ"
                                                    className="h-8 w-48 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                                            </div>
                                        )}
                                    </div>

                                    {pastVisits.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center p-10 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400">
                                            <Activity className="h-8 w-8 mb-2 opacity-50" />
                                            <p className="text-sm font-medium">ไม่พบประวัติการรักษา</p>
                                            <p className="text-xs mt-1">visit นี้เป็นครั้งแรกของคนไข้</p>
                                        </div>
                                    ) : filteredPast.length === 0 ? (
                                        <div className="p-6 text-center text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                                            ไม่พบประวัติที่ตรงกับ “{pastFilter}”
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                            {filteredPast.map((pv: any) => (
                                                <PastVisitCard key={pv.vn} pv={pv} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        </div>
                    </div>
                </Tabs>
            </div>
            </div>
            {/* ╚════════ END LEFT — Workspace Tabs ════════╝ */}

            </div>
            {/* ╚════════ END 2-Column Layout ════════╝ */}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Past Visit Card — แสดงประวัติแต่ละ visit ที่ผ่านมา
 *  รองรับทั้ง visit ทั่วไป และ aesthetic (แสดง face chart, notes)
 * ═══════════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PastVisitCard({ pv }: { pv: any }) {
    const isAesthetic = pv.service_category === "aesthetic";
    const aestheticRecords = pv.aesthetic_records || {};
    const faceChart = aestheticRecords.face_chart as FaceChartData | undefined;
    const treatmentNotes = aestheticRecords.treatment_notes;
    const pins = faceChart?.pins || [];
    const hasFaceChart = (faceChart?.strokes?.length || 0) > 0 || pins.length > 0;

    const doctor = Array.isArray(pv.doctor) ? pv.doctor[0] : pv.doctor;
    const doctorProfile = Array.isArray(doctor?.profiles) ? doctor.profiles[0] : doctor?.profiles;
    const doctorName = doctorProfile?.full_name;

    const hasVitals = pv.bp_systolic || pv.pulse_rate || pv.temperature || pv.weight_kg;
    const totalDrugCost = (pv.drug_orders || []).reduce((s: number, d: { total_cost?: number }) => s + (d.total_cost || 0), 0);

    const visitTypeLabel = isAesthetic ? "ความงาม" :
        pv.service_category === "wound_care" ? "ทำแผล" :
        pv.service_category === "checkup" ? "ตรวจสุขภาพ" :
        pv.service_category === "med_cert" ? "ใบรับรอง" :
        pv.service_category === "std_test" ? "ตรวจ STD" :
        "ตรวจทั่วไป";

    const categoryColor = isAesthetic ? "bg-rose-50 text-rose-700 border-rose-200" :
        pv.service_category === "wound_care" ? "bg-amber-50 text-amber-700 border-amber-200" :
        "bg-blue-50 text-blue-700 border-blue-200";

    return (
        <div className={`border-2 ${isAesthetic ? "border-rose-200" : "border-slate-200"} bg-white rounded-2xl overflow-hidden hover:shadow-md transition-shadow`}>
            {/* Header */}
            <div className={`px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${isAesthetic ? "bg-rose-50/40 border-b border-rose-100" : "bg-slate-50/40 border-b border-slate-100"}`}>
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-10 w-10 rounded-xl border-2 ${categoryColor} flex flex-col items-center justify-center shrink-0`}>
                        <div className="text-xs uppercase font-semibold opacity-70 leading-none">
                            {new Date(pv.visit_date).toLocaleDateString("th-TH", { month: "short" })}
                        </div>
                        <div className="text-base font-semibold leading-none">
                            {new Date(pv.visit_date).getDate()}
                        </div>
                    </div>
                    <div className="min-w-0">
                        <div className="font-semibold text-slate-800 text-sm">
                            {new Date(pv.visit_date).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                            {pv.visit_time && (
                                <span className="ml-2 text-xs font-mono text-slate-500">
                                    {pv.visit_time.slice(0, 5)} น.
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${categoryColor}`}>
                                {visitTypeLabel}
                            </span>
                            <span className="font-mono text-xs text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                {pv.vn}
                            </span>
                            {doctorName && (
                                <span className="text-xs text-slate-600 inline-flex items-center gap-0.5">
                                    <Stethoscope className="h-2.5 w-2.5" /> {doctorName}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <Link
                    href={`/dashboard/visits/${pv.vn}`}
                    target="_blank"
                    className="text-xs text-cyan-600 hover:text-cyan-700 font-semibold inline-flex items-center gap-0.5 shrink-0"
                >
                    เปิด <ChevronRight className="h-3 w-3" />
                </Link>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
                {/* Chief Complaint */}
                {pv.chief_complaint && (
                    <div className="flex items-start gap-2 text-sm">
                        <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-2">CC:</span>
                            <span className="text-slate-700">{pv.chief_complaint}</span>
                        </div>
                    </div>
                )}

                {/* Vitals (compact inline) */}
                {hasVitals && (
                    <div className="flex items-center gap-3 flex-wrap text-xs bg-slate-50/60 rounded-lg px-3 py-1.5">
                        {pv.bp_systolic && pv.bp_diastolic && (
                            <span><span className="text-slate-500">BP</span> <span className="font-semibold tabular-nums">{pv.bp_systolic}/{pv.bp_diastolic}</span></span>
                        )}
                        {pv.pulse_rate && (
                            <span><span className="text-slate-500">PR</span> <span className="font-semibold tabular-nums">{pv.pulse_rate}</span></span>
                        )}
                        {pv.temperature && (
                            <span><span className="text-slate-500">T</span> <span className="font-semibold tabular-nums">{pv.temperature}°C</span></span>
                        )}
                        {pv.weight_kg && (
                            <span><span className="text-slate-500">น.น.</span> <span className="font-semibold tabular-nums">{pv.weight_kg}kg</span></span>
                        )}
                        {pv.height_cm && (
                            <span><span className="text-slate-500">สูง</span> <span className="font-semibold tabular-nums">{pv.height_cm}cm</span></span>
                        )}
                    </div>
                )}

                {/* Aesthetic visit — show Face Chart + Treatment Notes */}
                {isAesthetic && (hasFaceChart || treatmentNotes) && (
                    <div className="grid grid-cols-1 md:grid-cols-[170px_minmax(0,1fr)] gap-3 pt-2 border-t border-slate-100">
                        {/* Face Chart */}
                        {hasFaceChart && (
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-rose-600 mb-1.5 flex items-center gap-1">
                                    <Pencil className="h-3 w-3" /> Face Chart
                                </div>
                                <FaceChartRender data={faceChart as FaceChartData} width={200} />
                                {pins.length > 0 && (
                                    <div className="mt-1.5 space-y-0.5">
                                        {pins.map((p, i) => (
                                            <div key={p.id || i} className="text-xs flex items-baseline gap-1.5">
                                                <span className="font-mono font-semibold text-rose-700 shrink-0">#{i + 1}</span>
                                                <span className="truncate text-slate-700">{p.label || <span className="italic text-slate-400">—</span>}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Treatment Notes */}
                        <div className="min-w-0 space-y-2">
                            {treatmentNotes && (
                                <div>
                                    <div className="text-xs font-semibold uppercase tracking-wider text-rose-600 mb-1 flex items-center gap-1">
                                        <Sparkles className="h-3 w-3" /> บันทึกหัตถการ
                                    </div>
                                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-rose-50/40 border border-rose-100 rounded-lg p-2.5">
                                        {treatmentNotes}
                                    </p>
                                </div>
                            )}

                            {/* Pin count summary if no notes */}
                            {!treatmentNotes && hasFaceChart && (
                                <div className="text-sm text-slate-500 italic">
                                    บันทึก {pins.length} จุดบนแผนผังใบหน้า
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Non-aesthetic — show PE + Plan */}
                {!isAesthetic && (pv.soap_o || pv.soap_p) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        {pv.soap_o && (
                            <div className="bg-slate-50/60 rounded-lg p-2.5">
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">PE / ผลตรวจ</div>
                                <p className="text-sm text-slate-700 leading-snug whitespace-pre-wrap line-clamp-3">{pv.soap_o}</p>
                            </div>
                        )}
                        {pv.soap_p && (
                            <div className="bg-slate-50/60 rounded-lg p-2.5">
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Plan</div>
                                <p className="text-sm text-slate-700 leading-snug whitespace-pre-wrap line-clamp-3">{pv.soap_p}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ICD-10 */}
                {pv.icd10_primary && (
                    <div className="inline-flex items-center gap-1.5 text-xs bg-blue-50 border border-blue-200 px-2 py-1 rounded-md">
                        <span className="font-semibold text-blue-700 uppercase tracking-wider">ICD-10</span>
                        <span className="font-mono font-semibold text-blue-800">{pv.icd10_primary}</span>
                    </div>
                )}

                {/* Prescriptions */}
                {pv.drug_orders && pv.drug_orders.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                                <Pill className="h-3 w-3" /> ยาที่ได้รับ ({pv.drug_orders.length})
                            </div>
                            {totalDrugCost > 0 && (
                                <span className="text-xs text-emerald-700 font-semibold tabular-nums">
                                    ฿{totalDrugCost.toLocaleString()}
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {pv.drug_orders.map((d: any, idx: number) => {
                                const inv = Array.isArray(d.inventory) ? d.inventory[0] : d.inventory;
                                return (
                                    <div key={idx} className="bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1 text-xs" title={d.sig_text || undefined}>
                                        <span className="font-semibold text-emerald-800">{inv?.item_name || "Unknown"}</span>
                                        {inv?.strength && <span className="text-emerald-600 ml-1">{inv.strength}</span>}
                                        <span className="text-emerald-600 font-semibold ml-1.5">×{d.qty}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
