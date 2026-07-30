"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Syringe, Plus, Trash2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInjectableProducts, getVisitInjections, saveVisitInjection, deleteVisitInjection } from "@/lib/actions/injections";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ตัวเลือก "จุด/โซนที่ฉีด" ปรับตามชนิดสินค้า:
//  Botox (unit) → ขายเป็นโซน Upper/Lower/Full Face · Filler (ml) → ตามตำแหน่งกายวิภาค · HIFU (shot) → โซน
function siteOptions(unit: string): string[] {
    if (unit === "ml" || unit === "cc") {
        return [
            "ร่องแก้ม (Nasolabial)", "แก้ม (Cheek)", "คาง (Chin)", "ริมฝีปาก (Lips)",
            "ใต้ตา (Tear trough)", "เปลือกตา (Eyelid)", "จมูก (Nose)", "ขมับ (Temple)",
            "กราม (Jawline)", "หน้าผาก (Forehead)", "ระหว่างคิ้ว (Glabella)",
        ];
    }
    if (unit === "shot") {
        return ["Full Face", "Upper Face", "Lower Face", "หน้า + คอ (Face + Neck)", "คอ (Neck)", "ใต้คาง (Submental)"];
    }
    // unit/u (Botox) และอื่นๆ → ขายเป็นโซน
    return ["Upper Face", "Lower Face", "Full Face"];
}

// ป้ายช่องจุดฉีด — Botox/HIFU = โซน · Filler = ตำแหน่ง
function siteLabel(unit: string): string {
    if (unit === "ml" || unit === "cc") return "4. ตำแหน่ง";
    return "4. โซน";
}

// ค่าที่ใช้บ่อยตามหน่วย → กดเลือกเร็ว ไม่ต้องพิมพ์
function qtyPresets(unit: string): number[] {
    if (unit === "ml" || unit === "cc") return [0.5, 1, 1.5, 2];
    if (unit === "shot") return [100, 200, 300, 500];
    return [10, 20, 30, 50, 100];
}

/** บันทึกการฉีดแบบ structured (สินค้า/จำนวน/จุด) — ตัดสต๊อกจริงตอนคิดเงินตามบิล
 *  UX เร็ว: chip สินค้า → preset จำนวน → dropdown จุด → Enter/เพิ่ม (สินค้าค้างไว้ฉีดจุดถัดไปต่อได้) */
