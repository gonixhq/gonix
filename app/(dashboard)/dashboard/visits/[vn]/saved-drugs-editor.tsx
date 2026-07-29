"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { updateDrugOrder, deleteDrugOrder } from "@/lib/actions/drug-orders";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** ตารางยาที่บันทึกแล้ว — แก้จำนวน/วิธีใช้ + ลบได้ (แก้ปัญหา "บันทึกแล้วแก้ไม่ได้") */
export default function SavedDrugsEditor({ drugs, vn, language }: { drugs: any[]; vn: string; language: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [editId, setEditId] = useState<string | null>(null);
    const [qty, setQty] = useState("");
    const [sig, setSig] = useState("");
    const [err, setErr] = useState("");

    const en = language === "en";

    function beginEdit(d: any) {
        setEditId(d.id); setQty(String(d.qty)); setSig(d.sig_text || ""); setErr("");
    }
    function cancel() { setEditId(null); setErr(""); }

    function save(id: string) {
        const q = parseFloat(qty);
        if (!(q > 0)) { setErr("จำนวนต้องมากกว่า 0"); return; }
        start(async () => {
            const res = await updateDrugOrder({ id, qty: q, sig_text: sig }, vn);
            if (!res.success) { setErr(res.error || "บันทึกไม่สำเร็จ"); return; }
            setEditId(null); router.refresh();
        });
    }
    function remove(id: string) {
        if (!confirm(en ? "Delete this medicine order?" : "ลบรายการยานี้?")) return;
        start(async () => { await deleteDrugOrder(id, vn); router.refresh(); });
    }

    const total = drugs.reduce((s, d) => s + (d.total_cost || 0), 0);

    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            {err && <div className="px-4 py-2 text-xs text-rose-600 bg-rose-50 border-b border-rose-100">{err}</div>}
            <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th className="text-left px-5 py-3.5 font-bold text-slate-600 uppercase tracking-wide text-xs">{en ? "Medicine" : "ชื่อยา"}</th>
                        <th className="text-center px-4 py-3.5 font-bold text-slate-600 uppercase tracking-wide text-xs w-28">{en ? "Qty" : "จำนวน"}</th>
                        <th className="text-left px-4 py-3.5 font-bold text-slate-600 uppercase tracking-wide text-xs">{en ? "Sig" : "วิธีใช้"}</th>
                        <th className="text-right px-5 py-3.5 font-bold text-slate-600 uppercase tracking-wide text-xs w-28">{en ? "Price" : "ราคา (฿)"}</th>
                        <th className="px-2 py-3.5 w-24"></th>
                    </tr>
                </thead>
                <tbody>
                    {drugs.map((d: any) => {
                        const inv = Array.isArray(d.inventory) ? d.inventory[0] : d.inventory;
                        const editing = editId === d.id;
                        return (
                            <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                                <td className="px-5 py-4">
                                    <div className="font-bold text-slate-800">{inv?.item_name}</div>
                                    {inv?.generic_name && <div className="text-xs font-medium text-slate-500 mt-0.5">{inv.generic_name} {inv.strength}</div>}
                                </td>
                                <td className="px-4 py-4 text-center font-bold text-slate-700 bg-slate-50">
                                    {editing ? (
                                        <Input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)}
                                            className="h-8 w-20 text-center text-sm tabular-nums mx-auto" />
                                    ) : (
                                        <>{d.qty} <span className="text-xs font-normal text-slate-400">{d.unit}</span></>
                                    )}
                                </td>
                                <td className="px-4 py-4 text-slate-600 text-[13px]">
                                    {editing ? (
                                        <Input value={sig} onChange={e => setSig(e.target.value)}
                                            placeholder={en ? "Directions (optional)" : "วิธีใช้ (เว้นว่างได้)"} className="h-8 text-sm" />
                                    ) : (d.sig_text || "—")}
                                </td>
                                <td className="px-5 py-4 text-right font-black text-blue-600 bg-blue-50/30">฿{d.total_cost?.toLocaleString()}</td>
                                <td className="px-2 py-4">
                                    <div className="flex items-center justify-center gap-1">
                                        {editing ? (
                                            <>
                                                <button onClick={() => save(d.id)} disabled={pending}
                                                    className="h-7 w-7 rounded-lg text-emerald-600 hover:bg-emerald-50 inline-flex items-center justify-center" title={en ? "Save" : "บันทึก"}>
                                                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                                </button>
                                                <button onClick={cancel} disabled={pending}
                                                    className="h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 inline-flex items-center justify-center" title={en ? "Cancel" : "ยกเลิก"}>
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => beginEdit(d)} disabled={pending}
                                                    className="h-7 w-7 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 inline-flex items-center justify-center" title={en ? "Edit" : "แก้ไข"}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => remove(d.id)} disabled={pending}
                                                    className="h-7 w-7 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center" title={en ? "Delete" : "ลบ"}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot className="bg-blue-50/50 border-t border-blue-100">
                    <tr>
                        <td colSpan={3} className="px-5 py-3 text-sm font-bold text-blue-800 uppercase text-right tracking-widest">{en ? "Total Price" : "รวมค่ายาทั้งหมด"}</td>
                        <td className="px-5 py-3 text-right font-black text-blue-600 text-lg">฿{total.toLocaleString()}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}
