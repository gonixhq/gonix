"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, X, Loader2, Search, Clock, CheckCircle2, XCircle, Stethoscope, Settings, PlayCircle, Receipt } from "lucide-react";
import {
    createPreOrder, confirmPreOrder, recordDeposit, checkInPreOrder,
    openConsult, submitDecisions, cancelPreOrder, extendExpiry, getPreOrder,
    startTreatment, completeTreatment, resolveRefund, updatePreOrderSettings,
    type PreOrderSettings, type CompleteTreatmentInput,
} from "@/lib/actions/pre-order";
import { getPatients, createPatient } from "@/lib/actions/patients";

const PREFIXES = ["นาย", "นาง", "นางสาว", "เด็กชาย", "เด็กหญิง"];

type Svc = { id: string; name: string; price: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PO = any;

const CHANNELS = [
    { v: "line_oa", l: "LINE OA" }, { v: "tiktok", l: "TikTok" }, { v: "facebook", l: "Facebook" },
    { v: "instagram", l: "Instagram" }, { v: "walk_in", l: "Walk-in" }, { v: "phone", l: "โทรศัพท์" }, { v: "other", l: "อื่นๆ" },
];
const STATUS: Record<string, { l: string; c: string }> = {
    draft: { l: "ร่าง", c: "bg-slate-100 text-slate-600" },
    pending_deposit: { l: "รอมัดจำ", c: "bg-amber-100 text-amber-700" },
    pending_doctor: { l: "รอพบแพทย์", c: "bg-blue-100 text-blue-700" },
    scheduled: { l: "นัดแล้ว", c: "bg-indigo-100 text-indigo-700" },
    checked_in: { l: "เช็คอิน", c: "bg-cyan-100 text-cyan-700" },
    in_consult: { l: "หมอกำลังตรวจ", c: "bg-violet-100 text-violet-700" },
    decided: { l: "ตัดสินแล้ว", c: "bg-emerald-100 text-emerald-700" },
    awaiting_confirmation: { l: "รอยืนยัน", c: "bg-amber-100 text-amber-700" },
    in_treatment: { l: "กำลังรักษา", c: "bg-teal-100 text-teal-700" },
    completed: { l: "เสร็จสิ้น", c: "bg-emerald-100 text-emerald-700" },
    cancelled: { l: "ยกเลิก", c: "bg-slate-200 text-slate-500" },
    rejected_full: { l: "หมอปฏิเสธทั้งหมด", c: "bg-rose-100 text-rose-700" },
    expired: { l: "หมดอายุ", c: "bg-slate-200 text-slate-500" },
};
const badge = (s: string) => STATUS[s] || { l: s, c: "bg-slate-100 text-slate-600" };

export default function PreOrdersClient({ initial, settings, refunds, services, canManage, canDecide, canExtend, canSettings, canRefund }: {
    initial: PO[]; settings: PreOrderSettings; refunds: PO[]; services: Svc[];
    canManage: boolean; canDecide: boolean; canExtend: boolean; canSettings: boolean; canRefund: boolean;
}) {
    const router = useRouter();
    const [showCreate, setShowCreate] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [detail, setDetail] = useState<PO | null>(null);
    const [err, setErr] = useState("");
    const minDeposit = settings.min_deposit_amount;

    async function openDetail(id: string) {
        setDetailId(id); setDetail(null); setErr("");
        const d = await getPreOrder(id);
        setDetail(d);
    }
    async function refresh() {
        router.refresh();
        if (detailId) setDetail(await getPreOrder(detailId));
    }

    return (
        <div className="space-y-4 max-w-6xl mx-auto animate-fade-in pb-12">
            <div className="flex items-center justify-between pt-1">
                <p className="text-sm font-medium text-slate-500"><span className="font-bold text-blue-700">พรีออเดอร์</span> · จองล่วงหน้า + Doctor Gate</p>
                <div className="flex items-center gap-2">
                    {canSettings && (
                        <Button variant="outline" onClick={() => { setShowSettings(true); setErr(""); }} className="rounded-xl gap-1.5 h-9">
                            <Settings className="h-4 w-4" /> ตั้งค่า
                        </Button>
                    )}
                    {canManage && (
                        <Button onClick={() => { setShowCreate(true); setErr(""); }} className="rounded-xl gap-1.5 h-9 bg-cyan-600 hover:bg-cyan-700 text-white">
                            <Plus className="h-4 w-4" /> สร้างพรีออเดอร์
                        </Button>
                    )}
                </div>
            </div>
            {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

            {/* คำขอคืนมัดจำที่รออนุมัติ */}
            {refunds.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                    <div className="text-xs font-black text-amber-800 uppercase tracking-wide">คำขอคืนมัดจำ ({refunds.length})</div>
                    {refunds.map((r: PO) => (
                        <div key={r.id} className="flex items-center justify-between gap-2 text-sm bg-white rounded-lg px-3 py-2">
                            <div className="min-w-0">
                                <span className="font-mono text-blue-700">{r.hn}</span>
                                <span className="font-bold tabular-nums ml-2">฿{Number(r.amount).toLocaleString()}</span>
                                <div className="text-[11px] text-slate-500 truncate">{r.reason || "—"}</div>
                            </div>
                            {canRefund ? (
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={async () => {
                                        const res = await resolveRefund(r.id, true);
                                        if (!res.ok) setErr(res.error); else router.refresh();
                                    }} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold">อนุมัติคืน</button>
                                    <button onClick={async () => {
                                        if (!confirm("ปฏิเสธคำขอคืนเงินนี้? (ยอดจะกลับไปเป็นเครดิต)")) return;
                                        const res = await resolveRefund(r.id, false);
                                        if (!res.ok) setErr(res.error); else router.refresh();
                                    }} className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-bold">ปฏิเสธ</button>
                                </div>
                            ) : <span className="text-[11px] text-amber-700 shrink-0">รอผู้มีสิทธิ์อนุมัติ</span>}
                        </div>
                    ))}
                </div>
            )}

            <div className="gonix-card-premium overflow-hidden">
                {initial.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-400">ยังไม่มีพรีออเดอร์</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50/60 text-[10px] font-black uppercase tracking-wider text-slate-500">
                            <tr><th className="text-left px-4 py-2">HN</th><th className="text-left px-4 py-2">สถานะ</th>
                                <th className="text-left px-4 py-2">ช่องทาง</th><th className="text-left px-4 py-2 hidden sm:table-cell">มัดจำหมดอายุ</th>
                                <th className="text-left px-4 py-2 hidden md:table-cell">สร้างเมื่อ</th></tr>
                        </thead>
                        <tbody>
                            {initial.map((p) => (
                                <tr key={p.id} onClick={() => openDetail(p.id)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                                    <td className="px-4 py-2.5 font-mono text-slate-700">{p.hn}</td>
                                    <td className="px-4 py-2.5"><span className={`text-[11px] font-bold px-2 py-0.5 rounded ${badge(p.status).c}`}>{badge(p.status).l}</span></td>
                                    <td className="px-4 py-2.5 text-slate-500">{CHANNELS.find(c => c.v === p.channel)?.l || p.channel}</td>
                                    <td className="px-4 py-2.5 text-slate-500 hidden sm:table-cell tabular-nums">{p.deposit_expires_at ? new Date(p.deposit_expires_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—"}</td>
                                    <td className="px-4 py-2.5 text-slate-400 hidden md:table-cell tabular-nums">{new Date(p.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {showCreate && <CreateModal services={services} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); refresh(); }} onError={setErr} />}
            {showSettings && <SettingsModal settings={settings} onClose={() => setShowSettings(false)} onDone={() => { setShowSettings(false); router.refresh(); }} onError={setErr} />}
            {detailId && <DetailDrawer po={detail} services={services} minDeposit={minDeposit} canDecide={canDecide} canExtend={canExtend} canManage={canManage}
                onClose={() => { setDetailId(null); setDetail(null); }} onAction={refresh} onError={setErr} />}
        </div>
    );
}

// ══════════ Create ══════════
function CreateModal({ services, onClose, onDone, onError }: { services: Svc[]; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
    const [q, setQ] = useState("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [results, setResults] = useState<any[]>([]);
    const [hn, setHn] = useState(""); const [hnLabel, setHnLabel] = useState("");
    const [newMode, setNewMode] = useState(false);
    const [np, setNp] = useState({ prefix: "นางสาว", first_name: "", last_name: "", phone: "" });
    const [creating, setCreating] = useState(false);
    const [channel, setChannel] = useState("line_oa");
    const [items, setItems] = useState<{ service_id: string; name: string; qty: number; price: number }[]>([]);
    const [svcSearch, setSvcSearch] = useState("");
    const [note, setNote] = useState("");
    const [pending, start] = useTransition();

    async function search() {
        const r = await getPatients(q);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setResults((r || []) as any[]);
    }
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const filteredSvc = svcSearch ? services.filter(s => s.name.toLowerCase().includes(svcSearch.toLowerCase())).slice(0, 8) : [];

    // ลูกค้าใหม่ที่ยังไม่มี HN — เปิดทะเบียนย่อ (ชื่อ+เบอร์) แล้วออก HN ทันที
    async function createNewPatient() {
        if (!np.first_name.trim() || !np.last_name.trim()) { onError("กรอกชื่อ-นามสกุลก่อน"); return; }
        setCreating(true);
        try {
            const fd = new FormData();
            fd.set("prefix", np.prefix);
            fd.set("first_name", np.first_name.trim());
            fd.set("last_name", np.last_name.trim());
            fd.set("phone", np.phone.trim());
            const r = await createPatient(fd);
            setHn(r.hn as string);
            setHnLabel(`${r.hn} · ${np.prefix}${np.first_name} ${np.last_name}${np.phone ? ` · ${np.phone}` : ""}`);
            setNewMode(false);
        } catch (e) {
            onError(e instanceof Error ? e.message : "สร้างคนไข้ใหม่ไม่สำเร็จ");
        } finally {
            setCreating(false);
        }
    }

    function submit() {
        if (!hn) { onError("เลือกผู้ป่วยก่อน"); return; }
        if (items.length === 0) { onError("เพิ่มรายการอย่างน้อย 1"); return; }
        start(async () => {
            const res = await createPreOrder({ hn, channel, note, items: items.map(i => ({ service_id: i.service_id, qty: i.qty, unit_price_snapshot: i.price })) });
            if (!res.ok) { onError(res.error); return; }
            onDone();
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 my-8">
                <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-900">สร้างพรีออเดอร์</h3>
                    <button onClick={onClose}><X className="h-5 w-5 text-slate-500" /></button></div>

                {/* patient */}
                <div>
                    <label className="text-xs font-bold text-slate-700">ผู้ป่วย *</label>
                    {hn ? (
                        <div className="flex items-center justify-between mt-1 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                            <span className="font-semibold text-emerald-800">{hnLabel}</span>
                            <button onClick={() => { setHn(""); setHnLabel(""); }} className="text-slate-400"><X className="h-4 w-4" /></button>
                        </div>
                    ) : newMode ? (
                        <div className="mt-1 space-y-2 rounded-xl border border-cyan-200 bg-cyan-50/50 p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-cyan-800">ลูกค้าใหม่ (ระบบออก HN ให้อัตโนมัติ)</span>
                                <button type="button" onClick={() => setNewMode(false)} className="text-[11px] text-slate-500 hover:underline">← ค้นหาแทน</button>
                            </div>
                            <div className="flex gap-2">
                                <select value={np.prefix} onChange={e => setNp({ ...np, prefix: e.target.value })} className="w-24 h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                                    {PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <input value={np.first_name} onChange={e => setNp({ ...np, first_name: e.target.value })} placeholder="ชื่อ *" className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                                <input value={np.last_name} onChange={e => setNp({ ...np, last_name: e.target.value })} placeholder="นามสกุล *" className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                            </div>
                            <input value={np.phone} onChange={e => setNp({ ...np, phone: e.target.value })} placeholder="เบอร์โทร (แนะนำให้กรอก — ใช้ยืนยันตัวตอนมาถึง)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                            <Button type="button" disabled={creating} onClick={createNewPatient} className="w-full h-9 rounded-lg bg-cyan-600 text-white">
                                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "สร้างคนไข้ + ออก HN"}
                            </Button>
                            <p className="text-[10px] text-slate-500">กรอกข้อมูลย่อพอจองได้ — ที่เหลือ (บัตร ปชช./ที่อยู่/ประวัติแพ้) ค่อยเก็บตอนมาถึงคลินิก</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-2 mt-1">
                                <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="ค้น HN / ชื่อ / เบอร์" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                                <Button type="button" onClick={search} variant="outline" className="rounded-lg"><Search className="h-4 w-4" /></Button>
                            </div>
                            {results.length > 0 && (
                                <div className="mt-1 max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y">
                                    {results.map((p) => (
                                        <button key={p.hn} type="button" onClick={() => { setHn(p.hn); setHnLabel(`${p.hn} · ${p.prefix || ""}${p.first_name || ""} ${p.last_name || ""}`); setResults([]); }}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                                            <span className="font-mono text-blue-700">{p.hn}</span> · {p.first_name} {p.last_name} {p.phone ? `· ${p.phone}` : ""}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <button type="button" onClick={() => { setNewMode(true); setResults([]); }}
                                className="mt-1.5 text-xs font-bold text-cyan-700 hover:underline flex items-center gap-1">
                                <Plus className="h-3.5 w-3.5" /> ลูกค้าใหม่ (ยังไม่มี HN)
                            </button>
                        </>
                    )}
                </div>

                {/* channel */}
                <div><label className="text-xs font-bold text-slate-700">ช่องทาง (attribution) *</label>
                    <select value={channel} onChange={e => setChannel(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-slate-200 px-3 text-sm">
                        {CHANNELS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                    </select>
                </div>

                {/* items */}
                <div>
                    <label className="text-xs font-bold text-slate-700">รายการ *</label>
                    <input value={svcSearch} onChange={e => setSvcSearch(e.target.value)} placeholder="ค้นบริการเพื่อเพิ่ม..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    {filteredSvc.length > 0 && (
                        <div className="mt-1 max-h-32 overflow-y-auto border border-slate-200 rounded-lg divide-y">
                            {filteredSvc.map(s => (
                                <button key={s.id} type="button" onClick={() => { setItems(prev => prev.some(i => i.service_id === s.id) ? prev : [...prev, { service_id: s.id, name: s.name, qty: 1, price: s.price }]); setSvcSearch(""); }}
                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex justify-between"><span>{s.name}</span><span className="text-slate-400">฿{s.price.toLocaleString()}</span></button>
                            ))}
                        </div>
                    )}
                    <div className="mt-2 space-y-1">
                        {items.map((it, idx) => (
                            <div key={it.service_id} className="flex items-center gap-2 text-sm">
                                <span className="flex-1 truncate">{it.name}</span>
                                <input type="number" min={1} value={it.qty} onChange={e => setItems(p => p.map((x, i) => i === idx ? { ...x, qty: parseInt(e.target.value) || 1 } : x))} className="w-14 rounded border border-slate-200 px-2 py-1 text-right" />
                                <input type="number" value={it.price} onChange={e => setItems(p => p.map((x, i) => i === idx ? { ...x, price: parseFloat(e.target.value) || 0 } : x))} className="w-24 rounded border border-slate-200 px-2 py-1 text-right tabular-nums" />
                                <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))}><X className="h-4 w-4 text-slate-400" /></button>
                            </div>
                        ))}
                        {items.length > 0 && <div className="text-right text-sm font-bold pt-1">รวม ฿{total.toLocaleString()}</div>}
                    </div>
                </div>

                <input value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุ (เช่น จองผ่านแชท TikTok)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="outline" onClick={onClose} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                    <Button onClick={submit} disabled={pending || !hn || items.length === 0} className="rounded-xl bg-cyan-600 text-white">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "สร้าง"}</Button>
                </div>
            </div>
        </div>
    );
}

// ══════════ ปิดบิล (T11) ══════════
function CompleteBox({ po, onError, onDone }: { po: PO; onError: (m: string) => void; onDone: () => void }) {
    const [pending, start] = useTransition();
    const [discount, setDiscount] = useState("");
    const [method, setMethod] = useState<CompleteTreatmentInput["payment_method"]>("cash");
    const [ref, setRef] = useState("");
    const [excessRes, setExcessRes] = useState<"convert_to_credit" | "refund_request">("convert_to_credit");

    const approved = (po.items || []).filter((i: PO) => i.status === "approved");
    const subtotal = approved.reduce((s: number, i: PO) => s + Number(i.unit_price_snapshot) * Number(i.qty), 0);
    const disc = Math.max(0, parseFloat(discount) || 0);
    const total = Math.max(0, subtotal - disc);

    // มัดจำคงเหลือของพรีออเดอร์นี้ (สูตรเดียวกับฝั่ง server)
    const deposit = (po.ledger || []).reduce((s: number, l: PO) => {
        const amt = Number(l.amount || 0);
        if (l.entry_type === "deposit_received") return s + amt;
        if (["applied_to_invoice", "refunded", "forfeited"].includes(l.entry_type)) return s - Math.abs(amt);
        return s;
    }, 0);
    const applied = Math.min(Math.max(0, deposit), total);
    const excess = Math.max(0, deposit - total);
    const due = Math.max(0, total - applied);

    return (
        <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
            <div className="text-xs font-black text-teal-800 uppercase tracking-wide">ปิดบิล / ออกใบเสร็จ</div>

            <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">ยอดรวม (ราคาล็อกจากวันจอง)</span><span className="tabular-nums font-semibold">฿{subtotal.toLocaleString()}</span></div>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">ส่วนลด</span>
                    <input type="number" min={0} value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0"
                        className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm text-right tabular-nums" />
                </div>
                <div className="flex justify-between border-t border-teal-200 pt-1"><span className="font-bold">ยอดสุทธิ</span><span className="tabular-nums font-bold">฿{total.toLocaleString()}</span></div>
                <div className="flex justify-between text-emerald-700"><span>หักมัดจำ</span><span className="tabular-nums">−฿{applied.toLocaleString()}</span></div>
                <div className="flex justify-between border-t border-teal-200 pt-1"><span className="font-bold text-rose-700">ต้องเก็บเพิ่ม</span><span className="tabular-nums font-black text-rose-700">฿{due.toLocaleString()}</span></div>
            </div>

            {due > 0 && (
                <div className="flex gap-2">
                    <select value={method} onChange={e => setMethod(e.target.value as CompleteTreatmentInput["payment_method"])} className="flex-1 h-9 rounded-lg border border-slate-200 px-2 text-sm">
                        <option value="cash">เงินสด</option><option value="transfer">โอน</option>
                        <option value="credit_card">บัตรเครดิต</option><option value="qr_promptpay">พร้อมเพย์</option>
                    </select>
                    <input value={ref} onChange={e => setRef(e.target.value)} placeholder="เลขท้ายสลิป" className="w-28 rounded-lg border border-slate-200 px-2 text-sm" />
                </div>
            )}

            {excess > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 space-y-1">
                    <div className="text-[11px] font-bold text-amber-800">มัดจำเกินยอดบิล ฿{excess.toLocaleString()} — จะจัดการอย่างไร?</div>
                    <select value={excessRes} onChange={e => setExcessRes(e.target.value as "convert_to_credit" | "refund_request")} className="w-full h-8 rounded-lg border border-amber-200 px-2 text-sm bg-white">
                        <option value="convert_to_credit">เก็บเป็นเครดิตของลูกค้า</option>
                        <option value="refund_request">ขอคืนเงิน (รออนุมัติ)</option>
                    </select>
                </div>
            )}

            <Button disabled={pending} onClick={() => start(async () => {
                const r = await completeTreatment(po.id, {
                    payment_method: method, extra_paid: due, discount: disc,
                    payment_ref: ref || undefined,
                    excess_resolution: excess > 0 ? excessRes : undefined,
                });
                if (!r.ok) { onError(r.error); return; }
                onDone();
            })} className="w-full rounded-lg bg-teal-600 text-white h-9 gap-1.5">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Receipt className="h-4 w-4" /> รับเงิน + ออกใบเสร็จ</>}
            </Button>
            <p className="text-[10px] text-slate-500">ระบบจะออกใบเสร็จ ตัดสต๊อกที่ผูกกับบริการ ปิด Visit และปิดพรีออเดอร์ให้อัตโนมัติ</p>
        </div>
    );
}

// ══════════ ตั้งค่า (P1/P2/P3) ══════════
function SettingsModal({ settings, onClose, onDone, onError }: {
    settings: PreOrderSettings; onClose: () => void; onDone: () => void; onError: (m: string) => void;
}) {
    const [s, setS] = useState(settings);
    const [warnDays, setWarnDays] = useState((settings.expiry_warning_days || []).join(","));
    const [pending, start] = useTransition();

    const num = (v: string, fb: number) => (v === "" ? 0 : parseInt(v)) || fb;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">ตั้งค่าพรีออเดอร์</h3>
                    <button onClick={onClose}><X className="h-5 w-5 text-slate-500" /></button>
                </div>

                <div className="space-y-3 text-sm">
                    <div>
                        <label className="text-xs font-bold text-slate-700">อายุมัดจำ (วัน)</label>
                        <input type="number" min={1} value={s.deposit_validity_days} onChange={e => setS({ ...s, deposit_validity_days: num(e.target.value, 90) })}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700">มัดจำขั้นต่ำ (บาท)</label>
                        <input type="number" min={0} value={s.min_deposit_amount} onChange={e => setS({ ...s, min_deposit_amount: parseFloat(e.target.value) || 0 })}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700">เมื่อมัดจำหมดอายุ</label>
                        <select value={s.expiry_action} onChange={e => setS({ ...s, expiry_action: e.target.value })}
                            className="mt-1 w-full h-10 rounded-lg border border-slate-200 px-3">
                            <option value="convert_to_credit">แปลงเป็นเครดิตลูกค้า (แนะนำ)</option>
                            <option value="forfeit">ริบมัดจำ</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs font-bold text-slate-700">ขยายอายุได้ (ครั้ง)</label>
                            <input type="number" min={0} value={s.max_expiry_extensions} onChange={e => setS({ ...s, max_expiry_extensions: num(e.target.value, 1) })}
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-700">ขยายครั้งละ (วัน)</label>
                            <input type="number" min={1} value={s.extension_days} onChange={e => setS({ ...s, extension_days: num(e.target.value, 30) })}
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 tabular-nums" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700">เตือนล่วงหน้าก่อนหมดอายุ (วัน, คั่นด้วย ,)</label>
                        <input value={warnDays} onChange={e => setWarnDays(e.target.value)} placeholder="7,1"
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
                        <p className="text-[10px] text-slate-400 mt-0.5">ส่งผ่าน LINE ให้ลูกค้าที่ผูกบัญชีไว้</p>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="outline" onClick={onClose} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                    <Button disabled={pending} onClick={() => start(async () => {
                        const days = warnDays.split(",").map(x => parseInt(x.trim())).filter(n => !isNaN(n) && n > 0);
                        const r = await updatePreOrderSettings({ ...s, expiry_warning_days: days });
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

// ══════════ Detail ══════════
function DetailDrawer({ po, services, minDeposit, canDecide, canExtend, canManage, onClose, onAction, onError }: {
    po: PO | null; services: Svc[]; minDeposit: number; canDecide: boolean; canExtend: boolean; canManage: boolean;
    onClose: () => void; onAction: () => void; onError: (m: string) => void;
}) {
    const [pending, start] = useTransition();
    const [depAmount, setDepAmount] = useState(""); const [depMethod, setDepMethod] = useState("transfer");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [dec, setDec] = useState<Record<string, { d: string; r: string }>>({});
    const svcName = (id: string) => services.find(s => s.id === id)?.name || id;

    function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
        start(async () => { const r = await fn(); if (!r.ok) onError(r.error || "ผิดพลาด"); else onAction(); });
    }

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white w-full max-w-md h-full overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
                {!po ? <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-300" /></div> : (
                    <>
                        <div className="flex items-center justify-between">
                            <div><div className="font-mono text-blue-700 font-bold">{po.hn}</div>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${badge(po.status).c}`}>{badge(po.status).l}</span></div>
                            <button onClick={onClose}><X className="h-5 w-5 text-slate-500" /></button>
                        </div>

                        {/* items */}
                        <div className="space-y-1">
                            <div className="text-xs font-bold text-slate-500">รายการ</div>
                            {po.items.map((it: PO) => (
                                <div key={it.id} className="flex items-center justify-between text-sm rounded-lg bg-slate-50 px-3 py-2">
                                    <div><div>{svcName(it.service_id)} ×{it.qty}</div>
                                        {it.doctor_decision && <div className={`text-[11px] ${it.doctor_decision === "approve" ? "text-emerald-600" : "text-rose-600"}`}>
                                            {it.doctor_decision === "approve" ? "✓ อนุมัติ" : `✗ ปฏิเสธ: ${it.decision_reason || ""}`}</div>}</div>
                                    <div className="tabular-nums font-semibold">฿{(Number(it.unit_price_snapshot) * it.qty).toLocaleString()}</div>
                                </div>
                            ))}
                        </div>

                        {/* deposit ledger */}
                        {po.ledger?.length > 0 && (
                            <div className="text-xs text-slate-500 space-y-0.5">
                                <div className="font-bold">มัดจำ/เครดิต</div>
                                {po.ledger.map((l: PO) => <div key={l.id} className="flex justify-between"><span>{l.entry_type}</span><span className="tabular-nums">฿{Number(l.amount).toLocaleString()}</span></div>)}
                            </div>
                        )}

                        {/* ── Actions per status ── */}
                        {po.status === "draft" && canManage && (
                            <Button disabled={pending} onClick={() => run(() => confirmPreOrder(po.id))} className="w-full rounded-xl bg-blue-600 text-white">ยืนยัน → รอมัดจำ</Button>
                        )}
                        {po.status === "pending_deposit" && canManage && (
                            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                                <div className="text-xs font-bold text-amber-800">รับมัดจำ (ขั้นต่ำ ฿{minDeposit.toLocaleString()})</div>
                                <div className="flex gap-2">
                                    <input type="number" value={depAmount} onChange={e => setDepAmount(e.target.value)} placeholder="จำนวน" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-right tabular-nums" />
                                    <select value={depMethod} onChange={e => setDepMethod(e.target.value)} className="rounded-lg border border-slate-200 px-2 text-sm">
                                        <option value="transfer">โอน</option><option value="cash">เงินสด</option><option value="card">บัตร</option><option value="promptpay">พร้อมเพย์</option></select>
                                </div>
                                <Button disabled={pending || !depAmount} onClick={() => run(() => recordDeposit(po.id, { amount: parseFloat(depAmount), payment_method: depMethod }))} className="w-full rounded-lg bg-amber-600 text-white h-9">รับมัดจำ</Button>
                            </div>
                        )}
                        {["pending_doctor", "scheduled"].includes(po.status) && (
                            <div className="grid grid-cols-2 gap-2">
                                {canManage && <Button disabled={pending} onClick={() => run(() => checkInPreOrder(po.id))} className="rounded-xl bg-cyan-600 text-white">เช็คอิน</Button>}
                                {canExtend && <Button disabled={pending} variant="outline" onClick={() => run(() => extendExpiry(po.id))} className="rounded-xl"><Clock className="h-4 w-4 mr-1" /> ขยายอายุ</Button>}
                            </div>
                        )}
                        {po.status === "checked_in" && canDecide && (
                            <Button disabled={pending} onClick={() => run(() => openConsult(po.id))} className="w-full rounded-xl bg-violet-600 text-white gap-1.5"><Stethoscope className="h-4 w-4" /> เปิดตรวจ (แพทย์)</Button>
                        )}
                        {po.status === "in_consult" && canDecide && (
                            <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                                <div className="text-xs font-bold text-violet-800">ตัดสินรายการ (Doctor Gate)</div>
                                {po.items.filter((i: PO) => i.status === "pending").map((it: PO) => (
                                    <div key={it.id} className="text-sm space-y-1 border-b border-violet-100 pb-2">
                                        <div className="font-semibold">{svcName(it.service_id)} ×{it.qty}</div>
                                        <div className="flex gap-1">
                                            <button onClick={() => setDec(d => ({ ...d, [it.id]: { d: "approve", r: "" } }))} className={`flex-1 py-1 rounded text-xs font-bold ${dec[it.id]?.d === "approve" ? "bg-emerald-600 text-white" : "bg-white border"}`}><CheckCircle2 className="h-3.5 w-3.5 inline" /> อนุมัติ</button>
                                            <button onClick={() => setDec(d => ({ ...d, [it.id]: { d: "reject", r: dec[it.id]?.r || "" } }))} className={`flex-1 py-1 rounded text-xs font-bold ${dec[it.id]?.d === "reject" ? "bg-rose-600 text-white" : "bg-white border"}`}><XCircle className="h-3.5 w-3.5 inline" /> ปฏิเสธ</button>
                                        </div>
                                        {dec[it.id]?.d === "reject" && (
                                            <input value={dec[it.id]?.r || ""} onChange={e => setDec(d => ({ ...d, [it.id]: { d: "reject", r: e.target.value } }))} placeholder="เหตุผล (บังคับ)" className="w-full rounded border border-rose-200 px-2 py-1 text-xs" />
                                        )}
                                    </div>
                                ))}
                                <Button disabled={pending} onClick={() => {
                                    const pendingItems = po.items.filter((i: PO) => i.status === "pending");
                                    if (pendingItems.some((i: PO) => !dec[i.id])) { onError("ตัดสินให้ครบทุกรายการ"); return; }
                                    if (pendingItems.some((i: PO) => dec[i.id].d === "reject" && !dec[i.id].r.trim())) { onError("ระบุเหตุผลการปฏิเสธ"); return; }
                                    run(() => submitDecisions(po.id, pendingItems.map((i: PO) => ({ item_id: i.id, decision: dec[i.id].d as "approve" | "reject", reason: dec[i.id].r }))));
                                }} className="w-full rounded-lg bg-violet-600 text-white h-9">บันทึกการตัดสิน</Button>
                            </div>
                        )}
                        {po.status === "decided" && canManage && (
                            <div className="space-y-2">
                                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                                    แพทย์ตัดสินแล้ว — กดเปิดการรักษาเพื่อสร้าง Visit (VN) จากรายการที่อนุมัติ
                                </div>
                                <Button disabled={pending} onClick={() => run(async () => {
                                    const r = await startTreatment(po.id);
                                    return r.ok ? { ok: true } : r;
                                })} className="w-full rounded-xl bg-teal-600 text-white gap-1.5"><PlayCircle className="h-4 w-4" /> เปิดการรักษา (สร้าง Visit)</Button>
                            </div>
                        )}
                        {po.status === "in_treatment" && canManage && (
                            <CompleteBox po={po} onError={onError} onDone={onAction} />
                        )}
                        {po.vn && (
                            <div className="text-xs text-slate-500">VN: <span className="font-mono text-slate-700">{po.vn}</span></div>
                        )}

                        {/* cancel (ก่อนพบแพทย์) */}
                        {["draft", "pending_deposit", "pending_doctor", "scheduled"].includes(po.status) && canManage && (
                            <button onClick={() => {
                                const reason = prompt("เหตุผลการยกเลิก?"); if (!reason) return;
                                const hasDeposit = (po.ledger || []).some((l: PO) => l.entry_type === "deposit_received");
                                let resolution: string | null = null;
                                if (hasDeposit) resolution = confirm("คืนมัดจำ? (OK=ขอคืนเงิน / Cancel=แปลงเป็นเครดิต)") ? "refund_request" : "convert_to_credit";
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                run(() => cancelPreOrder(po.id, { reason, deposit_resolution: resolution as any }));
                            }} className="w-full text-sm text-rose-600 hover:underline pt-2">ยกเลิกพรีออเดอร์</button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
