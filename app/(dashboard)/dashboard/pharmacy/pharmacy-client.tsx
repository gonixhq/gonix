"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./pharmacy-workspace.module.css";
import { Pill, ArrowRight, Clock, Receipt, BriefcaseMedical, Trash2, Loader2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cancelPharmacyQueueVisit } from "@/lib/actions/visits";
import { toast } from "@/lib/toast";

interface Patient {
    prefix?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
}

interface Visit {
    vn: string;
    hn: string;
    visit_date?: string;
    visit_time?: string | null;
    status: string;
    chief_complaint?: string | null;
    created_at: string;
    patients: Patient | Patient[];
    queue_entries: { queue_number: string | null } | { queue_number: string | null }[];
}

function waitMinutes(createdAt: string): string {
    const min = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    if (min < 1) return "เพิ่งสร้าง";
    if (min < 60) return `${min} นาที`;
    const hr = Math.floor(min / 60);
    return `${hr} ชม. ${min % 60} นาที`;
}

export default function PharmacyClient({ visits, today, isOwner }: { visits: Visit[]; today: string; isOwner: boolean }) {
    const { language } = useLanguage();
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    function delQueue(vn: string, name: string) {
        if (!confirm(`ลบคิวค้างของ ${name || vn} ออกจากห้องยา?\n\nระบบจะตั้ง Visit นี้เป็น "ยกเลิก" และเอาออกจากคิว (ทำได้เฉพาะ owner)`)) return;
        startTransition(async () => {
            const res = await cancelPharmacyQueueVisit(vn);
            if (!res.success) { toast.error(res.error || "ลบไม่สำเร็จ"); return; }
            toast.success("ลบคิวแล้ว");
            router.refresh();
        });
    }

    const waitingMeds = visits.filter(v => v.status === "waiting_medicine");
    const paymentPending = visits.filter(v => v.status === "waiting_payment");

    return (
        <div className={`${styles.workspace} space-y-4 max-w-6xl mx-auto animate-fade-in p-3 sm:p-6 pb-24`}>
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl bg-white/80 border border-white/90 p-4 shadow-sm">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-blue-700">
                        <Pill className="h-4 w-4" />
                        {language === "en" ? "Dispensing + Payment Queue" : "จัดยา + ชำระเงิน"}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>{language === "en" ? "Total" : "ทั้งหมด"} <span className="font-semibold text-slate-700 tabular-nums">{visits.length}</span> {language === "en" ? "patients" : "ราย"}</span>
                </p>
            </div>

            {/* Stats — 2 cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`rounded-2xl border backdrop-blur-md px-4 py-3 flex items-center justify-between gap-2 ${
                    waitingMeds.length > 0
                        ? "bg-white/85 border-blue-200 shadow-sm"
                        : "bg-white/50 border-slate-200/60"
                }`}>
                    <div className="flex items-center gap-2.5">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${waitingMeds.length > 0 ? "bg-blue-50" : "bg-slate-100/60"}`}>
                            <Pill className={`h-4 w-4 ${waitingMeds.length > 0 ? "text-blue-600" : "text-slate-500"}`} strokeWidth={2.5} />
                        </div>
                        <span className={`text-sm font-semibold ${waitingMeds.length > 0 ? "text-blue-800" : "text-slate-500"}`}>
                            {language === "en" ? "Waiting Dispensing" : "รอจัดยา"}
                        </span>
                    </div>
                    <span className={`text-2xl font-semibold tabular-nums ${waitingMeds.length > 0 ? "text-blue-700" : "text-slate-300"}`}>{waitingMeds.length}</span>
                </div>

                <div className={`rounded-2xl border backdrop-blur-md px-4 py-3 flex items-center justify-between gap-2 ${
                    paymentPending.length > 0
                        ? "bg-white/85 border-blue-200 shadow-sm"
                        : "bg-white/50 border-slate-200/60"
                }`}>
                    <div className="flex items-center gap-2.5">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${paymentPending.length > 0 ? "bg-blue-50" : "bg-slate-100/60"}`}>
                            <Receipt className={`h-4 w-4 ${paymentPending.length > 0 ? "text-blue-600" : "text-slate-500"}`} strokeWidth={2.5} />
                        </div>
                        <span className={`text-sm font-semibold ${paymentPending.length > 0 ? "text-blue-800" : "text-slate-500"}`}>
                            {language === "en" ? "Waiting Payment" : "รอชำระเงิน"}
                        </span>
                    </div>
                    <span className={`text-2xl font-semibold tabular-nums ${paymentPending.length > 0 ? "text-blue-700" : "text-slate-300"}`}>{paymentPending.length}</span>
                </div>
            </div>

            {/* Queue list */}
            {visits.length === 0 ? (
                <div className="rounded-3xl bg-gradient-to-br from-white/70 via-white/60 to-blue-50/40 backdrop-blur-xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-blue-100/60 flex items-center justify-center mx-auto mb-3">
                        <BriefcaseMedical className="h-8 w-8 text-blue-600" />
                    </div>
                    <p className="text-base font-semibold text-slate-700">
                        {language === "en" ? "No active queues" : "ไม่มีคิวรอจัดยาหรือชำระเงิน"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        {language === "en" ? "Patients who finished seeing the doctor will appear here." : "ผู้ป่วยที่ตรวจเสร็จแล้วจะมาที่นี่"}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {visits.map((v) => {
                        const p = Array.isArray(v.patients) ? v.patients[0] : v.patients;
                        const queueEntry = Array.isArray(v.queue_entries) ? v.queue_entries[0] : v.queue_entries;
                        const queueNumber = queueEntry?.queue_number || null;
                        const isWaitingMeds = v.status === "waiting_medicine";
                        const isCarryOver = v.visit_date && v.visit_date !== today;

                        return (
                            <Link
                                key={v.vn}
                                href={`/dashboard/pharmacy/${v.vn}`}
                                className="rounded-2xl border border-white/90 bg-white/85 backdrop-blur-xl shadow-sm block p-4 sm:p-5 hover:border-blue-300 hover:shadow-md transition-all group"
                            >
                                <div className="flex flex-wrap items-center gap-4">
                                    {/* Queue badge */}
                                    <div className={`flex flex-col items-center justify-center h-14 w-14 rounded-xl shrink-0 text-white shadow-md ring-1 ring-white/30 ${
                                        isWaitingMeds
                                            ? "bg-slate-800"
                                            : "bg-slate-800"
                                    }`}>
                                        <div className="text-xs uppercase tracking-wider font-semibold opacity-80">คิว</div>
                                        <div className="text-base font-semibold font-mono leading-none">{queueNumber || "—"}</div>
                                    </div>

                                    {/* Patient info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-base font-semibold text-slate-800 break-words group-hover:text-blue-700 transition-colors">
                                                {p?.prefix}{p?.first_name} {p?.last_name}
                                            </span>
                                            <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                                {v.hn}
                                            </span>
                                            <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                                                isWaitingMeds ? "bg-blue-50 text-blue-700" : "bg-blue-50 text-blue-700"
                                            }`}>
                                                {isWaitingMeds
                                                    ? (language === "en" ? "Dispensing" : "รอจัดยา")
                                                    : (language === "en" ? "Payment" : "รอชำระเงิน")}
                                            </span>
                                            {isCarryOver && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold text-xs">
                                                    ค้างจากวันก่อน
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap mt-1">
                                            <span className="font-mono">{v.vn}</span>
                                            {v.visit_time && (
                                                <>
                                                    <span>·</span>
                                                    <span className="tabular-nums">{v.visit_time.slice(0, 5)} น.</span>
                                                </>
                                            )}
                                            <span>·</span>
                                            <span className="inline-flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                รอ {waitMinutes(v.created_at)}
                                            </span>
                                            {p?.phone && (
                                                <>
                                                    <span>·</span>
                                                    <span className="font-mono">{p.phone}</span>
                                                </>
                                            )}
                                        </div>
                                        {v.chief_complaint && (
                                            <div className="text-sm text-slate-700 mt-1 break-words">
                                                <span className="text-slate-500">CC:</span> {v.chief_complaint}
                                            </div>
                                        )}
                                    </div>

                                    {/* CTA */}
                                    <span
                                        className={`inline-flex items-center justify-center h-11 px-4 shrink-0 ml-auto rounded-xl gap-1 text-sm font-semibold shadow-sm ${
                                            isWaitingMeds
                                                ? "bg-blue-700 hover:bg-blue-800 text-white"
                                                : "bg-blue-700 hover:bg-blue-800 text-white"
                                        }`}
                                    >
                                        {isWaitingMeds
                                            ? (language === "en" ? "Dispense" : "จัดยา")
                                            : (language === "en" ? "Collect" : "รับเงิน")}
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </span>

                                    {isOwner && (
                                        <button type="button" disabled={pending} title="ลบคิวค้าง (owner)"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); delQueue(v.vn, `${p?.prefix || ""}${p?.first_name || ""} ${p?.last_name || ""}`.trim()); }}
                                            className="h-11 w-11 shrink-0 rounded-xl border border-rose-200 bg-white/80 text-rose-500 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center disabled:opacity-50">
                                            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                        </button>
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
