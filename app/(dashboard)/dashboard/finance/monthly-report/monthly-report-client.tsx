"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileBarChart, ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import type { MonthRow } from "@/lib/actions/monthly-report";

const n = (v: number) => v === 0 ? "—" : v.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const monthLabel = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("th-TH", { month: "short", year: "2-digit" }); };

type Col = { key: keyof MonthRow; label: string; cost?: boolean; hint?: string; link?: string };
const COLS: Col[] = [
    { key: "revMedical", label: "รายได้เวชกรรม", hint: "เงินรับจริง (ไม่รวมขายคอส) + คอสที่ใช้ + คอสหมดอายุ + นิรนาม" },
    { key: "revAesthetic", label: "รายได้ความงาม" },
    { key: "material", label: "ยาที่ใช้จริง", cost: true, link: "/dashboard/finance/procedure-costs" },
    { key: "doctorComp", label: "ค่าตอบแทนแพทย์", cost: true, hint: "ชั่วโมง × อัตรา + DF แพทย์" },
    { key: "handComm", label: "ค่ามือ + คอม", cost: true, hint: "ค่ามือ คอมแนะนำ คอมเซลล์ + คอมทีม (อนุมัติแล้ว)" },
    { key: "cardFee", label: "ค่าธรรมเนียมบัตร", cost: true, link: "/dashboard/finance/card-fees" },
    { key: "staffPay", label: "เงินเดือนพนักงาน", cost: true, link: "/dashboard/compensation" },
    { key: "fixed", label: "ต้นทุนคงที่", cost: true, link: "/dashboard/finance/fixed-costs" },
    { key: "waste", label: "ยาทิ้ง", cost: true, link: "/dashboard/inventory/waste" },
    { key: "marketing", label: "การตลาด", cost: true, hint: "ค่าแอด + ต้นทุนคงที่หมวดการตลาด + ค่ามือเคสรีวิว" },
    { key: "pettyCash", label: "รายจ่ายย่อย", cost: true },
];

