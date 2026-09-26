"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Banknote, Plus, TrendingUp, CheckCircle2, Receipt, CreditCard,
    Trash2, X, Loader2, ArrowDownCircle, Download, Search, Eye, ArrowLeftRight, AlertCircle,
    FileSignature, Printer, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { shiftDate } from "@/lib/finance-range";

const MEDCERT_LABEL: Record<string, string> = {
    sick_leave: "ลาป่วย", fit_for_work: "พร้อมทำงาน", fitness: "ตรวจสุขภาพ",
    driving: "ใบขับขี่", government: "ราชการ", insurance: "ประกัน", other: "อื่นๆ",
};
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
    received_original?: number;
    refunded_amount?: number;
    pay_methods?: string[];   // cash / transfer / credit (จาก payment_logs)
}

interface RangeInfo { preset: string; from: string; to: string; isToday: boolean }

export default function FinanceClient({
    medCertsToPrint = [],
    invoices,
    range,
    rangeRevenue,
    rangeCount,
    depositAmount, regularRevenue, anonymousRevenue,
    channels,
    cardFeeTotal,
    pendingAmount,
    pettyTotal,
    pettyItems,
    netCashFlow,
    deferredValue,
    deferredCount,
    segments,
    trend,
    forecast,
    voidPattern = [],
}: {
    medCertsToPrint?: { vn: string; hn: string; patient_name: string; cert_type: string; approved_at: string | null }[];
    invoices: Invoice[];
    range: RangeInfo;
    rangeRevenue: number;
    rangeCount: number;
    depositAmount: number; regularRevenue: number; anonymousRevenue: number;
    channels: { cash: number; transfer: number; credit: number };
    cardFeeTotal?: number;
    pendingAmount: number;
    pettyTotal: number;
    pettyItems: PettyCashItem[];
    netCashFlow: number;
    deferredValue: number;
    deferredCount: number;
    segments: { segment: string; amount: number }[];
    trend: { prevRevenue: number; growthPct: number | null };
    forecast: number | null;
    voidPattern?: { name: string; voids: number; refunds: number; total: number; isOutlier: boolean }[];
}) {
    const { language } = useLanguage();
    const router = useRouter();
    const [filter, setFilter] = useState<"all" | "outstanding" | "paid" | "voided">("all");
    const [payFilter, setPayFilter] = useState<"all" | "cash" | "transfer" | "credit">("all");
    const [search, setSearch] = useState("");
    const [source, setSource] = useState<"all" | "normal" | "anon">("all");
    const [page, setPage] = useState(1);
    useEffect(() => setPage(1), [search, source, filter, payFilter, invoices]);

    const rangeLabel = range.preset === "today" ? "วันนี้" : range.preset === "week" ? "สัปดาห์นี้" : range.preset === "month" ? "เดือนนี้" : range.preset === "quarter" ? "ไตรมาสนี้" : `${range.from} – ${range.to}`;
    // ใช้ navigation แบบเต็ม (assign) — soft nav กับ searchParams เดิมมักไม่รีเฟรชข้อมูล
    const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
    const go = (url: string) => { window.location.assign(url); };
    function setPreset(preset: string) {
        go(preset === "today" ? "/dashboard/finance" : `/dashboard/finance?preset=${preset}`);
    }
    function setCustom(from: string, to: string) {
        if (from && to) go(`/dashboard/finance?preset=custom&from=${from}&to=${to}`);
    }
    function stepDay(delta: number) {
        const base = delta < 0 ? range.from : range.to;
        const day = shiftDate(base, delta);
        if (day > todayISO) return;
        go(`/dashboard/finance?preset=custom&from=${day}&to=${day}`);
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
            const raw = String(v ?? "");
            const s = /^[=+@\t\r]/.test(raw) || (raw.startsWith("-") && !/^-[0-9.]+$/.test(raw)) ? `'${raw}` : raw;
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines: string[] = [];
        lines.push("รายการใบเสร็จตามตัวกรอง (ยอดชำระสะสม ไม่ใช่ยอดรับเงินรายวัน)");
        lines.push(["เลขที่", "วันที่", "ผู้ป่วย", "ประเภท", "ยอดรวม", "รับเดิมสะสม", "คืนแล้วตามรายการ", "คงเหลือ", "สถานะ"].map(cell).join(","));
        for (const inv of filteredInvoices) {
            const pt = Array.isArray(inv.patients) ? inv.patients[0] : inv.patients;
            const name = inv.is_anon ? "นิรนาม" : `${pt?.prefix || ""}${pt?.first_name || ""} ${pt?.last_name || ""}`.trim();
            lines.push([inv.id, inv.invoice_date, name, inv.is_anon ? "นิรนาม" : "ปกติ",
                Number(inv.total_amount || 0), Number(inv.received_original ?? inv.paid_amount ?? 0), Number(inv.refunded_amount || 0), Number(inv.balance_due || 0),
                statusLabel[inv.status] || inv.status].map(cell).join(","));
        }
        lines.push("");
        lines.push(`รายจ่ายย่อย (${range.from} ถึง ${range.to})`);
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
        if (source !== "all") list = list.filter(i => source === "anon" ? i.is_anon : !i.is_anon);
        if (filter === "outstanding") list = list.filter(i => i.status === "issued" || i.status === "partial");
        else if (filter === "paid") list = list.filter(i => i.status === "paid");
        else if (filter === "voided") list = list.filter(i => i.status === "voided" || i.status === "refunded");
        if (payFilter !== "all") list = list.filter(i => (i.pay_methods || []).includes(payFilter));
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
    }, [invoices, filter, payFilter, search, source]);

    const pages = Math.max(1, Math.ceil(filteredInvoices.length / 25));
    const currentPage = Math.min(page, pages);
    const visibleInvoices = filteredInvoices.slice((currentPage - 1) * 25, currentPage * 25);

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
        <div className="space-y-5 max-w-7xl mx-auto p-4 sm:p-6 pb-10 rounded-3xl bg-white/35 border border-white/60">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <p className="text-sm font-medium text-slate-500 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                        <Banknote className="h-4 w-4" />
                        {language === "en" ? "Receipts & Payments" : "ใบเสร็จรับเงิน & การชำระเงิน"}
                    </span>
                </p>
            </div>

            {/* ── ใบรับรองแพทย์รอพิมพ์ (แจ้งเตือนเคาน์เตอร์ + พิมพ์) ── */}
            {medCertsToPrint.length > 0 && (
                <div className="gonix-card-premium p-3.5 border-amber-200">
                    <div className="flex items-center gap-2 mb-2">
                        <FileSignature className="h-4 w-4 text-amber-600" />
                        <h2 className="text-sm font-bold text-slate-800">ใบรับรองแพทย์รอพิมพ์</h2>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{medCertsToPrint.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {medCertsToPrint.map((c) => (
                            <div key={c.vn} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-1.5 text-sm">
                                <Printer className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                                <span className="font-semibold text-slate-700 truncate max-w-[140px]">{c.patient_name}</span>
                                <span className="text-[10px] text-slate-500">{MEDCERT_LABEL[c.cert_type] || c.cert_type}</span>
                                <span className="flex items-center gap-1">
                                    <a href={`/print/med-cert/${c.vn}?lang=th`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-white border border-amber-200 hover:bg-amber-100 text-amber-700">ไทย</a>
                                    <a href={`/print/med-cert/${c.vn}?lang=en`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-white border border-amber-200 hover:bg-amber-100 text-amber-700">EN</a>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Date range + search */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1">
                    <button onClick={() => stepDay(-1)} title="วันก่อนหน้า" aria-label="วันก่อนหน้า"
                        className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"><ChevronLeft className="h-4 w-4" /></button>
                    <button onClick={() => stepDay(1)} disabled={range.to >= todayISO} title="วันถัดไป" aria-label="วันถัดไป"
                        className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                </div>
                <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
                    {([["today", "วันนี้"], ["week", "สัปดาห์นี้"], ["month", "เดือนนี้"], ["quarter", "ไตรมาสนี้"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setPreset(k)}
                            className={cn("px-3 h-8 rounded-lg text-xs font-bold transition-all", range.preset === k ? "bg-white shadow text-blue-700" : "text-slate-500 hover:text-slate-700")}>{l}</button>
                    ))}
                </div>
                <div className="inline-flex items-center gap-1">
                    <input type="date" value={range.from} max={range.to} onChange={(e) => setCustom(e.target.value, range.to)} className="h-8 rounded-lg border border-slate-300 px-2 text-xs font-mono focus:outline-none focus:border-blue-400" />
                    <span className="text-slate-500 text-xs">–</span>
                    <input type="date" value={range.to} onChange={(e) => setCustom(range.from, e.target.value)} className="h-8 rounded-lg border border-slate-300 px-2 text-xs font-mono focus:outline-none focus:border-blue-400" />
                </div>
                <div className="relative ml-auto">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="ค้นหาใบเสร็จ" placeholder="ค้นหาชื่อ / เลขบิล / VN / HN"
                        className="h-10 w-64 rounded-lg border border-slate-300 pl-8 pr-2 text-xs focus:outline-none focus:border-blue-400" />
                </div>
            </div>

            <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {[
                    { label: `รับเงินจริงสุทธิ (${rangeLabel})`, value: rangeRevenue, detail: `ทั่วไป ฿${regularRevenue.toLocaleString()} · นิรนาม ฿${anonymousRevenue.toLocaleString()}` },
                    { label: `มัดจำที่บันทึก (${rangeLabel})`, value: depositAmount, detail: "รวมอยู่ในยอดรับเงินจริงแล้ว" },
                    { label: "ค้างชำระทั้งหมด", value: pendingAmount, detail: "รวมบิลก่อนช่วงที่เลือกและเคสนิรนาม" },
                    { label: `หลังหักรายจ่ายย่อย (${rangeLabel})`, value: netCashFlow, detail: `รายจ่ายย่อย ฿${pettyTotal.toLocaleString()}` },
                ].map(card => <div key={card.label} className="gonix-card-premium p-4 sm:p-5">
                    <p className="text-sm font-medium text-slate-600">{card.label}</p>
                    <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-2 break-words">฿{card.value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-xs text-slate-600 mt-2">{card.detail}</p>
                    {card.value === rangeRevenue && card.label.startsWith("รับเงินจริง") && trend.growthPct != null && <p className="text-xs text-slate-600 mt-1">เทียบช่วงก่อน {trend.growthPct > 0 ? "+" : ""}{trend.growthPct}%</p>}
                </div>)}
            </section>
            <p className="text-sm text-slate-600">ยอดรับเงินจริงตามวันรับเงิน รวมรับชำระบิลเก่าและหักเงินคืน · รายการด้านล่าง: บิลทั่วไปตามวันที่ออกบิล / นิรนามตามวันที่รับเงิน</p>

            {/* Invoice list */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2 flex-wrap">
                    <Banknote className="h-4 w-4 text-blue-700" />
                    <h2 className="text-sm font-bold text-slate-800">
                        {language === "en" ? "Recent Receipts" : "ใบเสร็จล่าสุด"}
                    </h2>
                    <span className="text-xs text-slate-500">({filteredInvoices.length}{filter !== "all" ? ` / ${invoices.length}` : ""})</span>
                    {voidCount > 0 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-600 inline-flex items-center gap-1" title="ใบเสร็จที่ยกเลิก/คืนเงินในช่วงนี้ — ตรวจสอบความถี่">
                            <AlertCircle className="h-3 w-3" /> ยกเลิก/คืน {voidCount}
                        </span>
                    )}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <Button onClick={exportCSV} variant="outline" size="sm" className="rounded-lg h-7 text-xs gap-1 border-slate-300 text-slate-600 hover:bg-slate-50">
                            <Download className="h-3.5 w-3.5" /> ส่งออก CSV
                        </Button>
                    </div>
                </div>

                <div className="px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-slate-100 text-sm">
                    <label className="flex items-center gap-2 text-slate-600">
                        สถานะ:
                        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="all">ทั้งหมด</option>
                            <option value="outstanding">ค้างชำระ ({outstandingCount})</option>
                            <option value="paid">ชำระแล้ว</option>
                            <option value="voided">ยกเลิก/คืน</option>
                        </select>
                    </label>
                    <label className="flex items-center gap-2 text-slate-600">
                        ช่องทาง:
                        <select value={payFilter} onChange={(e) => setPayFilter(e.target.value as typeof payFilter)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="all">ทุกช่องทาง</option>
                            <option value="cash">เงินสด</option>
                            <option value="transfer">โอน/QR</option>
                            <option value="credit">บัตร</option>
                        </select>
                    </label>
                    <label className="flex items-center gap-2 text-slate-600">
                        ประเภท:
                        <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="all">ทั้งหมด</option>
                            <option value="normal">ทั่วไป</option>
                            <option value="anon">นิรนาม</option>
                        </select>
                    </label>
                    <span className="text-slate-500 ml-auto">{rangeCount} รายการในช่วงที่เลือก</span>
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
                                <tr className="text-sm font-semibold text-slate-600">
                                    <th className="text-left px-4 py-2.5">เลขที่</th>
                                    <th className="text-left px-4 py-2.5">ผู้ป่วย</th>
                                    <th className="text-left px-4 py-2.5 hidden md:table-cell">VN</th>
                                    <th className="text-left px-4 py-2.5 hidden sm:table-cell">วันที่</th>
                                    <th className="text-right px-4 py-2.5">ยอดรวม</th>
                                    <th className="text-right px-4 py-2.5">รับแล้วสะสม</th>
                                    <th className="text-right px-4 py-2.5">คงเหลือ</th>
                                    <th className="text-center px-4 py-2.5">สถานะ</th>
                                    <th className="px-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleInvoices.map((inv) => {
                                    const pt = Array.isArray(inv.patients) ? inv.patients[0] : inv.patients;
                                    const balance = Number(inv.balance_due || 0);
                                    return (
                                        <tr
                                            key={inv.id}
                                            className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors group cursor-pointer"
                                            onClick={() => window.location.href = inv.route || `/dashboard/finance/${inv.id}`}
                                        >
                                            <td className="px-4 py-3">
                                                <span className={`font-mono text-sm font-medium px-2 py-1 rounded ${inv.is_anon ? "text-[#2B54F0] bg-[#2B54F0]/10" : "text-slate-600 bg-slate-100"}`}>
                                                    {inv.id}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                                                    {pt?.prefix}{pt?.first_name} {pt?.last_name}
                                                    {inv.is_anon && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">นิรนาม</span>}
                                                </div>
                                                <div className="text-sm font-mono text-slate-700">{inv.is_anon ? "คลินิกนิรนาม" : `HN: ${inv.hn}`}</div>
                                            </td>
                                            <td className="px-4 py-3 hidden md:table-cell">
                                                <span className="font-mono text-sm text-slate-600">{inv.vn}</span>
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
                                            <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                                                {inv.status === "refunded" || Number(inv.refunded_amount) > 0 ? <div className="space-y-1 whitespace-nowrap text-sm">
                                                    <div>รับเดิม ฿{Number(inv.received_original ?? inv.paid_amount ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                                                    {Number(inv.refunded_amount) > 0 ? <>
                                                        <div className="text-rose-700">คืนแล้ว ฿{Number(inv.refunded_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                                                        <div className="font-medium">สุทธิ ฿{((Math.round(Number(inv.received_original ?? inv.paid_amount ?? 0) * 100) - Math.round(Number(inv.refunded_amount) * 100)) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                                                    </> : <div className="text-amber-700">ไม่พบรายการยอดคืน</div>}
                                                </div> : <>฿{Number(inv.paid_amount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</>}
                                            </td>
                                            <td className="px-4 py-3 text-right">
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
                        <nav aria-label="หน้าใบเสร็จ" className="p-4 flex items-center justify-between gap-3 border-t text-sm text-slate-600">
                            <span>{filteredInvoices.length} รายการ · หน้าละ 25</span>
                            <div className="flex items-center gap-3"><Button variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>ก่อนหน้า</Button>
                            <span>{currentPage} / {pages}</span><Button variant="outline" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>ถัดไป</Button></div>
                        </nav>
                    </div>
                )}
            </div>

            <details className="gonix-card-premium p-5">
                <summary className="cursor-pointer font-semibold text-slate-800">รายงานเพิ่มเติม · รายจ่ายย่อย · คอร์สค้างใช้</summary>
                <div className="space-y-4 mt-4">
                    <Link href="/dashboard/packages" className="block text-sm text-blue-700">คอร์สค้างใช้ {deferredCount} คอร์ส · ฿{deferredValue.toLocaleString("th-TH", { minimumFractionDigits: 2 })} →</Link>
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
                                {language === "en" ? "Revenue by Department" : "ยอดชำระสะสมแยกแผนกของบิลในช่วง"} ({rangeLabel})
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
                                        <div className="text-[11px] text-slate-500">{pct.toFixed(0)}%</div>
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
                        <div><div className="text-lg font-black text-slate-800 tabular-nums">฿{summary.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div><div className="text-[11px] text-slate-500">รับจริงรวม</div></div>
                        <div><div className="text-lg font-black text-slate-800 tabular-nums">{summary.count}</div><div className="text-[11px] text-slate-500">จำนวนใบ</div></div>
                        <div><div className="text-lg font-black text-slate-800 tabular-nums">฿{summary.avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div><div className="text-[11px] text-slate-500">เฉลี่ย/ใบ</div></div>
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
                        <div><div className="text-base font-black text-emerald-700 tabular-nums">฿{channels.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div><div className="text-[11px] text-slate-500">เงินสด</div></div>
                        <div><div className="text-base font-black text-cyan-700 tabular-nums">฿{channels.transfer.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div><div className="text-[11px] text-slate-500">โอน</div></div>
                        <div><div className="text-base font-black text-violet-700 tabular-nums">฿{channels.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div><div className="text-[11px] text-slate-500">บัตร</div></div>
                    </div>
                    {channels.credit > 0 && (
                        <Link href={`/dashboard/finance/card-fees?month=${range.to.slice(0, 7)}`} className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs hover:bg-slate-50 rounded -mx-1 px-1">
                            <span className="text-slate-500">ค่าธรรมเนียมบัตร (รวม VAT)</span>
                            <span className="font-bold text-rose-600 tabular-nums">−฿{(cardFeeTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ›</span>
                        </Link>
                    )}
                    <Link href={`/dashboard/finance/team-commission?month=${range.to.slice(0, 7)}`} className="mt-2 flex items-center justify-between text-xs text-blue-700 hover:bg-slate-50 rounded -mx-1 px-1">
                        <span>คอมทีม (กองกลางความงาม)</span><span>›</span>
                    </Link>
                    <Link href={`/dashboard/finance/procedure-costs?month=${range.to.slice(0, 7)}`} className="mt-1 flex items-center justify-between text-xs text-blue-700 hover:bg-slate-50 rounded -mx-1 px-1">
                        <span>ต้นทุน & มาร์จิ้นหัตถการ</span><span>›</span>
                    </Link>
                </div>
            </div>

            {/* เตือน: พนักงานที่ยกเลิก/คืนเงินบ่อยผิดปกติ (90 วันล่าสุด) */}
            {voidPattern.some(v => v.isOutlier) && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 space-y-1.5">
                    <div className="text-xs font-black text-amber-900 inline-flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" /> ยกเลิก/คืนเงินบ่อยผิดปกติ (90 วันล่าสุด)
                    </div>
                    {voidPattern.filter(v => v.isOutlier).map((v, i) => (
                        <div key={i} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-1.5">
                            <span className="font-semibold text-slate-800">{v.name}</span>
                            <span className="text-xs text-slate-600 tabular-nums">
                                ยกเลิก {v.voids} · คืนเงิน {v.refunds} · <b className="text-amber-700">รวม {v.total} ครั้ง</b>
                            </span>
                        </div>
                    ))}
                    <p className="text-[10px] text-amber-700">สูงกว่าค่าเฉลี่ยของทีม 2 เท่าขึ้นไป — ตรวจสอบเหตุผลในประวัติใบเสร็จ</p>
                </div>
            )}

            {/* Petty Cash + Net Cash Flow */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2 flex-wrap">
                    <ArrowDownCircle className="h-4 w-4 text-rose-600" />
                    <h2 className="text-sm font-bold text-slate-800">
                        {language === "en" ? "Petty Cash" : "รายจ่ายย่อย"} ({rangeLabel})
                    </h2>
                    <span className="text-xs text-slate-500">({pettyItems.length})</span>
                    <div className="ml-auto flex items-center gap-3">
                        {/* Net Cash Flow inline */}
                        <div className="text-right hidden sm:block">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
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
                    <div className="py-6 text-center text-xs text-slate-500">
                        {language === "en" ? "No petty cash recorded today" : "ยังไม่มีรายจ่ายย่อยวันนี้"}
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {pettyItems.map((it) => (
                            <div key={it.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">{it.category}</span>
                                <span className="text-sm text-slate-700 truncate flex-1">{it.description}</span>
                                {it.recorded_by_name && <span className="text-[11px] text-slate-500 hidden md:block shrink-0">{it.recorded_by_name}</span>}
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
                            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">ลูกค้ารายนี้ · มูลค่าตลอดอายุ (LTV)</div>
                            <div className="text-lg font-black text-slate-800">{ltv.name} <span className="text-xs font-mono text-slate-500">{ltv.hn}</span></div>
                        </div>
                        <div className="flex items-center gap-5 flex-wrap">
                            <div className="text-center"><div className="text-xl font-black text-blue-700 tabular-nums">฿{Number(ltv.total).toLocaleString()}</div><div className="text-[11px] text-slate-500">ใช้จ่ายสะสม</div></div>
                            <div className="text-center"><div className="text-xl font-black text-slate-800 tabular-nums">{ltv.visitCount}</div><div className="text-[11px] text-slate-500">ครั้งที่มา</div></div>
                            {ltv.points != null && <div className="text-center"><div className="text-xl font-black text-amber-600 tabular-nums">{Number(ltv.points).toLocaleString()}</div><div className="text-[11px] text-slate-500">แต้ม{ltv.tierName ? ` · ${ltv.tierName}` : ""}</div></div>}
                            {ltv.firstDate && <div className="text-xs text-slate-500 self-end pb-1">ลูกค้าตั้งแต่ {new Date(ltv.firstDate + "T00:00:00").toLocaleDateString("th-TH", { month: "short", year: "2-digit" })}</div>}
                        </div>
                    </div>
                </div>
            )}

                </div>
            </details>
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
                            <button onClick={() => setShowPetty(false)} className="text-slate-500 hover:text-slate-700">
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
