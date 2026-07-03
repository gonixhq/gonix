"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    BarChart3, Users, Activity, TrendingUp, Calendar, Wallet,
    Download, AlertTriangle, Pill, Sparkles, FileText, ChevronRight,
    Banknote, CreditCard, QrCode, ArrowLeftRight, X, UserPlus, UserCheck,
    ShoppingBasket, ArrowRight, Link2,
} from "lucide-react";
import type { ReportSummary, OutstandingInvoice } from "@/lib/actions/reports";
import type { BusinessInsights, RfmResult, BasketAnalysis } from "@/lib/actions/business-insights";
import type { PeakHours, StaffPerfRow, OutstandingPackages, InventoryRevenue } from "@/lib/actions/operations-report";
import type { GoalProgress } from "@/lib/actions/targets";
import type { Seg } from "@/lib/report-segment";
import { SEG_LABEL } from "@/lib/report-segment";
import type { AcqSource, ConversionResult, Demographics } from "@/lib/actions/marketing-report";
import GoalCard from "./goal-card";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
    cash: "เงินสด",
    transfer: "โอน",
    credit_card: "บัตรเครดิต",
    qr_promptpay: "QR / พร้อมเพย์",
    insurance: "ประกัน",
    nhso: "สปสช.",
    package: "หักจากคอส",
    points: "แต้มสะสม",
    mixed: "ผสม",
};

const PAYMENT_METHOD_ICON: Record<string, React.ElementType> = {
    cash: Banknote,
    transfer: ArrowLeftRight,
    credit_card: CreditCard,
    qr_promptpay: QrCode,
};

const ITEM_TYPE_LABEL: Record<string, string> = {
    drug: "ยา",
    supply: "เวชภัณฑ์",
    doctor_fee: "ค่าตรวจ",
    procedure: "หัตถการ",
    service: "บริการ",
    package: "คอสบริการ",
    lab: "แล็บ",
    lab_external: "แล็บภายนอก",
    other: "อื่นๆ",
};

const ITEM_TYPE_COLOR: Record<string, string> = {
    drug: "bg-amber-100 text-amber-700",
    supply: "bg-indigo-100 text-indigo-700",
    doctor_fee: "bg-cyan-100 text-cyan-700",
    procedure: "bg-rose-100 text-rose-700",
    service: "bg-blue-100 text-blue-700",
    package: "bg-pink-100 text-pink-700",
    lab: "bg-purple-100 text-purple-700",
    other: "bg-slate-100 text-slate-700",
};

const DAYS_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const ROLE_TH: Record<string, string> = {
    owner: "เจ้าของ", admin: "แอดมิน", doctor: "แพทย์", dentist: "ทันตแพทย์",
    nurse: "พยาบาล", pharmacist: "เภสัชกร", physio: "นักกายภาพ", receptionist: "เวชระเบียน",
    accountant: "บัญชี", staff: "พนักงาน",
};

const CATEGORY_LABEL: Record<string, string> = {
    general_med: "เวชกรรมทั่วไป",
    aesthetic: "ความงาม",
    wound_care: "ทำแผล",
    med_cert: "ใบรับรอง",
    checkup: "ตรวจสุขภาพ",
    std_test: "ตรวจ STD",
};

const STATUS_LABEL: Record<string, string> = {
    partial: "ชำระบางส่วน",
    issued: "ค้างชำระ",
};

// RFM segment tone (เหมือนหน้ารายงานธุรกิจเดิม)
const SEG_TONE: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    cyan: "bg-cyan-50 border-cyan-200 text-cyan-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    red: "bg-red-50 border-red-200 text-red-700",
    slate: "bg-slate-50 border-slate-200 text-slate-600",
};

