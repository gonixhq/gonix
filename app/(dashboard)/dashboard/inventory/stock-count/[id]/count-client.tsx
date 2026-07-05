"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2, ChevronLeft, Save, Lock, Search } from "lucide-react";
import { saveStockCountCounts, finalizeStockCount, type StockCountHeader, type StockCountLine } from "@/lib/actions/consumables";

const baht = (n: number) => `฿${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function CountClient({ id, header, lines }: { id: string; header: StockCountHeader; lines: StockCountLine[] }) {
    const router = useRouter();
    const done = header.status === "done";
    const [counted, setCounted] = useState<Record<string, string>>(
        Object.fromEntries(lines.map((l) => [l.id, l.counted_qty != null ? String(l.counted_qty) : ""]))
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [applyAdjust, setApplyAdjust] = useState(true);
    const [search, setSearch] = useState("");

    const rows = useMemo(() => lines.map((l) => {
        const c = counted[l.id];
        const cv = c === "" || c == null ? null : Number(c);
        const diff = cv == null ? null : cv - l.system_qty;
        const diffValue = diff == null ? 0 : diff * l.cost_price;
        return { ...l, cv, diff, diffValue };
    }), [lines, counted]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? rows.filter((r) => r.item_name.toLowerCase().includes(q)) : rows;
    }, [rows, search]);

    const summary = useMemo(() => {
        let net = 0, over = 0, short = 0, cntDiff = 0, countedN = 0;
        for (const r of rows) {
            if (r.cv != null) countedN++;
            if (r.diff != null && r.diff !== 0) { cntDiff++; net += r.diffValue; if (r.diff > 0) over += r.diffValue; else short += r.diffValue; }
        }
        const totalVal = rows.reduce((s, r) => s + r.system_qty * r.cost_price, 0) || 1;
        return { net, over, short, cntDiff, countedN, shrinkagePct: Math.round((Math.abs(short) / totalVal) * 1000) / 10 };
    }, [rows]);

    async function save() {
        setBusy(true); setError(""); setMsg("");
        const r = await saveStockCountCounts(id, rows.map((x) => ({ line_id: x.id, counted_qty: x.cv })));
        setBusy(false);
        if (!r.success) { setError(r.error || "บันทึกไม่สำเร็จ"); return; }
        setMsg("บันทึกแล้ว");
        router.refresh();
    }
    async function finalize() {
        if (!confirm(`ปิดรอบนับ?${applyAdjust ? "\nระบบจะปรับสต๊อกให้ตรงกับที่นับได้ (RECOUNT)" : ""}\nปิดแล้วแก้ไม่ได้`)) return;
        setBusy(true); setError("");
        await saveStockCountCounts(id, rows.map((x) => ({ line_id: x.id, counted_qty: x.cv })));
        const r = await finalizeStockCount(id, applyAdjust);
        setBusy(false);
        if (!r.success) { setError(r.error || "ปิดรอบไม่สำเร็จ"); return; }
        router.refresh();
    }

    return (
        <div className="space-y-4 max-w-3xl mx-auto animate-fade-in pb-10">
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-2xl flex items-center justify-center bg-amber-100"><ClipboardCheck className="h-5 w-5 text-amber-600" /></div>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight">ตรวจนับ · {new Date(header.count_date + "T00:00:00").toLocaleDateString("th-TH", { dateStyle: "medium" })}
                            {done && <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 align-middle">ปิดรอบแล้ว</span>}
                        </h1>
                        <p className="text-xs text-slate-500">นับได้ {summary.countedN}/{lines.length} · ต่าง {summary.cntDiff} รายการ</p>
                    </div>
                </div>
                <Link href="/dashboard/inventory/stock-count" className="inline-flex items-center gap-1 h-9 px-3 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /> กลับ</Link>
            </div>

            {/* Shrinkage summary */}
            <div className="grid grid-cols-3 gap-3">
                <div className="gonix-card-premium p-3.5 text-center"><div className={`text-lg font-black tabular-nums ${summary.net < 0 ? "text-rose-600" : summary.net > 0 ? "text-emerald-600" : "text-slate-700"}`}>{summary.net < 0 ? "−" : summary.net > 0 ? "+" : ""}{baht(summary.net)}</div><div className="text-[11px] text-slate-500">ส่วนต่างสุทธิ</div></div>
                <div className="gonix-card-premium p-3.5 text-center"><div className="text-lg font-black tabular-nums text-rose-600">−{baht(summary.short)}</div><div className="text-[11px] text-slate-500">ขาด (Shrinkage)</div></div>
                <div className="gonix-card-premium p-3.5 text-center"><div className={`text-lg font-black tabular-nums ${summary.shrinkagePct > 10 ? "text-rose-600" : summary.shrinkagePct > 5 ? "text-amber-600" : "text-slate-700"}`}>{summary.shrinkagePct}%</div><div className="text-[11px] text-slate-500">% ขาด (ปกติ ≤5-10%)</div></div>
            </div>

            {error && <div className="rounded-xl px-4 py-2.5 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>}
            {msg && <div className="rounded-xl px-4 py-2.5 text-sm bg-emerald-50 border border-emerald-200 text-emerald-700">{msg}</div>}

            <div className="gonix-card-premium overflow-hidden">
                <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-2">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารายการ" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-sm" />
                    </div>
                </div>
                <div className="max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50/60 sticky top-0">
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <th className="text-left px-5 py-2">รายการ</th>
                                <th className="text-center px-2 py-2">ระบบ</th>
                                <th className="text-center px-3 py-2">นับได้</th>
                                <th className="text-center px-4 py-2">ต่าง</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r) => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-5 py-2 font-semibold text-slate-700">{r.item_name} <span className="text-[11px] font-normal text-slate-400">{r.unit}</span></td>
                                    <td className="px-2 py-2 text-center tabular-nums text-slate-500">{r.system_qty}</td>
                                    <td className="px-3 py-2 text-center">
                                        <input type="number" min={0} disabled={done} value={counted[r.id] ?? ""} placeholder="—"
                                            onChange={(e) => setCounted((p) => ({ ...p, [r.id]: e.target.value }))}
                                            className="w-20 h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-center tabular-nums disabled:bg-slate-50" />
                                    </td>
                                    <td className={`px-4 py-2 text-center tabular-nums font-bold ${r.diff == null ? "text-slate-300" : r.diff < 0 ? "text-rose-600" : r.diff > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                                        {r.diff == null ? "—" : r.diff === 0 ? "0" : (r.diff > 0 ? "+" : "") + r.diff}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!done && (
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={applyAdjust} onChange={(e) => setApplyAdjust(e.target.checked)} className="h-4 w-4 accent-[#2B54F0]" />
                            ปิดรอบแล้วปรับสต๊อกให้ตรงกับที่นับได้
                        </label>
                        <div className="flex items-center gap-2">
                            <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึก
                            </button>
                            <button onClick={finalize} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-50" style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} ปิดรอบ
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
