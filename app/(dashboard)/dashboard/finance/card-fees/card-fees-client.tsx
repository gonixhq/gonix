"use client";

import Link from "next/link";
import { ArrowLeft, CreditCard, Download, Printer, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import type { CardFeeReport } from "@/lib/actions/card-fee-report";

const money = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
const shiftMonth = (m: string, d: number) => { const [y, mo] = m.split("-").map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return t.toISOString().slice(0, 7); };
const dt = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export default function CardFeesClient({ report: r }: { report: CardFeeReport }) {
    const go = (m: string) => window.location.assign(`/dashboard/finance/card-fees?month=${m}`);

    function exportCsv() {
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [
            ["วันที่รับเงิน", "เลขบิล", "ประเภทบัตร", "ยอดรูด", "MDR %", "ค่าธรรมเนียม (รวม VAT)", "เลขอ้างอิง"].map(esc).join(","),
            ...r.rows.map((x) => [dt(x.paid_at), x.inv_id, x.card, x.amount.toFixed(2), x.rate ?? "", x.fee.toFixed(2), x.ref || ""].map(esc).join(",")),
        ];
        const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `card-fees-${r.month}.csv`; a.click(); URL.revokeObjectURL(a.href);
    }

    return (
        <div className="space-y-4 max-w-5xl mx-auto animate-fade-in p-3 sm:p-6 pb-24">
            <div className="rounded-2xl bg-white/85 border border-white/90 p-4 shadow-sm flex items-center gap-3 flex-wrap no-print">
                <Link href="/dashboard/finance" className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50"><ArrowLeft className="h-4 w-4 text-slate-500" /></Link>
                <CreditCard className="h-5 w-5 text-blue-700" />
                <div className="flex-1 min-w-[160px]">
                    <h1 className="text-base font-bold text-slate-800">ค่าธรรมเนียมบัตร — {monthLabel(r.month)}</h1>
                    <p className="text-xs text-slate-500">ใช้กระทบยอดกับ statement ร้านค้า · คิดตามวันที่รับเงิน · ไม่รวมบิลที่ยกเลิก</p>
                </div>
                <div className="inline-flex items-center gap-1">
                    <button onClick={() => go(shiftMonth(r.month, -1))} className="h-9 w-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center" aria-label="เดือนก่อน"><ChevronLeft className="h-4 w-4" /></button>
                    <input type="month" value={r.month} onChange={(e) => e.target.value && go(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
                    <button onClick={() => go(shiftMonth(r.month, 1))} className="h-9 w-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center" aria-label="เดือนถัดไป"><ChevronRight className="h-4 w-4" /></button>
                </div>
                <button onClick={exportCsv} className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-bold inline-flex items-center gap-1 hover:bg-slate-50"><Download className="h-4 w-4" /> CSV</button>
                <button onClick={() => window.print()} className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-bold inline-flex items-center gap-1 hover:bg-slate-50"><Printer className="h-4 w-4" /> พิมพ์</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[["ยอดรูดบัตรรวม", money(r.totals.amount), `${r.totals.count} รายการ`],
                  ["ค่าธรรมเนียม (MDR)", money(r.totals.fee), ""],
                  ["VAT ค่าธรรมเนียม", money(r.totals.vat), r.vatEnabled ? "ขอคืนได้ (จด VAT)" : "นับเป็นต้นทุน"],
                  ["ต้นทุนจริง", money(r.totals.cost), `อัตราเฉลี่ยจริง ${r.totals.effectivePct}%`]].map(([l, v, s]) => (
                    <div key={l} className="rounded-2xl bg-white/85 border border-white/90 p-4 shadow-sm">
                        <div className="text-xs text-slate-500">{l}</div>
                        <div className="text-xl font-black tabular-nums text-slate-800 mt-1">{v}</div>
                        {s && <div className="text-[11px] text-slate-400 mt-0.5">{s}</div>}
                    </div>
                ))}
            </div>

            {r.unspecifiedCount > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>มี {r.unspecifiedCount} รายการที่ไม่ได้ระบุประเภทบัตร (บิลก่อนเริ่มระบบนี้) — คิดค่าธรรมเนียมโดยประมาณด้วยอัตราเครดิตในประเทศ ถ้าต้องการให้ตรง ให้แก้ประเภทบัตรที่หน้าใบเสร็จ (ปุ่ม "แก้วิธี")</span>
                </div>
            )}

            <section className="rounded-2xl bg-white/85 border border-white/90 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 text-sm font-bold text-slate-800">แยกตามประเภทบัตร</div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                            <th className="text-left px-4 py-2">ประเภทบัตร</th><th className="text-right px-3 py-2">รายการ</th><th className="text-right px-3 py-2">ยอดรูด</th>
                            <th className="text-right px-3 py-2">ค่าธรรมเนียม</th><th className="text-right px-3 py-2">VAT</th><th className="text-right px-3 py-2">รวม</th><th className="text-right px-4 py-2">อัตราจริง</th>
                        </tr></thead>
                        <tbody>
                            {r.groups.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">ไม่มีการรับเงินด้วยบัตรในเดือนนี้</td></tr> : r.groups.map((g) => (
                                <tr key={g.key} className="border-t border-slate-100">
                                    <td className="px-4 py-2 font-medium text-slate-700">{g.label}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{g.count}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{money(g.amount)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{money(g.fee)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{money(g.vat)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-rose-600">{money(g.total)}</td>
                                    <td className="px-4 py-2 text-right tabular-nums">{g.effectivePct}%</td>
                                </tr>
                            ))}
                        </tbody>
                        {r.groups.length > 0 && <tfoot className="bg-slate-50 font-bold"><tr>
                            <td className="px-4 py-2">รวม</td><td className="px-3 py-2 text-right">{r.totals.count}</td><td className="px-3 py-2 text-right tabular-nums">{money(r.totals.amount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(r.totals.fee)}</td><td className="px-3 py-2 text-right tabular-nums">{money(r.totals.vat)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-rose-600">{money(r.totals.total)}</td><td className="px-4 py-2 text-right">{r.totals.effectivePct}%</td>
                        </tr></tfoot>}
                    </table>
                </div>
                {r.refunds.count > 0 && <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100">คืนเงินผ่านบัตร {r.refunds.count} รายการ รวม {money(Math.abs(r.refunds.amount))} (ไม่คิดค่าธรรมเนียม — ตรวจกับ statement ว่าธนาคารคืน MDR หรือไม่)</p>}
            </section>

            {r.installments.length > 0 && (
                <section className="rounded-2xl bg-white/85 border border-white/90 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                        <div className="text-sm font-bold text-slate-800">ผ่อนผ่านบัตรกสิกร</div>
                        <div className="text-xs text-slate-500">ดอกเบี้ยลูกค้าเป็นผู้จ่าย ไม่ใช่ต้นทุนคลินิก — แสดงเพื่อรายงานเท่านั้น</div>
                    </div>
                    <div className="overflow-x-auto"><table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="text-left px-4 py-2">วันที่</th><th className="text-left px-3 py-2">บิล</th><th className="text-right px-3 py-2">ยอด</th><th className="text-right px-3 py-2">งวด</th><th className="text-right px-4 py-2">ดอกเบี้ยลูกค้า (โดยประมาณ)</th></tr></thead>
                        <tbody>{r.installments.map((x, i) => (
                            <tr key={i} className="border-t border-slate-100">
                                <td className="px-4 py-2 text-slate-600">{dt(x.paid_at)}</td>
                                <td className="px-3 py-2"><Link href={x.anonId ? `/dashboard/anonymous/${x.anonId}` : `/dashboard/finance/${x.inv_id}`} className="font-mono text-xs text-blue-700 hover:underline">{x.inv_id}</Link></td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(x.amount)}</td>
                                <td className="px-3 py-2 text-right">{x.months} เดือน</td>
                                <td className="px-4 py-2 text-right tabular-nums text-slate-600">{money(x.customerInterest)} <span className="text-[11px] text-slate-400">({x.interestPctMonth}%/ด.)</span></td>
                            </tr>
                        ))}</tbody>
                    </table></div>
                </section>
            )}

            <section className="rounded-2xl bg-white/85 border border-white/90 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 text-sm font-bold text-slate-800">รายการรับเงินด้วยบัตร ({r.rows.length})</div>
                <div className="overflow-x-auto max-h-[480px]"><table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 sticky top-0"><tr><th className="text-left px-4 py-2">วันที่</th><th className="text-left px-3 py-2">บิล</th><th className="text-left px-3 py-2">บัตร</th><th className="text-right px-3 py-2">ยอดรูด</th><th className="text-right px-3 py-2">MDR</th><th className="text-right px-3 py-2">ค่าธรรมเนียม</th><th className="text-left px-4 py-2">อ้างอิง</th></tr></thead>
                    <tbody>{r.rows.map((x, i) => (
                        <tr key={i} className="border-t border-slate-100">
                            <td className="px-4 py-1.5 text-slate-600">{dt(x.paid_at)}</td>
                            <td className="px-3 py-1.5"><Link href={x.anonId ? `/dashboard/anonymous/${x.anonId}` : `/dashboard/finance/${x.inv_id}`} className="font-mono text-xs text-blue-700 hover:underline">{x.inv_id}</Link></td>
                            <td className="px-3 py-1.5 text-slate-600">{x.card}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{money(x.amount)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{x.rate != null ? `${x.rate}%` : "—"}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-rose-600">{money(x.fee)}</td>
                            <td className="px-4 py-1.5 font-mono text-xs text-slate-500">{x.ref || "—"}</td>
                        </tr>
                    ))}</tbody>
                </table></div>
            </section>
            <style>{`@media print { .no-print { display: none !important; } }`}</style>
        </div>
    );
}
