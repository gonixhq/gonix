"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, UserPlus, Wallet, BadgeCheck, Loader2, X, Calendar, ArrowRight, Layers, Trash2, History, Lock, LockOpen, FileText, Target } from "lucide-react";
import { createAffiliate, recordAffiliatePayout, deleteAffiliatePayout, getRateSchedule, saveRateSchedule, getRateAudit, closeAffiliateMonth, reopenAffiliateMonth, type AffiliateSummary, type RateSchedule, type RateBasis, type RateAuditEntry, type BranchOption } from "@/lib/actions/affiliates";
import RewardsTabs from "@/components/layout/rewards-tabs";

const BASIS_LABEL: Record<RateBasis, string> = { flat: "% คงที่", bill_seq: "ตามลำดับบิล", month_seq: "ตามเดือน" };

const baht = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
function monthLabel(m: string) { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "long" }); }
function shiftMonth(m: string, d: number) { const [y, mo] = m.split("-").map(Number); const dt = new Date(y, mo - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; }

export default function AffiliatesClient({ month, summary, locked, lockedAt, branches }: { month: string; summary: AffiliateSummary[]; locked: boolean; lockedAt: string | null; branches: BranchOption[] }) {
    const router = useRouter();
    const [showAdd, setShowAdd] = useState(false);
    const [pending, start] = useTransition();
    const [payingId, setPayingId] = useState<string | null>(null);
    const [rateFor, setRateFor] = useState<{ id: string; name: string } | null>(null);

    const totalGross = summary.reduce((s, a) => s + a.period_commission, 0);
    const totalUnpaid = summary.filter(a => !a.is_paid).reduce((s, a) => s + a.period_commission, 0);
    const payableCount = summary.filter(a => a.payout_status !== "paid" && a.period_commission > 0).length;

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
    function closeMonth() {
        if (!confirm(`ปิดยอดทั้งเดือน ${monthLabel(month)}?\nยอดค่าคอมจะถูกล็อก (snapshot) ไม่เปลี่ยนตามบิลที่เพิ่มภายหลัง\n\nระบบจะส่งสรุปยอดทาง LINE ให้เซลล์ที่ผูกบัญชีไว้`)) return;
        const payDate = prompt("กำหนดวันโอน (YYYY-MM-DD) สำหรับข้อความ LINE — เว้นว่างได้:", "") || undefined;
        start(async () => {
            const r = await closeAffiliateMonth(month, payDate ? { payDate } : undefined);
            if (!r.success) alert(r.error || "ปิดยอดไม่สำเร็จ");
            else if (typeof r.notified === "number" && r.notified > 0) alert(`ปิดยอดแล้ว · ส่งแจ้งเตือน LINE ${r.notified} ราย`);
            router.refresh();
        });
    }
    function reopenMonth() {
        if (!confirm("เปิดยอดกลับ? (เฉพาะรายที่ยังไม่จ่ายจะกลับมาคำนวณสด — รายที่จ่ายแล้วคงเดิม)")) return;
        start(async () => { await reopenAffiliateMonth(month); router.refresh(); });
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
                    <Link href={`/dashboard/affiliates/cac?month=${month}`}><button className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-bold inline-flex items-center gap-1.5"><Target className="h-4 w-4" /> CAC</button></Link>
                    <button onClick={() => setShowAdd(true)} className="h-9 px-3 rounded-lg bg-[#2B54F0] text-white text-sm font-bold inline-flex items-center gap-1.5"><Plus className="h-4 w-4" /> เพิ่ม</button>
                    {locked ? (
                        <button onClick={reopenMonth} disabled={pending} className="h-9 px-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"><LockOpen className="h-4 w-4" /> เปิดยอด</button>
                    ) : (
                        <button onClick={closeMonth} disabled={pending || payableCount === 0} className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-40"><Lock className="h-4 w-4" /> ปิดยอดเดือนนี้</button>
                    )}
                </div>
            </div>

            <RewardsTabs />

            {locked && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>ปิดยอดเดือนนี้แล้ว — ยอดถูกล็อก (snapshot){lockedAt ? ` เมื่อ ${new Date(lockedAt).toLocaleDateString("th-TH", { dateStyle: "medium" })}` : ""} · กด &quot;จ่าย&quot; รายคนได้ตามปกติ</span>
                </div>
            )}

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
                                    <td className="px-3 py-2.5 text-right">
                                        <button onClick={() => setRateFor({ id: s.affiliate.id, name: s.affiliate.name })}
                                            className="inline-flex items-center gap-1 text-xs tabular-nums hover:text-[#2B54F0] group">
                                            {s.affiliate.rate_basis && s.affiliate.rate_basis !== "flat"
                                                ? <span className="font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">หลายขั้น</span>
                                                : <span>{s.affiliate.commission_pct}%</span>}
                                            <Layers className="h-3 w-3 opacity-30 group-hover:opacity-100" />
                                        </button>
                                    </td>
                                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">{s.patient_count}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[#10B981]">{baht(s.period_commission)}</td>
                                    <td className="px-3 py-2.5 text-center">
                                        {s.payout_status === "paid" ? (
                                            <div className="inline-flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">จ่ายแล้ว</span>
                                                <a href={`/print/wht-cert/${month}/${s.affiliate.id}`} target="_blank" rel="noopener" title="ใบหัก ณ ที่จ่าย 50 ทวิ" className="text-slate-400 hover:text-[#2B54F0]"><FileText className="h-3.5 w-3.5" /></a>
                                                <button onClick={() => unpay(s.affiliate.id)} className="text-[10px] text-slate-400 hover:text-rose-500">ยกเลิก</button>
                                            </div>
                                        ) : s.period_commission > 0 ? (
                                            <div className="inline-flex items-center gap-1.5">
                                                {s.payout_status === "closed" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">ปิดยอด</span>}
                                                <button onClick={() => pay(s.affiliate.id)} disabled={payingId === s.affiliate.id}
                                                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-bold bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 disabled:opacity-50">
                                                    {payingId === s.affiliate.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <BadgeCheck className="h-3 w-3" />} จ่าย
                                                </button>
                                            </div>
                                        ) : <span className="text-slate-300 text-xs">—</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <p className="text-[11px] text-slate-400">* ค่าคอม = ยอดที่ชำระแล้วของลูกค้าที่พามา × % · แบบ &quot;ครั้งเดียว&quot; นับเฉพาะบิลแรก · &quot;ต่อเนื่อง&quot; นับทุกบิลในระยะ attribution · จ่ายแล้วหัก ณ ที่จ่าย 3%</p>

            {showAdd && <AddModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); router.refresh(); }} pending={pending} startTransition={start} branches={branches} />}
            {rateFor && <RateModal affiliate={rateFor} onClose={() => setRateFor(null)} onSaved={() => { setRateFor(null); router.refresh(); }} />}
        </div>
    );
}

