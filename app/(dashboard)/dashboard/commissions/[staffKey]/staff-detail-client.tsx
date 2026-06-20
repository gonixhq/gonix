"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    ChevronLeft, ChevronRight, Printer, Calendar, FileText,
    CheckCircle, Wallet, Stethoscope, Heart, User,
} from "lucide-react";
import type { CommissionEntry } from "@/lib/actions/commissions";

const ROLE_LABEL: Record<string, string> = {
    doctor: "แพทย์",
    nurse: "พยาบาล",
    assistant: "ผู้ช่วย",
    sales: "เซลล์",
    other: "อื่นๆ",
};

const ROLE_COLOR: Record<string, string> = {
    doctor: "bg-cyan-100 text-cyan-700 border-cyan-200",
    nurse: "bg-rose-100 text-rose-700 border-rose-200",
    assistant: "bg-amber-100 text-amber-700 border-amber-200",
    sales: "bg-emerald-100 text-emerald-700 border-emerald-200",
    other: "bg-slate-100 text-slate-700 border-slate-200",
};

const ROLE_ICON: Record<string, React.ElementType> = {
    doctor: Stethoscope,
    nurse: Heart,
    assistant: User,
    sales: User,
    other: User,
};

function formatMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString("th-TH", { year: "numeric", month: "long" });
}

function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface Payout {
    amount: number;
    paid_at: string;
    payment_method: string;
    note: string | null;
}

export default function StaffDetailClient({
    staffId, role, month, staffName, entries, total, payout,
}: {
    staffId: string;
    role: string;
    month: string;
    staffName: string;
    entries: CommissionEntry[];
    total: number;
    payout: Payout | null;
}) {
    const Icon = ROLE_ICON[role] || User;
    const isPaid = !!payout;

    // Group by date
    const byDate: Record<string, CommissionEntry[]> = {};
    entries.forEach(e => {
        if (!byDate[e.invoice_date]) byDate[e.invoice_date] = [];
        byDate[e.invoice_date].push(e);
    });

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in pb-12">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <Link href={`/dashboard/commissions?month=${month}`} className="text-sm text-slate-500 hover:text-blue-700 inline-flex items-center gap-1.5">
                    <ChevronLeft className="h-4 w-4" /> กลับรายชื่อพนักงาน
                </Link>

                <div className="flex items-center gap-1.5">
                    <Link href={`/dashboard/commissions/${staffId}-${role}?month=${shiftMonth(month, -1)}`}>
                        <Button variant="outline" size="sm" className="rounded-lg h-9 w-9 p-0">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="px-4 h-9 rounded-lg border border-slate-300 bg-white flex items-center gap-2 font-bold text-sm text-slate-700">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        {formatMonth(month)}
                    </div>
                    <Link href={`/dashboard/commissions/${staffId}-${role}?month=${shiftMonth(month, 1)}`}>
                        <Button variant="outline" size="sm" className="rounded-lg h-9 w-9 p-0">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </Link>
                    <Link href={`/print/commissions/${month}/${staffId}-${role}`} target="_blank">
                        <Button size="sm" className="rounded-lg h-9 gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white">
                            <Printer className="h-4 w-4" /> พิมพ์ PDF
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Header card */}
            <div className="gonix-card-premium p-5 flex items-start gap-4">
                <div className={`h-14 w-14 rounded-2xl border-2 flex items-center justify-center ${ROLE_COLOR[role] || ROLE_COLOR.other}`}>
                    <Icon className="h-7 w-7" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h1 className="text-xl font-bold text-slate-800">{staffName}</h1>
                        <Badge className={`border-0 text-[10px] font-bold uppercase ${ROLE_COLOR[role] || ROLE_COLOR.other}`}>
                            {ROLE_LABEL[role] || role}
                        </Badge>
                    </div>
                    <div className="text-sm text-slate-500">{formatMonth(month)} · {entries.length} รายการ</div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">ยอด Commission</div>
                    <div className="text-3xl font-black text-blue-700 tabular-nums">
                        ฿{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    {isPaid && (
                        <Badge className="border-0 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase mt-1">
                            <CheckCircle className="h-3 w-3 mr-1" /> จ่ายแล้ว ฿{Number(payout.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </Badge>
                    )}
                </div>
            </div>

            {/* Payout info */}
            {payout && (
                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-4">
                    <h3 className="font-bold text-emerald-900 mb-2 flex items-center gap-2">
                        <Wallet className="h-4 w-4" /> บันทึกการจ่าย
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                            <div className="text-[10px] uppercase font-bold text-emerald-700">ยอดจ่าย</div>
                            <div className="font-bold tabular-nums">฿{Number(payout.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-emerald-700">วันที่จ่าย</div>
                            <div className="font-bold">{new Date(payout.paid_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-emerald-700">วิธีจ่าย</div>
                            <div className="font-bold">{payout.payment_method === "cash" ? "เงินสด" : payout.payment_method === "transfer" ? "โอน" : "รวมในเงินเดือน"}</div>
                        </div>
                        {payout.note && (
                            <div className="col-span-2 md:col-span-4">
                                <div className="text-[10px] uppercase font-bold text-emerald-700">หมายเหตุ</div>
                                <div className="text-slate-700">{payout.note}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Entries grouped by date */}
            {entries.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center">
                    <FileText className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-slate-700">ไม่มีรายการในเดือนนี้</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {Object.entries(byDate).map(([date, dateEntries]) => {
                        const dailyTotal = dateEntries.reduce((s, e) => s + Number(e.commission_amount || 0), 0);
                        return (
                            <div key={date} className="gonix-card-premium overflow-hidden">
                                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-3.5 w-3.5 text-slate-500" />
                                        <span className="font-bold text-slate-800">
                                            {new Date(date).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                                        </span>
                                        <span className="text-xs text-slate-500">({dateEntries.length} รายการ)</span>
                                    </div>
                                    <span className="font-bold text-blue-700 tabular-nums">
                                        ฿{dailyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/40">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            <th className="text-left px-4 py-2">เลขใบเสร็จ</th>
                                            <th className="text-left px-4 py-2">รายการ</th>
                                            <th className="text-center px-4 py-2">จำนวน</th>
                                            <th className="text-right px-4 py-2">DF/หน่วย</th>
                                            <th className="text-right px-4 py-2">รวม</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dateEntries.map((e, i) => (
                                            <tr key={i} className="border-t border-slate-100">
                                                <td className="px-4 py-2">
                                                    {e.inv_id ? (
                                                        <Link href={`/dashboard/finance/${e.inv_id}`} className="font-mono text-[11px] text-cyan-600 hover:text-cyan-700 underline">
                                                            {e.inv_id}
                                                        </Link>
                                                    ) : (
                                                        <span className="font-mono text-[11px] text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2 text-slate-700">{e.item_name}</td>
                                                <td className="px-4 py-2 text-center tabular-nums">{e.qty}</td>
                                                <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                                                    {role === "sales" ? `${Number(e.df_rate).toFixed(1)}%` : `฿${Number(e.df_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                                </td>
                                                <td className="px-4 py-2 text-right font-bold tabular-nums text-blue-700">
                                                    ฿{Number(e.commission_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
