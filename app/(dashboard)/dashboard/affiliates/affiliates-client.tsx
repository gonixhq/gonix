"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, UserPlus, Wallet, BadgeCheck, Loader2, X, Calendar, ArrowRight } from "lucide-react";
import { createAffiliate, recordAffiliatePayout, deleteAffiliatePayout, type AffiliateSummary } from "@/lib/actions/affiliates";
import RewardsTabs from "@/components/layout/rewards-tabs";

const baht = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
function monthLabel(m: string) { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" }); }
function shiftMonth(m: string, d: number) { const [y, mo] = m.split("-").map(Number); const dt = new Date(y, mo - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; }

export default function AffiliatesClient({ month, summary }: { month: string; summary: AffiliateSummary[] }) {
    const router = useRouter();
    const [showAdd, setShowAdd] = useState(false);
    const [pending, start] = useTransition();
    const [payingId, setPayingId] = useState<string | null>(null);

    const totalGross = summary.reduce((s, a) => s + a.period_commission, 0);
    const totalUnpaid = summary.filter(a => !a.is_paid).reduce((s, a) => s + a.period_commission, 0);

    function pay(affiliateId: string) {
        if (!confirm("บันทึกจ่ายค่าคอม affiliate รายนี้? (หัก ณ ที่จ่าย 3%)")) return;
        setPayingId(affiliateId);
        start(async () => {
            const r = await recordAffiliatePayout(affiliateId, month);
            setPayingId(null);
            if (!r.success) alert(r.error || "จ่ายไม่สำเร็จ");
            router.refresh();
        });
    }
    function unpay(affiliateId: string) {
        if (!confirm("ยกเลิกการจ่าย?")) return;
        start(async () => { await deleteAffiliatePayout(affiliateId, month); router.refresh(); });
    }

    return (
        <div className="space-y-5 animate-fade-in max-w-5xl mx-auto pb-10">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><UserPlus className="h-6 w-6 text-[#2B54F0]" /> เซลล์ฟรีแลนซ์ (Affiliate)</h1>
                    <p className="text-xs text-slate-500 mt-1">{monthLabel(month)} · ค่าคอมจากลูกค้าที่พามา</p>
                </div>
                <div className="flex items-center gap-1.5">
                    <Link href={`/dashboard/affiliates?month=${shiftMonth(month, -1)}`}><button className="h-9 w-9 rounded-lg border border-slate-300 bg-white flex items-center justify-center"><ChevronLeft className="h-4 w-4" /></button></Link>
                    <div className="px-3 h-9 rounded-lg border border-slate-300 bg-white flex items-center gap-2 font-bold text-sm"><Calendar className="h-4 w-4 text-slate-500" />{monthLabel(month)}</div>
                    <Link href={`/dashboard/affiliates?month=${shiftMonth(month, 1)}`}><button className="h-9 w-9 rounded-lg border border-slate-300 bg-white flex items-center justify-center"><ChevronRight className="h-4 w-4" /></button></Link>
                    <button onClick={() => setShowAdd(true)} className="h-9 px-3 rounded-lg bg-[#2B54F0] text-white text-sm font-bold inline-flex items-center gap-1.5"><Plus className="h-4 w-4" /> เพิ่ม</button>
                </div>
            </div>

            <RewardsTabs />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="gonix-card-premium p-4"><div className="text-xs text-slate-500">ยอดค่าคอมเดือนนี้</div><div className="text-2xl font-black text-slate-800">{baht(totalGross)}</div></div>
                <div className="gonix-card-premium p-4"><div className="text-xs text-slate-500">ค้างจ่าย</div><div className="text-2xl font-black text-amber-600">{baht(totalUnpaid)}</div></div>
                <div className="gonix-card-premium p-4"><div className="text-xs text-slate-500">จำนวนเซลล์</div><div className="text-2xl font-black text-slate-800">{summary.length}</div></div>
            </div>

            <div className="gonix-card-premium overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50/60">
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <th className="text-left px-4 py-2.5">เซลล์</th>
                                <th className="text-left px-3 py-2.5">รหัส</th>
                                <th className="text-center px-3 py-2.5">แบบ</th>
                                <th className="text-right px-3 py-2.5">%</th>
                                <th className="text-center px-3 py-2.5">ลูกค้า</th>
                                <th className="text-right px-3 py-2.5">ยอดเดือนนี้</th>
                                <th className="text-center px-3 py-2.5">จ่าย</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">ยังไม่มี affiliate — กด &quot;เพิ่ม&quot;</td></tr>
                            ) : summary.map(s => (
                                <tr key={s.affiliate.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                                    <td className="px-4 py-2.5">
                                        <Link href={`/dashboard/affiliates/${s.affiliate.id}?month=${month}`} className="font-bold text-slate-800 hover:text-[#2B54F0] inline-flex items-center gap-1">
                                            {s.affiliate.name} <ArrowRight className="h-3 w-3 opacity-40" />
                                        </Link>
                                        {!s.affiliate.is_active && <span className="ml-1 text-[10px] text-slate-400">(ปิด)</span>}
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{s.affiliate.referral_code}</td>
                                    <td className="px-3 py-2.5 text-center text-xs">{s.affiliate.commission_type === "recurring" ? `ต่อเนื่อง ${s.affiliate.attribution_months}ด.` : "ครั้งเดียว"}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{s.affiliate.commission_pct}%</td>
                                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">{s.patient_count}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[#10B981]">{baht(s.period_commission)}</td>
                                    <td className="px-3 py-2.5 text-center">
                                        {s.is_paid ? (
                                            <div className="inline-flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">จ่ายแล้ว</span>
                                                <button onClick={() => unpay(s.affiliate.id)} className="text-[10px] text-slate-400 hover:text-rose-500">ยกเลิก</button>
                                            </div>
                                        ) : s.period_commission > 0 ? (
                                            <button onClick={() => pay(s.affiliate.id)} disabled={payingId === s.affiliate.id}
                                                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 disabled:opacity-50">
                                                {payingId === s.affiliate.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <BadgeCheck className="h-3 w-3" />} จ่าย
                                            </button>
                                        ) : <span className="text-slate-300 text-xs">—</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <p className="text-[11px] text-slate-400">* ค่าคอม = ยอดที่ชำระแล้วของลูกค้าที่พามา × % · แบบ &quot;ครั้งเดียว&quot; นับเฉพาะบิลแรก · &quot;ต่อเนื่อง&quot; นับทุกบิลในระยะ attribution · จ่ายแล้วหัก ณ ที่จ่าย 3%</p>

            {showAdd && <AddModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); router.refresh(); }} pending={pending} startTransition={start} />}
        </div>
    );
}

function AddModal({ onClose, onSaved, pending, startTransition }: { onClose: () => void; onSaved: () => void; pending: boolean; startTransition: (cb: () => void) => void }) {
    const [form, setForm] = useState({ name: "", phone: "", bank_account: "", bank_name: "", referral_code: "", commission_type: "one_time" as "one_time" | "recurring", commission_pct: 5, attribution_months: 6 });
    const [err, setErr] = useState<string | null>(null);
    const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));

    function save() {
        setErr(null);
        startTransition(async () => {
            const r = await createAffiliate(form);
            if (!r.success) { setErr(r.error || "บันทึกไม่สำเร็จ"); return; }
            onSaved();
        });
    }
    const inputCls = "w-full h-10 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30";

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-800">เพิ่มเซลล์ฟรีแลนซ์</h2>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><X className="h-4 w-4" /></button>
                </div>
                <div className="space-y-3">
                    <div><label className="text-xs font-bold text-slate-600">ชื่อ *</label><input value={form.name} onChange={e => set("name", e.target.value)} className={inputCls} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs font-bold text-slate-600">รหัสแนะนำ *</label><input value={form.referral_code} onChange={e => set("referral_code", e.target.value.toUpperCase())} placeholder="เช่น SALE01" className={`${inputCls} font-mono`} /></div>
                        <div><label className="text-xs font-bold text-slate-600">เบอร์โทร</label><input value={form.phone} onChange={e => set("phone", e.target.value)} className={inputCls} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs font-bold text-slate-600">ธนาคาร</label><input value={form.bank_name} onChange={e => set("bank_name", e.target.value)} className={inputCls} /></div>
                        <div><label className="text-xs font-bold text-slate-600">เลขบัญชี</label><input value={form.bank_account} onChange={e => set("bank_account", e.target.value)} className={inputCls} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-600">แบบค่าคอม</label>
                            <select value={form.commission_type} onChange={e => set("commission_type", e.target.value)} className={inputCls}>
                                <option value="one_time">ครั้งเดียว (บิลแรก)</option>
                                <option value="recurring">ต่อเนื่อง (ทุกบิล)</option>
                            </select>
                        </div>
                        <div><label className="text-xs font-bold text-slate-600">% ค่าคอม</label><input type="number" min={0} max={100} value={form.commission_pct} onChange={e => set("commission_pct", Number(e.target.value))} className={inputCls} /></div>
                    </div>
                    {form.commission_type === "recurring" && (
                        <div><label className="text-xs font-bold text-slate-600">อายุ attribution (เดือน)</label><input type="number" min={1} value={form.attribution_months} onChange={e => set("attribution_months", Number(e.target.value))} className={inputCls} /></div>
                    )}
                    {err && <p className="text-xs text-rose-600">{err}</p>}
                    <button onClick={save} disabled={pending} className="w-full h-11 rounded-xl bg-[#2B54F0] text-white font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} บันทึก
                    </button>
                </div>
            </div>
        </div>
    );
}
