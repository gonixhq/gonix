"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pill, ArrowRight, Clock, Receipt, BriefcaseMedical } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

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

export default function PharmacyClient({ visits, today }: { visits: Visit[]; today: string }) {
    const { language } = useLanguage();

    const waitingMeds = visits.filter(v => v.status === "waiting_medicine");
    const paymentPending = visits.filter(v => v.status === "waiting_payment");

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                        <Pill className="h-4 w-4" />
                        {language === "en" ? "Dispensing + Payment Queue" : "จัดยา + ชำระเงิน"}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>{language === "en" ? "Total" : "ทั้งหมด"} <span className="font-bold text-slate-700 tabular-nums">{visits.length}</span> {language === "en" ? "patients" : "ราย"}</span>
                </p>
            </div>

            {/* Stats — 2 cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`rounded-2xl border backdrop-blur-md px-4 py-3 flex items-center justify-between gap-2 ${
                    waitingMeds.length > 0
                        ? "bg-gradient-to-br from-amber-50 to-orange-50/60 border-amber-200 shadow-sm shadow-amber-100"
                        : "bg-white/50 border-slate-200/60"
                }`}>
                    <div className="flex items-center gap-2.5">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${waitingMeds.length > 0 ? "bg-amber-100" : "bg-slate-100/60"}`}>
                            <Pill className={`h-4 w-4 ${waitingMeds.length > 0 ? "text-amber-600" : "text-slate-400"}`} strokeWidth={2.5} />
                        </div>
                        <span className={`text-sm font-bold ${waitingMeds.length > 0 ? "text-amber-800" : "text-slate-500"}`}>
                            {language === "en" ? "Waiting Dispensing" : "รอจัดยา"}
                        </span>
                    </div>
                    <span className={`text-2xl font-black tabular-nums ${waitingMeds.length > 0 ? "text-amber-700" : "text-slate-300"}`}>{waitingMeds.length}</span>
                </div>

                <div className={`rounded-2xl border backdrop-blur-md px-4 py-3 flex items-center justify-between gap-2 ${
                    paymentPending.length > 0
                        ? "bg-gradient-to-br from-rose-50 to-pink-50/60 border-rose-200 shadow-sm shadow-rose-100"
                        : "bg-white/50 border-slate-200/60"
                }`}>
                    <div className="flex items-center gap-2.5">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${paymentPending.length > 0 ? "bg-rose-100" : "bg-slate-100/60"}`}>
                            <Receipt className={`h-4 w-4 ${paymentPending.length > 0 ? "text-rose-600" : "text-slate-400"}`} strokeWidth={2.5} />
                        </div>
                        <span className={`text-sm font-bold ${paymentPending.length > 0 ? "text-rose-800" : "text-slate-500"}`}>
                            {language === "en" ? "Waiting Payment" : "รอชำระเงิน"}
                        </span>
                    </div>
                    <span className={`text-2xl font-black tabular-nums ${paymentPending.length > 0 ? "text-rose-700" : "text-slate-300"}`}>{paymentPending.length}</span>
                </div>
            </div>

            {/* Queue list */}
            {visits.length === 0 ? (
                <div className="rounded-3xl bg-gradient-to-br from-white/70 via-white/60 to-blue-50/40 backdrop-blur-xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-12 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-blue-100/60 flex items-center justify-center mx-auto mb-3">
                        <BriefcaseMedical className="h-8 w-8 text-blue-600" />
                    </div>
                    <p className="text-base font-bold text-slate-700">
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
                                className="gonix-card-premium block p-4 hover:border-blue-300 hover:shadow-md transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    {/* Queue badge */}
                                    <div className={`flex flex-col items-center justify-center h-14 w-14 rounded-xl shrink-0 text-white shadow-md ring-1 ring-white/30 ${
                                        isWaitingMeds
                                            ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/20"
                                            : "bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/20"
                                    }`}>
                                        <div className="text-[9px] uppercase tracking-wider font-bold opacity-80">คิว</div>
                                        <div className="text-base font-black font-mono leading-none">{queueNumber || "—"}</div>
                                    </div>

                                    {/* Patient info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-base font-bold text-slate-800 truncate group-hover:text-blue-700 transition-colors">
                                                {p?.prefix}{p?.first_name} {p?.last_name}
                                            </span>
                                            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                                {v.hn}
                                            </span>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                                isWaitingMeds ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                                            }`}>
                                                {isWaitingMeds
                                                    ? (language === "en" ? "Dispensing" : "รอจัดยา")
                                                    : (language === "en" ? "Payment" : "รอชำระเงิน")}
                                            </span>
                                            {isCarryOver && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-[10px]">
                                                    ⌚ ค้างจากวันก่อน
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
                                            <div className="text-xs text-slate-600 mt-1 truncate">
                                                <span className="text-slate-400">CC:</span> {v.chief_complaint}
                                            </div>
                                        )}
                                    </div>

                                    {/* CTA */}
                                    <Button
                                        size="sm"
                                        className={`rounded-xl gap-1 text-xs font-bold shadow-sm ${
                                            isWaitingMeds
                                                ? "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20"
                                                : "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20"
                                        }`}
                                    >
                                        {isWaitingMeds
                                            ? (language === "en" ? "Dispense" : "จัดยา")
                                            : (language === "en" ? "Collect" : "รับเงิน")}
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
