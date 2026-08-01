"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Coins, Users, TrendingUp } from "lucide-react";
import type { DailyCommissionResult } from "@/lib/actions/commissions";

const ROLE_LABEL: Record<string, string> = {
    doctor: "หมอ", nurse: "พยาบาล", assistant: "ผู้ช่วย", sales: "เซลล์",
};
const ROLE_COLOR: Record<string, string> = {
    doctor: "bg-cyan-100 text-cyan-700", nurse: "bg-emerald-100 text-emerald-700",
    assistant: "bg-amber-100 text-amber-700", sales: "bg-violet-100 text-violet-700",
};
const money = (n: number) => `฿${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function CommissionsDailyClient({ data, date }: { data: DailyCommissionResult; date: string }) {
    const router = useRouter();
    const fmtDate = new Date(date + "T00:00:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in pb-12">
            {/* Header + toggle */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-emerald-700" />
                    <h1 className="text-lg font-bold text-slate-800">ค่ามือ/คอมมิชชั่น — รายวัน</h1>
                </div>
                <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm">
                    <Link href="/dashboard/commissions" className="px-4 py-1.5 font-semibold bg-white text-slate-600 hover:bg-slate-50">รายเดือน</Link>
                    <span className="px-4 py-1.5 font-semibold bg-emerald-600 text-white">รายวัน</span>
                </div>
            </div>

            {/* Date picker + total */}
            <div className="gonix-card-premium p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-slate-500" />
                    <input type="date" value={date} max={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" })}
                        onChange={e => router.push(`/dashboard/commissions?view=daily&date=${e.target.value}`)}
                        className="h-9 rounded-lg border border-slate-200 px-2 text-sm" />
                    <span className="text-sm text-slate-500">{fmtDate}</span>
                </div>
                <div className="text-right">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">รวมค่ามือวันนี้</div>
                    <div className="text-2xl font-black tabular-nums text-emerald-700">{money(data.total)}</div>
                </div>
            </div>

            {data.entries.length === 0 ? (
                <div className="gonix-card-premium p-12 text-center text-sm text-slate-400">
                    ยังไม่มีค่ามือในวันนี้ (บิลต้อง <b>ชำระแล้ว</b> + หัตถการ/ยา มีตั้ง DF ไว้)
                </div>
            ) : (
                <>
                    {/* สรุปต่อคน */}
                    <div className="gonix-card-premium p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Users className="h-4 w-4 text-blue-700" />
                            <h2 className="text-sm font-bold text-slate-800">สรุปต่อคน ({data.byStaff.length})</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {data.byStaff.map(s => (
                                <div key={`${s.staff_id}-${s.role}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="font-bold text-slate-800 truncate">{s.staff_name}</div>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ROLE_COLOR[s.role] || "bg-slate-100 text-slate-600"}`}>{ROLE_LABEL[s.role] || s.role}</span>
                                        <span className="text-[11px] text-slate-400 ml-1">· {s.count} เคส</span>
                                    </div>
                                    <div className="font-black tabular-nums text-emerald-700 shrink-0">{money(s.total)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* รายละเอียดต่อเคส */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200/60 bg-slate-50/40">
                            <TrendingUp className="h-4 w-4 text-blue-700" />
                            <h2 className="text-sm font-bold text-slate-800">รายละเอียดต่อเคส ({data.entries.length})</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/60">
                                    <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        <th className="text-left px-4 py-2">ผู้รับ</th>
                                        <th className="text-left px-4 py-2">บทบาท</th>
                                        <th className="text-left px-4 py-2">เคส (VN)</th>
                                        <th className="text-left px-4 py-2">ลูกค้า</th>
                                        <th className="text-left px-4 py-2">รายการ</th>
                                        <th className="text-right px-4 py-2">ยอดขาย</th>
                                        <th className="text-right px-4 py-2">ค่ามือ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.entries.map((e, i) => (
                                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/40">
                                            <td className="px-4 py-2 font-semibold text-slate-800">{e.staff_name}</td>
                                            <td className="px-4 py-2">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ROLE_COLOR[e.role] || "bg-slate-100 text-slate-600"}`}>{ROLE_LABEL[e.role] || e.role}</span>
                                                {e.is_split && <span className="text-[10px] text-violet-600 ml-1">แบ่ง {e.split_percent}%</span>}
                                            </td>
                                            <td className="px-4 py-2">
                                                {e.vn ? <Link href={`/dashboard/finance/${e.inv_id}`} className="font-mono text-xs text-blue-600 hover:underline">{e.vn}</Link>
                                                    : <span className="font-mono text-xs text-slate-400">คอส</span>}
                                            </td>
                                            <td className="px-4 py-2 text-slate-700">{e.patient_name}</td>
                                            <td className="px-4 py-2 text-slate-700">{e.item_name} {e.qty > 1 && <span className="text-slate-400">×{e.qty}</span>}</td>
                                            <td className="px-4 py-2 text-right tabular-nums text-slate-500">{money(e.sale_amount)}</td>
                                            <td className="px-4 py-2 text-right font-bold tabular-nums text-emerald-700">{money(e.commission_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
            <p className="text-[11px] text-slate-400">💡 ยอดรายวันม้วนขึ้นเป็นยอดเดือน — อนุมัติ + จ่ายจริงทีเดียวสิ้นเดือนที่หน้า &quot;รายเดือน&quot;</p>
        </div>
    );
}
