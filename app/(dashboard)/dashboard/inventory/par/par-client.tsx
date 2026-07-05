"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { PackageCheck, Loader2, ClipboardList, Settings2, Search, ChevronLeft, Boxes } from "lucide-react";
import { getRoomPar, setRoomParBulk, replenishPar, type RoomParRow, type ConsumableItem } from "@/lib/actions/consumables";
import type { ScheduleRoom } from "@/lib/actions/doctor-shifts";

export default function ParClient({ rooms, items }: { rooms: ScheduleRoom[]; items: ConsumableItem[] }) {
    const [roomId, setRoomId] = useState(rooms[0]?.id || "");
    const [mode, setMode] = useState<"replenish" | "setup">("replenish");
    const [par, setPar] = useState<RoomParRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");

    // replenish qty (item_id → qty)
    const [qty, setQty] = useState<Record<string, number>>({});
    // setup par (item_id → par_qty)
    const [setup, setSetup] = useState<Record<string, number>>({});
    const [search, setSearch] = useState("");

    const load = useCallback(async (rid: string) => {
        if (!rid) return;
        setLoading(true); setError(""); setMsg("");
        try {
            const rows = await getRoomPar(rid);
            setPar(rows);
            setQty(Object.fromEntries(rows.map((r) => [r.item_id, r.par_qty])));
            setSetup(Object.fromEntries(rows.map((r) => [r.item_id, r.par_qty])));
        } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(roomId); }, [roomId, load]);

    const roomName = rooms.find((r) => r.id === roomId)?.name || "";

    async function doReplenish() {
        const lines = par.map((r) => ({ item_id: r.item_id, qty: Number(qty[r.item_id] || 0) })).filter((l) => l.qty > 0);
        if (lines.length === 0) { setError("ยังไม่ได้ระบุจำนวนเบิก"); return; }
        setBusy(true); setError(""); setMsg("");
        const r = await replenishPar(roomId, lines);
        setBusy(false);
        if (!r.success) { setError(r.error || "เบิกไม่สำเร็จ"); return; }
        setMsg(`เบิกเติมแล้ว ${r.issued} รายการ — ตัดสต๊อกกลางเรียบร้อย`);
        await load(roomId);
    }

    async function doSaveSetup() {
        const lines = items.map((i) => ({ item_id: i.id, par_qty: Number(setup[i.id] || 0) }));
        setBusy(true); setError(""); setMsg("");
        const r = await setRoomParBulk(roomId, lines);
        setBusy(false);
        if (!r.success) { setError(r.error || "บันทึกไม่สำเร็จ"); return; }
        setMsg("บันทึก PAR แล้ว");
        setMode("replenish");
        await load(roomId);
    }

    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? items.filter((i) => i.item_name.toLowerCase().includes(q)) : items;
    }, [items, search]);

    return (
        <div className="space-y-5 max-w-4xl mx-auto animate-fade-in pb-10">
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-2xl flex items-center justify-center bg-[#2B54F0]/10"><PackageCheck className="h-5 w-5 text-[#2B54F0]" /></div>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight">เบิกเติม PAR ห้องตรวจ</h1>
                        <p className="text-xs text-slate-500">กำหนดของที่ควรมีในห้อง (PAR) แล้วเบิกเติมก่อนเปิดคลินิก</p>
                    </div>
                </div>
                <Link href="/dashboard/inventory" className="inline-flex items-center gap-1 h-9 px-3 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /> คลัง</Link>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
                    {rooms.length === 0 && <option value="">— ไม่มีห้องตรวจ —</option>}
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <div className="inline-flex items-center bg-slate-100 rounded-xl p-0.5 gap-0.5">
                    <button onClick={() => setMode("replenish")} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold ${mode === "replenish" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-600"}`}><ClipboardList className="h-3.5 w-3.5" /> เบิกเติม</button>
                    <button onClick={() => setMode("setup")} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold ${mode === "setup" ? "bg-white text-[#2B54F0] shadow-sm" : "text-slate-600"}`}><Settings2 className="h-3.5 w-3.5" /> ตั้งค่า PAR</button>
                </div>
            </div>

            {error && <div className="rounded-xl px-4 py-2.5 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>}
            {msg && <div className="rounded-xl px-4 py-2.5 text-sm bg-emerald-50 border border-emerald-200 text-emerald-700">{msg}</div>}

            {loading ? (
                <div className="py-16 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : mode === "replenish" ? (
                <div className="gonix-card-premium overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                        <Boxes className="h-4 w-4 text-[#2B54F0]" />
                        <h2 className="text-sm font-bold text-slate-800">รายการ PAR — {roomName}</h2>
                        <span className="text-xs text-slate-400">({par.length})</span>
                    </div>
                    {par.length === 0 ? (
                        <div className="py-12 text-center text-sm text-slate-400">ยังไม่ได้ตั้ง PAR ห้องนี้ — ไปที่ “ตั้งค่า PAR”</div>
                    ) : (
                        <>
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/60">
                                    <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                        <th className="text-left px-5 py-2.5">รายการ</th>
                                        <th className="text-center px-3 py-2.5">PAR</th>
                                        <th className="text-center px-3 py-2.5">คงเหลือกลาง</th>
                                        <th className="text-center px-5 py-2.5">จำนวนเบิก</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {par.map((r) => {
                                        const low = r.stock_qty < Number(qty[r.item_id] || 0);
                                        return (
                                            <tr key={r.item_id} className="border-t border-slate-100">
                                                <td className="px-5 py-2.5 font-semibold text-slate-700">{r.item_name}</td>
                                                <td className="px-3 py-2.5 text-center tabular-nums text-slate-500">{r.par_qty} {r.unit}</td>
                                                <td className={`px-3 py-2.5 text-center tabular-nums font-bold ${low ? "text-rose-600" : "text-slate-600"}`}>{r.stock_qty}</td>
                                                <td className="px-5 py-2.5">
                                                    <input type="number" min={0} value={qty[r.item_id] ?? 0}
                                                        onChange={(e) => setQty((p) => ({ ...p, [r.item_id]: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                                        className="w-24 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-center tabular-nums mx-auto block" />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
                                <span className="text-xs text-slate-400">ยืนยันแล้วระบบตัดสต๊อกคลังกลางตาม FEFO</span>
                                <button onClick={doReplenish} disabled={busy} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-50" style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} ยืนยันเบิกเติม
                                </button>
                            </div>
                        </>
                    )}
                </div>
            ) : (
                <div className="gonix-card-premium overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                        <Settings2 className="h-4 w-4 text-[#2B54F0]" />
                        <h2 className="text-sm font-bold text-slate-800">ตั้งค่า PAR — {roomName}</h2>
                        <div className="relative ml-auto">
                            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา" className="h-9 w-40 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-sm" />
                        </div>
                    </div>
                    <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100">
                        {filteredItems.map((i) => (
                            <div key={i.id} className="flex items-center gap-3 px-5 py-2">
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-semibold text-slate-700">{i.item_name}</span>
                                    <span className="text-[11px] text-slate-400 ml-2">{i.category || "—"} · คงเหลือ {i.stock_qty} {i.unit}</span>
                                </div>
                                <input type="number" min={0} value={setup[i.id] ?? 0}
                                    onChange={(e) => setSetup((p) => ({ ...p, [i.id]: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                    className="w-24 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-center tabular-nums" />
                                <span className="text-[11px] text-slate-400 w-10">{i.unit}</span>
                            </div>
                        ))}
                    </div>
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-400">ใส่ 0 = ไม่อยู่ใน PAR ห้องนี้</span>
                        <button onClick={doSaveSetup} disabled={busy} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-50" style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />} บันทึก PAR
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