function RateModal({ affiliate, onClose, onSaved }: { affiliate: { id: string; name: string }; onClose: () => void; onSaved: () => void }) {
    const [loading, setLoading] = useState(true);
    const [saving, start] = useTransition();
    const [basis, setBasis] = useState<RateBasis>("flat");
    const [flatPct, setFlatPct] = useState(5);
    const [tiers, setTiers] = useState<{ from_n: number; pct: number }[]>([]);
    const [note, setNote] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [audit, setAudit] = useState<RateAuditEntry[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        (async () => {
            const sched = await getRateSchedule(affiliate.id);
            if (sched) {
                setBasis(sched.basis); setFlatPct(sched.flat_pct);
                setTiers(sched.tiers.length ? sched.tiers : [{ from_n: 1, pct: sched.flat_pct }]);
            }
            setAudit(await getRateAudit(affiliate.id));
            setLoading(false);
        })();
    }, [affiliate.id]);

    const unitWord = basis === "month_seq" ? "เดือนที่" : "บิลที่";
    function addTier() {
        const nextN = tiers.length ? Math.max(...tiers.map(t => t.from_n)) + 1 : 1;
        setTiers([...tiers, { from_n: nextN, pct: 0 }]);
    }
    function setTier(i: number, k: "from_n" | "pct", v: number) {
        setTiers(tiers.map((t, idx) => idx === i ? { ...t, [k]: v } : t));
    }
    function save() {
        setErr(null);
        const schedule: RateSchedule = { basis, flat_pct: flatPct, tiers: basis === "flat" ? [] : tiers };
        start(async () => {
            const r = await saveRateSchedule(affiliate.id, schedule, note.trim() || undefined);
            if (!r.success) { setErr(r.error || "บันทึกไม่สำเร็จ"); return; }
            onSaved();
        });
    }
    const inputCls = "h-9 rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30";

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Layers className="h-5 w-5 text-violet-600" /> เรทค่าคอม — {affiliate.name}</h2>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><X className="h-4 w-4" /></button>
                </div>

                {loading ? <div className="py-10 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-slate-600">รูปแบบเรท</label>
                            <select value={basis} onChange={e => setBasis(e.target.value as RateBasis)} className={`${inputCls} w-full h-10`}>
                                <option value="flat">% คงที่ (เหมือนเดิม)</option>
                                <option value="bill_seq">หลายขั้นตามลำดับบิลของลูกค้า</option>
                                <option value="month_seq">หลายขั้นตามเดือนนับจากวันที่พามา</option>
                            </select>
                        </div>

                        {basis === "flat" ? (
                            <div>
                                <label className="text-xs font-bold text-slate-600">% ค่าคอม</label>
                                <input type="number" min={0} max={100} value={flatPct} onChange={e => setFlatPct(Number(e.target.value))} className={`${inputCls} w-full h-10`} />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-600">ขั้นค่าคอม</label>
                                    <button onClick={addTier} className="text-[11px] font-bold text-[#2B54F0] inline-flex items-center gap-1"><Plus className="h-3 w-3" /> เพิ่มขั้น</button>
                                </div>
                                {tiers.map((t, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500">{unitWord}</span>
                                        <input type="number" min={1} value={t.from_n} onChange={e => setTier(i, "from_n", Number(e.target.value))} className={`${inputCls} w-16 text-center`} />
                                        <span className="text-xs text-slate-500">เป็นต้นไป =</span>
                                        <input type="number" min={0} max={100} value={t.pct} onChange={e => setTier(i, "pct", Number(e.target.value))} className={`${inputCls} w-20 text-center`} />
                                        <span className="text-xs text-slate-500">%</span>
                                        <button onClick={() => setTiers(tiers.filter((_, idx) => idx !== i))} className="ml-auto text-slate-300 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                ))}
                                <p className="text-[11px] text-slate-400">เช่น {unitWord} 1 = 10%, {unitWord} 2 เป็นต้นไป = 5% · ระบบเลือกขั้นสูงสุดที่ {unitWord} ถึง</p>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">% เริ่มต้น (ใช้เมื่อไม่เข้าขั้นใด)</label>
                                    <input type="number" min={0} max={100} value={flatPct} onChange={e => setFlatPct(Number(e.target.value))} className={`${inputCls} w-24 ml-2`} />
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-bold text-slate-600">เหตุผล/หมายเหตุการแก้ (เก็บใน log)</label>
                            <input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ปรับลดเรทหลังบิลแรกตามสัญญาใหม่" className={`${inputCls} w-full h-10`} />
                        </div>

                        {err && <p className="text-xs text-rose-600">{err}</p>}
                        <button onClick={save} disabled={saving} className="w-full h-11 rounded-xl bg-[#2B54F0] text-white font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} บันทึกเรท
                        </button>

                        {audit.length > 0 && (
                            <div className="pt-2 border-t border-slate-100">
                                <button onClick={() => setShowHistory(h => !h)} className="text-xs font-bold text-slate-500 inline-flex items-center gap-1"><History className="h-3.5 w-3.5" /> ประวัติการแก้ ({audit.length})</button>
                                {showHistory && (
                                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                                        {audit.map(a => (
                                            <div key={a.id} className="text-[11px] bg-slate-50 rounded-lg p-2">
                                                <div className="flex justify-between text-slate-500">
                                                    <span>{a.actor_name || "—"}</span>
                                                    <span>{new Date(a.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
                                                </div>
                                                <div className="text-slate-700 mt-0.5">{scheduleText(a.old_value)} <ArrowRight className="h-3 w-3 inline opacity-40" /> {scheduleText(a.new_value)}</div>
                                                {a.note && <div className="text-slate-400 italic mt-0.5">“{a.note}”</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function scheduleText(s: RateSchedule | null): string {
    if (!s) return "—";
    if (s.basis === "flat") return `${s.flat_pct}%`;
    const u = s.basis === "month_seq" ? "ด." : "บ.";
    return `${BASIS_LABEL[s.basis]}: ` + s.tiers.map(t => `${u}${t.from_n}+→${t.pct}%`).join(", ");
}

function AddModal({ onClose, onSaved, pending, startTransition, branches }: { onClose: () => void; onSaved: () => void; pending: boolean; startTransition: (cb: () => void) => void; branches: BranchOption[] }) {
    const [form, setForm] = useState({ name: "", phone: "", bank_account: "", bank_name: "", referral_code: "", commission_type: "one_time" as "one_time" | "recurring", commission_pct: 5, attribution_months: 6, branch_id: "" });
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
                    {branches.length > 1 && (
                        <div>
                            <label className="text-xs font-bold text-slate-600">สาขา</label>
                            <select value={form.branch_id} onChange={e => set("branch_id", e.target.value)} className={inputCls}>
                                <option value="">ทุกสาขา (ข้ามสาขา)</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
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
