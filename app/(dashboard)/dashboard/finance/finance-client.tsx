"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Banknote, Plus, TrendingUp, Clock, CheckCircle2, Receipt, CreditCard,
    Trash2, X, Loader2, ArrowDownCircle, Package, Download, Search, Eye, ArrowLeftRight, AlertCircle,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { addPettyCash, deletePettyCash, type PettyCashItem } from "@/lib/actions/expenses";
import { getPatientLifetime } from "@/lib/actions/finance-insight";
import { SEGMENTS, SEGMENT_STYLE, type Segment } from "@/lib/segments";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Lifetime = any;

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

interface RangeInfo { preset: string; from: string; to: string; isToday: boolean }

export default function FinanceClient({
    invoices,
    range,
    rangeRevenue,
    rangeCount,
    channels,
    pendingAmount,
    pettyTotal,
    pettyItems,
    netCashFlow,
    deferredValue,
    deferredCount,
    segments,
    trend,
    forecast,
}: {
    invoices: Invoice[];
    range: RangeInfo;
    rangeRevenue: number;
    rangeCount: number;
    channels: { cash: number; transfer: number; credit: number };
    pendingAmount: number;
    pettyTotal: number;
    pettyItems: PettyCashItem[];
    netCashFlow: number;
    deferredValue: number;
    deferredCount: number;
    segments: { segment: string; amount: number }[];
    trend: { prevRevenue: number; growthPct: number | null };
    forecast: number | null;
}) {
    const { language } = useLanguage();
    const router = useRouter();
    const [filter, setFilter] = useState<"all" | "outstanding" | "paid" | "voided">("all");
    const [search, setSearch] = useState("");

    const rangeLabel = range.preset === "today" ? "วันนี้" : range.preset === "week" ? "สัปดาห์นี้" : range.preset === "month" ? "เดือนนี้" : `${range.from} – ${range.to}`;
    function setPreset(preset: string) {
        const url = preset === "today" ? "/dashboard/finance" : `/dashboard/finance?preset=${preset}`;
        router.push(url);
    }
    function setCustom(from: string, to: string) {
        if (from && to) router.push(`/dashboard/finance?preset=custom&from=${from}&to=${to}`);
    }

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
        for (const inv of filteredInvoices) {
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
        let list = invoices;
        if (filter === "outstanding") list = list.filter(i => i.status === "issued" || i.status === "partial");
        else if (filter === "paid") list = list.filter(i => i.status === "paid");
        else if (filter === "voided") list = list.filter(i => i.status === "voided" || i.status === "refunded");
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter(i => {
                const pt = Array.isArray(i.patients) ? i.patients[0] : i.patients;
                const name = `${pt?.prefix || ""}${pt?.first_name || ""} ${pt?.last_name || ""}`.toLowerCase();
                return name.includes(q) || String(i.id).toLowerCase().includes(q)
                    || String(i.vn || "").toLowerCase().includes(q) || String(i.hn || "").toLowerCase().includes(q);
            });
        }
        return list;
    }, [invoices, filter, search]);

    // สรุปตามผลที่กรอง (Report Summary)
    const summary = useMemo(() => {
        const valid = filteredInvoices.filter(i => i.status !== "voided" && i.status !== "refunded");
        const total = valid.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
        const count = filteredInvoices.length;
        return { total, count, avg: count ? total / count : 0 };
    }, [filteredInvoices]);

    // Anomaly: ใบยอดสูงผิดปกติ (>4 เท่าค่าเฉลี่ย, ขั้นต่ำ 5,000) + จำนวนยกเลิก/คืน
    const anomalyThreshold = useMemo(() => {
        const vals = invoices.filter(i => !i.is_anon && i.status !== "voided" && i.status !== "refunded").map(i => Number(i.total_amount || 0)).filter(v => v > 0);
        if (vals.length < 4) return Infinity;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        return Math.max(avg * 4, 5000);
    }, [invoices]);
    const voidCount = useMemo(() => invoices.filter(i => i.status === "voided" || i.status === "refunded").length, [invoices]);

    // Customer LTV — ถ้าค้นหาแล้วเหลือผู้ป่วยคนเดียว → ดึงยอดสะสมทั้งชีวิต
    const [ltv, setLtv] = useState<Lifetime | null>(null);
    useEffect(() => {
        if (!search.trim()) { setLtv(null); return; }
        const hns = [...new Set(filteredInvoices.filter(i => !i.is_anon && i.hn).map(i => i.hn))];
        if (hns.length !== 1) { setLtv(null); return; }
        let alive = true;
        getPatientLifetime(hns[0] as string).then(r => { if (alive) setLtv(r); });
        return () => { alive = false; };
    }, [search, filteredInvoices]);

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

            {/* Date range + search */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
                    {([["today", "วันนี้"], ["week", "สัปดาห์นี้"], ["month", "เดือนนี้"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setPreset(k)}
                            className={cn("px-3 h-8 rounded-lg text-xs font-bold transition-all", range.preset === k ? "bg-white shadow text-blue-700" : "text-slate-500 hover:text-slate-700")}>{l}</button>
                    ))}
                </div>
                <div className="inline-flex items-center gap-1">
                    <input type="date" value={range.from} max={range.to} onChange={(e) => setCustom(e.target.value, range.to)} className="h-8 rounded-lg border border-slate-300 px-2 text-xs font-mono focus:outline-none focus:border-blue-400" />
                    <span className="text-slate-400 text-xs">–</span>
                    <input type="date" value={range.to} onChange={(e) => setCustom(range.from, e.target.value)} className="h-8 rounded-lg border border-slate-300 px-2 text-xs font-mono focus:outline-none focus:border-blue-400" />
                </div>
                <div className="relative ml-auto">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา ชื่อ / INV / VN"
                        className="h-8 w-44 rounded-lg border border-slate-300 pl-8 pr-2 text-xs focus:outline-none focus:border-blue-400" />
                </div>
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
                            {rangeRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </h3>
                        <p className="text-sm font-semibold text-slate-600 mt-1">
                            {language === "en" ? "Revenue" : "รายรับ"} ({rangeLabel})
                        </p>
                        {trend.growthPct != null && (
                            <p className={`text-[11px] font-bold mt-0.5 inline-flex items-center gap-0.5 ${trend.growthPct >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                                {trend.growthPct >= 0 ? "▲" : "▼"} {Math.abs(trend.growthPct)}% <span className="text-slate-400 font-normal">เทียบช่วงก่อน (฿{trend.prevRevenue.toLocaleString()})</span>
                            </p>
                        )}
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
                        <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight tabular-nums">{rangeCount}</h3>
                        <p className="text-sm font-semibold text-slate-600 mt-1">
                            {language === "en" ? "Receipts" : "ใบเสร็จ"} ({rangeLabel})
                        </p>
                    </div>
                </div>

                {/* Deferred Revenue — มูลค่าคอร์สค้างใช้ (กดดูหน้าสรุปคอส) */}
                <Link href="/dashboard/packages" className="gonix-card-premium p-5 relative overflow-hidden block hover:ring-2 hover:ring-violet-300 transition-all">
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
                            {language === "en" ? `Deferred (${deferredCount} pkg)` : `คอร์สค้างใช้ (${deferredCount} คอส)`} <span className="text-[11px] text-violet-500 font-normal">ดูทั้งหมด →</span>
                        </p>
                    </div>
                </Link>
            </div>

            {/* Revenue by Segment (แยกแผนก) */}
            {(() => {
                const segMap: Record<string, number> = {};
                for (const s of segments) segMap[s.segment] = s.amount;
                const segTotal = SEGMENTS.reduce((a, s) => a + (segMap[s.key] || 0), 0);
                if (segTotal <= 0) return null;
                return (
                    <div className="gonix-card-premium p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="h-4 w-4 text-blue-700" />
                            <h2 className="text-sm font-bold text-slate-800">
                                {language === "en" ? "Revenue by Department" : "สัดส่วนรายได้ตามแผนก"} ({rangeLabel})
                            </h2>
                        </div>
                        {/* stacked bar */}
                        <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 mb-3">
                            {SEGMENTS.map((s) => {
                                const amt = segMap[s.key] || 0;
                                const pct = (amt / segTotal) * 100;
                                if (pct <= 0) return null;
                                return <div key={s.key} className={SEGMENT_STYLE[s.key as Segment].bar} style={{ width: `${pct}%` }} title={`${s.label} ${pct.toFixed(0)}%`} />;
                            })}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {SEGMENTS.map((s) => {
                                const amt = segMap[s.key] || 0;
                                const pct = segTotal > 0 ? (amt / segTotal) * 100 : 0;
                                const st = SEGMENT_STYLE[s.key as Segment];
                                return (
                                    <div key={s.key} className="text-center">
                                        <div className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-md", st.bg, st.text)}>
                                            <span className={cn("h-2 w-2 rounded-full", st.bar)} /> {s.label}
                                        </div>
                                        <div className="text-lg font-black text-slate-800 tabular-nums mt-1">฿{amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                        <div className="text-[11px] text-slate-400">{pct.toFixed(0)}%</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}

            {/* Report summary + channels */}
            <div className="grid md:grid-cols-2 gap-3">
                <div className="gonix-card-premium p-4">
                    <div className="text-xs font-bold text-slate-500 mb-2.5">สรุปยอด ({rangeLabel}{(search || filter !== "all") ? " · ตามที่กรอง" : ""})</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div><div className="text-lg font-black text-slate-800 tabular-nums">฿{summary.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div><div className="text-[11px] text-slate-400">รับจริงรวม</div></div>
                        <div><div className="text-lg font-black text-slate-800 tabular-nums">{summary.count}</div><div className="text-[11px] text-slate-400">จำนวนใบ</div></div>
                        <div><div className="text-lg font-black text-slate-800 tabular-nums">฿{summary.avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div><div className="text-[11px] text-slate-400">เฉลี่ย/ใบ</div></div>
                    </div>
                    {forecast != null && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-slate-500 inline-flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-violet-500" /> คาดการณ์สิ้นเดือน</span>
                            <span className="font-black tabular-nums text-violet-700">~฿{forecast.toLocaleString()}</span>
                        </div>
                    )}
                </div>
                <div className="gonix-card-premium p-4">
                    <div className="text-xs font-bold text-slate-500 mb-2.5 inline-flex items-center gap-1"><ArrowLeftRight className="h-3.5 w-3.5" /> รายรับตามช่องทาง ({rangeLabel})</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div><div className="text-base font-black text-emerald-700 tabular-nums">฿{channels.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div><div className="text-[11px] text-slate-400">เงินสด</div></div>
                        <div><div className="text-base font-black text-cyan-700 tabular-nums">฿{channels.transfer.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div><div className="text-[11px] text-slate-400">โอน</div></div>
                        <div><div className="text-base font-black text-violet-700 tabular-nums">฿{channels.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div><div className="text-[11px] text-slate-400">บัตร</div></div>
                    </div>
                </div>
            </div>

            {/* Petty Cash + Net Cash Flow */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2 flex-wrap">
                    <ArrowDownCircle className="h-4 w-4 text-rose-600" />
                    <h2 className="text-sm font-bold text-slate-800">
                        {language === "en" ? "Petty Cash" : "รายจ่ายย่อย"} ({rangeLabel})
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
                    <span className="text-slate-500">รายรับ ({rangeLabel}) <span className="font-bold text-emerald-700 tabular-nums">฿{rangeRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
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

            {/* Customer LTV (เมื่อค้นเหลือคนเดียว) */}
            {ltv && (
                <div className="gonix-card-premium p-4 border-l-4 border-l-blue-500">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">ลูกค้ารายนี้ · มูลค่าตลอดอายุ (LTV)</div>
                            <div className="text-lg font-black text-slate-800">{ltv.name} <span className="text-xs font-mono text-slate-400">{ltv.hn}</span></div>
                        </div>
                        <div className="flex items-center gap-5 flex-wrap">
                            <div className="text-center"><div className="text-xl font-black text-blue-700 tabular-nums">฿{Number(ltv.total).toLocaleString()}</div><div className="text-[11px] text-slate-400">ใช้จ่ายสะสม</div></div>
                            <div className="text-center"><div className="text-xl font-black text-slate-800 tabular-nums">{ltv.visitCount}</div><div className="text-[11px] text-slate-400">ครั้งที่มา</div></div>
                            {ltv.points != null && <div className="text-center"><div className="text-xl font-black text-amber-600 tabular-nums">{Number(ltv.points).toLocaleString()}</div><div className="text-[11px] text-slate-400">แต้ม{ltv.tierName ? ` · ${ltv.tierName}` : ""}</div></div>}
                            {ltv.firstDate && <div className="text-xs text-slate-400 self-end pb-1">ลูกค้าตั้งแต่ {new Date(ltv.firstDate + "T00:00:00").toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* Invoice list */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2 flex-wrap">
                    <Banknote className="h-4 w-4 text-blue-700" />
                    <h2 className="text-sm font-bold text-slate-800">
                        {language === "en" ? "Recent Receipts" : "ใบเสร็จล่าสุด"}
                    </h2>
                    <span className="text-xs text-slate-400">({filteredInvoices.length}{filter !== "all" ? ` / ${invoices.length}` : ""})</span>
                    {voidCount > 0 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-600 inline-flex items-center gap-1" title="ใบเสร็จที่ยกเลิก/คืนเงินในช่วงนี้ — ตรวจสอบความถี่">
                            <AlertCircle className="h-3 w-3" /> ยกเลิก/คืน {voidCount}
                        </span>
                    )}
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
                                                <span className="font-bold text-slate-800 tabular-nums inline-flex items-center gap-1 justify-end">
                                                    {!inv.is_anon && Number(inv.total_amount || 0) >= anomalyThreshold && (
                                                        <span title="ยอดสูงผิดปกติ — ตรวจสอบ" className="text-amber-500"><AlertCircle className="h-3.5 w-3.5" /></span>
                                                    )}
                                                    ฿{Number(inv.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right hidden lg:table-cell">
                                                <span className={`font-bold tabular-nums ${balance > 0 ? "text-amber-700" : "text-slate-300"}`}>
                                                    ฿{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                                                <div className="flex items-center gap-1 justify-end">
                                                    <Link href={inv.route || `/dashboard/finance/${inv.id}`} onClick={(e) => e.stopPropagation()} title="ดูรายละเอียด">
                                                        <Button variant="outline" size="sm" className="rounded-lg h-7 w-7 p-0 hover:border-blue-300 hover:text-blue-700">
                                                            <Eye className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </Link>
                                                    {!inv.is_anon && (
                                                        <Link href={`/print/invoice/${inv.id}`} target="_blank" onClick={(e) => e.stopPropagation()} title="พิมพ์ใบเสร็จ">
                                                            <Button variant="outline" size="sm" className="rounded-lg h-7 w-7 p-0 hover:border-emerald-300 hover:text-emerald-700">
                                                                <Receipt className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </Link>
                                                    )}
                                                </div>
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
