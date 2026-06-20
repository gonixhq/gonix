"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Banknote, Plus, TrendingUp, Clock, CheckCircle2, Receipt, CreditCard,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Patient {
    prefix?: string | null;
    first_name?: string | null;
    last_name?: string | null;
}

interface Invoice {
    id: string;
    vn: string;
    hn: string;
    invoice_date: string;
    subtotal?: number | null;
    discount_amount?: number | null;
    total_amount: number;
    paid_amount?: number | null;
    balance_due?: number | null;
    status: string;
    patients: Patient | Patient[];
    is_anon?: boolean;
    route?: string;
}

export default function FinanceClient({
    invoices,
    todayRevenue,
    pendingAmount,
    todayInvoiceCount,
}: {
    invoices: Invoice[];
    todayRevenue: number;
    pendingAmount: number;
    todayInvoiceCount: number;
}) {
    const { language } = useLanguage();
    const [filter, setFilter] = useState<"all" | "outstanding" | "paid" | "voided">("all");

    const outstandingCount = useMemo(
        () => invoices.filter(i => i.status === "issued" || i.status === "partial").length,
        [invoices]
    );
    const filteredInvoices = useMemo(() => {
        if (filter === "all") return invoices;
        if (filter === "outstanding") return invoices.filter(i => i.status === "issued" || i.status === "partial");
        if (filter === "paid") return invoices.filter(i => i.status === "paid");
        if (filter === "voided") return invoices.filter(i => i.status === "voided" || i.status === "refunded");
        return invoices;
    }, [invoices, filter]);

    const statusLabel: Record<string, string> = {
        draft: language === "en" ? "Draft" : "ร่าง",
        issued: language === "en" ? "Issued" : "รอชำระ",
        partial: language === "en" ? "Partial" : "ชำระบางส่วน",
        paid: language === "en" ? "Paid" : "ชำระแล้ว",
        voided: language === "en" ? "Voided" : "ยกเลิก",
        refunded: language === "en" ? "Refunded" : "คืนเงิน",
    };

    const statusColor: Record<string, string> = {
        draft: "bg-slate-100 text-slate-600 border-slate-200",
        issued: "bg-amber-100 text-amber-700 border-amber-200",
        partial: "bg-cyan-100 text-cyan-700 border-cyan-200",
        paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
        voided: "bg-slate-100 text-slate-500 border-slate-200",
        refunded: "bg-rose-100 text-rose-700 border-rose-200",
    };

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in pb-10">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                        <Banknote className="h-4 w-4" />
                        {language === "en" ? "Receipts & Payments" : "ใบเสร็จรับเงิน & การชำระเงิน"}
                    </span>
                </p>
                <Link href="/dashboard/finance/new">
                    <Button className="rounded-xl gap-1.5 h-9 bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20">
                        <Plus className="h-4 w-4" />
                        {language === "en" ? "Create Receipt" : "สร้างใบเสร็จ"}
                    </Button>
                </Link>
            </div>

            {/* Stats — 3 cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Today Revenue */}
                <div className="gonix-card-premium p-5 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br from-[#15FF83]/25 to-[#10B981]/5 blur-2xl pointer-events-none" />
                    <div className="relative">
                        <div className="h-11 w-11 rounded-2xl flex items-center justify-center mb-3 bg-[#10B981]/10">
                            <TrendingUp className="h-5 w-5 text-[#10B981]" strokeWidth={2.5} />
                        </div>
                        <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight tabular-nums">
                            <span className="text-lg mr-0.5 text-slate-400">฿</span>
                            {todayRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </h3>
                        <p className="text-sm font-semibold text-slate-600 mt-1">
                            {language === "en" ? "Today's Revenue" : "รายรับวันนี้"}
                        </p>
                    </div>
                </div>

                {/* Pending */}
                <div className="gonix-card-premium p-5 relative overflow-hidden">
                    <div className={`absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br blur-2xl pointer-events-none ${pendingAmount > 0 ? "from-amber-300/30 to-orange-200/5" : "from-slate-200/30 to-slate-100/5"}`} />
                    <div className="relative">
                        <div className={`h-11 w-11 rounded-2xl flex items-center justify-center mb-3 ${pendingAmount > 0 ? "bg-amber-100" : "bg-slate-100"}`}>
                            <Clock className={`h-5 w-5 ${pendingAmount > 0 ? "text-amber-600" : "text-slate-400"}`} strokeWidth={2.5} />
                        </div>
                        <h3 className={`text-3xl font-extrabold tracking-tight tabular-nums ${pendingAmount > 0 ? "text-amber-700" : "text-slate-400"}`}>
                            <span className="text-lg mr-0.5 opacity-60">฿</span>
                            {pendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </h3>
                        <p className="text-sm font-semibold text-slate-600 mt-1">
                            {language === "en" ? "Pending" : "รอชำระ"}
                        </p>
                    </div>
                </div>

                {/* Today's invoices count */}
                <div className="gonix-card-premium p-5 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br from-[#00FFCC]/25 to-[#0EA5A0]/5 blur-2xl pointer-events-none" />
                    <div className="relative">
                        <div className="h-11 w-11 rounded-2xl flex items-center justify-center mb-3 bg-[#0EA5A0]/10">
                            <Receipt className="h-5 w-5 text-[#0EA5A0]" strokeWidth={2.5} />
                        </div>
                        <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight tabular-nums">{todayInvoiceCount}</h3>
                        <p className="text-sm font-semibold text-slate-600 mt-1">
                            {language === "en" ? "Today's Invoices" : "ใบเสร็จวันนี้"}
                        </p>
                    </div>
                </div>
            </div>

            {/* Invoice list */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2 flex-wrap">
                    <Banknote className="h-4 w-4 text-blue-700" />
                    <h2 className="text-sm font-bold text-slate-800">
                        {language === "en" ? "Recent Receipts" : "ใบเสร็จล่าสุด"}
                    </h2>
                    <span className="text-xs text-slate-400">({filteredInvoices.length}{filter !== "all" ? ` / ${invoices.length}` : ""})</span>
                    <div className="ml-auto flex items-center gap-1.5">
                        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>ทั้งหมด</FilterChip>
                        <FilterChip active={filter === "outstanding"} onClick={() => setFilter("outstanding")} color="amber">
                            ค้างชำระ ({outstandingCount})
                        </FilterChip>
                        <FilterChip active={filter === "paid"} onClick={() => setFilter("paid")} color="emerald">ชำระแล้ว</FilterChip>
                        <FilterChip active={filter === "voided"} onClick={() => setFilter("voided")}>ยกเลิก/คืน</FilterChip>
                    </div>
                </div>

                {filteredInvoices.length === 0 ? (
                    <div className="py-16 flex flex-col items-center justify-center">
                        <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                            <CreditCard className="h-7 w-7 text-slate-300" />
                        </div>
                        <p className="text-base font-bold text-slate-700">
                            {language === "en" ? "No Receipts Yet" : "ยังไม่มีใบเสร็จรับเงิน"}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            {language === "en" ? "Receipts are created automatically when payment is collected." : "ใบเสร็จจะสร้างอัตโนมัติเมื่อเคาท์เตอร์รับเงิน"}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60">
                                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    <th className="text-left px-4 py-2.5">เลขที่</th>
                                    <th className="text-left px-4 py-2.5">ผู้ป่วย</th>
                                    <th className="text-left px-4 py-2.5 hidden md:table-cell">VN</th>
                                    <th className="text-left px-4 py-2.5 hidden sm:table-cell">วันที่</th>
                                    <th className="text-right px-4 py-2.5">ยอดรวม</th>
                                    <th className="text-right px-4 py-2.5 hidden lg:table-cell">คงเหลือ</th>
                                    <th className="text-center px-4 py-2.5">สถานะ</th>
                                    <th className="px-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInvoices.map((inv) => {
                                    const pt = Array.isArray(inv.patients) ? inv.patients[0] : inv.patients;
                                    const balance = Number(inv.balance_due || 0);
                                    return (
                                        <tr
                                            key={inv.id}
                                            className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors group cursor-pointer"
                                            onClick={() => window.location.href = inv.route || `/dashboard/finance/${inv.id}`}
                                        >
                                            <td className="px-4 py-3">
                                                <span className={`font-mono text-[11px] font-bold px-2 py-1 rounded ${inv.is_anon ? "text-[#2B54F0] bg-[#2B54F0]/10" : "text-slate-600 bg-slate-100"}`}>
                                                    {inv.id}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                                                    {pt?.prefix}{pt?.first_name} {pt?.last_name}
                                                    {inv.is_anon && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">นิรนาม</span>}
                                                </div>
                                                <div className="text-[11px] font-mono text-slate-500">{inv.is_anon ? "คลินิกนิรนาม" : `HN: ${inv.hn}`}</div>
                                            </td>
                                            <td className="px-4 py-3 hidden md:table-cell">
                                                <span className="font-mono text-xs text-slate-600">{inv.vn}</span>
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell text-xs text-slate-600 tabular-nums">
                                                {new Date(inv.invoice_date).toLocaleDateString(language === "en" ? "en-US" : "th-TH", { day: "numeric", month: "short", year: "2-digit" })}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="font-bold text-slate-800 tabular-nums">
                                                    ฿{Number(inv.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right hidden lg:table-cell">
                                                <span className={`font-bold tabular-nums ${balance > 0 ? "text-amber-700" : "text-slate-400"}`}>
                                                    {balance > 0 ? `฿${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className={cn(
                                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border",
                                                    statusColor[inv.status] || statusColor.draft
                                                )}>
                                                    {inv.status === "paid" && <CheckCircle2 className="h-3 w-3" />}
                                                    {statusLabel[inv.status] || inv.status}
                                                </div>
                                            </td>
                                            <td className="px-2 py-3">
                                                <Link href={inv.route || `/dashboard/finance/${inv.id}`} onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="outline" size="sm" className="rounded-lg text-xs h-7 hover:border-blue-300 hover:text-blue-700">
                                                        {language === "en" ? "View" : "ดู"}
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function FilterChip({
    active, onClick, children, color = "slate",
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    color?: "slate" | "amber" | "emerald";
}) {
    const activeStyles = {
        slate: "bg-slate-700 text-white",
        amber: "bg-amber-600 text-white shadow-sm shadow-amber-500/30",
        emerald: "bg-emerald-600 text-white shadow-sm shadow-emerald-500/30",
    }[color];
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-2.5 h-7 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all ${
                active ? activeStyles : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
        >
            {children}
        </button>
    );
}
