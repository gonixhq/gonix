"use client";

import { useEffect, useState } from "react";
import { listInventoryForPicker } from "@/lib/actions/services";
import type { InventoryPick } from "@/lib/service-types";

export type UsageItem = { inventory_item_id: string; qty: number };

// ยา/วัสดุที่ใช้เพิ่มในการตัดคอสครั้งนี้ (นอกเหนือจากค่าตั้งของคอส/สูตร) → ตัดสต๊อก + ต้นทุนจริง (mig 153)
export default function UsageItemsPicker({ value, onChange }: { value: UsageItem[]; onChange: (v: UsageItem[]) => void }) {
    const [inv, setInv] = useState<InventoryPick[]>([]);
    useEffect(() => { listInventoryForPicker().then(setInv).catch(() => setInv([])); }, []);
    const cls = "h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs";
    return (
        <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-600">ยา/วัสดุที่ใช้เพิ่ม <span className="font-normal text-slate-400">(ของตามสูตร/ค่าตั้งตัดให้อัตโนมัติแล้ว)</span></div>
            {value.map((r, i) => {
                const p = inv.find(x => x.id === r.inventory_item_id);
                return (
                    <div key={i} className="flex items-center gap-1.5">
                        <select value={r.inventory_item_id} onChange={e => onChange(value.map((x, j) => j === i ? { ...x, inventory_item_id: e.target.value } : x))} className={`${cls} flex-1 min-w-0`}>
                            <option value="">— เลือก —</option>
                            {inv.map(x => <option key={x.id} value={x.id}>{x.item_name} (เหลือ {x.stock_qty})</option>)}
                        </select>
                        <input type="number" min="0" step="0.01" value={r.qty || ""} onChange={e => onChange(value.map((x, j) => j === i ? { ...x, qty: parseFloat(e.target.value) || 0 } : x))} className={`${cls} w-20 text-right tabular-nums`} />
                        <span className="text-[11px] text-slate-500 w-8">{p?.unit || ""}</span>
                        <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-[11px] text-rose-600">ลบ</button>
                    </div>
                );
            })}
            <button type="button" onClick={() => onChange([...value, { inventory_item_id: "", qty: 1 }])} className="text-xs font-semibold text-blue-700">+ เพิ่มยา/วัสดุ</button>
        </div>
    );
}
