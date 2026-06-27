"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Loader2, X, Split, Plus, Trash2, History } from "lucide-react";
import { transferAttribution, getAttributionLog, getInvoiceSplits, setInvoiceSplit, type AttributionLogEntry, type InvoiceSplitInfo } from "@/lib/actions/affiliates";

type Aff = { id: string; name: string };
const baht = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

/** เครื่องมือโอนสิทธิ์ลูกค้า (เซลล์คนแรก) + ประวัติ */
export function AttributionTransfer({ affiliates }: { affiliates: Aff[] }) {
    const router = useRouter();
    const [hn, setHn] = useState("");
    const [target, setTarget] = useState("");
    const [reason, setReason] = useState("");
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState(false);
    const [log, setLog] = useState<AttributionLogEntry[]>([]);
    const [showLog, setShowLog] = useState(false);

    async function loadLog() { setLog(await getAttributionLog()); setShowLog(true); }
    function submit() {
        setErr(null); setOk(false);
        if (!hn.trim()) { setErr("ใส่ HN ลูกค้า"); return; }
        start(async () => {
            const r = await transferAttribution(hn.trim(), target || null, reason);
            if (!r.success) { setErr(r.error || "โอนไม่สำเร็จ"); return; }
            setOk(true); setHn(""); setReason(""); setTarget("");
            router.refresh();
            if (showLog) setLog(await getAttributionLog());
        });
    }
    const inputCls = "h-9 rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30";

    return (
        <div className="gonix-card-premium p-5">
            <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-slate-800 text-sm flex items-center gap-2"><ArrowLeftRight className="h-4 w-4 text-amber-600" /> โอนสิทธิ์ดูแลลูกค้า (แก้ข้อพิพาท)</div>
                <button onClick={loadLog} className="text-xs font-bold text-slate-500 inline-flex items-center gap-1"><History className="h-3.5 w-3.5" /> ประวัติ</button>
            </div>
            <div className="grid sm:grid-cols-4 gap-2">
                <input value={hn} onChange={e => setHn(e.target.value)} placeholder="HN ลูกค้า" className={`${inputCls} font-mono`} />
                <select value={target} onChange={e => setTarget(e.target.value)} className={inputCls}>
                    <option value="">— เซลล์ใหม่ (หรือว่าง=เอาออก) —</option>
                    {affiliates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="เหตุผล (บันทึก log)" className={`${inputCls} sm:col-span-1`} />
                <button onClick={submit} disabled={pending} className="h-9 rounded-lg bg-amber-500 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />} โอนสิทธิ์
                </button>
            </div>
            {err && <p className="text-xs text-rose-600 mt-2">{err}</p>}
            {ok && <p className="text-xs text-emerald-600 mt-2">โอนสิทธิ์เรียบร้อย · บันทึก log แล้ว</p>}
            <p className="text-[11px] text-slate-400 mt-2">เซลล์คนแรกได้ค่าคอม recurring ตลอดอายุ attribution — ใช้เครื่องมือนี้เฉพาะเมื่อต้องเปลี่ยนตัวผู้ดูแลอย่างเป็นทางการ</p>

            {showLog && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                    {log.length === 0 ? <p className="text-xs text-slate-400">ยังไม่มีประวัติการโอน</p> : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {log.map(l => (
                                <div key={l.id} className="text-[11px] bg-slate-50 rounded-lg p-2">
                                    <div className="flex justify-between text-slate-500">
                                        <span className="font-mono">HN {l.hn}</span>
                                        <span>{new Date(l.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
                                    </div>
                                    <div className="text-slate-700">{l.old_name} → {l.new_name} {l.actor_name && <span className="text-slate-400">· โดย {l.actor_name}</span>}</div>
                                    {l.reason && <div className="text-slate-400 italic">“{l.reason}”</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** ปุ่มแบ่งบิล (ต่อ 1 invoice) */
export function InvoiceSplitButton({ invId, affiliates }: { invId: string; affiliates: Aff[] }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-violet-600" title="แบ่งค่าคอมบิลนี้">
                <Split className="h-3.5 w-3.5" />
            </button>
            {open && <SplitModal invId={invId} affiliates={affiliates} onClose={() => setOpen(false)} />}
        </>
    );
}

function SplitModal({ invId, affiliates, onClose }: { invId: string; affiliates: Aff[]; onClose: () => void }) {
    const router = useRouter();
    const [info, setInfo] = useState<InvoiceSplitInfo | null>(null);
    const [rows, setRows] = useState<{ affiliate_id: string; pct: number }[]>([]);
    const [saving, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            const d = await getInvoiceSplits(invId);
            setInfo(d);
            setRows(d.splits.length ? d.splits.map(s => ({ affiliate_id: s.affiliate_id, pct: s.pct })) : []);
        })();
    }, [invId]);

    const sum = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);
    function addRow() { setRows([...rows, { affiliate_id: info?.primary?.id || "", pct: 0 }]); }
    function setRow(i: number, k: "affiliate_id" | "pct", v: string | number) { setRows(rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r)); }
    function save() {
        setErr(null);
        start(async () => {
            const r = await setInvoiceSplit(invId, rows, "แบ่งบิล (assisted close)");
            if (!r.success) { setErr(r.error || "บันทึกไม่สำเร็จ"); return; }
            router.refresh(); onClose();
        });
    }
    const inputCls = "h-9 rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30";

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Split className="h-5 w-5 text-violet-600" /> แบ่งค่าคอมบิลนี้</h2>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><X className="h-4 w-4" /></button>
                </div>
                {!info ? <div className="py-8 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
                    <div className="space-y-3">
                        <div className="text-xs text-slate-500">
                            บิล <span className="font-mono">{invId}</span> · ยอดขาย <span className="font-bold">{baht(info.sale)}</span>
                            {info.primary && <> · เซลล์หลัก: <span className="font-bold">{info.primary.name}</span></>}
                        </div>
                        <div className="space-y-2">
                            {rows.map((r, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <select value={r.affiliate_id} onChange={e => setRow(i, "affiliate_id", e.target.value)} className={`${inputCls} flex-1`}>
                                        <option value="">— เลือกเซลล์ —</option>
                                        {affiliates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                    <input type="number" min={0} max={100} value={r.pct} onChange={e => setRow(i, "pct", Number(e.target.value))} className={`${inputCls} w-20 text-center`} />
                                    <span className="text-xs text-slate-500">%</span>
                                    <button onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                                </div>
                            ))}
                            <button onClick={addRow} className="text-[11px] font-bold text-[#2B54F0] inline-flex items-center gap-1"><Plus className="h-3 w-3" /> เพิ่มเซลล์</button>
                        </div>
                        <div className="text-xs flex justify-between">
                            <span className="text-slate-500">รวม {sum}% ของยอดขาย = {baht(Math.round(info.sale * sum) / 100)}</span>
                            {sum > 100 && <span className="text-rose-600 font-bold">เกิน 100%</span>}
                        </div>
                        <p className="text-[11px] text-slate-400">ถ้าบิลนี้มีการแบ่ง ค่าคอมจะคิดตาม % นี้แทน attribution ปกติ (แต่ละคนได้ ยอดขาย × % ของตน) · ลบทุกแถวแล้วบันทึก = กลับไปคิดแบบปกติ</p>
                        {err && <p className="text-xs text-rose-600">{err}</p>}
                        <button onClick={save} disabled={saving || sum > 100} className="w-full h-10 rounded-xl bg-violet-600 text-white font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Split className="h-4 w-4" />} บันทึกการแบ่ง
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
