"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Calendar, ArrowLeft, Target, Loader2, Save } from "lucide-react";
import { upsertAdSpend } from "@/lib/actions/marketing";
import { AD_CHANNELS, type CacRow, type AdSpendRow } from "@/lib/marketing-constants";

const baht = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
function monthLabel(m: string) { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" }); }
function shiftMonth(m: string, d: number) { const [y, mo] = m.split("-").map(Number); const dt = new Date(y, mo - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; }
const CH_LABEL: Record<string, string> = { facebook: "Facebook Ads", google: "Google Ads", tiktok: "TikTok Ads", other: "โฆษณาอื่นๆ" };

export default function CacClient({ month, report, spend, canManage }: { month: string; report: { rows: CacRow[]; totalSpend: number; totalNew: number }; spend: AdSpendRow[]; canManage: boolean }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const spendByCh: Record<string, AdSpendRow> = {};
    spend.forEach(s => { spendByCh[s.channel] = s; });

    const [form, setForm] = useState<Record<string, { amount: number; new_customers: number }>>(() => {
        const o: Record<string, { amount: number; new_customers: number }> = {};
        AD_CHANNELS.forEach(c => { o[c] = { amount: spendByCh[c]?.amount ?? 0, new_customers: spendByCh[c]?.new_customers ?? 0 }; });
        return o;
    });
    const set = (ch: string, k: "amount" | "new_customers", v: number) => setForm(f => ({ ...f, [ch]: { ...f[ch], [k]: v } }));

    function saveCh(ch: string) {
        start(async () => {
            const r = await upsertAdSpend(month, ch, form[ch].amount, form[ch].new_customers);
            if (!r.success) alert(r.error || "บันทึกไม่สำเร็จ");
            router.refresh();
        });
    }

    const bestCac = report.rows.filter(r => r.cac !== null).sort((a, b) => (a.cac! - b.cac!))[0];

    return (
        <div className="space-y-5 animate-fade-in max-w-4xl mx-auto pb-10">
            <Link href={`/dashboard/affiliates?month=${month}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> กลับหน้าเซลล์</Link>

            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Target className="h-6 w-6 text-[#2B54F0]" /> ต้นทุนต่อลูกค้าใหม่ (CAC)</h1>
                    <p className="text-xs text-slate-500 mt-1">{monthLabel(month)} · เทียบช่องเซลล์ฟรีแลนซ์ vs ค่าโฆษณา</p>
                </div>
                <div className="flex items-center gap-1.5">
                    <Link href={`/dashboard/affiliates/cac?month=${shiftMonth(month, -1)}`}><button className="h-9 w-9 rounded-lg border border-slate-300 bg-white flex items-center justify-center"><ChevronLeft className="h-4 w-4" /></button></Link>
                    <div className="px-3 h-9 rounded-lg border border-slate-300 bg-white flex items-center gap-2 font-bold text-sm"><Calendar className="h-4 w-4 text-slate-500" />{monthLabel(month)}</div>
                    <Link href={`/dashboard/affiliates/cac?month=${shiftMonth(month, 1)}`}><button className="h-9 w-9 rounded-lg border border-slate-300 bg-white flex items-center justify-center"><ChevronRight className="h-4 w-4" /></button></Link>
                </div>
            </div>

            {/* กรอกค่าโฆษณา (เฉพาะผู้มีสิทธิ์จัดการ) */}
            {canManage && (
            <div className="gonix-card-premium p-5">
                <div className="font-bold text-slate-800 text-sm mb-3">กรอกค่าโฆษณา + ลูกค้าใหม่ต่อช่องทาง</div>
                <div className="space-y-2">
                    {AD_CHANNELS.map(ch => (
                        <div key={ch} className="flex flex-wrap items-center gap-2">
                            <span className="w-28 text-sm font-bold text-slate-600">{CH_LABEL[ch]}</span>
                            <label className="text-xs text-slate-400">ค่าโฆษณา</label>
                            <input type="number" min={0} value={form[ch].amount} onChange={e => set(ch, "amount", Number(e.target.value))}
                                className="h-9 w-32 rounded-lg border border-slate-200 px-2.5 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30" />
                            <label className="text-xs text-slate-400">ลูกค้าใหม่</label>
                            <input type="number" min={0} value={form[ch].new_customers} onChange={e => set(ch, "new_customers", Number(e.target.value))}
                                className="h-9 w-20 rounded-lg border border-slate-200 px-2.5 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30" />
                            <span className="text-xs text-slate-500 w-28">CAC {form[ch].new_customers > 0 ? baht(Math.round(form[ch].amount / form[ch].new_customers * 100) / 100) : "—"}</span>
                            <button onClick={() => saveCh(ch)} disabled={pending} className="h-9 px-2.5 rounded-lg bg-[#2B54F0] text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
                                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} บันทึก
                            </button>
                        </div>
                    ))}
                </div>
            </div>
            )}

            {/* ตารางเปรียบเทียบ CAC */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-800 text-sm">เปรียบเทียบ CAC ตามช่องทาง</div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50/60">
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <th className="text-left px-4 py-2.5">ช่องทาง</th>
                                <th className="text-right px-4 py-2.5">ต้นทุน</th>
                                <th className="text-center px-4 py-2.5">ลูกค้าใหม่</th>
                                <th className="text-right px-4 py-2.5">CAC</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.rows.map(r => (
                                <tr key={r.channel} className={`border-t border-slate-100 ${bestCac && r.channel === bestCac.channel ? "bg-emerald-50/40" : ""}`}>
                                    <td className="px-4 py-2.5 font-bold text-slate-700">
                                        {r.label}
                                        {r.is_auto && <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700">auto</span>}
                                        {bestCac && r.channel === bestCac.channel && <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">คุ้มสุด</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{baht(r.spend)}</td>
                                    <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">{r.new_customers}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-800">{r.cac !== null ? baht(r.cac) : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-slate-200 font-black">
                                <td className="px-4 py-2.5">รวม</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{baht(report.totalSpend)}</td>
                                <td className="px-4 py-2.5 text-center tabular-nums">{report.totalNew}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{report.totalNew > 0 ? baht(Math.round(report.totalSpend / report.totalNew * 100) / 100) : "—"}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            <p className="text-[11px] text-slate-400">* ช่องเซลล์คำนวณอัตโนมัติ: ต้นทุน = ค่าคอมที่ปิดยอด/จ่ายในเดือน · ลูกค้าใหม่ = ผู้ป่วยที่ถูก attribute ให้เซลล์ในเดือนนี้ · ช่องโฆษณากรอกมือ</p>
        </div>
    );
}
