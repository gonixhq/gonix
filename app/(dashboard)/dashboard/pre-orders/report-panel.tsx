"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { getPreOrderReport, type PreOrderReport, type FunnelRow } from "@/lib/actions/pre-order";

const CHANNEL_LABEL: Record<string, string> = { line_oa: "LINE OA", tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram", walk_in: "Walk-in", phone: "โทรศัพท์", other: "อื่นๆ" };
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round(a / b * 100)}%` : "—");
const bkk = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

// รายงาน จอง → มัดจำ → นัด → มาจริง → รักษา แยกช่องทาง + no-show + มัดจำค้าง
export default function ReportPanel() {
    const today = bkk(new Date());
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [data, setData] = useState<PreOrderReport | null>(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true); setErr("");
        getPreOrderReport(from, to).then(r => { if ("ok" in r && r.ok === false) setErr(r.error); else setData(r as PreOrderReport); }).finally(() => setLoading(false));
    }, [from, to]);

    const preset = (days: number | "month" | "year") => {
        const now = new Date();
        if (days === "month") { setFrom(`${today.slice(0, 7)}-01`); setTo(today); return; }
        if (days === "year") { setFrom(`${today.slice(0, 4)}-01-01`); setTo(today); return; }
        const d = new Date(now); d.setDate(d.getDate() - days); setFrom(bkk(d)); setTo(today);
    };

    const Row = ({ r, bold }: { r: FunnelRow; bold?: boolean }) => (
        <tr className={`border-t border-slate-100 ${bold ? "bg-slate-50 font-bold" : ""}`}>
            <td className="px-3 py-2">{CHANNEL_LABEL[r.channel] || r.channel}</td>
            <td className="px-2 py-2 text-right tabular-nums">{r.created}</td>
            <td className="px-2 py-2 text-right tabular-nums">{r.deposited} <span className="text-[10px] text-slate-400">{pct(r.deposited, r.created)}</span></td>
            <td className="px-2 py-2 text-right tabular-nums">{r.scheduled}</td>
            <td className="px-2 py-2 text-right tabular-nums">{r.arrived} <span className="text-[10px] text-slate-400">{pct(r.arrived, r.deposited)}</span></td>
            <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{r.completed}</td>
            <td className="px-2 py-2 text-right tabular-nums text-rose-600">{r.noShow || "—"}</td>
            <td className="px-2 py-2 text-right tabular-nums text-slate-500">{r.cancelled + r.expired || "—"}</td>
            <td className="px-2 py-2 text-right tabular-nums">{baht(r.depositAmount)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{baht(r.revenue)}</td>
        </tr>
    );

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                <TrendingUp className="h-4 w-4 text-blue-700" />
                <input type="date" value={from} onChange={e => e.target.value && setFrom(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
                <span className="text-slate-400">–</span>
                <input type="date" value={to} onChange={e => e.target.value && setTo(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
                {([["30 วัน", 30], ["เดือนนี้", "month"], ["ปีนี้", "year"]] as const).map(([l, v]) => (
                    <button key={l} onClick={() => preset(v)} className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50">{l}</button>
                ))}
                <span className="text-[11px] text-slate-400">นับตามวันที่สร้างการจอง</span>
            </div>

            {loading ? <div className="gonix-card-premium py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            : err ? <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>
            : data && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Card label="การจองทั้งหมด" value={String(data.total.created)} sub={`จ่ายมัดจำ ${data.total.deposited} (${pct(data.total.deposited, data.total.created)})`} />
                        <Card label="มาจริง / รักษาแล้ว" value={`${data.total.arrived} / ${data.total.completed}`} sub={`อัตรามาจริง ${pct(data.total.arrived, data.total.deposited)} ของที่จ่ายมัดจำ`} />
                        <Card label="No-show (เลยวันนัด)" value={String(data.total.noShow)} sub={`ยกเลิก/หมดอายุ ${data.total.cancelled + data.total.expired}`} warn={data.total.noShow > 0} />
                        <Card label="มัดจำค้าง (ทั้งคลินิก ตอนนี้)" value={baht(data.outstandingDeposit)} sub={`${data.outstandingCount} การจอง · เครดิตลูกค้า ${baht(data.creditBalance)}`} />
                    </div>
                    <div className="gonix-card-premium overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/70 text-[11px] font-bold text-slate-500">
                                <tr>
                                    <th className="text-left px-3 py-2">ช่องทาง</th><th className="text-right px-2 py-2">จอง</th><th className="text-right px-2 py-2">มัดจำ</th>
                                    <th className="text-right px-2 py-2">นัดแล้ว</th><th className="text-right px-2 py-2">มาจริง</th><th className="text-right px-2 py-2">รักษาแล้ว</th>
                                    <th className="text-right px-2 py-2">No-show</th><th className="text-right px-2 py-2">ยกเลิก/หมดอายุ</th>
                                    <th className="text-right px-2 py-2">ยอดมัดจำ</th><th className="text-right px-3 py-2">รายได้จากการจอง</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 ? <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400">ไม่มีการจองในช่วงนี้</td></tr>
                                    : data.rows.map(r => <Row key={r.channel} r={r} />)}
                                {data.rows.length > 1 && <Row r={data.total} bold />}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[11px] text-slate-400">No-show = ถึงวันนัดแล้วแต่ยังไม่เช็คอิน · รายได้ = ยอดบิลของการจองที่รักษาเสร็จ · เครดิตลูกค้า = มัดจำจากการจองที่ยกเลิก/หมดอายุ/จ่ายเกิน (ใช้หักบิลได้ที่ห้องยา)</p>
                </>
            )}
        </div>
    );
}

function Card({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
    return (
        <div className="gonix-card-premium p-4">
            <div className="text-xs text-slate-500 font-semibold">{label}</div>
            <div className={`text-2xl font-black tabular-nums ${warn ? "text-rose-600" : "text-slate-800"}`}>{value}</div>
            {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
        </div>
    );
}