function fmt(n: number): string {
    return n.toLocaleString("th-TH", { minimumFractionDigits: 0 });
}
function fmt2(n: number): string {
    return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDateThai(d: string): string {
    return new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export default function ReportsClient({
    summary, prevSummary, goal, acqSources, conversion, demographics, outstanding, biz, rfm, basket, peak, staffPerf, outstandingPkg, invMargin, seg, startDate, endDate, today,
}: {
    summary: ReportSummary;
    prevSummary: ReportSummary;
    goal: GoalProgress;
    acqSources: AcqSource[];
    conversion: ConversionResult;
    demographics: Demographics;
    outstanding: OutstandingInvoice[];
    biz: BusinessInsights;
    rfm: RfmResult;
    basket: BasketAnalysis;
    peak: PeakHours;
    staffPerf: StaffPerfRow[];
    outstandingPkg: OutstandingPackages;
    invMargin: InventoryRevenue;
    seg: Seg;
    startDate: string;
    endDate: string;
    today: string;
}) {
    const router = useRouter();
    const [showOutstanding, setShowOutstanding] = useState(false);
    const [tab, setTab] = useState<"overview" | "sales" | "items" | "customers" | "behavior" | "operations" | "marketing">("overview");

    const newPct = biz.totalRevenue > 0 ? Math.round((biz.newRevenue / biz.totalRevenue) * 100) : 0;
    const retPct = 100 - newPct;

    // Quick range presets
    function applyPreset(preset: "today" | "week" | "month" | "lastMonth") {
        const now = new Date(today + "T00:00:00");
        let start = today, end = today;
        if (preset === "today") {
            start = today; end = today;
        } else if (preset === "week") {
            const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
            const monday = new Date(now); monday.setDate(now.getDate() - dow);
            start = monday.toLocaleDateString("sv-SE"); end = today;
        } else if (preset === "month") {
            const [y, m] = today.split("-");
            start = `${y}-${m}-01`; end = today;
        } else if (preset === "lastMonth") {
            const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
            start = lm.toLocaleDateString("sv-SE"); end = lmEnd.toLocaleDateString("sv-SE");
        }
        router.push(`/dashboard/reports?start=${start}&end=${end}&seg=${seg}`);
    }

    function exportCSV() {
        const lines: string[] = [];
        lines.push(`รายงานสรุป,${formatDateThai(startDate)} ถึง ${formatDateThai(endDate)}`);
        lines.push("");
        lines.push("=== สรุปยอด ===");
        lines.push(`รายรับ (ชำระจริง),${summary.totalRevenue}`);
        lines.push(`ยอดออกบิล,${summary.totalBilled}`);
        lines.push(`ค้างชำระ,${summary.outstanding}`);
        lines.push(`จำนวนใบเสร็จ,${summary.invoiceCount}`);
        lines.push(`Visit ทั้งหมด,${summary.totalVisits}`);
        lines.push(`ลูกค้าใหม่ (ซื้อครั้งแรกในช่วง),${summary.newPatients}`);
        lines.push("");
        lines.push("=== รายรับรายวัน ===");
        lines.push("วันที่,ยอดรับ");
        summary.revenueByDay.forEach(r => lines.push(`${r.date},${r.amount}`));
        lines.push("");
        lines.push("=== แยกตามวิธีชำระ ===");
        lines.push("วิธีชำระ,จำนวนครั้ง,ยอด");
        summary.revenueByMethod.forEach(r => lines.push(`${PAYMENT_METHOD_LABEL[r.method] || r.method},${r.count},${r.amount}`));
        lines.push("");
        lines.push("=== ยอดขายตามประเภท ===");
        lines.push("ประเภท,จำนวนรายการ,ยอด");
        summary.salesByType.forEach(r => lines.push(`${ITEM_TYPE_LABEL[r.type] || r.type},${r.count},${r.amount}`));
        lines.push("");
        lines.push("=== รายการขายดี ===");
        lines.push("ชื่อ,ประเภท,จำนวน,ยอด");
        summary.topItems.forEach(r => lines.push(`"${r.name}",${ITEM_TYPE_LABEL[r.type] || r.type},${r.qty},${r.amount}`));
        lines.push("");
        lines.push("=== ลูกค้าใหม่ vs เก่า ===");
        lines.push("กลุ่ม,จำนวนราย,รายได้");
        lines.push(`ลูกค้าใหม่,${biz.newCustomers},${biz.newRevenue}`);
        lines.push(`ลูกค้าเก่า,${biz.returningCustomers},${biz.returningRevenue}`);
        lines.push("");
        lines.push("=== กลุ่มลูกค้า RFM (ทั้งหมด) ===");
        lines.push("กลุ่ม,จำนวนราย,ยอดใช้จ่ายรวม");
        rfm.segments.filter(s => s.customers > 0).forEach(s => lines.push(`"${s.label}",${s.customers},${s.revenue}`));
        lines.push("");
        lines.push("=== สินค้าที่ซื้อคู่กันบ่อย (Market Basket) ===");
        lines.push("สินค้า A,สินค้า B,ซื้อคู่กัน(ครั้ง),Lift");
        basket.pairs.forEach(p => lines.push(`"${p.a}","${p.b}",${p.count},${p.lift}`));
        lines.push("");
        lines.push("=== ซื้อแล้วครั้งถัดไปมักซื้ออะไร ===");
        lines.push("ซื้อก่อน,ครั้งถัดไป,จำนวนครั้ง,เฉลี่ยห่าง(วัน)");
        basket.transitions.forEach(t => lines.push(`"${t.from}","${t.to}",${t.count},${t.avgGapDays}`));
        lines.push("");
        lines.push("=== ผลงานแพทย์/พนักงาน ===");
        lines.push("ผู้ดูแล,ตำแหน่ง,เคส,ลูกค้า,ยอดขาย,เฉลี่ย/เคส,ชม.เวร,ขาย/ชม.,Retention%");
        staffPerf.forEach(s => lines.push(`"${s.name}",${ROLE_TH[s.role] || s.role},${s.cases},${s.patients},${s.sales},${s.avgPerCase},${s.shiftHours},${s.salesPerHour},${s.repeatRate}`));
        lines.push("");
        lines.push("=== คอสค้างใช้ (ภาระผูกพัน) ===");
        lines.push("ลูกค้า,HN,คอส,ใช้,ทั้งหมด,มูลค่าคงเหลือ,หมดอายุ");
        outstandingPkg.items.forEach(p => lines.push(`"${p.patient_name}",${p.hn},"${p.package_name}",${p.used_sessions},${p.total_sessions},${p.unearned},${p.expires_at?.slice(0, 10) || ""}`));
        lines.push("");
        lines.push("=== กำไรขั้นต้นตามประเภท ===");
        lines.push("ประเภท,รายได้,ต้นทุน,กำไรขั้นต้น,Margin%");
        invMargin.byType.forEach(r => lines.push(`${ITEM_TYPE_LABEL[r.type] || r.type},${r.revenue},${r.cogs},${r.margin},${r.marginPct}`));
        lines.push("");
        lines.push("=== กำไรขั้นต้นรายตัว (Margin Analysis) ===");
        lines.push("ชื่อ,ประเภท,จำนวน,รายได้,ต้นทุน,กำไรขั้นต้น");
        invMargin.items.forEach(it => lines.push(`"${it.name}",${ITEM_TYPE_LABEL[it.type] || it.type},${it.qty},${it.revenue},${it.cogs},${it.margin}`));

        const csv = "﻿" + lines.join("\n");  // BOM for Excel Thai
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `report-${startDate}_${endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Export รายชื่อลูกค้าในกลุ่ม RFM (เบอร์/อีเมล) → ไป retarget FB/LINE OA
    function exportRfmSegment(segKey: string, segLabel: string) {
        const rows = rfm.customers.filter(c => c.segment === segKey);
        if (rows.length === 0) { alert("ไม่มีลูกค้าในกลุ่มนี้"); return; }
        const lines = ["ชื่อ,HN,เบอร์โทร,อีเมล,ซื้อล่าสุด(วันก่อน),จำนวนครั้ง,ยอดใช้จ่าย"];
        rows.forEach(c => lines.push(`"${c.name}",${c.hn},${c.phone || ""},${c.email || ""},${c.recencyDays},${c.frequency},${c.monetary}`));
        const csv = "﻿" + lines.join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `rfm-${segKey}-${today}.csv`; a.click();
        URL.revokeObjectURL(url);
    }

    // เปิดหน้า print (บันทึก PDF) — section = แท็บปัจจุบัน หรือ "all" ทั้งหมด
    function openPDF(section: "overview" | "sales" | "items" | "customers" | "behavior" | "operations" | "marketing" | "all") {
        window.open(`/print/report?start=${startDate}&end=${endDate}&section=${section}&seg=${seg}`, "_blank");
    }

    const TAB_LABEL: Record<string, string> = {
        overview: "ภาพรวม", sales: "ยอดขาย", items: "รายการขายดี",
        customers: "ลูกค้า & ธุรกิจ", behavior: "พฤติกรรมการซื้อ", operations: "ปฏิบัติการ", marketing: "การตลาด",
    };

    const maxDayRevenue = Math.max(...summary.revenueByDay.map(r => r.amount), 1);

    return (
        <div className="space-y-4 max-w-7xl mx-auto animate-fade-in pb-12">
            {/* Header — title + period picker */}
            <div className="gonix-card-premium p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-2xl flex items-center justify-center bg-[#2B54F0]/10 shrink-0">
                        <BarChart3 className="h-5 w-5 text-[#2B54F0]" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight leading-tight">รายงาน & สถิติ</h1>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <Calendar className="h-3 w-3" /> {formatDateThai(startDate)} — {formatDateThai(endDate)}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Presets */}
                    <div className="inline-flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
                        <PresetBtn onClick={() => applyPreset("today")}>วันนี้</PresetBtn>
                        <PresetBtn onClick={() => applyPreset("week")}>สัปดาห์</PresetBtn>
                        <PresetBtn onClick={() => applyPreset("month")}>เดือนนี้</PresetBtn>
                        <PresetBtn onClick={() => applyPreset("lastMonth")}>เดือนก่อน</PresetBtn>
                    </div>

                    {/* Custom range */}
                    <form method="get" className="inline-flex items-center gap-1.5">
                        <input type="hidden" name="seg" value={seg} />
                        <input type="date" name="start" defaultValue={startDate} max={today}
                            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-[#2B54F0] focus:outline-none" />
                        <span className="text-slate-300 text-xs">–</span>
                        <input type="date" name="end" defaultValue={endDate} max={today}
                            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:border-[#2B54F0] focus:outline-none" />
                        <Button type="submit" size="sm" variant="outline" className="rounded-lg h-9 text-xs">ดู</Button>
                    </form>
                </div>
            </div>

            {/* Business Unit filter (Medical/Aesthetic) */}
            <div className="inline-flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
                {(["all", "medical", "aesthetic"] as Seg[]).map(s => (
                    <button key={s} onClick={() => router.push(`/dashboard/reports?start=${startDate}&end=${endDate}&seg=${s}`)}
                        className={`h-8 px-3.5 rounded-lg text-xs font-bold transition-all ${seg === s ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-600 hover:text-slate-800"}`}>
                        {SEG_LABEL[s]}
                    </button>
                ))}
            </div>

            {/* Outstanding alert */}
            {summary.outstanding > 0 && (
                <button
                    onClick={() => setShowOutstanding(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border-2 border-amber-200 hover:bg-amber-100/60 transition-colors text-left"
                >
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    <div className="flex-1">
                        <span className="font-bold text-amber-900">ค้างชำระทั้งหมด ฿{fmt2(outstanding.reduce((s, o) => s + o.balance, 0))}</span>
                        <span className="text-sm text-amber-700 ml-2">({outstanding.length} ใบเสร็จ)</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-amber-600" />
                </button>
            )}

            {/* Top stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={Wallet} label="รายรับ (ชำระจริง)" value={`฿${fmt(summary.totalRevenue)}`} color="emerald" delta={pctChange(summary.totalRevenue, prevSummary.totalRevenue)} />
                <StatCard icon={AlertTriangle} label="ค้างชำระ" value={`฿${fmt(summary.outstanding)}`} color="amber" sub={`${summary.partialCount} บางส่วน`} />
                <StatCard icon={Activity} label="Visit" value={fmt(summary.totalVisits)} color="sky" delta={pctChange(summary.totalVisits, prevSummary.totalVisits)} />
                <StatCard icon={Users} label="ลูกค้าใหม่" value={fmt(summary.newPatients)} color="violet" delta={pctChange(summary.newPatients, prevSummary.newPatients)} />
            </div>

            {/* Tabs + Export toolbar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="inline-flex items-center bg-slate-100 rounded-xl p-1 gap-0.5 flex-wrap">
                    <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>ภาพรวม</TabBtn>
                    <TabBtn active={tab === "sales"} onClick={() => setTab("sales")}>ยอดขาย</TabBtn>
                    <TabBtn active={tab === "items"} onClick={() => setTab("items")}>รายการขายดี</TabBtn>
                    <TabBtn active={tab === "customers"} onClick={() => setTab("customers")}>ลูกค้า & ธุรกิจ</TabBtn>
                    <TabBtn active={tab === "behavior"} onClick={() => setTab("behavior")}>พฤติกรรมการซื้อ</TabBtn>
                    <TabBtn active={tab === "operations"} onClick={() => setTab("operations")}>ปฏิบัติการ</TabBtn>
                    <TabBtn active={tab === "marketing"} onClick={() => setTab("marketing")}>การตลาด</TabBtn>
                </div>

                <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    <button onClick={exportCSV} title="ดาวน์โหลด Excel (.csv) ทั้งรายงาน"
                        className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors">
                        <Download className="h-4 w-4" /> Excel
                    </button>
                    <div className="w-px h-5 bg-slate-200" />
                    <button onClick={() => openPDF(tab)} title={`บันทึก PDF เฉพาะแท็บ ${TAB_LABEL[tab]}`}
                        className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors">
                        <FileText className="h-4 w-4" /> PDF แท็บนี้
                    </button>
                    <div className="w-px h-5 bg-slate-200" />
                    <button onClick={() => openPDF("all")} title="บันทึก PDF รวมทุกหัวข้อ"
                        className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                        PDF ทั้งหมด
                    </button>
                </div>
            </div>

            {/* ── OVERVIEW ── */}
            {tab === "overview" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="lg:col-span-2"><GoalCard goal={goal} /></div>
                    {/* Revenue by day */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                            <h2 className="text-sm font-bold text-slate-800">รายรับรายวัน</h2>
                        </div>
                        <div className="p-5">
                            {summary.revenueByDay.length === 0 ? (
                                <p className="text-center text-sm text-slate-400 py-8">ไม่มีรายรับในช่วงนี้</p>
                            ) : (
                                <div className="space-y-2">
                                    {summary.revenueByDay.slice(-14).map(r => {
                                        const pct = Math.round((r.amount / maxDayRevenue) * 100);
                                        return (
                                            <div key={r.date} className="flex items-center gap-3">
                                                <span className="text-xs text-slate-500 w-16 shrink-0 text-right">
                                                    {new Date(r.date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                                                </span>
                                                <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-emerald-400 to-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-xs font-bold text-emerald-700 w-20 text-right tabular-nums">฿{fmt(r.amount)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Payment methods */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-cyan-600" />
                            <h2 className="text-sm font-bold text-slate-800">แยกตามวิธีชำระ</h2>
                        </div>
                        <div className="p-5">
                            {summary.revenueByMethod.length === 0 ? (
                                <p className="text-center text-sm text-slate-400 py-8">ไม่มีข้อมูล</p>
                            ) : (
                                <div className="space-y-3">
                                    {summary.revenueByMethod.map(r => {
                                        const PIcon = PAYMENT_METHOD_ICON[r.method] || Wallet;
                                        const totalMethodRev = summary.revenueByMethod.reduce((s, m) => s + Math.abs(m.amount), 0);
                                        const pct = totalMethodRev > 0 ? Math.round((Math.abs(r.amount) / totalMethodRev) * 100) : 0;
                                        return (
                                            <div key={r.method} className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-xl bg-cyan-50 flex items-center justify-center shrink-0">
                                                    <PIcon className="h-4 w-4 text-cyan-600" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between text-sm mb-0.5">
                                                        <span className="font-medium text-slate-700">{PAYMENT_METHOD_LABEL[r.method] || r.method}</span>
                                                        <span className="font-bold text-slate-800 tabular-nums">฿{fmt(r.amount)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 w-16 text-right">{r.count} ครั้ง</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Visits by category */}
                    <div className="gonix-card-premium overflow-hidden lg:col-span-2">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <Activity className="h-4 w-4 text-violet-600" />
                            <h2 className="text-sm font-bold text-slate-800">Visit แยกตามประเภทบริการ</h2>
                        </div>
                        <div className="p-5">
                            {summary.revenueByCategory.length === 0 ? (
                                <p className="text-center text-sm text-slate-400 py-8">ไม่มี Visit ในช่วงนี้</p>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                    {summary.revenueByCategory.map(c => (
                                        <div key={c.category} className="rounded-xl border border-slate-200 p-3 text-center">
                                            <div className="text-2xl font-black text-slate-800 tabular-nums">{c.count}</div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">{CATEGORY_LABEL[c.category] || c.category}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── SALES ── */}
            {tab === "sales" && (
                <div className="gonix-card-premium overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <h2 className="text-sm font-bold text-slate-800">ยอดขายแยกตามประเภทรายการ</h2>
                    </div>
                    <div className="p-5">
                        {summary.salesByType.length === 0 ? (
                            <p className="text-center text-sm text-slate-400 py-8">ไม่มียอดขายในช่วงนี้</p>
                        ) : (
                            <div className="space-y-3">
                                {(() => {
                                    const totalSales = summary.salesByType.reduce((s, t) => s + t.amount, 0);
                                    return summary.salesByType.map(t => {
                                        const pct = totalSales > 0 ? Math.round((t.amount / totalSales) * 100) : 0;
                                        return (
                                            <div key={t.type}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase ${ITEM_TYPE_COLOR[t.type] || ITEM_TYPE_COLOR.other}`}>
                                                        {ITEM_TYPE_LABEL[t.type] || t.type}
                                                    </span>
                                                    <div className="text-sm">
                                                        <span className="font-bold text-slate-800 tabular-nums">฿{fmt2(t.amount)}</span>
                                                        <span className="text-slate-400 ml-2 text-xs">{pct}% · {t.count} รายการ</span>
                                                    </div>
                                                </div>
                                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-blue-400 to-cyan-500 rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TOP ITEMS ── */}
            {tab === "items" && (
                <div className="gonix-card-premium overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-rose-600" />
                        <h2 className="text-sm font-bold text-slate-800">รายการขายดี (Top 15)</h2>
                    </div>
                    {summary.topItems.length === 0 ? (
                        <p className="text-center text-sm text-slate-400 py-12">ไม่มีรายการขายในช่วงนี้</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60">
                                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    <th className="text-left px-5 py-2.5 w-10">#</th>
                                    <th className="text-left px-4 py-2.5">รายการ</th>
                                    <th className="text-left px-4 py-2.5">ประเภท</th>
                                    <th className="text-center px-4 py-2.5">จำนวน</th>
                                    <th className="text-right px-5 py-2.5">ยอดขาย</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.topItems.map((it, i) => (
                                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/40">
                                        <td className="px-5 py-2.5 text-slate-400 font-bold tabular-nums">{i + 1}</td>
                                        <td className="px-4 py-2.5 font-bold text-slate-800">{it.name}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${ITEM_TYPE_COLOR[it.type] || ITEM_TYPE_COLOR.other}`}>
                                                {ITEM_TYPE_LABEL[it.type] || it.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">{fmt(it.qty)}</td>
                                        <td className="px-5 py-2.5 text-right font-bold text-emerald-700 tabular-nums">฿{fmt2(it.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ── CUSTOMERS & BUSINESS ── */}
            {tab === "customers" && (
                <div className="space-y-4">
                    {/* New vs returning revenue */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-600" />
                            <h2 className="text-sm font-bold text-slate-800">รายได้: ลูกค้าใหม่ vs เก่า</h2>
                            <span className="text-xs text-slate-400">(ในช่วงที่เลือก)</span>
                        </div>
                        <div className="p-5">
                            <div className="flex h-4 rounded-full overflow-hidden bg-slate-100 mb-3">
                                <div style={{ width: `${newPct}%`, background: "#2B54F0" }} />
                                <div style={{ width: `${retPct}%`, background: "#10B981" }} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl bg-[#2B54F0]/5 border border-[#2B54F0]/15 p-3">
                                    <div className="text-[11px] font-bold text-[#2B54F0] inline-flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" /> ลูกค้าใหม่</div>
                                    <div className="text-lg font-black text-slate-800 tabular-nums mt-1">฿{fmt(biz.newRevenue)}</div>
                                    <div className="text-[11px] text-slate-500">{newPct}% · {biz.newCustomers} ราย</div>
                                </div>
                                <div className="rounded-xl bg-[#10B981]/5 border border-[#10B981]/15 p-3">
                                    <div className="text-[11px] font-bold text-emerald-600 inline-flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> ลูกค้าเก่า</div>
                                    <div className="text-lg font-black text-slate-800 tabular-nums mt-1">฿{fmt(biz.returningRevenue)}</div>
                                    <div className="text-[11px] text-slate-500">{retPct}% · {biz.returningCustomers} ราย</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RFM segments */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-violet-600" />
                            <h2 className="text-sm font-bold text-slate-800">กลุ่มลูกค้า (RFM)</h2>
                            <span className="text-xs text-slate-400">{rfm.total} ราย (ทั้งหมด)</span>
                        </div>
                        <div className="p-4">
                            {rfm.total > 0 && rfm.total < 30 && (
                                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <span>ฐานลูกค้ายังน้อย ({rfm.total} ราย) — การแบ่งกลุ่ม RFM อาจยังไม่มีนัยสำคัญทางสถิติ (แนะนำ ≥ 30 ราย) ใช้ดูเป็นแนวโน้มเบื้องต้นได้</span>
                                </div>
                            )}
                            {rfm.segments.filter(s => s.customers > 0).length === 0 ? (
                                <p className="text-center text-sm text-slate-400 py-8">ยังไม่มีข้อมูลลูกค้าเพียงพอ</p>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                                        {rfm.segments.filter(s => s.customers > 0).map(s => (
                                            <div key={s.key} className={`rounded-xl border p-3 relative group ${SEG_TONE[s.color] || SEG_TONE.slate}`}>
                                                <button onClick={() => exportRfmSegment(s.key, s.label)} title={`Export รายชื่อ ${s.label} (เบอร์/อีเมล)`}
                                                    className="absolute top-2 right-2 h-6 w-6 rounded-lg bg-white/70 hover:bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Download className="h-3.5 w-3.5" />
                                                </button>
                                                <div className="text-sm font-bold pr-6">{s.label}</div>
                                                <div className="text-2xl font-black tabular-nums mt-0.5">{s.customers}</div>
                                                <div className="text-[11px] opacity-80">฿{fmt(s.revenue)}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-3">
                                        แบ่งจาก Recency (ซื้อล่าสุด) · Frequency (ความถี่) · Monetary (ยอดใช้จ่าย) — ใช้วางแผนแคมเปญ เช่น &quot;ห้ามเสียไป/เสี่ยงหาย&quot; ส่งโปรดึงกลับ, &quot;ลูกค้าชั้นยอด&quot; ดูแลพิเศษ
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── PURCHASE BEHAVIOR (เฟส 2) ── */}
            {tab === "behavior" && (
                <div className="space-y-4">
                    {/* summary line */}
                    <div className="flex flex-wrap gap-3 text-xs">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold">
                            ใบเสร็จในช่วง <b className="text-slate-800 tabular-nums">{fmt(basket.totalBaskets)}</b> ใบ
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold">
                            มี ≥2 รายการ <b className="text-slate-800 tabular-nums">{fmt(basket.multiItemBaskets)}</b> ใบ
                        </span>
                    </div>

                    {/* Market basket — co-occurrence */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <ShoppingBasket className="h-4 w-4 text-blue-600" />
                            <h2 className="text-sm font-bold text-slate-800">สินค้า/บริการที่มักซื้อคู่กัน</h2>
                            <span className="text-xs text-slate-400">(ในใบเสร็จเดียวกัน)</span>
                        </div>
                        {basket.pairs.length === 0 ? (
                            <p className="text-center text-sm text-slate-400 py-10">ยังไม่พบคู่ที่ซื้อร่วมกันบ่อยพอ (ต้อง ≥ 2 ครั้ง)</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/60">
                                    <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        <th className="text-left px-5 py-2.5">คู่สินค้า / บริการ</th>
                                        <th className="text-center px-4 py-2.5">ซื้อคู่กัน</th>
                                        <th className="text-center px-4 py-2.5">โอกาสซื้อคู่</th>
                                        <th className="text-right px-5 py-2.5">Lift</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {basket.pairs.map((p, i) => (
                                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/40">
                                            <td className="px-5 py-2.5">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-semibold text-slate-800">{p.a}</span>
                                                    <Link2 className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                                                    <span className="font-semibold text-slate-800">{p.b}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-center tabular-nums font-bold text-slate-700">{fmt(p.count)} ครั้ง</td>
                                            <td className="px-4 py-2.5 text-center text-xs text-slate-500">
                                                <span title="ลูกค้าที่ซื้อ A แล้วซื้อ B ด้วย">{Math.round(Math.max(p.confAtoB, p.confBtoA))}%</span>
                                            </td>
                                            <td className="px-5 py-2.5 text-right">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${p.lift >= 1.2 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                                    ×{p.lift.toFixed(1)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <p className="text-[11px] text-slate-400 px-5 py-2.5 border-t border-slate-100">
                            <b>Lift ×{">"}1</b> = ซื้อคู่กันมากกว่าที่จะบังเอิญ — เหมาะจัดโปรขายคู่ / แนะนำเพิ่มหน้าเคาน์เตอร์
                        </p>
                    </div>

                    {/* Next-purchase transitions */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <ArrowRight className="h-4 w-4 text-violet-600" />
                            <h2 className="text-sm font-bold text-slate-800">ซื้อแล้ว…ครั้งถัดไปมักซื้ออะไร</h2>
                            <span className="text-xs text-slate-400">(คนไข้คนเดิม ใบเสร็จถัดไป)</span>
                        </div>
                        {basket.transitions.length === 0 ? (
                            <p className="text-center text-sm text-slate-400 py-10">ยังไม่พบลำดับการซื้อซ้ำมากพอ (ต้อง ≥ 2 ครั้ง)</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/60">
                                    <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        <th className="text-left px-5 py-2.5">ซื้อก่อน → ครั้งถัดไป</th>
                                        <th className="text-center px-4 py-2.5">จำนวนครั้ง</th>
                                        <th className="text-right px-5 py-2.5">เฉลี่ยห่างกัน</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {basket.transitions.map((t, i) => (
                                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/40">
                                            <td className="px-5 py-2.5">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-semibold text-slate-700">{t.from}</span>
                                                    <ArrowRight className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                                                    <span className="font-semibold text-slate-800">{t.to}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-center tabular-nums font-bold text-slate-700">{fmt(t.count)}</td>
                                            <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{Math.round(t.avgGapDays)} วัน</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <p className="text-[11px] text-slate-400 px-5 py-2.5 border-t border-slate-100">
                            ใช้ตั้งเตือนติดตาม / ส่งโปรกระตุ้นซื้อซ้ำตามรอบเวลาที่ลูกค้ามักกลับมา
                        </p>
                    </div>
                </div>
            )}

            {/* ── แท็บ ปฏิบัติการ (Operations) ── */}
            {tab === "operations" && (
                <div className="space-y-4 animate-fade-in">
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                            <Activity className="h-4 w-4 text-sky-600" />
                            <h2 className="text-sm font-bold text-slate-800">ช่วงเวลาที่ลูกค้าแน่น (Peak Hours)</h2>
                            {peak.busiest && (
                                <span className="text-xs text-slate-400">
                                    พีคสุด: {DAYS_TH[peak.busiest.day]} {String(peak.busiest.hour).padStart(2, "0")}:00 น. · {peak.busiest.count} visit
                                </span>
                            )}
                        </div>
                        <div className="p-4 overflow-x-auto">
                            {peak.total === 0
                                ? <p className="text-center text-sm text-slate-400 py-8">ไม่มีข้อมูล visit ในช่วงนี้</p>
                                : <PeakHeatmap peak={peak} />}
                        </div>
                        <div className="px-4 pb-4">
                            <p className="text-[11px] text-slate-400">นับจากเวลาเปิด Visit (visit_time) · สีเข้ม = ลูกค้าแน่น ใช้จัดเวรแพทย์/พนักงานให้พอในช่วงพีค ลดเวลารอคอย</p>
                        </div>
                    </div>

                    {/* Staff & Doctor Performance */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                            <h2 className="text-sm font-bold text-slate-800">ผลงานแพทย์/พนักงาน (จัดอันดับตามยอดขาย)</h2>
                        </div>
                        {staffPerf.length === 0 ? (
                            <p className="text-center text-sm text-slate-400 py-8">ไม่มีข้อมูลเคสที่ระบุผู้ดูแลในช่วงนี้</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/60">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            <th className="text-left px-4 py-2.5">#</th>
                                            <th className="text-left px-4 py-2.5">ผู้ดูแล</th>
                                            <th className="text-right px-3 py-2.5">เคส</th>
                                            <th className="text-right px-3 py-2.5">ลูกค้า</th>
                                            <th className="text-right px-3 py-2.5">ยอดขาย</th>
                                            <th className="text-right px-3 py-2.5">เฉลี่ย/เคส</th>
                                            <th className="text-right px-3 py-2.5" title="ชั่วโมงเข้าเวรจริง จาก GPS check-in">ชม.เวร</th>
                                            <th className="text-right px-3 py-2.5" title="ยอดขาย ÷ ชั่วโมงเวร (productivity จริง)">ขาย/ชม.</th>
                                            <th className="text-right px-4 py-2.5" title="ลูกค้าที่กลับมา ≥2 ครั้งกับคนนี้">Retention</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {staffPerf.map((s, i) => (
                                            <tr key={s.staff_id} className="border-t border-slate-100 hover:bg-slate-50/40">
                                                <td className="px-4 py-2.5 text-slate-400 tabular-nums">{i + 1}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className="font-bold text-slate-800">{s.name}</span>
                                                    <span className="ml-1.5 text-[10px] text-slate-400">{ROLE_TH[s.role] || s.role}</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmt(s.cases)}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmt(s.patients)}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[#10B981]">฿{fmt(s.sales)}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">฿{fmt(s.avgPerCase)}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{s.shiftHours > 0 ? `${s.shiftHours} ชม.` : "—"}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-sky-600">{s.shiftHours > 0 ? `฿${fmt(s.salesPerHour)}` : "—"}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{s.repeatRate}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="px-4 py-3">
                            <p className="text-[11px] text-slate-400">ยอดขาย = บิลที่ผูกกับ Visit ของผู้ดูแล (ตาม doctor_id) · ชม.เวร/ขาย/ชม. = วัด productivity จริงจาก GPS check-in (คนทำเวรน้อยแต่ขายได้มาก = มีประสิทธิภาพสูง) · Retention = % ลูกค้ากลับมา ≥2 ครั้ง</p>
                        </div>
                    </div>

                    {/* Outstanding Packages (Liabilities) */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <Pill className="h-4 w-4 text-pink-600" />
                            <h2 className="text-sm font-bold text-slate-800">คอสค้างใช้ (ภาระผูกพันล่วงหน้า)</h2>
                        </div>
                        <div className="grid grid-cols-3 gap-3 p-4">
                            <div className="rounded-xl bg-slate-50 p-3">
                                <div className="text-[10px] uppercase font-bold text-slate-500">คอสที่ยังใช้ไม่ครบ</div>
                                <div className="text-xl font-black text-slate-800">{fmt(outstandingPkg.count)}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                                <div className="text-[10px] uppercase font-bold text-slate-500">ครั้งคงเหลือรวม</div>
                                <div className="text-xl font-black text-slate-800">{fmt(outstandingPkg.totalRemainingSessions)}</div>
                            </div>
                            <div className="rounded-xl bg-pink-50 p-3">
                                <div className="text-[10px] uppercase font-bold text-pink-600">มูลค่าภาระผูกพัน</div>
                                <div className="text-xl font-black text-pink-700">฿{fmt(outstandingPkg.totalLiability)}</div>
                            </div>
                        </div>
                        {outstandingPkg.items.length === 0 ? (
                            <p className="text-center text-sm text-slate-400 pb-8">ไม่มีคอสค้างใช้</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/60">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            <th className="text-left px-4 py-2.5">ลูกค้า</th>
                                            <th className="text-left px-3 py-2.5">คอส</th>
                                            <th className="text-center px-3 py-2.5">ใช้/ทั้งหมด</th>
                                            <th className="text-right px-3 py-2.5">มูลค่าคงเหลือ</th>
                                            <th className="text-right px-4 py-2.5">หมดอายุ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {outstandingPkg.items.slice(0, 50).map((p, i) => (
                                            <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/40">
                                                <td className="px-4 py-2.5">
                                                    <Link href={`/dashboard/patients/${p.hn}`} className="font-bold text-slate-800 hover:text-[#2B54F0]">{p.patient_name}</Link>
                                                    <span className="ml-1.5 font-mono text-[10px] text-slate-400">{p.hn}</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-700">{p.package_name}</td>
                                                <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">{p.used_sessions}/{p.total_sessions}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-pink-700">฿{fmt(p.unearned)}</td>
                                                <td className="px-4 py-2.5 text-right text-[11px] text-slate-500">{formatDateThai(p.expires_at)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="px-4 py-3">
                            <p className="text-[11px] text-slate-400">มูลค่าคงเหลือ = ยอดที่จ่าย × (ครั้งคงเหลือ ÷ ครั้งทั้งหมด) — เงินที่รับมาแล้วแต่ยังต้องให้บริการในอนาคต อย่าหมุนจนลืมเผื่อต้นทุน</p>
                        </div>
                    </div>

                    {/* Inventory-Revenue margin */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-indigo-600" />
                            <h2 className="text-sm font-bold text-slate-800">กำไรขั้นต้นตามประเภท (Revenue − ต้นทุน)</h2>
                        </div>
                        {invMargin.byType.length === 0 ? (
                            <p className="text-center text-sm text-slate-400 py-8">ไม่มีรายการขายในช่วงนี้</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/60">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            <th className="text-left px-4 py-2.5">ประเภท</th>
                                            <th className="text-right px-3 py-2.5">รายได้</th>
                                            <th className="text-right px-3 py-2.5">ต้นทุน</th>
                                            <th className="text-right px-3 py-2.5">กำไรขั้นต้น</th>
                                            <th className="text-right px-4 py-2.5">Margin %</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invMargin.byType.map(r => (
                                            <tr key={r.type} className="border-t border-slate-100 hover:bg-slate-50/40">
                                                <td className="px-4 py-2.5">
                                                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${ITEM_TYPE_COLOR[r.type] || ITEM_TYPE_COLOR.other}`}>{ITEM_TYPE_LABEL[r.type] || r.type}</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">฿{fmt(r.revenue)}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums text-rose-500">฿{fmt(r.cogs)}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[#10B981]">฿{fmt(r.margin)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{r.marginPct}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-slate-200 font-black bg-slate-50/40">
                                            <td className="px-4 py-2.5">รวม</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">฿{fmt(invMargin.totals.revenue)}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-rose-600">฿{fmt(invMargin.totals.cogs)}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-[#10B981]">฿{fmt(invMargin.totals.margin)}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{invMargin.totals.marginPct}%</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                        <div className="px-4 py-3">
                            <p className="text-[11px] text-slate-400">ต้นทุน = cogs_amount (ต้นทุนยา/เวชภัณฑ์ ณ ตอนขาย) · ค่าบริการ/หัตถการ ต้นทุน=0 → กำไรเกือบเต็ม · กดปุ่ม Excel ด้านบนเพื่อ export รายตัวละเอียด</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── แท็บ การตลาด (Marketing) ── */}
            {tab === "marketing" && (
                <div className="space-y-4 animate-fade-in">
                    {/* Acquisition Source */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-[#2B54F0]" />
                            <h2 className="text-sm font-bold text-slate-800">ที่มาของลูกค้า (Acquisition Source)</h2>
                        </div>
                        <div className="p-4 space-y-2.5">
                            {acqSources.length === 0 ? (
                                <p className="text-center text-sm text-slate-400 py-4">ไม่มีข้อมูล visit ในช่วงนี้</p>
                            ) : acqSources.map(s => (
                                <div key={s.source} className="flex items-center gap-3">
                                    <span className="w-40 text-xs font-bold text-slate-600 shrink-0">{s.label}</span>
                                    <div className="flex-1 h-6 rounded-lg bg-slate-100 overflow-hidden">
                                        <div className="h-full bg-[#2B54F0]/80 rounded-lg flex items-center justify-end px-2" style={{ width: `${Math.max(s.pct, 4)}%` }}>
                                            <span className="text-[10px] font-bold text-white tabular-nums">{s.pct}%</span>
                                        </div>
                                    </div>
                                    <span className="w-12 text-right text-xs tabular-nums text-slate-500">{fmt(s.count)}</span>
                                </div>
                            ))}
                            <p className="text-[11px] text-slate-400 pt-1">จาก case_source ตอนเปิด Visit — ใช้ดูว่าช่องทางไหนพาลูกค้ามามากสุด เทียบกับงบยิงแอด</p>
                        </div>
                    </div>

                    {/* Consultation Conversion */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <Activity className="h-4 w-4 text-emerald-600" />
                            <h2 className="text-sm font-bold text-slate-800">อัตราปิดการขาย (Conversion)</h2>
                            <span className="text-xs text-slate-400">รวม {conversion.rate}% ({fmt(conversion.closedVisits)}/{fmt(conversion.totalVisits)} visit)</span>
                        </div>
                        {conversion.byDoctor.length === 0 ? (
                            <p className="text-center text-sm text-slate-400 py-8">ไม่มีข้อมูล visit ในช่วงนี้</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/60">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            <th className="text-left px-4 py-2.5">แพทย์</th>
                                            <th className="text-right px-3 py-2.5">Visit</th>
                                            <th className="text-right px-3 py-2.5">ปิดการขาย</th>
                                            <th className="text-right px-4 py-2.5">อัตราปิด</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {conversion.byDoctor.map(d => (
                                            <tr key={d.staff_id} className="border-t border-slate-100 hover:bg-slate-50/40">
                                                <td className="px-4 py-2.5 font-bold text-slate-700">{d.name}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmt(d.visits)}</td>
                                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmt(d.closed)}</td>
                                                <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${d.rate >= 50 ? "text-emerald-600" : d.rate >= 25 ? "text-amber-600" : "text-rose-500"}`}>{d.rate}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="px-4 py-3">
                            <p className="text-[11px] text-slate-400">ปิดการขาย = Visit ที่มีบิลชำระ &gt; 0 · ปรึกษาเยอะแต่ปิดน้อย = ทบทวนสคริปต์การขาย (กรองแผนกความงามด้วยปุ่ม BU ด้านบน)</p>
                        </div>
                    </div>

                    {/* Demographics */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                            <Users className="h-4 w-4 text-violet-600" />
                            <h2 className="text-sm font-bold text-slate-800">ข้อมูลประชากรลูกค้า (Demographics)</h2>
                            <span className="text-xs text-slate-400">{fmt(demographics.total)} ราย</span>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4 p-4">
                            <div>
                                <div className="text-xs font-bold text-slate-600 mb-2">เพศ</div>
                                <div className="space-y-2">
                                    {demographics.gender.map(g => (
                                        <div key={g.key} className="flex items-center gap-2">
                                            <span className="w-14 text-xs text-slate-500 shrink-0">{g.label}</span>
                                            <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
                                                <div className="h-full bg-violet-400 rounded" style={{ width: `${Math.max(g.pct, 3)}%` }} />
                                            </div>
                                            <span className="w-16 text-right text-[11px] tabular-nums text-slate-500">{g.pct}% ({g.count})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-bold text-slate-600 mb-2">ช่วงอายุ {demographics.withDob < demographics.total && <span className="font-normal text-slate-400">(มีวันเกิด {fmt(demographics.withDob)} ราย)</span>}</div>
                                <div className="space-y-2">
                                    {demographics.ageBuckets.map(a => (
                                        <div key={a.label} className="flex items-center gap-2">
                                            <span className="w-14 text-xs text-slate-500 shrink-0">{a.label} ปี</span>
                                            <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
                                                <div className="h-full bg-sky-400 rounded" style={{ width: `${Math.max(a.pct, 2)}%` }} />
                                            </div>
                                            <span className="w-16 text-right text-[11px] tabular-nums text-slate-500">{a.pct}% ({a.count})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="px-4 pb-4"><p className="text-[11px] text-slate-400">ใช้ตั้งกลุ่มเป้าหมายยิงแอดออนไลน์ให้แม่นขึ้น · ข้อมูลทั้งคลินิก (ไม่ผูกช่วงวันที่/แผนก)</p></div>
                    </div>
                </div>
            )}

            {/* Outstanding modal */}
            {showOutstanding && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={() => setShowOutstanding(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <div>
                                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-amber-600" /> ใบเสร็จค้างชำระ
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">{outstanding.length} ใบ · รวม ฿{fmt2(outstanding.reduce((s, o) => s + o.balance, 0))}</p>
                            </div>
                            <button onClick={() => setShowOutstanding(false)} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                                <X className="h-4 w-4 text-slate-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/60 sticky top-0">
                                    <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        <th className="text-left px-4 py-2">ใบเสร็จ</th>
                                        <th className="text-left px-4 py-2">คนไข้</th>
                                        <th className="text-right px-4 py-2">ค้าง</th>
                                        <th className="w-8"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {outstanding.map(o => (
                                        <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                                            <td className="px-4 py-2.5">
                                                <Link href={`/dashboard/finance/${o.id}`} className="font-mono text-[11px] text-cyan-600 hover:underline">
                                                    {o.id}
                                                </Link>
                                                <div className="text-[10px] text-slate-400">{formatDateThai(o.invoice_date)}</div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="font-medium text-slate-700">{o.patient_name}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">{o.hn}</div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <div className="font-bold text-amber-700 tabular-nums">฿{fmt2(o.balance)}</div>
                                                <div className="text-[10px] text-slate-400">{STATUS_LABEL[o.status] || o.status}</div>
                                            </td>
                                            <td className="px-2">
                                                <Link href={`/dashboard/finance/${o.id}`}>
                                                    <ChevronRight className="h-4 w-4 text-slate-400" />
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function PresetBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button onClick={onClick} className="h-8 px-3 rounded-lg text-xs font-bold text-slate-600 hover:bg-white hover:text-[#2B54F0] hover:shadow-sm transition-all">
            {children}
        </button>
    );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`h-9 px-4 rounded-lg text-sm font-bold transition-all ${active ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
        >
            {children}
        </button>
    );
}

function pctChange(cur: number, prev: number): number | null {
    if (!prev || prev === 0) return null;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function DeltaBadge({ delta }: { delta: number | null }) {
    if (delta === null) return <span className="text-[10px] text-slate-400">— เทียบช่วงก่อน</span>;
    const up = delta >= 0;
    return (
        <span className={`text-[10px] font-bold inline-flex items-center gap-0.5 ${up ? "text-emerald-600" : "text-rose-500"}`}>
            {up ? "▲" : "▼"} {Math.abs(delta)}% <span className="text-slate-400 font-normal">เทียบช่วงก่อน</span>
        </span>
    );
}

function StatCard({ icon: Icon, label, value, color, sub, delta }: {
    icon: React.ElementType;
    label: string;
    value: string;
    color: "emerald" | "amber" | "sky" | "violet";
    sub?: string;
    delta?: number | null;
}) {
    const styles = {
        emerald: { tile: "bg-[#10B981]/10", iconText: "text-[#10B981]", glow: "from-[#15FF83]/25 to-[#10B981]/5" },
        amber: { tile: "bg-amber-100", iconText: "text-amber-600", glow: "from-amber-200/30 to-orange-100/5" },
        sky: { tile: "bg-[#0EA5A0]/10", iconText: "text-[#0EA5A0]", glow: "from-[#00FFCC]/25 to-[#0EA5A0]/5" },
        violet: { tile: "bg-[#6366F1]/10", iconText: "text-[#6366F1]", glow: "from-[#6366F1]/20 to-[#8B5CF6]/5" },
    }[color];
    return (
        <div className="gonix-card-premium p-4 relative overflow-hidden">
            <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${styles.glow} blur-2xl pointer-events-none`} />
            <div className="relative">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${styles.tile}`}>
                    <Icon className={`h-5 w-5 ${styles.iconText}`} />
                </div>
                <div className="text-2xl font-extrabold text-slate-800 tabular-nums tracking-tight">{value}</div>
                <div className="text-sm font-medium text-slate-700 mt-0.5">{label}</div>
                {delta !== undefined
                    ? <div className="mt-0.5"><DeltaBadge delta={delta} /></div>
                    : sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
            </div>
        </div>
    );
}

function PeakHeatmap({ peak }: { peak: PeakHours }) {
    // ช่วงชั่วโมงที่จะแสดง = จากชั่วโมงแรกถึงชั่วโมงสุดท้ายที่มีข้อมูล (อย่างน้อย 8–19)
    let lo = 23, hi = 0;
    peak.byHour.forEach((c, h) => { if (c > 0) { if (h < lo) lo = h; if (h > hi) hi = h; } });
    if (lo > hi) { lo = 8; hi = 19; }
    lo = Math.min(lo, 8); hi = Math.max(hi, 19);
    const hours: number[] = [];
    for (let h = lo; h <= hi; h++) hours.push(h);

    const cellBg = (count: number) => {
        if (count === 0) return undefined;
        const ratio = peak.maxCell > 0 ? count / peak.maxCell : 0;
        return `rgba(2, 132, 199, ${(0.12 + 0.78 * ratio).toFixed(3)})`; // sky-600
    };

    return (
        <table className="border-separate" style={{ borderSpacing: 3 }}>
            <thead>
                <tr>
                    <th className="text-[10px] font-bold text-slate-400 text-right pr-2 sticky left-0 bg-white">วัน \ ชม.</th>
                    {hours.map(h => (
                        <th key={h} className="text-[10px] font-bold text-slate-500 w-8 text-center">{String(h).padStart(2, "0")}</th>
                    ))}
                    <th className="text-[10px] font-bold text-slate-400 text-center pl-2">รวม</th>
                </tr>
            </thead>
            <tbody>
                {peak.grid.map((row, day) => (
                    <tr key={day}>
                        <td className="text-[11px] font-bold text-slate-600 text-right pr-2 sticky left-0 bg-white">{DAYS_TH[day]}</td>
                        {hours.map(h => {
                            const c = row[h];
                            return (
                                <td key={h} title={`${DAYS_TH[day]} ${String(h).padStart(2, "0")}:00 · ${c} visit`}
                                    className="w-8 h-8 text-center align-middle rounded"
                                    style={{ background: cellBg(c) }}>
                                    <span className={`text-[10px] tabular-nums ${c > 0 ? (peak.maxCell > 0 && c / peak.maxCell > 0.55 ? "text-white font-bold" : "text-slate-700") : "text-slate-200"}`}>
                                        {c > 0 ? c : "·"}
                                    </span>
                                </td>
                            );
                        })}
                        <td className="text-[11px] font-bold text-slate-500 text-center pl-2 tabular-nums">{peak.byDay[day]}</td>
                    </tr>
                ))}
                <tr>
                    <td className="text-[10px] font-bold text-slate-400 text-right pr-2 sticky left-0 bg-white">รวม</td>
                    {hours.map(h => (
                        <td key={h} className="text-[10px] font-bold text-slate-500 text-center tabular-nums">{peak.byHour[h] || ""}</td>
                    ))}
                    <td className="text-[11px] font-black text-slate-700 text-center pl-2 tabular-nums">{peak.total}</td>
                </tr>
            </tbody>
        </table>
    );
}