export default function InjectionRecorder({ vn }: { vn: string }) {
    const router = useRouter();
    const [products, setProducts] = useState<any[]>([]);
    const [rows, setRows] = useState<any[]>([]);
    const [itemId, setItemId] = useState("");
    const [qty, setQty] = useState("");
    const [price, setPrice] = useState("");
    const [site, setSite] = useState("");
    const [customSite, setCustomSite] = useState("");
    const [err, setErr] = useState("");
    const [pending, start] = useTransition();
    const [loading, setLoading] = useState(true);
    const qtyRef = useRef<HTMLInputElement>(null);

    async function reload() {
        const [p, r] = await Promise.all([getInjectableProducts(), getVisitInjections(vn)]);
        setProducts(p); setRows(r); setLoading(false);
    }
    useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [vn]);

    const sel = products.find(p => p.id === itemId);
    const capLabel = sel?.capacity_unit_label || sel?.unit || "u";
    const effectiveSite = site === "__custom__" ? customSite.trim() : site;

    function pickProduct(id: string) {
        setErr("");
        setItemId(id);
        setSite(""); setCustomSite("");   // ตัวเลือกจุด/โซนต่างกันตามสินค้า → รีเซ็ต
        setTimeout(() => qtyRef.current?.focus(), 50);   // เด้งไปช่องจำนวนอัตโนมัติ
    }

    function add() {
        setErr("");
        if (!itemId) { setErr("เลือกสินค้าที่ฉีด"); return; }
        const q = parseFloat(qty);
        if (!(q > 0)) { setErr("กรอกจำนวน"); return; }
        const p = price.trim() ? parseFloat(price) : null;
        if (p != null && !(p >= 0)) { setErr("ราคาไม่ถูกต้อง"); return; }
        start(async () => {
            const res = await saveVisitInjection({ vn, item_id: itemId, qty: q, sale_price: p, site: effectiveSite || undefined });
            if (!res.success) { setErr(res.error || "บันทึกไม่สำเร็จ"); return; }
            // เก็บสินค้าไว้ (ฉีดหลายจุดต่อได้เร็ว) เคลียร์แค่ จำนวน/ราคา/จุด
            setQty(""); setPrice(""); setSite(""); setCustomSite("");
            await reload(); router.refresh();
            setTimeout(() => qtyRef.current?.focus(), 50);
        });
    }
    function remove(id: string) {
        start(async () => { await deleteVisitInjection(id, vn); await reload(); router.refresh(); });
    }
    function onKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") { e.preventDefault(); add(); }
    }

    if (loading) return null;
    if (products.length === 0) return null;   // ไม่มีสินค้าฉีด → ไม่ต้องโชว์

    return (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Syringe className="h-4 w-4 text-violet-700" />
                <h3 className="text-sm font-bold text-violet-900">บันทึกการฉีด (ตัดสต๊อก + ขึ้นบิลอัตโนมัติ)</h3>
            </div>

            {/* รายการที่บันทึกแล้ว */}
            {rows.length > 0 && (
                <div className="space-y-1">
                    {rows.map(r => (
                        <div key={r.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 text-sm">
                            <div className="min-w-0">
                                <span className="font-semibold text-slate-800">{r.item_name}</span>
                                {r.brand && <span className="text-xs text-slate-500"> · {r.brand}</span>}
                                <span className="text-slate-600"> — {r.qty} {r.unit_label || ""}</span>
                                {r.sale_price != null && <span className="font-semibold text-violet-700"> = ฿{Number(r.sale_price).toLocaleString()}</span>}
                                {r.site && <span className="text-xs text-slate-500"> @ {r.site}</span>}
                            </div>
                            <button onClick={() => remove(r.id)} disabled={pending} className="text-slate-300 hover:text-rose-600 shrink-0"><Trash2 className="h-4 w-4" /></button>
                        </div>
                    ))}
                </div>
            )}

            {/* STEP 1: เลือกสินค้า (chip คลิกเดียว) */}
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-violet-900/70">1. เลือกสินค้าที่ฉีด</p>
                <div className="flex flex-wrap gap-1.5">
                    {products.map(p => {
                        const active = p.id === itemId;
                        return (
                            <button key={p.id} type="button" onClick={() => pickProduct(p.id)}
                                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors inline-flex items-center gap-1 ${active ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-700 border-slate-200 hover:border-violet-300"}`}>
                                {active && <Check className="h-3.5 w-3.5" />}
                                {p.item_name}{p.brand ? ` (${p.brand})` : ""}
                                <span className={active ? "text-violet-200" : "text-slate-400"}> · เหลือ {Number(p.stock_qty || 0).toLocaleString()} {p.capacity_unit_label || p.unit || ""}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* STEP 2: จำนวน + ราคา + จุด (โผล่เมื่อเลือกสินค้า) */}
            {sel && (
                <div className="space-y-2 rounded-xl bg-white border border-violet-100 p-3">
                    {/* จำนวน + presets */}
                    <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-violet-900/70">2. จำนวนที่ฉีด ({capLabel}) — ตัดสต๊อกจริง</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {qtyPresets(capLabel).map(v => (
                                <button key={v} type="button" onClick={() => { setQty(String(v)); qtyRef.current?.focus(); }}
                                    className={`px-2.5 py-1 rounded-lg text-[13px] font-bold border transition-colors ${qty === String(v) ? "bg-violet-100 text-violet-700 border-violet-300" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-violet-300"}`}>
                                    {v}
                                </button>
                            ))}
                            <input ref={qtyRef} type="number" min={0} value={qty} onChange={e => setQty(e.target.value)} onKeyDown={onKey}
                                placeholder="หรือพิมพ์" className="w-24 h-9 rounded-lg border border-slate-200 px-2 text-sm text-right tabular-nums" />
                            <span className="text-xs text-slate-500">{capLabel}</span>
                        </div>
                    </div>
                    {/* ราคา + จุด */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 w-14 shrink-0">3. ราคาขาย</span>
                            <span className="text-xs text-slate-500">฿</span>
                            <input type="number" min={0} value={price} onChange={e => setPrice(e.target.value)} onKeyDown={onKey}
                                placeholder="ก้อน (เว้นว่างได้)" className="flex-1 min-w-0 h-9 rounded-lg border border-slate-200 px-2 text-sm text-right tabular-nums" />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 shrink-0 whitespace-nowrap">{siteLabel(capLabel)}</span>
                            <select value={site} onChange={e => setSite(e.target.value)} className="flex-1 min-w-0 h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                                <option value="">— เลือก —</option>
                                {siteOptions(capLabel).map(s => <option key={s} value={s}>{s}</option>)}
                                <option value="__custom__">อื่นๆ (พิมพ์เอง)</option>
                            </select>
                        </div>
                    </div>
                    {site === "__custom__" && (
                        <input value={customSite} onChange={e => setCustomSite(e.target.value)} onKeyDown={onKey}
                            placeholder="พิมพ์ตำแหน่งที่ฉีด" className="w-full h-9 rounded-lg border border-slate-200 px-2 text-sm" autoFocus />
                    )}
                    <Button onClick={add} disabled={pending} className="w-full h-10 rounded-lg bg-violet-600 hover:bg-violet-700 text-white gap-1 font-bold">
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        เพิ่ม {sel.item_name}{qty ? ` ${qty} ${capLabel}` : ""}{effectiveSite ? ` @ ${effectiveSite}` : ""}
                    </Button>
                </div>
            )}

            <p className="text-[11px] text-slate-500">💡 คลิกสินค้า → กดจำนวน → เลือกจุด → เพิ่ม (Enter ก็ได้) · สินค้าค้างไว้ ฉีดจุดถัดไปต่อได้เลย</p>
            {err && <p className="text-xs text-rose-600">{err}</p>}
        </div>
    );
}
