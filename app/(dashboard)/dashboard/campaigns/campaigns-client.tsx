"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, X, Loader2, Ticket, Power, Trash2, Pencil, TrendingUp } from "lucide-react";
import {
    createCampaign, updateCampaign, toggleCampaign, deleteCampaign,
    type CampaignInput, type CampaignPerf,
} from "@/lib/actions/campaigns";
import { type Campaign, APPLIES_TO_LABEL, CAMPAIGN_CHANNELS } from "@/lib/campaign-types";

const money = (n: number) => `฿${Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function statusOf(c: Campaign, today: string): { label: string; cls: string } {
    if (!c.is_active) return { label: "ปิดใช้งาน", cls: "bg-slate-100 text-slate-500" };
    if (c.starts_at && today < c.starts_at) return { label: "ยังไม่เริ่ม", cls: "bg-amber-100 text-amber-700" };
    if (c.ends_at && today > c.ends_at) return { label: "หมดอายุ", cls: "bg-rose-100 text-rose-700" };
    return { label: "ใช้งานอยู่", cls: "bg-emerald-100 text-emerald-700" };
}

export default function CampaignsClient({ campaigns, perf, range, canManage }: {
    campaigns: Campaign[]; perf: CampaignPerf[]; range: { from: string; to: string }; canManage: boolean;
}) {
    const router = useRouter();
    const [editing, setEditing] = useState<Campaign | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [err, setErr] = useState("");
    const [, start] = useTransition();
    const today = new Date().toISOString().slice(0, 10);

    const perfMap = new Map(perf.map(p => [p.campaign_id, p]));
    const totalDiscount = perf.reduce((s, p) => s + p.discount_total, 0);
    const totalNet = perf.reduce((s, p) => s + p.net_revenue, 0);
    const totalBills = perf.reduce((s, p) => s + p.invoice_count, 0);

    function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
        start(async () => {
            const r = await fn();
            if (!r.ok) setErr(r.error || "ผิดพลาด"); else { setErr(""); router.refresh(); }
        });
    }

    function setRange(from: string, to: string) {
        router.push(`/dashboard/campaigns?from=${from}&to=${to}`);
    }

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in pb-12">
            <div className="flex items-center justify-between pt-1">
                <p className="text-sm font-medium text-slate-500">
                    <span className="font-bold text-blue-700">แคมเปญ & ส่วนลด</span> · โค้ดโปรโมชันและผลตอบรับ
                </p>
                {canManage && (
                    <Button onClick={() => { setEditing(null); setShowForm(true); setErr(""); }}
                        className="rounded-xl gap-1.5 h-9 bg-cyan-600 hover:bg-cyan-700 text-white">
                        <Plus className="h-4 w-4" /> สร้างแคมเปญ
                    </Button>
                )}
            </div>
            {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

            {/* สรุปช่วง */}
            <div className="gonix-card-premium p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" /> ผลตอบรับ {range.from} – {range.to}
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="date" value={range.from} onChange={e => setRange(e.target.value, range.to)}
                            className="h-8 rounded-lg border border-slate-200 px-2 text-xs" />
                        <span className="text-slate-400 text-xs">ถึง</span>
                        <input type="date" value={range.to} onChange={e => setRange(range.from, e.target.value)}
                            className="h-8 rounded-lg border border-slate-200 px-2 text-xs" />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">บิลที่ใช้โค้ด</div>
                        <div className="text-xl font-black text-slate-800 tabular-nums">{totalBills}</div>
                    </div>
                    <div className="rounded-xl bg-red-50 p-3">
                        <div className="text-[10px] font-bold text-red-600 uppercase">ส่วนลดที่ให้ไป</div>
                        <div className="text-xl font-black text-red-700 tabular-nums">{money(totalDiscount)}</div>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-3">
                        <div className="text-[10px] font-bold text-emerald-600 uppercase">รายได้สุทธิที่ได้กลับมา</div>
                        <div className="text-xl font-black text-emerald-700 tabular-nums">{money(totalNet)}</div>
                    </div>
                </div>
            </div>

            {/* ตารางแคมเปญ */}
            <div className="gonix-card-premium overflow-hidden">
                {campaigns.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-400">
                        <Ticket className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        ยังไม่มีแคมเปญ — สร้างโค้ดแรกเพื่อให้เคาน์เตอร์กรอกตอนคิดเงิน
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[820px]">
                            <thead className="bg-slate-50/60 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="text-left px-4 py-2">โค้ด / ชื่อ</th>
                                    <th className="text-left px-3 py-2">ส่วนลด</th>
                                    <th className="text-left px-3 py-2">ใช้กับ</th>
                                    <th className="text-left px-3 py-2">ช่วงเวลา</th>
                                    <th className="text-right px-3 py-2">ใช้ไป</th>
                                    <th className="text-right px-3 py-2">ส่วนลดรวม</th>
                                    <th className="text-center px-3 py-2">สถานะ</th>
                                    <th className="px-2 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.map(c => {
                                    const st = statusOf(c, today);
                                    const p = perfMap.get(c.id);
                                    return (
                                        <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                                            <td className="px-4 py-2.5">
                                                <div className="font-mono font-black text-blue-700">{c.code}</div>
                                                <div className="text-[11px] text-slate-500 truncate max-w-[180px]">{c.name}</div>
                                                {c.channel && <span className="text-[10px] font-bold text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded">{CAMPAIGN_CHANNELS.find(x => x.v === c.channel)?.l || c.channel}</span>}
                                            </td>
                                            <td className="px-3 py-2.5 tabular-nums">
                                                {c.discount_type === "percent" ? `${c.discount_value}%` : money(c.discount_value)}
                                                {c.max_discount_amount != null && <div className="text-[10px] text-slate-400">สูงสุด {money(c.max_discount_amount)}</div>}
                                                {c.min_purchase > 0 && <div className="text-[10px] text-slate-400">ขั้นต่ำ {money(c.min_purchase)}</div>}
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-600 text-xs">{APPLIES_TO_LABEL[c.applies_to] || c.applies_to}</td>
                                            <td className="px-3 py-2.5 text-xs text-slate-500 tabular-nums">
                                                {c.starts_at || "—"} → {c.ends_at || "ไม่จำกัด"}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">
                                                {p?.invoice_count || 0}{c.usage_limit != null ? ` / ${c.usage_limit}` : ""}
                                                <div className="text-[10px] text-slate-400">{p?.unique_patients || 0} คน</div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums font-bold text-red-600">{money(p?.discount_total || 0)}</td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                                            </td>
                                            <td className="px-2 py-2.5">
                                                {canManage && (
                                                    <div className="flex items-center gap-1 justify-end">
                                                        <button onClick={() => { setEditing(c); setShowForm(true); setErr(""); }} title="แก้ไข"
                                                            className="h-7 w-7 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 inline-flex items-center justify-center"><Pencil className="h-3.5 w-3.5" /></button>
                                                        <button onClick={() => run(() => toggleCampaign(c.id, !c.is_active))} title={c.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                                                            className="h-7 w-7 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 inline-flex items-center justify-center"><Power className="h-3.5 w-3.5" /></button>
                                                        <button onClick={() => { if (confirm(`ลบแคมเปญ ${c.code}?`)) run(() => deleteCampaign(c.id)); }} title="ลบ"
                                                            className="h-7 w-7 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center"><Trash2 className="h-3.5 w-3.5" /></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showForm && (
                <CampaignForm
                    initial={editing}
                    onClose={() => { setShowForm(false); setEditing(null); }}
                    onDone={() => { setShowForm(false); setEditing(null); router.refresh(); }}
                    onError={setErr}
                />
            )}
        </div>
    );
}

// ══════════ ฟอร์มสร้าง/แก้ไข ══════════
function CampaignForm({ initial, onClose, onDone, onError }: {
    initial: Campaign | null; onClose: () => void; onDone: () => void; onError: (m: string) => void;
}) {
    const [f, setF] = useState<CampaignInput>({
        code: initial?.code || "",
        name: initial?.name || "",
        discount_type: initial?.discount_type || "percent",
        discount_value: initial?.discount_value ?? 10,
        max_discount_amount: initial?.max_discount_amount ?? null,
        min_purchase: initial?.min_purchase ?? 0,
        applies_to: initial?.applies_to || "all",
        channel: initial?.channel || null,
        starts_at: initial?.starts_at || null,
        ends_at: initial?.ends_at || null,
        usage_limit: initial?.usage_limit ?? null,
        usage_limit_per_patient: initial?.usage_limit_per_patient ?? 1,
        is_active: initial?.is_active ?? true,
    });
    const [pending, start] = useTransition();
    const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v) || 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-3 my-8">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">{initial ? "แก้ไขแคมเปญ" : "สร้างแคมเปญ"}</h3>
                    <button onClick={onClose}><X className="h-5 w-5 text-slate-500" /></button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-bold text-slate-700">โค้ด *</label>
                        <input value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="LINE10"
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono uppercase" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700">ชื่อแคมเปญ *</label>
                        <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="ลด 10% ลูกค้า LINE"
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <div>
                        <label className="text-xs font-bold text-slate-700">ประเภท</label>
                        <select value={f.discount_type} onChange={e => setF({ ...f, discount_type: e.target.value as "percent" | "fixed" })}
                            className="mt-1 w-full h-10 rounded-lg border border-slate-200 px-2 text-sm">
                            <option value="percent">เปอร์เซ็นต์</option><option value="fixed">จำนวนเงิน</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700">{f.discount_type === "percent" ? "ลด %" : "ลด ฿"} *</label>
                        <input type="number" min={0} value={f.discount_value} onChange={e => setF({ ...f, discount_value: Number(e.target.value) || 0 })}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700">เพดาน ฿</label>
                        <input type="number" min={0} value={f.max_discount_amount ?? ""} onChange={e => setF({ ...f, max_discount_amount: numOrNull(e.target.value) })}
                            placeholder="ไม่จำกัด" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-bold text-slate-700">ใช้ได้กับ</label>
                        <select value={f.applies_to} onChange={e => setF({ ...f, applies_to: e.target.value })}
                            className="mt-1 w-full h-10 rounded-lg border border-slate-200 px-2 text-sm">
                            {Object.entries(APPLIES_TO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700">ยอดขั้นต่ำ ฿</label>
                        <input type="number" min={0} value={f.min_purchase || ""} onChange={e => setF({ ...f, min_purchase: Number(e.target.value) || 0 })}
                            placeholder="0" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums" />
                    </div>
                </div>

                <div>
                    <label className="text-xs font-bold text-slate-700">ช่องทางที่มา (attribution)</label>
                    <select value={f.channel || ""} onChange={e => setF({ ...f, channel: e.target.value || null })}
                        className="mt-1 w-full h-10 rounded-lg border border-slate-200 px-2 text-sm">
                        <option value="">— ไม่ระบุ —</option>
                        {CAMPAIGN_CHANNELS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-0.5">ใช้แยกรายงานว่าช่องทางไหนดึงลูกค้าได้ดีกว่ากัน</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-bold text-slate-700">เริ่มใช้</label>
                        <input type="date" value={f.starts_at || ""} onChange={e => setF({ ...f, starts_at: e.target.value || null })}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700">หมดอายุ</label>
                        <input type="date" value={f.ends_at || ""} onChange={e => setF({ ...f, ends_at: e.target.value || null })}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-bold text-slate-700">ใช้ได้ทั้งหมด (ครั้ง)</label>
                        <input type="number" min={1} value={f.usage_limit ?? ""} onChange={e => setF({ ...f, usage_limit: numOrNull(e.target.value) })}
                            placeholder="ไม่จำกัด" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700">ต่อคนไข้ (ครั้ง)</label>
                        <input type="number" min={1} value={f.usage_limit_per_patient} onChange={e => setF({ ...f, usage_limit_per_patient: Number(e.target.value) || 1 })}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums" />
                    </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={f.is_active ?? true} onChange={e => setF({ ...f, is_active: e.target.checked })} className="h-4 w-4" />
                    เปิดใช้งาน
                </label>

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="outline" onClick={onClose} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                    <Button disabled={pending} onClick={() => start(async () => {
                        const r = initial ? await updateCampaign(initial.id, f) : await createCampaign(f);
                        if (!r.ok) { onError(r.error); return; }
                        onDone();
                    })} className="rounded-xl bg-cyan-600 text-white">
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "บันทึก"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
