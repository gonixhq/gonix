"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Syringe, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInjectableProducts, getVisitInjections, saveVisitInjection, deleteVisitInjection } from "@/lib/actions/injections";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** บันทึกการฉีดแบบ structured (สินค้า/จำนวน/จุด) — ตัดสต๊อกจริงตอนคิดเงินตามบิล
 *  ค่านี้จะเด้งขึ้นบิลอัตโนมัติ + ระบบเทียบกับที่เคาท์เตอร์คิดเงิน (flag ถ้าต่าง) */
export default function InjectionRecorder({ vn }: { vn: string }) {
    const router = useRouter();
    const [products, setProducts] = useState<any[]>([]);
    const [rows, setRows] = useState<any[]>([]);
    const [itemId, setItemId] = useState("");
    const [qty, setQty] = useState("");
    const [site, setSite] = useState("");
    const [err, setErr] = useState("");
    const [pending, start] = useTransition();
    const [loading, setLoading] = useState(true);

    async function reload() {
        const [p, r] = await Promise.all([getInjectableProducts(), getVisitInjections(vn)]);
        setProducts(p); setRows(r); setLoading(false);
    }
    useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [vn]);

    const sel = products.find(p => p.id === itemId);
    const capLabel = sel?.capacity_unit_label || sel?.unit || "u";

    function add() {
        setErr("");
        if (!itemId) { setErr("เลือกสินค้าที่ฉีด"); return; }
        const q = parseFloat(qty);
        if (!(q > 0)) { setErr("กรอกจำนวน"); return; }
        start(async () => {
            const res = await saveVisitInjection({ vn, item_id: itemId, qty: q, site: site.trim() || undefined });
            if (!res.success) { setErr(res.error || "บันทึกไม่สำเร็จ"); return; }
            setItemId(""); setQty(""); setSite("");
            await reload(); router.refresh();
        });
    }
    function remove(id: string) {
        start(async () => { await deleteVisitInjection(id, vn); await reload(); router.refresh(); });
    }

    if (loading) return null;
    if (products.length === 0) return null;   // ไม่มีสินค้าฉีด → ไม่ต้องโชว์

    return (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Syringe className="h-4 w-4 text-violet-700" />
                <h3 className="text-sm font-bold text-violet-900">บันทึกการฉีด (ตัดสต๊อก + ขึ้นบิลอัตโนมัติ)</h3>
            </div>

            {rows.length > 0 && (
                <div className="space-y-1">
                    {rows.map(r => (
                        <div key={r.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 text-sm">
                            <div className="min-w-0">
                                <span className="font-semibold text-slate-800">{r.item_name}</span>
                                {r.brand && <span className="text-xs text-slate-500"> · {r.brand}{r.model_variant ? ` ${r.model_variant}` : ""}</span>}
                                <span className="text-slate-600"> — {r.qty} {r.unit_label || ""}</span>
                                {r.site && <span className="text-xs text-slate-500"> @ {r.site}</span>}
                            </div>
                            <button onClick={() => remove(r.id)} disabled={pending} className="text-slate-300 hover:text-rose-600 shrink-0"><Trash2 className="h-4 w-4" /></button>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-2">
                <select value={itemId} onChange={e => setItemId(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                    <option value="">— เลือกสินค้าฉีด —</option>
                    {products.map(p => (
                        <option key={p.id} value={p.id}>{p.item_name}{p.brand ? ` (${p.brand})` : ""} · เหลือ {Number(p.stock_qty || 0).toLocaleString()}</option>
                    ))}
                </select>
                <div className="flex items-center gap-1">
                    <input type="number" min={0} value={qty} onChange={e => setQty(e.target.value)} placeholder="จำนวน" className="w-20 h-9 rounded-lg border border-slate-200 px-2 text-sm text-right tabular-nums" />
                    <span className="text-xs text-slate-500 w-8">{capLabel}</span>
                </div>
                <input value={site} onChange={e => setSite(e.target.value)} placeholder="จุดที่ฉีด (เช่น หน้าผาก, หางตา)" className="h-9 rounded-lg border border-slate-200 px-2 text-sm" />
                <Button onClick={add} disabled={pending} className="h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white gap-1">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} เพิ่ม
                </Button>
            </div>
            {err && <p className="text-xs text-rose-600">{err}</p>}
        </div>
    );
}
