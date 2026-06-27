import { gatePermission } from "@/lib/auth/guard";
import { getAffiliateLedger, getAffiliatePayoutHistory, listAffiliates, getAffiliateQuality, getBranches } from "@/lib/actions/affiliates";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserPlus, Phone, Landmark, FileText, Award, TrendingUp, Repeat, Building2 } from "lucide-react";
import AffiliateDocs from "./affiliate-docs";
import { AttributionTransfer, InvoiceSplitButton } from "./m14-tools";
import AffiliateLine from "./affiliate-line";

export const dynamic = "force-dynamic";

const baht = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
function monthLabel(m: string) { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" }); }
const STATUS_LABEL: Record<string, string> = { paid: "จ่ายแล้ว", closed: "ปิดยอด (รอจ่าย)" };

export default async function AffiliateDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
    await gatePermission("finance.view");
    const { id } = await params;
    const sp = await searchParams;
    const now = new Date();
    const month = sp.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [{ entries, total, affiliate }, history, affiliates, quality, branches] = await Promise.all([
        getAffiliateLedger(id, month),
        getAffiliatePayoutHistory({ affiliateId: id }),
        listAffiliates(),
        getAffiliateQuality(id),
        getBranches(),
    ]);
    if (!affiliate) return notFound();
    const affOptions = affiliates.map(a => ({ id: a.id, name: a.name }));
    const branchName = affiliate.branch_id ? (branches.find(b => b.id === affiliate.branch_id)?.name || null) : null;
    const badgeMeta = quality.badge === "gold"
        ? { label: "คุณภาพสูง 🥇", cls: "bg-amber-100 text-amber-700 border-amber-300" }
        : quality.badge === "silver"
            ? { label: "คุณภาพดี 🥈", cls: "bg-slate-100 text-slate-600 border-slate-300" }
            : null;

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
                        {branchName && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{branchName}</span>}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-slate-500">{monthLabel(month)}</div>
                    <div className="text-2xl font-black text-[#10B981]">{baht(total)}</div>
                    {total > 0 && <div className="text-[11px] text-slate-400">หัก 3% {baht(wht)} · สุทธิ {baht(net)}</div>}
                    {total > 0 && (
                        <a href={`/print/wht-cert/${month}/${id}`} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#2B54F0] hover:underline">
                            <FileText className="h-3 w-3" /> ใบ 50 ทวิ
                        </a>
                    )}
                </div>
            </div>

            {/* M13 คุณภาพเซลล์ */}
            <div className="gonix-card-premium p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="font-bold text-slate-800 text-sm flex items-center gap-2"><Award className="h-4 w-4 text-amber-500" /> คุณภาพเซลล์ (Performance Quality)</div>
                    {badgeMeta && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badgeMeta.cls}`}>{badgeMeta.label}</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[10px] uppercase font-bold text-slate-500">ลูกค้าที่พามา</div>
                        <div className="text-xl font-black text-slate-800">{quality.customer_count}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> LTV เฉลี่ย</div>
                        <div className="text-xl font-black text-[#10B981]">{baht(quality.ltv)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1"><Repeat className="h-3 w-3" /> ซื้อซ้ำ ≥3 บิล</div>
                        <div className="text-xl font-black text-slate-800">{quality.repeat_count}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[10px] uppercase font-bold text-slate-500">Retention Rate</div>
                        <div className="text-xl font-black text-slate-800">{quality.retention_rate}%</div>
                    </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-3">
                    วัดคุณภาพลูกค้าที่พามา (ไม่ใช่แค่จำนวนหัว) · retention = ลูกค้าที่กลับมาซื้อถึงบิลที่ 3+
                    {quality.suggested_bonus_pct > 0 && <> · <span className="text-amber-600 font-bold">แนะนำโบนัสค่าคอม +{quality.suggested_bonus_pct}%</span> (ตั้งเองที่เรทค่าคอม)</>}
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <AffiliateDocs affiliateId={id} idCardPath={affiliate.id_card_path} bankBookPath={affiliate.bank_book_path} />
                <AffiliateLine affiliateId={id} linked={!!affiliate.line_user_id} month={month} />
            </div>

            <AttributionTransfer affiliates={affOptions} />

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
                                    <th className="text-center px-3 py-2">แบ่ง</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((e, i) => (
                                    <tr key={i} className="border-t border-slate-100">
                                        <td className="px-4 py-2 whitespace-nowrap text-slate-600">{new Date(e.invoice_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</td>
                                        <td className="px-4 py-2">
                                            <Link href={`/dashboard/finance/${e.inv_id}`} className="font-mono text-[11px] text-cyan-600 hover:underline">{e.inv_id}</Link>
                                        </td>
                                        <td className="px-4 py-2 text-slate-700">{e.patient_name}{e.is_split && <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-700">แบ่ง</span>}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-slate-500">{baht(e.sale_amount)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-slate-500">{e.pct}%</td>
                                        <td className="px-4 py-2 text-right tabular-nums font-bold text-[#10B981]">{baht(e.commission)}</td>
                                        <td className="px-3 py-2 text-center"><InvoiceSplitButton invId={e.inv_id} affiliates={affOptions} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ประวัติการจ่ายย้อนหลัง */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-800 text-sm">ประวัติการจ่าย (Payout History)</div>
                {history.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-sm">ยังไม่มีประวัติการจ่าย</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/40">
                                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    <th className="text-left px-4 py-2">งวด</th>
                                    <th className="text-right px-4 py-2">ยอดรวม</th>
                                    <th className="text-right px-4 py-2">หัก 3%</th>
                                    <th className="text-right px-4 py-2">สุทธิ</th>
                                    <th className="text-center px-4 py-2">สถานะ</th>
                                    <th className="text-center px-4 py-2">50 ทวิ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(h => (
                                    <tr key={h.period_month} className="border-t border-slate-100">
                                        <td className="px-4 py-2 text-slate-700">{monthLabel(h.period_month)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-slate-600">{baht(h.gross_amount)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-rose-500">{baht(h.wht_amount)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-800">{baht(h.net_amount)}</td>
                                        <td className="px-4 py-2 text-center">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${h.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{STATUS_LABEL[h.status] || h.status}</span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <a href={`/print/wht-cert/${h.period_month}/${id}`} target="_blank" rel="noopener" className="inline-flex text-slate-400 hover:text-[#2B54F0]"><FileText className="h-3.5 w-3.5" /></a>
                                        </td>
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
