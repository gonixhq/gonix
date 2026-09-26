"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calculator, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import type { ProcedureCostReport } from "@/lib/actions/procedure-costs";
import { SEGMENT_LABEL } from "@/lib/segments";

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };

export default function ProcedureCostsClient({ report: r }: { report: ProcedureCostReport }) {
    const router = useRouter();
    const [tab, setTab] = useState<"std" | "actual">("std");
    const [onlyLow, setOnlyLow] = useState(false);
    const go = (m: string) => router.push(`/dashboard/finance/procedure-costs?month=${m}`);
    const std = useMemo(() => onlyLow ? r.std.filter(s => s.margin < r.threshold) : r.std, [r, onlyLow]);
    const lowCount = r.std.filter(s => s.price > 0 && s.margin < r.threshold).length;
    const mCls = (m: number) => m < r.threshold ? "text-rose-600 font-bold" : "text-emerald-700 font-semibold";

    return (
        <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4 pb-24">
            <div className="flex items-center gap-3 flex-wrap">
                <Calculator className="h-5 w-5 text-blue-700" />
                <div className="flex-1 min-w-[220px]">
                    <h1 className="text-lg font-bold text-slate-800">ต้นทุน & มาร์จิ้นหัตถการ</h1>
                    <p className="text-xs text-slate-500">เกณฑ์มาร์จิ้น {r.threshold}% · ค่าชั่วโมงแพทย์ {baht(r.doctorRate)} · DF แพทย์ {r.dfPct}% — แก้ได้ที่ <Link href="/dashboard/settings/finance-rates" className="underline">อัตราการเงิน</Link></p>
                </div>
                <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
                    <button onClick={() => setTab("std")} className={`px-3 h-8 rounded-lg text-xs font-bold ${tab === "std" ? "bg-white shadow text-blue-700" : "text-slate-500"}`}>ต้นทุนมาตรฐานรายเมนู</button>
                    <button onClick={() => setTab("actual")} className={`px-3 h-8 rounded-lg text-xs font-bold ${tab === "actual" ? "bg-white shadow text-blue-700" : "text-slate-500"}`}>จริงจากบิลรายเดือน</button>
                </div>
            </div>

            {tab === "std" ? (
                <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-700 flex-1">ต้นทุนต่อ 1 ครั้ง (ตามสูตร/ค่าที่ตั้งไว้)</span>
                        {lowCount > 0 && <span className="text-xs text-rose-600 inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> ต่ำกว่าเกณฑ์ {lowCount} เมนู</span>}
                        <label className="text-xs text-slate-600 inline-flex items-center gap-1"><input type="checkbox" checked={onlyLow} onChange={e => setOnlyLow(e.target.checked)} /> เฉพาะที่ต่ำกว่าเกณฑ์</label>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500">
                                <tr>
                                    <th className="text-left px-3 py-2">เมนู</th>
                                    <th className="text-right px-3 py-2">ราคา</th>
                                    <th className="text-right px-3 py-2">ยา/วัสดุ</th>
                                    <th className="text-right px-3 py-2">ค่ามือ</th>
                                    <th className="text-right px-3 py-2 hidden md:table-cell">ชม.แพทย์</th>
                                    <th className="text-right px-3 py-2 hidden md:table-cell">DF</th>
                                    <th className="text-right px-3 py-2">ต้นทุนรวม</th>
                                    <th className="text-right px-3 py-2">มาร์จิ้น</th>
                                </tr>
                            </thead>
                            <tbody>
                                {std.map(s => (
                                    <tr key={`${s.kind}-${s.id}`} className="border-t border-slate-100">
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-slate-800">{s.name}</div>
                                            <div className="text-[11px] text-slate-400">
                                                {s.kind === "package" ? "คอส" : "บริการ"}{s.segment ? ` · ${SEGMENT_LABEL[s.segment] || s.segment}` : ""}
                                                {s.missing.length > 0 && <span className="text-amber-600"> · ยังไม่ตั้ง{s.missing.join("/")}</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">{baht(s.price)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{baht(s.material)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{baht(s.hand)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-600 hidden md:table-cell">{s.doctorTime ? baht(s.doctorTime) : "—"}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-600 hidden md:table-cell">{s.df ? baht(s.df) : "—"}</td>
                                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{baht(s.cost)}</td>
                                        <td className={`px-3 py-2 text-right tabular-nums ${s.price > 0 ? mCls(s.margin) : "text-slate-400"}`}>{s.price > 0 ? `${s.margin}%` : "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="px-4 py-2 text-[11px] text-slate-400">ตั้งสูตรยา/วัสดุ + ชม.แพทย์ ที่ <Link href="/dashboard/settings/services" className="underline">เมนูบริการ</Link> · คอสตั้งค่ามือ/ต้นทุนวัสดุที่หน้าคอส · DF คิดเมื่อเมนูมีชม.แพทย์ · ไม่รวมค่าธรรมเนียมบัตร (ขึ้นกับวิธีจ่าย)</p>
                </section>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        <button onClick={() => go(shiftMonth(r.month, -1))} className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center" aria-label="เดือนก่อน"><ChevronLeft className="h-4 w-4" /></button>
                        <input type="month" value={r.month} onChange={e => e.target.value && go(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
                        <button onClick={() => go(shiftMonth(r.month, 1))} className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center" aria-label="เดือนถัดไป"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Card label="รายได้สุทธิ (บิลเดือนนี้ ไม่รวมขายคอส)" value={baht(r.actualTotals.revenue)} />
                        <Card label="ต้นทุนตรง (ยา/วัสดุ + ค่ามือ + DF)" value={baht(r.actualTotals.cost)} />
                        <Card label="มาร์จิ้นเฉลี่ย" value={`${r.actualTotals.margin}%`} warn={r.actualTotals.margin < r.threshold} />
                        <Card label={`ตัดคอส ${r.courseUsage.sessions} ครั้ง — ต้นทุนที่เกิด`} value={baht(r.courseUsage.material + r.courseUsage.hand)} hint={`วัสดุ ${baht(r.courseUsage.material)} · ค่ามือ ${baht(r.courseUsage.hand)}`} />
                    </div>
                    <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs text-slate-500">
                                    <tr>
                                        <th className="text-left px-3 py-2">รายการ</th>
                                        <th className="text-right px-3 py-2">จำนวน</th>
                                        <th className="text-right px-3 py-2">รายได้สุทธิ</th>
                                        <th className="text-right px-3 py-2">ยา/วัสดุ</th>
                                        <th className="text-right px-3 py-2">ค่ามือ</th>
                                        <th className="text-right px-3 py-2">DF</th>
                                        <th className="text-right px-3 py-2">มาร์จิ้น</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {r.actual.length === 0 ? (
                                        <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">ไม่มีบิลในเดือนนี้</td></tr>
                                    ) : r.actual.map(a => (
                                        <tr key={a.name} className="border-t border-slate-100">
                                            <td className="px-3 py-2 text-slate-800">{a.name}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{a.qty.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{baht(a.revenue)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{baht(a.material)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{baht(a.hand)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{baht(a.df)}</td>
                                            <td className={`px-3 py-2 text-right tabular-nums ${a.revenue > 0 ? mCls(a.margin) : "text-slate-400"}`}>{a.revenue > 0 ? `${a.margin}%` : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="px-4 py-2 text-[11px] text-slate-400">ต้นทุนยา/วัสดุ = ราคาทุน ณ วันออกบิล (บิลก่อนเปิดใช้ระบบนี้ประเมินด้วยราคาทุนปัจจุบัน) · นับตามวันลงบัญชี · ไม่รวมบิลยกเลิก</p>
                    </section>
                </>
            )}
        </div>
    );
}

function Card({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
    return (
        <div className="rounded-2xl bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`text-xl font-black tabular-nums ${warn ? "text-rose-600" : "text-slate-800"}`}>{value}</div>
            {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
        </div>
    );
}
