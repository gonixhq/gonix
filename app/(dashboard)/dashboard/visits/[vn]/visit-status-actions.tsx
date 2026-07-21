"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
    Loader2, CheckCircle, ClipboardList, X, AlertTriangle,
    FileText, Stethoscope, Pill, FlaskConical, CalendarDays, ArrowRight, Building2, Heart, Sparkles, Pencil, MapPin,
} from "lucide-react";

/** Format "20:30:00+00" or "20:30" → "20:30" */
function fmtTime(t: string | null | undefined): string {
    if (!t) return "—";
    return t.slice(0, 5);
}

/** Format "2026-06-01" → "1 มิ.ย. 2026" */
function fmtDate(d: string | null | undefined): string {
    if (!d) return "—";
    try {
        return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    } catch {
        return d;
    }
}

const CERT_LABEL: Record<string, string> = {
    sick_leave: "ใบรับรองแพทย์ — ลาป่วย",
    fit_for_work: "ใบรับรองแพทย์ — Fit for Work",
    fitness: "ใบรับรองแพทย์ — สมัครงาน/เรียน",
    driving: "ใบรับรองแพทย์ — ทำใบขับขี่",
    insurance: "ใบรับรองแพทย์ — ประกัน",
    other: "ใบรับรองแพทย์ — อื่นๆ",
};

interface DrugSummary {
    item_name: string;
    qty: number;
    unit: string;
    sig_text: string;
    total_cost: number;
}

interface EndExamProps {
    vn: string;
    currentStatus: string;
    hasDrugs: boolean;
    serviceCategory?: string;
    summary: {
        patientName: string;
        icd10?: string | null;
        icd10Name?: string | null;
        soap_o?: string | null;  // Physical Exam
        soap_p?: string | null;  // Doctor Note
        drugs: DrugSummary[];
        totalDrugCost: number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        labOrders?: any[];
        medCert?: { cert_type: string; rest_days: string | null; doctor_opinion: string | null } | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        appointments?: any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        referrals?: any[];
        // Aesthetic visit summary
        aesthetic?: {
            strokesCount: number;
            pinsCount: number;
            pins: { label: string; color: string }[];
            treatmentNotes: string | null;
            beforePhotosCount: number;
            afterPhotosCount: number;
        };
    };
}

