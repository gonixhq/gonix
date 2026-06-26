"use client";

import { useEffect, useState, useTransition } from "react";
import { Gift, Copy, Check, Users2, Loader2, Coins, Banknote, TicketPercent } from "lucide-react";
import { ensureReferralCode, getReferralsByReferrer, claimReferralReward, type ReferredItem } from "@/lib/actions/patient-referrals";

export default function ReferralTab({ hn }: { hn: string }) {
    const [code, setCode] = useState("");
    const [list, setList] = useState<ReferredItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [claimTarget, setClaimTarget] = useState<ReferredItem | null>(null);

    const reload = async () => {
        const [c, l] = await Promise.all([ensureReferralCode(hn), getReferralsByReferrer(hn)]);
        setCode(c); setList(l); setLoading(false);
    };
    useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [hn]);

    const claimedCount = list.filter(r => ["cash", "discount", "points"].includes(r.reward_status)).length;
    const pendingCount = list.filter(r => r.reward_status === "pending" && r.has_sales).length;

    const STATUS: Record<string, { label: string; cls: string }> = {
        pending: { label: "รอเลือกรางวัล", cls: "bg-amber-100 text-amber-700" },
        cash: { label: "รับเงินแล้ว", cls: "bg-emerald-100 text-emerald-700" },
        discount: { label: "เป็นส่วนลดแล้ว", cls: "bg-blue-100 text-blue-700" },
        points: { label: "เป็นแต้มแล้ว", cls: "bg-violet-100 text-violet-700" },
        cancelled: { label: "ยกเลิก", cls: "bg-slate-100 text-slate-500" },
    };

    if (loading) return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></div>;

    return (
        <div className="space-y-5">
            {/* รหัสแนะนำ */}
            <div className="gonix-card-premium p-5">
                <div className="flex items-center gap-2 mb-3"><Gift className="h-4 w-4 text-[#2B54F0]" /><h3 className="text-sm font-bold text-slate-800">รหัสแนะนำเพื่อน</h3></div>
                <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-xl bg-gradient-to-r from-[#2B54F0]/10 to-[#00A6C0]/10 border border-[#2B54F0]/20 px-4 py-3 font-mono font-black text-2xl text-[#2B54F0] tracking-wider text-center">
                        {code || "—"}
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                        className="h-12 px-4 rounded-xl bg-[#2B54F0] text-white text-sm font-bold inline-flex items-center gap-1.5">
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                    </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">ให้เพื่อนกรอกรหัสนี้ตอนสมัครสมาชิก/ลงทะเบียน เมื่อเพื่อนมาใช้บริการจริง คุณจะได้รางวัล</p>
            </div>

            {/* สรุป */}
            <div className="grid grid-cols-3 gap-3">
                <div className="gonix-card-premium p-4 text-center"><div className="text-2xl font-black text-slate-800">{list.length}</div><div className="text-xs text-slate-500">แนะนำมาแล้ว</div></div>
                <div className="gonix-card-premium p-4 text-center"><div className="text-2xl font-black text-amber-600">{pendingCount}</div><div className="text-xs text-slate-500">รอเลือกรางวัล</div></div>
                <div className="gonix-card-premium p-4 text-center"><div className="text-2xl font-black text-emerald-600">{claimedCount}</div><div className="text-xs text-slate-500">รับรางวัลแล้ว</div></div>
            </div>

            {/* รายการ */}
            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 font-bold text-slate-800 text-sm flex items-center gap-2"><Users2 className="h-4 w-4 text-slate-500" /> คนที่แนะนำมา</div>
                {list.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 text-sm">ยังไม่มีคนที่แนะนำมา</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {list.map(r => (
                            <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-slate-800">{r.referred_name}</div>
                                    <div className="text-xs text-slate-400">
                                        {new Date(r.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
                                        {r.reward_status === "points" && r.reward_points > 0 && ` · ${r.reward_points} แต้ม`}
                                        {(r.reward_status === "cash" || r.reward_status === "discount") && r.reward_amount > 0 && ` · ฿${r.reward_amount.toLocaleString()}`}
                                    </div>
                                </div>
                                {!r.has_sales && r.reward_status === "pending" ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">ยังไม่มาใช้บริการ</span>
                                ) : (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS[r.reward_status]?.cls || ""}`}>{STATUS[r.reward_status]?.label}</span>
                                )}
                                {r.reward_status === "pending" && r.has_sales && (
                                    <button onClick={() => setClaimTarget(r)} className="h-8 px-3 rounded-lg bg-[#10B981]/10 text-[#10B981] text-xs font-bold hover:bg-[#10B981]/20">เลือกรางวัล</button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {claimTarget && <ClaimModal item={claimTarget} onClose={() => setClaimTarget(null)} onDone={() => { setClaimTarget(null); setLoading(true); reload(); }} />}
        </div>
    );
}

function ClaimModal({ item, onClose, onDone }: { item: ReferredItem; onClose: () => void; onDone: () => void }) {
    const [type, setType] = useState<"cash" | "discount" | "points">("points");
    const [value, setValue] = useState<number>(0);
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    const opts = [
        { k: "cash" as const, label: "เงินสด", Icon: Banknote, unit: "บาท" },
        { k: "discount" as const, label: "ส่วนลดบิลหน้า", Icon: TicketPercent, unit: "บาท" },
        { k: "points" as const, label: "แต้มสะสม", Icon: Coins, unit: "แต้ม" },
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
                <h2 className="text-lg font-bold text-slate-800 mb-1">เลือกรางวัลแนะนำ</h2>
                <p className="text-xs text-slate-500 mb-4">จาก {item.referred_name}</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                    {opts.map(o => (
                        <button key={o.k} onClick={() => setType(o.k)}
                            className={`p-3 rounded-xl border text-center transition-all ${type === o.k ? "border-[#2B54F0] bg-[#2B54F0]/5" : "border-slate-200"}`}>
                            <o.Icon className={`h-5 w-5 mx-auto mb-1 ${type === o.k ? "text-[#2B54F0]" : "text-slate-400"}`} />
                            <div className="text-[11px] font-bold text-slate-700">{o.label}</div>
                        </button>
                    ))}
                </div>
                <label className="text-xs font-bold text-slate-600">จำนวน ({opts.find(o => o.k === type)?.unit})</label>
                <input type="number" min={0} value={value} onChange={e => setValue(Number(e.target.value))}
                    className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30" autoFocus />
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
