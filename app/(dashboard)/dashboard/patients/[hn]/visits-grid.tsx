"use client";

import { useState } from "react";
import Link from "next/link";
import { getVisitSummary } from "@/lib/actions/visits";
import {
    Activity, Calendar, ChevronDown, Loader2, Stethoscope, Pill,
    FileText, ArrowRightCircle, CalendarCheck, Thermometer,
    User, ExternalLink, ClipboardList, Printer, Paperclip, Eye,
    Image as ImageIcon,
} from "lucide-react";
import { getAttachmentSignedUrl } from "@/lib/actions/visit-attachments";

interface VisitItem {
    vn: string;
    visit_date: string;
    status: string;
    chief_complaint?: string | null;
    icd10_primary?: string | null;
}

const statusLabel: Record<string, string> = {
    waiting: "รอซักประวัติ", triaged: "คัดกรอง", with_doctor: "รอตรวจ",
    with_nurse: "พบพยาบาล", waiting_medicine: "รอรับยา",
    waiting_payment: "รอชำระ", completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};
const statusDot: Record<string, string> = {
    waiting: "bg-amber-400", triaged: "bg-blue-400",
    with_doctor: "bg-indigo-500", with_nurse: "bg-cyan-500",
    waiting_medicine: "bg-purple-500", waiting_payment: "bg-orange-500",
    completed: "bg-emerald-500", cancelled: "bg-slate-300",
};
const statusText: Record<string, string> = {
    waiting: "text-amber-700", triaged: "text-blue-700",
    with_doctor: "text-indigo-700", with_nurse: "text-cyan-700",
    waiting_medicine: "text-purple-700", waiting_payment: "text-orange-700",
    completed: "text-emerald-700", cancelled: "text-slate-400",
};

type Summary = Awaited<ReturnType<typeof getVisitSummary>>;

