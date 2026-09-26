"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ChevronLeft, ChevronRight, Loader2, AlertTriangle, FlaskConical, Clock } from "lucide-react";
import { recordWaste, setOpenedShelfHours, type WasteRow, type WasteItemPick, type OpenVialRow } from "@/lib/actions/stock-waste";
import { WASTE_REASONS, WASTE_REASON_LABEL, type WasteReason } from "@/lib/stock-waste";
import { toast } from "@/lib/toast";

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

export default function WasteClient({ month, today, log, items, openVials }: {
    month: string; today: string;
    log: { rows: WasteRow[]; total: number; byReason: Record<string, number> };
    items: WasteItemPick[]; openVials: OpenVialRow[];
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [search, setSearch] = useState("");
    const [itemId, setItemId] = useState("");
    const [qty, setQty] = useState("");
    const [reason, setReason] = useState<WasteReason>("mixed_leftover");
    const [note, setNote] = useState("");
    const [lotId, setLotId] = useState("");
    const [vialId, setVialId] = useState("");
    const [date, setDate] = useState(today);
    const item = items.find(i => i.id === itemId);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? items.filter(i => i.item_name.toLowerCase().includes(q)) : items;
    }, [items, search]);
    const value = item ? Number(qty || 0) * item.cost_price : 0;

    function submit(payload?: Parameters<typeof recordWaste>[0]) {
        const body = payload || { item_id: itemId, qty: Number(qty), reason, note, lot_id: lotId || null, vial_id: vialId || null, wasted_on: date };
        start(async () => {
            const res = await recordWaste(body);
            if (!res.success) { toast.error(res.error || "บันทึกไม่สำเร็จ"); return; }
            toast.success("บันทึกยาทิ้งแล้ว — หักสต๊อกเรียบร้อย");
            setItemId(""); setQty(""); setNote(""); setLotId(""); setVialId("");
            router.refresh();
        });
    }
    function discardVial(v: OpenVialRow) {
        if (!confirm(`ทิ้งส่วนที่เหลือ ${v.remaining} ${v.unit || ""} ของ ${v.item_name}\nมูลค่า ${baht(v.value)}?`)) return;
        submit({ item_id: v.item_id, qty: v.remaining, reason: "mixed_leftover", vial_id: v.id, note: `เปิดค้าง ${v.hours_open} ชม.` });
    }
    function editShelf(v: OpenVialRow) {
        const s = prompt(`${v.item_name}: อยู่ได้กี่ชั่วโมงหลังเปิด/ผสม? (เว้นว่าง = ไม่กำหนด)`, v.shelf_hours != null ? String(v.shelf_hours) : "");
        if (s === null) return;
        start(async () => {
            const res = await setOpenedShelfHours(v.item_id, s.trim() === "" ? null : Number(s));
            if (!res.success) { toast.error(res.error || "บันทึกไม่สำเร็จ"); return; }
            router.refresh();
        });
    }

    return (
        <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4 pb-24">
            <div className="flex items-center gap-3 flex-wrap">
                <Trash2 className="h-5 w-5 text-rose-600" />
                <div className="flex-1 min-w-[220px]">
                    <h1 className="text-lg font-bold text-slate-800">ยาทิ้ง / หมดอายุ / เสียหาย</h1>
                    <p className="text-xs text-slate-500">บันทึกทุกครั้ง → หักสต๊อก + มูลค่าตามราคาทุน แยกเป็นบรรทัดในรายงานรายเดือน</p>
                </div>
            </div>

            {/* ขวดเปิดค้าง */}
            {openVials.length > 0 && (
                <section className="rounded-2xl bg-amber-50/70 border border-amber-200 p-4">
                    <h2 className="text-sm font-bold text-amber-900 inline-flex items-center gap-1.5 mb-2"><FlaskConical className="h-4 w-4" /> ขวดที่เปิดค้างอยู่ ({openVials.length}) — ใช้ขวดนี้ก่อนเปิดขวดใหม่</h2>
                    <div className="space-y-1.5">
                        {openVials.map(v => (
                            <div key={v.id} className={`flex items-center gap-3 flex-wrap rounded-xl bg-white border px-3 py-2 ${v.overdue ? "border-rose-300" : "border-amber-100"}`}>
                                <div className="flex-1 min-w-[180px]">
                                    <div className="text-sm font-semibold text-slate-800">{v.item_name} <span className="text-xs font-normal text-slate-400">{v.lot || ""}</span></div>
                                    <div className="text-xs text-slate-500 inline-flex items-center gap-1">
                                        <Clock className="h-3 w-3" /> เปิดมา {v.hours_open} ชม.
                                        {v.shelf_hours != null ? <> · อยู่ได้ {v.shelf_hours} ชม.</> : <button onClick={() => editShelf(v)} className="underline text-blue-700 ml-1">ตั้งอายุหลังเปิด</button>}
                                        {v.overdue && <span className="text-rose-600 font-bold ml-1 inline-flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" /> เกินอายุหลังเปิด</span>}
                                    </div>
                                </div>
                                <div className="text-sm tabular-nums text-slate-700">เหลือ {v.remaining}/{v.total} {v.unit || ""} · {baht(v.value)}</div>
                                <button onClick={() => discardVial(v)} disabled={pending} className="h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-bold disabled:opacity-50">ทิ้งส่วนที่เหลือ</button>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-amber-800/80 mt-2">ระบบตัดจากขวดที่เปิดค้างก่อนเสมอ (ก่อนเปิดขวดใหม่) · ยาที่ผสมแล้วอยู่ได้ไม่นาน (เช่น โบทูลินัม) ถ้าวันนั้นคนไข้ไม่พอให้ทิ้งแล้วบันทึกที่นี่</p>
                </section>
            )}

            {/* ฟอร์มบันทึก */}
            <section className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                <h2 className="text-sm font-bold text-slate-700">บันทึกยาทิ้ง</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-xs text-slate-600 space-y-1">
                        <span className="font-semibold">ยา / วัสดุ</span>
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
                        <select value={itemId} onChange={e => { setItemId(e.target.value); setLotId(""); setVialId(""); }} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
                            <option value="">— เลือก ({filtered.length}) —</option>
                            {filtered.map(i => <option key={i.id} value={i.id}>{i.item_name} (เหลือ {i.stock_qty} {i.unit || ""})</option>)}
                        </select>
                    </label>
                    {item && (item.is_vial ? (
                        <label className="text-xs text-slate-600 space-y-1">
                            <span className="font-semibold">ขวดที่ทิ้ง</span>
                            <select value={vialId} onChange={e => { setVialId(e.target.value); const v = item.vials.find(x => x.id === e.target.value); if (v && !qty) setQty(String(v.remaining)); }} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
                                <option value="">— เลือกขวด —</option>
                                {item.vials.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                            </select>
                        </label>
                    ) : item.lots.length > 0 && (
                        <label className="text-xs text-slate-600 space-y-1">
                            <span className="font-semibold">ล็อต (ไม่เลือก = ตัดล็อตที่หมดอายุก่อน)</span>
                            <select value={lotId} onChange={e => setLotId(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
                                <option value="">— อัตโนมัติ (FEFO) —</option>
                                {item.lots.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                            </select>
                        </label>
                    ))}
                    <label className="text-xs text-slate-600 space-y-1">
                        <span className="font-semibold">จำนวน {item?.unit ? `(${item.unit})` : ""}</span>
                        <input type="number" min="0" step="0.01" value={qty} onChange={e => setQty(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm text-right tabular-nums" />
                        {item && <span className="text-slate-500">มูลค่า ≈ <b className="tabular-nums">{baht(value)}</b> ({baht(item.cost_price)}/{item.unit || "หน่วย"})</span>}
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">
                        <span className="font-semibold">เหตุผล</span>
                        <select value={reason} onChange={e => setReason(e.target.value as WasteReason)} className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
                            {WASTE_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">
                        <span className="font-semibold">หมายเหตุ {reason === "other" && <span className="text-rose-600">*</span>}</span>
                        <input value={note} onChange={e => setNote(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
                    </label>
                    <label className="text-xs text-slate-600 space-y-1">
                        <span className="font-semibold">วันที่ทิ้ง</span>
                        <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
                    </label>
                </div>
                <button onClick={() => submit()} disabled={pending || !itemId || !(Number(qty) > 0) || (item?.is_vial && !vialId)}
                    className="h-10 px-4 rounded-xl bg-rose-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} บันทึกทิ้ง + หักสต๊อก
                </button>
            </section>

            {/* ประวัติรายเดือน */}
            <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center gap-1">
                        <button onClick={() => router.push(`/dashboard/inventory/waste?month=${shiftMonth(month, -1)}`)} className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center" aria-label="เดือนก่อน"><ChevronLeft className="h-4 w-4" /></button>
                        <input type="month" value={month} onChange={e => e.target.value && router.push(`/dashboard/inventory/waste?month=${e.target.value}`)} className="h-8 rounded-lg border border-slate-300 px-2 text-xs" />
                        <button onClick={() => router.push(`/dashboard/inventory/waste?month=${shiftMonth(month, 1)}`)} className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center" aria-label="เดือนถัดไป"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                    <span className="flex-1" />
                    <span className="text-sm">รวม <b className="text-rose-600 tabular-nums">{baht(log.total)}</b></span>
                    {Object.entries(log.byReason).map(([k, v]) => <span key={k} className="text-xs text-slate-500">{WASTE_REASON_LABEL[k]} {baht(v)}</span>)}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                            <tr><th className="text-left px-3 py-2">วันที่</th><th className="text-left px-3 py-2">รายการ</th><th className="text-right px-3 py-2">จำนวน</th><th className="text-right px-3 py-2">มูลค่า</th><th className="text-left px-3 py-2">เหตุผล</th><th className="text-left px-3 py-2">ผู้บันทึก</th></tr>
                        </thead>
                        <tbody>
                            {log.rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">ไม่มีรายการในเดือนนี้</td></tr> : log.rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-3 py-2 text-slate-600">{fmtDate(r.wasted_on)}</td>
                                    <td className="px-3 py-2"><div className="text-slate-800">{r.item_name}</div>{r.lot && <div className="text-[11px] text-slate-400">ล็อต {r.lot}</div>}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{r.qty} {r.unit || ""}</td>
                                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-rose-600">{baht(r.value)}</td>
                                    <td className="px-3 py-2"><div>{WASTE_REASON_LABEL[r.reason]}</div>{r.note && <div className="text-[11px] text-slate-400">{r.note}</div>}</td>
                                    <td className="px-3 py-2 text-slate-500">{r.recorded_by || "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
