"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, Loader2, Check, Banknote, TicketPercent, Coins } from "lucide-react";
import { claimReferralReward, type ClinicReferral } from "@/lib/actions/patient-referrals";
import RewardsTabs from "@/components/layout/rewards-tabs";

const STATUS: Record<string, { label: string; cls: string }> = {
    pending: { label: "รอเลือก", cls: "bg-amber-100 text-amber-700" },
    cash: { label: "เงินสด", cls: "bg-emerald-100 text-emerald-700" },
    discount: { label: "ส่วนลด", cls: "bg-blue-100 text-blue-700" },
    points: { label: "แต้ม", cls: "bg-violet-100 text-violet-700" },
    cancelled: { label: "ยกเลิก", cls: "bg-slate-100 text-slate-500" },
};

export default function ReferralsClient({ referrals }: { referrals: ClinicReferral[] }) {
    const router = useRouter();
    const [target, setTarget] = useState<ClinicReferral | null>(null);

    const pending = referrals.filter(r => r.reward_status === "pending" && r.has_sales).length;
    const claimed = referrals.filter(r => ["cash", "discount", "points"].includes(r.reward_status)).length;

    return (
        <div className="space-y-5 animate-fade-in max-w-5xl mx-auto pb-10">
            <div>
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Gift className="h-6 w-6 text-[#2B54F0]" /> Referral ลูกค้าแนะนำ</h1>
                <p className="text-xs text-slate-500 mt-1">ลูกค้าเก่าแนะนำลูกค้าใหม่ + รางวัล</p>
            </div>

            <RewardsTabs />

            <div className="grid grid-cols-3 gap-3">
                <div className="gonix-card-premium p-4 text-center"><div className="text-2xl font-black text-slate-800">{referrals.length}</div><div className="text-xs text-slate-500">การแนะนำทั้งหมด</div></div>
                <div className="gonix-card-premium p-4 text-center"><div className="text-2xl font-black text-amber-600">{pending}</div><div className="text-xs text-slate-500">รอเลือกรางวัล</div></div>
                <div className="gonix-card-premium p-4 text-center"><div className="text-2xl font-black text-emerald-600">{claimed}</div><div className="text-xs text-slate-500">รับรางวัลแล้ว</div></div>
            </div>

            <div className="gonix-card-premium overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50/60">
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <th className="text-left px-4 py-2.5">ผู้แนะนำ</th>
                                <th className="text-left px-4 py-2.5">ลูกค้าใหม่</th>
                                <th className="text-center px-3 py-2.5">มาใช้บริการ</th>
                                <th className="text-center px-3 py-2.5">รางวัล</th>
                                <th className="text-center px-3 py-2.5"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {referrals.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">ยังไม่มีการแนะนำ</td></tr>
                            ) : referrals.map(r => (
                                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                                    <td className="px-4 py-2.5">
                                        <Link href={`/dashboard/patients/${r.referrer_hn}`} className="font-semibold text-slate-800 hover:text-[#2B54F0]">{r.referrer_name}</Link>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <Link href={`/dashboard/patients/${r.referred_hn}`} className="text-slate-700 hover:text-[#2B54F0]">{r.referred_name}</Link>
                                    </td>
                                    <td className="px-3 py-2.5 text-center">{r.has_sales ? <span className="text-emerald-600 text-xs font-bold">✓ แล้ว</span> : <span className="text-slate-300 text-xs">ยัง</span>}</td>
                                    <td className="px-3 py-2.5 text-center">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS[r.reward_status]?.cls || ""}`}>{STATUS[r.reward_status]?.label}</span>
                                        {r.reward_status === "points" && r.reward_points > 0 && <span className="text-[10px] text-slate-400 ml-1">{r.reward_points}แต้ม</span>}
                                        {(r.reward_status === "cash" || r.reward_status === "discount") && r.reward_amount > 0 && <span className="text-[10px] text-slate-400 ml-1">฿{r.reward_amount.toLocaleString()}</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        {r.reward_status === "pending" && r.has_sales && (
                                            <button onClick={() => setTarget(r)} className="h-7 px-2.5 rounded-lg bg-[#10B981]/10 text-[#10B981] text-[11px] font-bold hover:bg-[#10B981]/20">เลือกรางวัล</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {target && <ClaimModal item={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); router.refresh(); }} />}
        </div>
    );
}

function ClaimModal({ item, onClose, onDone }: { item: ClinicReferral; onClose: () => void; onDone: () => void }) {
    const [type, setType] = useState<"cash" | "discount" | "points">("points");
    const [value, setValue] = useState(0);
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const opts = [
        { k: "cash" as const, label: "เงินสด", Icon: Banknote, unit: "บาท" },
        { k: "discount" as const, label: "ส่วนลด", Icon: TicketPercent, unit: "บาท" },
        { k: "points" as const, label: "แต้ม", Icon: Coins, unit: "แต้ม" },
    ];
    function save() {
        setErr(null);
        start(async () => {
            const r = await claimReferralReward(item.id, type, value);
            if (!r.success) { setErr(r.error || "บันทึกไม่สำเร็จ"); return; }
            onDone();
        });
    }
    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                <h2 className="text-lg font-bold text-slate-800 mb-1">เลือกรางวัลให้ {item.referrer_name}</h2>
                <p className="text-xs text-slate-500 mb-4">จากการแนะนำ {item.referred_name}</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                    {opts.map(o => (
                        <button key={o.k} onClick={() => setType(o.k)} className={`p-3 rounded-xl border text-center ${type === o.k ? "border-[#2B54F0] bg-[#2B54F0]/5" : "border-slate-200"}`}>
                            <o.Icon className={`h-5 w-5 mx-auto mb-1 ${type === o.k ? "text-[#2B54F0]" : "text-slate-400"}`} />
                            <div className="text-[11px] font-bold text-slate-700">{o.label}</div>
                        </button>
                    ))}
                </div>
                <label className="text-xs font-bold text-slate-600">จำนวน ({opts.find(o => o.k === type)?.unit})</label>
                <input type="number" min={0} value={value} onChange={e => setValue(Number(e.target.value))} className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30" autoFocus />
                {err && <p className="text-xs text-rose-600 mt-2">{err}</p>}
                <div className="flex gap-2 mt-4">
                    <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">ยกเลิก</button>
                    <button onClick={save} disabled={pending || value <= 0} className="flex-1 h-10 rounded-xl bg-[#2B54F0] text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} ยืนยัน
                    </button>
                </div>
            </div>
        </div>
    );
}