export default function MonthlyReportClient({ report, currentYear }: { report: { year: number; rows: MonthRow[]; totals: MonthRow }; currentYear: number }) {
    const router = useRouter();
    const [withPlanned, setWithPlanned] = useState(false);
    const { year, rows, totals } = report;
    const adj = (r: MonthRow) => withPlanned ? r.profit - r.fixedPlanned : r.profit;
    let cum = 0;
    const cums = rows.map(r => (cum += adj(r)));

    function exportCsv() {
        const head = ["เดือน", ...COLS.map(c => c.label), ...(withPlanned ? ["วางแผน"] : []), "กำไรก่อนภาษี", "กำไรสะสม", "เงินรับค่าคอส(ยังไม่เป็นรายได้)"];
        const lines = rows.map((r, i) => [r.month, ...COLS.map(c => r[c.key]), ...(withPlanned ? [r.fixedPlanned] : []), adj(r), cums[i], r.courseCash].join(","));
        const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `monthly-report-${year}.csv`; a.click();
    }

    return (
        <div className="max-w-[1400px] mx-auto p-3 sm:p-6 space-y-4 pb-24 print:p-0">
            <div className="flex items-center gap-3 flex-wrap print:hidden">
                <FileBarChart className="h-5 w-5 text-blue-700" />
                <div className="flex-1 min-w-[220px]">
                    <h1 className="text-lg font-bold text-slate-800">รายงานรายเดือน</h1>
                    <p className="text-xs text-slate-500">เดือนปฏิทิน · รายได้นับเมื่อให้บริการ (ขายคอส = รับรู้ตอนใช้/หมดอายุ) · คลินิกเดียว ไม่แยกฝั่ง</p>
                </div>
                <div className="inline-flex items-center gap-1">
                    <button onClick={() => router.push(`/dashboard/finance/monthly-report?year=${year - 1}`)} className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center" aria-label="ปีก่อน"><ChevronLeft className="h-4 w-4" /></button>
                    <span className="px-3 text-sm font-bold tabular-nums">{year + 543}</span>
                    <button onClick={() => router.push(`/dashboard/finance/monthly-report?year=${year + 1}`)} disabled={year >= currentYear} className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center disabled:opacity-40" aria-label="ปีถัดไป"><ChevronRight className="h-4 w-4" /></button>
                </div>
                <label className="text-xs text-slate-600 inline-flex items-center gap-1"><input type="checkbox" checked={withPlanned} onChange={e => setWithPlanned(e.target.checked)} /> รวมรายการ &quot;วางแผน&quot; (สถานการณ์สมมติ)</label>
                <button onClick={exportCsv} className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" /> CSV</button>
                <button onClick={() => window.print()} className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold inline-flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> พิมพ์</button>
            </div>
            <h1 className="hidden print:block text-base font-bold">รายงานรายเดือน ปี {year + 543}</h1>

            {rows.length === 0 ? <div className="p-10 text-center text-slate-400">ยังไม่มีข้อมูลปีนี้</div> : (
                <section className="rounded-2xl bg-white border border-slate-200 overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                            <tr>
                                <th className="text-left px-2 py-2 sticky left-0 bg-slate-50">เดือน</th>
                                {COLS.map(c => (
                                    <th key={c.key} title={c.hint} className={`text-right px-2 py-2 whitespace-nowrap ${c.cost ? "" : "text-emerald-700"}`}>
                                        {c.link ? <Link href={c.link} className="hover:underline">{c.label}</Link> : c.label}
                                    </th>
                                ))}
                                {withPlanned && <th className="text-right px-2 py-2 whitespace-nowrap">วางแผน</th>}
                                <th className="text-right px-2 py-2 whitespace-nowrap text-slate-800">กำไรก่อนภาษี</th>
                                <th className="text-right px-2 py-2 whitespace-nowrap text-slate-800">กำไรสะสม</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={r.month} className="border-t border-slate-100">
                                    <td className="px-2 py-2 font-semibold whitespace-nowrap sticky left-0 bg-white">{monthLabel(r.month)}</td>
                                    {COLS.map(c => (
                                        <td key={c.key} className={`px-2 py-2 text-right tabular-nums ${c.cost ? "text-slate-600" : "text-emerald-700 font-semibold"}`}>
                                            {n(r[c.key] as number)}
                                            {c.key === "handComm" && !r.teamApproved && <span className="text-amber-600" title="คอมทีมเดือนนี้ยังไม่อนุมัติ — ยังไม่รวม">*</span>}
                                        </td>
                                    ))}
                                    {withPlanned && <td className="px-2 py-2 text-right tabular-nums text-slate-400">{n(r.fixedPlanned)}</td>}
                                    <td className={`px-2 py-2 text-right tabular-nums font-bold ${adj(r) < 0 ? "text-rose-600" : "text-slate-800"}`}>{n(adj(r))}</td>
                                    <td className={`px-2 py-2 text-right tabular-nums ${cums[i] < 0 ? "text-rose-600" : "text-slate-700"}`}>{n(cums[i])}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-50 font-bold">
                            <tr className="border-t-2 border-slate-200">
                                <td className="px-2 py-2 sticky left-0 bg-slate-50">รวม</td>
                                {COLS.map(c => <td key={c.key} className="px-2 py-2 text-right tabular-nums">{n(totals[c.key] as number)}</td>)}
                                {withPlanned && <td className="px-2 py-2 text-right tabular-nums">{n(totals.fixedPlanned)}</td>}
                                <td className="px-2 py-2 text-right tabular-nums">{n(withPlanned ? totals.profit - totals.fixedPlanned : totals.profit)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </section>
            )}

            <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-500">
                <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-1">
                    <div className="font-bold text-slate-700">ข้อมูลประกอบ</div>
                    <div>เงินรับค่าคอสทั้งปี (ยังไม่เป็นรายได้จนกว่าจะใช้): <b className="tabular-nums text-slate-700">฿{totals.courseCash.toLocaleString()}</b></div>
                    <div>รายได้จากคอสหมดอายุ (รวมในรายได้แล้ว): <b className="tabular-nums text-slate-700">฿{totals.breakage.toLocaleString()}</b></div>
                </div>
                <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-1">
                    <div className="font-bold text-slate-700">หมายเหตุ</div>
                    <div>* คอมทีมเดือนที่ยังไม่อนุมัติยังไม่รวม · ต้นทุนยา = ราคาทุน ณ วันออกบิล (บิลก่อนเปิดระบบประเมินจากราคาปัจจุบัน)</div>
                    <div>ตัวเลขเพื่อบริหาร — งบการเงินจริงยืนยันกับสำนักงานบัญชี</div>
                </div>
            </div>
        </div>
    );
}
