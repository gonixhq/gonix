import { gatePermission } from "@/lib/auth/guard";
import { getAffiliateLedger } from "@/lib/actions/affiliates";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserPlus, Phone, Landmark } from "lucide-react";

export const dynamic = "force-dynamic";

const baht = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
function monthLabel(m: string) { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" }); }

export default async function AffiliateDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
    await gatePermission("finance.view");
    const { id } = await params;
    const sp = await searchParams;
    const now = new Date();
    const month = sp.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const { entries, total, affiliate } = await getAffiliateLedger(id, month);
    if (!affiliate) return notFound();

    const wht = Math.round(total * 0.03 * 100) / 100;
    const net = Math.round((total - wht) * 100) / 100;

    return (
        <div className="space-y-5 animate-fade-in max-w-4xl mx-auto pb-10">
            <Link href={`/dashboard/affiliates?month=${month}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> กลับ</Link>

            <div className="gonix-card-premium p-5 flex items-start gap-4">
                <div className="h-14 w-14 rounded-2xl bg-[#2B54F0]/10 flex items-center justify-center"><UserPlus className="h-7 w-7 text-[#2B54F0]" /></div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold text-slate-800">{affiliate.name}</h1>
                    <div className="text-sm text-slate-500 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                        <span className="font-mono">รหัส {affiliate.referral_code}</span>
                        <span>{affiliate.commission_type === "recurring" ? `ต่อเนื่อง ${affiliate.attribution_months} เดือน` : "ครั้งเดียว"} · {affiliate.commission_pct}%</span>
                        {affiliate.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{affiliate.phone}</span>}
                        {affiliate.bank_account && <span className="inline-flex items-center gap-1"><Landmark className="h-3 w-3" />{affiliate.bank_name} {affiliate.bank_account}</span>}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-slate-500">{monthLabel(month)}</div>
                    <div className="text-2xl font-black text-[#10B981]">{baht(total)}</div>
                    {total > 0 && <div className="text-[11px] text-slate-400">หัก 3% {baht(wht)} · สุทธิ {baht(net)}</div>}
                </div>
            </div>

            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-800 text-sm">รายการค่าคอม (Transaction Ledger)</div>
                {entries.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 text-sm">ไม่มีรายการในเดือนนี้</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/40">
                                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    <th className="text-left px-4 py-2">วันที่</th>
                                    <th className="text-left px-4 py-2">เลขบิล</th>
                                    <th className="text-left px-4 py-2">ลูกค้า</th>
                                    <th className="text-right px-4 py-2">ยอดขาย</th>
                                    <th className="text-right px-4 py-2">%</th>
                                    <th className="text-right px-4 py-2">ค่าคอม</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((e, i) => (
                                    <tr key={i} className="border-t border-slate-100">
                                        <td className="px-4 py-2 whitespace-nowrap text-slate-600">{new Date(e.invoice_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</td>
                                        <td className="px-4 py-2">
                                            <Link href={`/dashboard/finance/${e.inv_id}`} className="font-mono text-[11px] text-cyan-600 hover:underline">{e.inv_id}</Link>
                                        </td>
                                        <td className="px-4 py-2 text-slate-700">{e.patient_name}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-slate-500">{baht(e.sale_amount)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-slate-500">{e.pct}%</td>
                                        <td className="px-4 py-2 text-right tabular-nums font-bold text-[#10B981]">{baht(e.commission)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