export default function VisitsGrid({
    visits,
    icdMap = {},
}: {
    visits: VisitItem[];
    icdMap?: Record<string, string>;
}) {
    const [expanded, setExpanded] = useState<string | null>(null);
    const [summaries, setSummaries] = useState<Record<string, Summary>>({});
    const [loading, setLoading] = useState<string | null>(null);

    async function handleToggle(vn: string) {
        if (expanded === vn) { setExpanded(null); return; }
        setExpanded(vn);
        if (!summaries[vn]) {
            setLoading(vn);
            try {
                const data = await getVisitSummary(vn);
                setSummaries(prev => ({ ...prev, [vn]: data }));
            } catch (e) {
                console.error("[visits-grid] load summary error:", e);
            } finally {
                setLoading(null);
            }
        }
    }

    if (visits.length === 0) {
        return (
            <div className="gonix-card-premium overflow-hidden">
                <div className="text-center py-16 text-slate-400">
                    <Activity className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm">ยังไม่มีประวัติ Visit</p>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden divide-y divide-slate-100">
            {visits.map((v) => {
                const isOpen = expanded === v.vn;
                const d = new Date(v.visit_date);
                return (
                    <div key={v.vn}>
                        {/* Row */}
                        <button
                            onClick={() => handleToggle(v.vn)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                isOpen ? "bg-blue-50/60" : "hover:bg-slate-50/60"
                            }`}
                        >
                            {/* Status dot */}
                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDot[v.status] || "bg-slate-300"}`} />

                            {/* Date */}
                            <div className="text-xs font-semibold text-slate-700 w-20 shrink-0">
                                {d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                                <span className="text-slate-400 font-normal ml-1">{d.getFullYear() + 543 - 2500 < 10 ? "0" + (d.getFullYear() + 543 - 2500) : (d.getFullYear() + 543) % 100}</span>
                            </div>

                            {/* Chief complaint */}
                            <div className="flex-1 min-w-0 text-sm text-slate-700 truncate">
                                {v.chief_complaint || <span className="text-slate-400 italic">—</span>}
                            </div>

                            {/* ICD-10 + name */}
                            <div className="w-56 shrink-0 hidden sm:flex items-center gap-1.5 min-w-0">
                                {v.icd10_primary ? (
                                    <>
                                        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                                            {v.icd10_primary}
                                        </span>
                                        {icdMap[v.icd10_primary] && (
                                            <span className="text-xs text-slate-500 truncate" title={icdMap[v.icd10_primary]}>
                                                {icdMap[v.icd10_primary]}
                                            </span>
                                        )}
                                    </>
                                ) : <span className="text-slate-300 text-xs">—</span>}
                            </div>

                            {/* Status label */}
                            <div className={`text-xs font-semibold w-20 text-right shrink-0 hidden md:block ${statusText[v.status] || "text-slate-500"}`}>
                                {statusLabel[v.status] || v.status}
                            </div>

                            {/* VN */}
                            <div className="text-[10px] font-mono text-slate-400 w-28 text-right shrink-0 hidden lg:block">
                                {v.vn}
                            </div>

                            {/* Chevron */}
                            <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </button>

                        {/* Inline expand */}
                        {isOpen && (
                            <div className="bg-slate-50/30 border-t border-slate-200/60 animate-in fade-in slide-in-from-top-1 duration-200">
                                {loading === v.vn ? (
                                    <div className="flex items-center justify-center py-8 text-slate-400">
                                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                        <span className="text-sm">กำลังโหลด...</span>
                                    </div>
                                ) : summaries[v.vn] ? (
                                    <VisitSummaryDetail summary={summaries[v.vn]} vn={v.vn} />
                                ) : null}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/* ─── Detail content ─── */
function VisitSummaryDetail({ summary, vn }: { summary: Summary; vn: string }) {
    const { visit, drugOrders, vitalSigns, certificates, referrals, followUps, icdMap, attachments } = summary;
    if (!visit) return <p className="p-6 text-sm text-slate-400">ไม่พบข้อมูล</p>;

    async function viewFile(filePath: string) {
        const res = await getAttachmentSignedUrl(filePath);
        if (res.success && res.url) window.open(res.url, "_blank");
        else alert(res.error || "ไม่สามารถเปิดไฟล์ได้");
    }

    const attachCategoryLabel: Record<string, string> = {
        opd_record: "OPD", lab_external: "Lab นอก", lab_internal: "Lab ใน",
        imaging: "X-ray", consent: "ยินยอม", referral_doc: "ส่งต่อ",
        prescription: "ใบสั่งยา", med_cert: "ใบรับรอง", other: "อื่นๆ",
    };

    // Normalize ICD secondary (could be null/array of strings)
    const icdSecondary: string[] = Array.isArray(visit.icd10_secondary)
        ? visit.icd10_secondary.filter(Boolean)
        : [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doctor = Array.isArray((visit as any).doctor) ? (visit as any).doctor[0] : (visit as any).doctor;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nurse = Array.isArray((visit as any).nurse) ? (visit as any).nurse[0] : (visit as any).nurse;
    const doctorName = doctor?.profiles?.full_name || doctor?.profiles?.[0]?.full_name;
    const nurseName = nurse?.profiles?.full_name || nurse?.profiles?.[0]?.full_name;

    const vs = vitalSigns || {
        bp_systolic: visit.bp_systolic, bp_diastolic: visit.bp_diastolic,
        pulse_rate: visit.pulse_rate, temperature: visit.temperature,
        weight_kg: visit.weight_kg, height_cm: visit.height_cm,
    };
    const hasVitals = vs.bp_systolic || vs.pulse_rate || vs.temperature || vs.weight_kg;

    const totalRx = drugOrders.reduce((sum, d) => sum + Number(d.total_cost || 0), 0);

    return (
        <div className="p-5 space-y-4">
            {/* Mini header bar */}
            <div className="flex items-center justify-between text-xs">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-slate-500">{vn}</span>
                    {visit.visit_time && <span className="text-slate-400">เวลา {visit.visit_time.slice(0, 5)}</span>}
                    {doctorName && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            <Stethoscope className="h-3 w-3" /> {doctorName}
                        </span>
                    )}
                    {nurseName && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">
                            <User className="h-3 w-3" /> {nurseName}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <Link href={`/print/visits/${vn}?noauto=1`} target="_blank"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline">
                        <Printer className="h-3 w-3" /> พิมพ์ / PDF
                    </Link>
                    <Link href={`/dashboard/visits/${vn}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline">
                        เปิดหน้าตรวจเต็ม <ExternalLink className="h-3 w-3" />
                    </Link>
                </div>
            </div>

            {/* Two-column layout: CC + Vitals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <CompactBox icon={ClipboardList} title="อาการ (CC)">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                        {visit.chief_complaint || <span className="text-slate-400 italic">ไม่ได้บันทึก</span>}
                    </p>
                </CompactBox>

                {hasVitals && (
                    <CompactBox icon={Thermometer} title="สัญญาณชีพ">
                        <div className="grid grid-cols-3 gap-1.5 text-xs">
                            {vs.bp_systolic && vs.bp_diastolic && <MiniVital label="BP" value={`${vs.bp_systolic}/${vs.bp_diastolic}`} />}
                            {vs.pulse_rate && <MiniVital label="PR" value={String(vs.pulse_rate)} />}
                            {vs.temperature && <MiniVital label="T°" value={String(vs.temperature)} />}
                            {vs.weight_kg && <MiniVital label="W" value={`${vs.weight_kg}kg`} />}
                            {vs.height_cm && <MiniVital label="H" value={`${vs.height_cm}cm`} />}
                            {vs.weight_kg && vs.height_cm && (
                                <MiniVital label="BMI" value={(Number(vs.weight_kg) / Math.pow(Number(vs.height_cm) / 100, 2)).toFixed(1)} />
                            )}
                        </div>
                    </CompactBox>
                )}
            </div>

            {/* SOAP — collapsible inline */}
            {(visit.soap_s || visit.soap_o || visit.soap_a || visit.soap_p) && (
                <CompactBox icon={FileText} title="SOAP">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {visit.soap_s && <SoapRow label="S" text={visit.soap_s} />}
                        {visit.soap_o && <SoapRow label="O" text={visit.soap_o} />}
                        {visit.soap_a && <SoapRow label="A" text={visit.soap_a} />}
                        {visit.soap_p && <SoapRow label="P" text={visit.soap_p} />}
                    </div>
                </CompactBox>
            )}

            {/* Diagnosis */}
            {(visit.icd10_primary || icdSecondary.length > 0) && (
                <CompactBox icon={Stethoscope} title="การวินิจฉัย">
                    <div className="flex flex-wrap gap-1.5 text-xs">
                        {visit.icd10_primary && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800">
                                <span className="text-[10px] font-bold text-indigo-500">หลัก</span>
                                <span className="font-mono font-semibold">{visit.icd10_primary}</span>
                                {icdMap?.[visit.icd10_primary]?.description_th && (
                                    <span className="text-slate-700">— {icdMap[visit.icd10_primary].description_th}</span>
                                )}
                                {!icdMap?.[visit.icd10_primary]?.description_th && icdMap?.[visit.icd10_primary]?.description_en && (
                                    <span className="text-slate-700">— {icdMap[visit.icd10_primary].description_en}</span>
                                )}
                            </span>
                        )}
                        {icdSecondary.map((code) => (
                            <span key={code} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
                                <span className="text-[10px] font-bold text-slate-500">รอง</span>
                                <span className="font-mono font-semibold">{code}</span>
                                {icdMap?.[code]?.description_th && (
                                    <span>— {icdMap[code].description_th}</span>
                                )}
                                {!icdMap?.[code]?.description_th && icdMap?.[code]?.description_en && (
                                    <span>— {icdMap[code].description_en}</span>
                                )}
                            </span>
                        ))}
                    </div>
                </CompactBox>
            )}

            {/* Drug Orders */}
            {drugOrders.length > 0 && (
                <CompactBox icon={Pill} title={`รายการยา (${drugOrders.length})`}
                    right={<span className="text-xs font-semibold text-slate-600">รวม {totalRx.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</span>}>
                    <div className="space-y-1">
                        {drugOrders.map((d) => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const item = Array.isArray((d as any).inventory) ? (d as any).inventory[0] : (d as any).inventory;
                            return (
                                <div key={d.id} className="flex items-start justify-between gap-3 text-xs py-1.5 border-b border-slate-100 last:border-0">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-slate-800">
                                            {item?.item_name}
                                            {item?.strength && <span className="text-slate-500 ml-1 font-normal">{item.strength}</span>}
                                        </div>
                                        {d.sig_text && <div className="text-slate-500 text-[11px] mt-0.5">{d.sig_text}</div>}
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-bold text-slate-700">{d.qty} {d.unit}</div>
                                        <div className="text-[10px] text-slate-400">{Number(d.total_cost || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CompactBox>
            )}

            {/* Cert + Refer + Appt — 3 column row if any */}
            {(certificates.length > 0 || referrals.length > 0 || followUps.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {certificates.length > 0 && (
                        <CompactBox icon={FileText} title={`ใบรับรอง (${certificates.length})`}>
                            <div className="space-y-1 text-xs">
                                {certificates.map(c => (
                                    <div key={c.id} className="text-slate-700">
                                        <span className="font-semibold">
                                            {c.cert_type === "sick_leave" ? "ลาป่วย" : c.cert_type === "fit_for_work" ? "ใบรับรองปกติ" : c.cert_type}
                                        </span>
                                        {c.rest_days && <span className="ml-1 text-emerald-700 font-semibold">{c.rest_days} วัน</span>}
                                    </div>
                                ))}
                            </div>
                        </CompactBox>
                    )}
                    {referrals.length > 0 && (
                        <CompactBox icon={ArrowRightCircle} title={`ส่งต่อ (${referrals.length})`}>
                            <div className="space-y-1 text-xs">
                                {referrals.map(r => (
                                    <div key={r.id} className="text-slate-700">
                                        <div className="font-semibold truncate">{r.destination_hospital || "—"}</div>
                                        {r.referral_reason && <div className="text-slate-500 text-[11px] truncate">{r.referral_reason}</div>}
                                    </div>
                                ))}
                            </div>
                        </CompactBox>
                    )}
                    {followUps.length > 0 && (
                        <CompactBox icon={CalendarCheck} title={`นัดหมาย (${followUps.length})`}>
                            <div className="space-y-1 text-xs">
                                {followUps.map(a => (
                                    <div key={a.id} className="flex items-center gap-1.5 text-slate-700">
                                        <Calendar className="h-3 w-3 text-blue-500" />
                                        <span className="font-semibold">
                                            {new Date(a.appt_date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                                        </span>
                                        {a.appt_start && <span className="font-mono text-[10px] text-slate-500">{a.appt_start.slice(0, 5)}</span>}
                                    </div>
                                ))}
                            </div>
                        </CompactBox>
                    )}
                </div>
            )}

            {/* Attachments */}
            {attachments && attachments.length > 0 && (
                <CompactBox icon={Paperclip} title={`ไฟล์แนบ (${attachments.length})`}>
                    <div className="space-y-1">
                        {attachments.map(att => {
                            const isImage = att.mime_type?.startsWith("image/");
                            const Icon = isImage ? ImageIcon : FileText;
                            return (
                                <div key={att.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-100 last:border-0">
                                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isImage ? "text-cyan-600" : "text-red-600"}`} />
                                    <span className="font-semibold text-slate-700 truncate flex-1">{att.file_name}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                                        {attachCategoryLabel[att.category] || att.category}
                                    </span>
                                    <button onClick={() => viewFile(att.file_path)}
                                        className="p-1 rounded hover:bg-blue-100 text-blue-600 shrink-0" title="เปิด">
                                        <Eye className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </CompactBox>
            )}

            {/* Empty state */}
            {drugOrders.length === 0 && certificates.length === 0 && referrals.length === 0 &&
                followUps.length === 0 && (!attachments || attachments.length === 0) &&
                !visit.icd10_primary && !visit.soap_s && !visit.soap_a && !visit.chief_complaint && (
                    <div className="text-center text-xs text-slate-400 italic py-4">
                        ไม่มีรายการบันทึกอื่นๆ ใน visit นี้
                    </div>
                )}
        </div>
    );
}

/* ─── Helpers ─── */
function CompactBox({
    icon: Icon, title, children, right,
}: {
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
    right?: React.ReactNode;
}) {
    return (
        <div className="rounded-xl bg-white border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/60 border-b border-slate-200/40">
                <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Icon className="h-3 w-3" /> {title}
                </div>
                {right}
            </div>
            <div className="px-3 py-2">{children}</div>
        </div>
    );
}

function MiniVital({ label, value }: { label: string; value: string }) {
    return (
        <div className="text-center px-1.5 py-1 rounded-md bg-slate-50/80 border border-slate-200/40">
            <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
            <div className="text-xs font-bold text-slate-800">{value}</div>
        </div>
    );
}

function SoapRow({ label, text }: { label: string; text: string }) {
    return (
        <div className="flex gap-2">
            <span className="font-bold text-slate-500 shrink-0 w-4">{label}</span>
            <span className="text-slate-700 whitespace-pre-wrap">{text}</span>
        </div>
    );
}
