"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Clock, ChevronRight, AlertTriangle, Droplet, Activity, X, Trash2, HeartPulse, Printer,
} from "lucide-react";
import { SERVICE_LABEL, type ServiceCategory } from "@/lib/visit-service-types";
import { cancelVisit } from "@/lib/actions/visits";

interface Patient {
    prefix?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    gender?: string | null;
    dob?: string | null;
    blood_group?: string | null;
    allergy_summary?: string | null;
    disease_summary?: string | null;
    phone?: string | null;
}

interface Visit {
    vn: string;
    hn: string;
    visit_time?: string | null;
    status: string;
    service_category: string;
    chief_complaint?: string | null;
    triage_level?: string | null;
    created_at: string;
    patients: Patient | Patient[];
}

const triageColor: Record<string, string> = {
    normal: "bg-slate-100 text-slate-600",
    urgent: "bg-amber-500 text-white",
    emergency: "bg-red-600 text-white animate-pulse",
};
const triageLabel: Record<string, string> = {
    normal: "ปกติ", urgent: "เร่งด่วน", emergency: "ฉุกเฉิน",
};

function calcAge(dob: string | null | undefined): string {
    if (!dob) return "—";
    const d = new Date(dob);
    const now = new Date();
    let y = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) y--;
    return `${y}`;
}

function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "เพิ่งสร้าง";
    if (min < 60) return `${min} นาที`;
    const hr = Math.floor(min / 60);
    return `${hr} ชม. ${min % 60} นาที`;
}

export default function ScreeningRow({ visit, queueNumber }: { visit: Visit; queueNumber: number }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);

    const pt = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients;
    const cat = visit.service_category as ServiceCategory;
    const triage = visit.triage_level || "normal";

    function handleCancel() {
        setError(null);
        startTransition(async () => {
            const res = await cancelVisit(visit.vn, reason.trim() || undefined);
            if (!res.success) {
                setError(res.error || "ยกเลิกไม่สำเร็จ");
                return;
            }
            setShowCancelConfirm(false);
            router.refresh();
        });
    }

    return (
        <>
            <div className="gonix-card-premium p-4 hover:border-blue-300 hover:shadow-md transition-all group">
                <div className="flex items-center gap-4">
                    {/* Queue number */}
                    <Link href={`/dashboard/screening/${visit.vn}`} className="flex flex-col items-center justify-center h-14 w-14 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-md shadow-blue-500/20 ring-1 ring-white/30 shrink-0 text-white">
                        <div className="text-[9px] uppercase tracking-wider font-bold opacity-80">คิว</div>
                        <div className="text-xl font-black leading-none">{queueNumber}</div>
                    </Link>

                    {/* Patient info — clickable */}
                    <Link href={`/dashboard/screening/${visit.vn}`} className="flex-1 min-w-0 block">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-slate-800 group-hover:text-blue-900 transition-colors">
                                {pt?.prefix} {pt?.first_name} {pt?.last_name}
                            </span>
                            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                {visit.hn}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${triageColor[triage]}`}>
                                {triageLabel[triage]}
                            </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span>{pt?.gender === "M" ? "ชาย" : pt?.gender === "F" ? "หญิง" : "—"}</span>
                            <span>·</span>
                            <span>{calcAge(pt?.dob)} ปี</span>
                            {pt?.blood_group && (
                                <>
                                    <span>·</span>
                                    <span className="inline-flex items-center gap-0.5 text-red-700 font-semibold">
                                        <Droplet className="h-2.5 w-2.5" /> {pt.blood_group}
                                    </span>
                                </>
                            )}
                            {pt?.allergy_summary && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold">
                                    <AlertTriangle className="h-2.5 w-2.5" /> แพ้: {pt.allergy_summary}
                                </span>
                            )}
                            {pt?.disease_summary && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                    <HeartPulse className="h-2.5 w-2.5" /> โรคประจำตัว: {pt.disease_summary}
                                </span>
                            )}
                        </div>
                    </Link>

                    {/* Service + time */}
                    <div className="text-right shrink-0 hidden sm:block">
                        <div className="text-sm font-semibold text-slate-700">
                            {SERVICE_LABEL[cat] || cat}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center justify-end gap-1 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {visit.visit_time?.slice(0, 5) || "—"} · รอ {timeAgo(visit.created_at)}
                        </div>
                    </div>

                    {/* CTAs */}
                    <div className="shrink-0 flex items-center gap-1.5">
                        {visit.service_category === "med_cert" && (
                            <div className="inline-flex items-center h-9 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 overflow-hidden" title="พิมพ์ฟอร์มใบรับรอง (ให้หมอกรอก/เซ็นมือ)">
                                <Printer className="h-4 w-4 ml-2 mr-1" />
                                <Link href={`/print/med-cert/${visit.vn}?lang=th`} target="_blank" className="px-2 h-full flex items-center text-xs font-bold hover:bg-emerald-100">ไทย</Link>
                                <Link href={`/print/med-cert/${visit.vn}?lang=en`} target="_blank" className="px-2 h-full flex items-center text-xs font-bold hover:bg-emerald-100 border-l border-emerald-200">EN</Link>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowCancelConfirm(true)}
                            disabled={pending}
                            title="ยกเลิกคิว"
                            className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                        <Link
                            href={`/dashboard/screening/${visit.vn}`}
                            className="inline-flex items-center gap-1 h-9 px-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white text-xs font-bold transition-colors shadow-sm shadow-blue-500/20"
                        >
                            <Activity className="h-3.5 w-3.5" /> ซักประวัติ
                            <ChevronRight className="h-3 w-3" />
                        </Link>
                    </div>
                </div>

                {/* Brief note */}
                {visit.chief_complaint && (
                    <Link href={`/dashboard/screening/${visit.vn}`} className="block mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 truncate">
                        <span className="text-slate-400">บันทึก:</span> {visit.chief_complaint}
                    </Link>
                )}
            </div>

            {/* Cancel confirm modal */}
            {showCancelConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                                <AlertTriangle className="h-5 w-5 text-red-700" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-slate-900">ยกเลิกคิว?</h3>
                                <p className="text-sm text-slate-600 mt-0.5">
                                    <span className="font-semibold">{pt?.prefix}{pt?.first_name} {pt?.last_name}</span>
                                    <span className="text-slate-400 ml-1">({visit.vn})</span>
                                </p>
                            </div>
                            <button onClick={() => setShowCancelConfirm(false)} className="rounded-lg p-1 hover:bg-slate-100">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                เหตุผล (ไม่บังคับ)
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="เช่น คนไข้ไม่มา, ขอเลื่อนนัด, สร้างผิด..."
                                rows={2}
                                disabled={pending}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
                            />
                        </div>

                        {error && (
                            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                            </div>
                        )}

                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                            ⚠ ยกเลิกแล้วจะกู้คืนไม่ได้ — Visit จะถูกตั้ง status เป็น <strong>cancelled</strong>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setShowCancelConfirm(false)}
                                disabled={pending}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                                ไม่ใช่
                            </button>
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={pending}
                                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                                <Trash2 className="h-4 w-4" />
                                {pending ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
