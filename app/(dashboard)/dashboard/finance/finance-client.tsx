"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Banknote, Plus, TrendingUp, Clock, CheckCircle2, Receipt, CreditCard,
    Trash2, X, Loader2, ArrowDownCircle, Package, Download,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { addPettyCash, deletePettyCash, type PettyCashItem } from "@/lib/actions/expenses";

const PETTY_CATEGORIES = ["ค่าส่งไปรษณีย์", "ค่าเดินทาง/น้ำมัน", "ค่าอุปกรณ์/ของใช้", "ค่าอาหาร/เครื่องดื่ม", "ค่าแม่บ้าน/ทำความสะอาด", "อื่นๆ"];

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
    pettyTotal,
    pettyItems,
    netCashFlow,
    deferredValue,
    deferredCount,
}: {
    invoices: Invoice[];
    todayRevenue: number;
    pendingAmount: number;
    todayInvoiceCount: number;
    pettyTotal: number;
    pettyItems: PettyCashItem[];
    netCashFlow: number;
    deferredValue: number;
    deferredCount: number;
}) {
    const { language } = useLanguage();
    const router = useRouter();
    const [filter, setFilter] = useState<"all" | "outstanding" | "paid" | "voided">("all");

    // ── Petty cash (รายจ่ายย่อย) ──
    const [showPetty, setShowPetty] = useState(false);
    const [pAmount, setPAmount] = useState("");
    const [pCategory, setPCategory] = useState(PETTY_CATEGORIES[0]);
    const [pDesc, setPDesc] = useState("");
    const [pErr, setPErr] = useState("");
    const [pending, startTransition] = useTransition();

    function submitPetty() {
        setPErr("");
        const amt = Number(pAmount);
        if (!amt || amt <= 0) { setPErr("กรอกจำนวนเงินให้ถูกต้อง"); return; }
        if (!pDesc.trim()) { setPErr("กรอกรายละเอียด"); return; }
        startTransition(async () => {
            const res = await addPettyCash({ amount: amt, category: pCategory, description: pDesc.trim() });
            if (!res.success) { setPErr(res.error || "บันทึกไม่สำเร็จ"); return; }
            setShowPetty(false); setPAmount(""); setPDesc(""); setPCategory(PETTY_CATEGORIES[0]);
            router.refresh();
        });
    }

    function removePetty(id: string) {
        if (!confirm("ลบรายการรายจ่ายย่อยนี้?")) return;
        startTransition(async () => {
            await deletePettyCash(id);
            router.refresh();
        });
    }

    // Export CSV (รายรับ + รายจ่ายย่อย) — เปิดใน Excel ได้
    function exportCSV() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cell = (v: any) => {
            const s = String(v ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines: string[] = [];
        lines.push("รายรับ (ใบเสร็จล่าสุด)");
        lines.push(["เลขที่", "วันที่", "ผู้ป่วย", "ประเภท", "ยอดรวม", "ชำระแล้ว", "คงเหลือ", "สถานะ"].map(cell).join(","));
        for (const inv of invoices) {
            const pt = Array.isArray(inv.patients) ? inv.patients[0] : inv.patients;
            const name = inv.is_anon ? "นิรนาม" : `${pt?.prefix || ""}${pt?.first_name || ""} ${pt?.last_name || ""}`.trim();
            lines.push([inv.id, inv.invoice_date, name, inv.is_anon ? "นิรนาม" : "ปกติ",
                Number(inv.total_amount || 0), Number(inv.paid_amount || 0), Number(inv.balance_due || 0),
                statusLabel[inv.status] || inv.status].map(cell).join(","));
        }
        lines.push("");
        lines.push("รายจ่ายย่อย (วันนี้)");
        lines.push(["หมวดหมู่", "รายละเอียด", "จำนวนเงิน", "ผู้บันทึก"].map(cell).join(","));
        for (const it of pettyItems) {
            lines.push([it.category, it.description, Number(it.amount || 0), it.recorded_by_name || ""].map(cell).join(","));
        }
        const csv = "﻿" + lines.join("\r\n");   // BOM ให้ Excel อ่านไทยถูก
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const d = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
        a.href = url; a.download = `การเงิน-${d}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

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

            {/* Stats — 4 cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

                {/* Deferred Revenue — มูลค่าคอร์สค้างใช้ */}
                <div className="gonix-card-premium p-5 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br from-violet-300/25 to-fuchsia-200/5 blur-2xl pointer-events-none" />
                    <div className="relative">
                        <div className="h-11 w-11 rounded-2xl flex items-center justify-center mb-3 bg-violet-100">
                            <Package className="h-5 w-5 text-violet-600" strokeWidth={2.5} />
                        </div>
                        <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight tabular-nums">
                            <span className="text-lg mr-0.5 text-slate-400">฿</span>
                            {deferredValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </h3>
                        <p className="text-sm font-semibold text-slate-600 mt-1">
                            {language === "en" ? `Deferred (${deferredCount} pkg)` : `คอร์สค้างใช้ (${deferredCount} คอส)`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Petty Cash + Net Cash Flow */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2 flex-wrap">
                    <ArrowDownCircle className="h-4 w-4 text-rose-600" />
                    <h2 className="text-sm font-bold text-slate-800">
                        {language === "en" ? "Petty Cash (Today)" : "รายจ่ายย่อยวันนี้"}
                    </h2>
                    <span className="text-xs text-slate-400">({pettyItems.length})</span>
                    <div className="ml-auto flex items-center gap-3">
                        {/* Net Cash Flow inline */}
                        <div className="text-right hidden sm:block">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {language === "en" ? "Net Cash Flow" : "กระแสเงินสดสุทธิ"}
                            </div>
                            <div className={cn("text-base font-black tabular-nums leading-none", netCashFlow >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                ฿{netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                        <Button onClick={() => setShowPetty(true)} size="sm"
                            className="rounded-xl gap-1.5 h-9 bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-500/20">
                            <Plus className="h-4 w-4" /> {language === "en" ? "Add Expense" : "บันทึกรายจ่ายย่อย"}
                        </Button>
                    </div>
                </div>

                {/* Net cash breakdown (mobile + summary line) */}
                <div className="px-5 py-2.5 bg-slate-50/60 border-b border-slate-200/40 flex items-center gap-4 text-xs flex-wrap">
                    <span className="text-slate-500">รายรับวันนี้ <span className="font-bold text-emerald-700 tabular-nums">฿{todayRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
                    <span className="text-slate-300">−</span>
                    <span className="text-slate-500">รายจ่ายย่อย <span className="font-bold text-rose-600 tabular-nums">฿{pettyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
                    <span className="text-slate-300">=</span>
                    <span className="text-slate-500">สุทธิ <span className={cn("font-black tabular-nums", netCashFlow >= 0 ? "text-emerald-700" : "text-rose-600")}>฿{netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
                </div>

                {pettyItems.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                        {language === "en" ? "No petty cash recorded today" : "ยังไม่มีรายจ่ายย่อยวันนี้"}
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {pettyItems.map((it) => (
                            <div key={it.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">{it.category}</span>
                                <span className="text-sm text-slate-700 truncate flex-1">{it.description}</span>
                                {it.recorded_by_name && <span className="text-[11px] text-slate-400 hidden md:block shrink-0">{it.recorded_by_name}</span>}
                                <span className="text-sm font-bold text-rose-600 tabular-nums shrink-0">−฿{it.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                <button onClick={() => removePetty(it.id)} disabled={pending}
                                    className="text-slate-300 hover:text-rose-600 transition-colors shrink-0 disabled:opacity-40">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
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
                        <Button onClick={exportCSV} variant="outline" size="sm" className="rounded-lg h-7 text-xs gap-1 border-slate-300 text-slate-600 hover:bg-slate-50">
                            <Download className="h-3.5 w-3.5" /> Export CSV
                        </Button>
                        <span className="w-px h-5 bg-slate-200 mx-0.5" />
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

            {/* Add petty cash modal */}
            {showPetty && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                                    <ArrowDownCircle className="h-5 w-5 text-rose-600" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900">บันทึกรายจ่ายย่อย</h3>
                            </div>
                            <button onClick={() => setShowPetty(false)} className="text-slate-400 hover:text-slate-700">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">จำนวนเงิน (บาท)</label>
                            <input value={pAmount} onChange={(e) => setPAmount(e.target.value.replace(/[^\d.]/g, ""))}
                                inputMode="decimal" placeholder="0.00" autoFocus
                                className="w-full h-12 rounded-xl border-2 border-slate-200 px-3 text-lg font-bold tabular-nums focus:border-rose-500 focus:outline-none" />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">หมวดหมู่</label>
                            <div className="flex flex-wrap gap-1.5">
                                {PETTY_CATEGORIES.map((c) => (
                                    <button key={c} type="button" onClick={() => setPCategory(c)}
                                        className={cn("px-2.5 h-8 rounded-lg text-xs font-bold transition-all",
                                            pCategory === c ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1 block">รายละเอียด</label>
                            <input value={pDesc} onChange={(e) => setPDesc(e.target.value)}
                                placeholder="เช่น ค่าส่งพัสดุ EMS"
                                className="w-full h-11 rounded-xl border-2 border-slate-200 px-3 text-sm focus:border-rose-500 focus:outline-none" />
                        </div>

                        {pErr && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{pErr}</p>}

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => setShowPetty(false)} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                            <Button onClick={submitPetty} disabled={pending}
                                className="rounded-xl gap-1.5 bg-rose-600 hover:bg-rose-700 text-white">
                                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} บันทึก
                            </Button>
                        </div>
                    </div>
                </div>
            )}
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