export default function VisitStatusActions({ vn, currentStatus, hasDrugs, summary, serviceCategory }: EndExamProps) {
    const isAesthetic = serviceCategory === "aesthetic";
    // ICD-10 ไม่บังคับสำหรับ: ความงาม (aesthetic) และ ขอใบรับรองแพทย์ (med_cert)
    // — เคสขอใบรับรอง การวินิจฉัยอยู่ในตัวใบรับรองเอง ไม่จำเป็นต้องมี ICD
    const icdRequired = !isAesthetic && serviceCategory !== "med_cert";
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [showDialog, setShowDialog] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    if (currentStatus !== "with_doctor" && currentStatus !== "with_nurse") {
        return null;
    }

    const nextStatus = hasDrugs ? "waiting_medicine" : "waiting_payment";
    const nextLabel = hasDrugs ? "รอรับยา 💊" : "รอชำระเงิน 💳";

    async function handleConfirm() {
        setLoading(true);
        try {
            const { error } = await supabase.from("visits")
                .update({ status: nextStatus })
                .eq("vn", vn);
            if (error) throw error;

            await supabase.from("visit_status_logs").insert({
                vn,
                old_status: currentStatus,
                new_status: nextStatus,
            });

            await supabase.from("queue_entries").update({
                status: nextStatus,
            }).eq("vn", vn);

            setShowDialog(false);
            // กลับไปห้องแพทย์ — หมอจะได้เลือกคนไข้คนต่อไปทันที
            router.push("/dashboard/doctor-station");
        } catch {
            // handle silently
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            {/* ── End Exam Button ─────────────────────────────── */}
            <button
                onClick={() => setShowDialog(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold text-white transition-all bg-emerald-600 hover:bg-emerald-700 shadow-sm"
            >
                <ClipboardList className="h-4 w-4" />
                สิ้นสุดการตรวจ
            </button>

            {/* ── Confirmation Dialog (Portal — escape stacking context of sticky/transform parents) ──────────────────────────── */}
            {showDialog && mounted && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => !loading && setShowDialog(false)}
                    />

                    {/* Dialog */}
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
                        {/* Header */}
                        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                            <div className="min-w-0">
                                <h2 className="text-lg font-bold text-slate-800">ยืนยันสิ้นสุดการตรวจ</h2>
                                <p className="text-xs text-slate-500 mt-0.5">ตรวจสอบข้อมูลก่อนส่งต่อ</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDialog(false)}
                                disabled={loading}
                                className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-5 py-4 space-y-3">
                            {/* Patient header */}
                            <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">ผู้ป่วย</p>
                                <p className="font-bold text-slate-800 text-sm truncate">{summary.patientName}</p>
                            </div>

                            {/* ICD-10 (ไม่แสดงสำหรับ aesthetic) */}
                            {!isAesthetic && (
                                <SummarySection icon={Stethoscope} title="การวินิจฉัย (ICD-10)">
                                    {summary.icd10 ? (
                                        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                                            <span className="font-mono font-bold text-blue-700 text-sm bg-white px-2 py-0.5 rounded shrink-0">{summary.icd10}</span>
                                            <span className="text-slate-800 text-sm font-medium">{summary.icd10Name || "—"}</span>
                                        </div>
                                    ) : icdRequired ? (
                                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                                            <span className="text-amber-800 text-sm font-medium">ยังไม่ได้ระบุการวินิจฉัย</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                                            <span className="text-slate-500 text-sm">— ไม่ได้ระบุ (ไม่บังคับสำหรับใบรับรองแพทย์)</span>
                                        </div>
                                    )}
                                </SummarySection>
                            )}

                            {/* Aesthetic summary (เฉพาะ aesthetic visit) */}
                            {isAesthetic && summary.aesthetic && (
                                <>
                                    <SummarySection icon={Pencil} title="แผนผังใบหน้า (Face Chart)">
                                        {summary.aesthetic.strokesCount === 0 && summary.aesthetic.pinsCount === 0 ? (
                                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                                                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                                                <span className="text-amber-800 text-sm font-medium">ยังไม่ได้บันทึก face chart</span>
                                            </div>
                                        ) : (
                                            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 space-y-2">
                                                <div className="flex items-center gap-3 text-sm">
                                                    <span className="text-slate-600">
                                                        เส้นวาด <span className="font-bold text-rose-700">{summary.aesthetic.strokesCount}</span> เส้น
                                                    </span>
                                                    <span className="text-slate-300">·</span>
                                                    <span className="text-slate-600">
                                                        หมุด <span className="font-bold text-rose-700">{summary.aesthetic.pinsCount}</span> จุด
                                                    </span>
                                                </div>
                                                {summary.aesthetic.pins.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-rose-200/60">
                                                        {summary.aesthetic.pins.map((pin, i) => (
                                                            <span
                                                                key={i}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold text-white"
                                                                style={{ backgroundColor: pin.color }}
                                                            >
                                                                <MapPin className="h-2.5 w-2.5" />
                                                                {pin.label || "(no label)"}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </SummarySection>

                                    <SummarySection icon={FileText} title="บันทึกหัตถการ">
                                        {summary.aesthetic.treatmentNotes ? (
                                            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2.5 whitespace-pre-wrap border border-slate-200/60">
                                                {summary.aesthetic.treatmentNotes}
                                            </p>
                                        ) : (
                                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                                                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                                                <span className="text-amber-800 text-sm font-medium">ยังไม่ได้บันทึกรายละเอียดหัตถการ</span>
                                            </div>
                                        )}
                                    </SummarySection>

                                    {(summary.aesthetic.beforePhotosCount + summary.aesthetic.afterPhotosCount) > 0 && (
                                        <SummarySection icon={Sparkles} title="รูปก่อน-หลัง">
                                            <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm">
                                                <span className="inline-flex items-center gap-1">
                                                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                                                    ก่อน <span className="font-bold tabular-nums">{summary.aesthetic.beforePhotosCount}</span> รูป
                                                </span>
                                                <span className="text-slate-300">·</span>
                                                <span className="inline-flex items-center gap-1">
                                                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                                    หลัง <span className="font-bold tabular-nums">{summary.aesthetic.afterPhotosCount}</span> รูป
                                                </span>
                                            </div>
                                        </SummarySection>
                                    )}
                                </>
                            )}

                            {/* PE Note */}
                            {!isAesthetic && summary.soap_o && (
                                <SummarySection icon={FileText} title="ผลตรวจร่างกาย (PE)">
                                    <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2.5 whitespace-pre-wrap border border-slate-200/60">
                                        {summary.soap_o}
                                    </p>
                                </SummarySection>
                            )}

                            {/* Doctor Note */}
                            {!isAesthetic && summary.soap_p && (
                                <SummarySection icon={FileText} title="บันทึกแพทย์">
                                    <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2.5 whitespace-pre-wrap border border-slate-200/60">
                                        {summary.soap_p}
                                    </p>
                                </SummarySection>
                            )}

                            {/* Drugs (ไม่แสดงสำหรับ aesthetic — เคาท์เตอร์คีย์ในหน้าจ่ายเงิน) */}
                            {!isAesthetic && (
                            <SummarySection icon={Pill} title={`รายการยา (${summary.drugs.length} รายการ)`}>
                                {summary.drugs.length === 0 ? (
                                    <p className="text-sm text-slate-400 bg-slate-50 rounded-lg px-3 py-2.5 italic border border-slate-200/60">
                                        ไม่มีการสั่งยา
                                    </p>
                                ) : (
                                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                                        <table className="w-full text-sm">
                                            <tbody>
                                                {summary.drugs.map((d, i) => (
                                                    <tr key={i} className="border-b last:border-0 border-slate-100">
                                                        <td className="px-3 py-2">
                                                            <div className="font-semibold text-slate-800 text-sm">{d.item_name}</div>
                                                            <div className="text-xs text-slate-500 mt-0.5">{d.sig_text}</div>
                                                        </td>
                                                        <td className="px-3 py-2 text-center text-slate-600 text-xs whitespace-nowrap">
                                                            {d.qty} <span className="text-slate-400">{d.unit}</span>
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-bold text-slate-800 text-sm whitespace-nowrap">
                                                            ฿{d.total_cost.toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-blue-50/60 border-t border-blue-100">
                                                <tr>
                                                    <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-blue-800 text-right">รวม</td>
                                                    <td className="px-3 py-2 text-right font-bold text-blue-700">
                                                        ฿{summary.totalDrugCost.toLocaleString()}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </SummarySection>
                            )}

                            {/* Lab Orders */}
                            {Array.isArray(summary.labOrders) && summary.labOrders.length > 0 && (
                                <SummarySection icon={FlaskConical} title={`สั่ง Lab (${summary.labOrders.length})`}>
                                    <div className="flex flex-wrap gap-1.5">
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        {summary.labOrders.map((lab: any, i: number) => (
                                            <span key={i} className="px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-md text-xs font-semibold text-indigo-800">
                                                {lab.name}
                                            </span>
                                        ))}
                                    </div>
                                </SummarySection>
                            )}

                            {/* Medical Certificate */}
                            {summary.medCert && (
                                <SummarySection icon={Heart} title="ใบรับรองแพทย์">
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm">
                                        <div className="font-bold text-amber-900">
                                            {CERT_LABEL[summary.medCert.cert_type] || summary.medCert.cert_type}
                                            {summary.medCert.cert_type === "sick_leave" && summary.medCert.rest_days && (
                                                <span className="ml-2 px-2 py-0.5 bg-amber-200 text-amber-900 rounded text-xs">
                                                    {summary.medCert.rest_days} วัน
                                                </span>
                                            )}
                                        </div>
                                        {summary.medCert.doctor_opinion && (
                                            <p className="text-amber-800/80 text-xs mt-1.5 whitespace-pre-wrap">{summary.medCert.doctor_opinion}</p>
                                        )}
                                    </div>
                                </SummarySection>
                            )}

                            {/* Appointments & Referrals */}
                            {(Array.isArray(summary.appointments) && summary.appointments.length > 0) || (Array.isArray(summary.referrals) && summary.referrals.length > 0) ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {Array.isArray(summary.appointments) && summary.appointments.length > 0 && (
                                        <SummarySection icon={CalendarDays} title="นัดครั้งต่อไป">
                                            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-sm">
                                                <p className="font-bold text-blue-800">
                                                    {fmtDate(summary.appointments[0].appt_date)}
                                                </p>
                                                {summary.appointments[0].appt_start && (
                                                    <p className="text-xs text-blue-700/80 mt-0.5">เวลา {fmtTime(summary.appointments[0].appt_start)}</p>
                                                )}
                                                {summary.appointments[0].note && (
                                                    <p className="text-xs text-slate-600 mt-1.5 truncate">{summary.appointments[0].note}</p>
                                                )}
                                            </div>
                                        </SummarySection>
                                    )}
                                    {Array.isArray(summary.referrals) && summary.referrals.length > 0 && (
                                        <SummarySection icon={Building2} title="ส่งต่อ (Refer)">
                                            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm">
                                                <p className="font-bold text-red-900">รพ. {summary.referrals[0].destination_hospital}</p>
                                                {summary.referrals[0].referral_reason && (
                                                    <p className="text-xs text-red-800/80 mt-1 truncate">{summary.referrals[0].referral_reason}</p>
                                                )}
                                            </div>
                                        </SummarySection>
                                    )}
                                </div>
                            ) : null}

                            {/* Next step */}
                            <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                                    <ArrowRight className="h-4 w-4" />
                                    สถานะถัดไป
                                </div>
                                <span className="text-sm font-bold text-emerald-700 bg-white px-2.5 py-0.5 rounded-md border border-emerald-200">
                                    {nextLabel}
                                </span>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="sticky bottom-0 bg-white border-t px-6 py-4 rounded-b-2xl space-y-2.5">
                            {icdRequired && !summary.icd10 && (
                                <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 font-semibold">
                                    <AlertTriangle className="h-4 w-4 shrink-0" /> ต้องระบุการวินิจฉัย (ICD-10) อย่างน้อย 1 รายการ ก่อนสิ้นสุดการตรวจ
                                </div>
                            )}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowDialog(false)}
                                    disabled={loading}
                                    className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-colors">
                                    แก้ไขข้อมูล
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirm}
                                    disabled={loading || (icdRequired && !summary.icd10)}
                                    title={icdRequired && !summary.icd10 ? "ต้องระบุ ICD-10 ก่อน" : undefined}
                                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {loading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <CheckCircle className="h-4 w-4" />
                                    )}
                                    ยืนยัน — ส่งต่อ
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

/** Section wrapper: icon + title + content */
function SummarySection({
    icon: Icon, title, children,
}: {
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className="h-3 w-3 text-slate-400" />
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
            </div>
            {children}
        </div>
    );
}
