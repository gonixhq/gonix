"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Loader2, X, Download } from "lucide-react";
import { saveFixedCost, deleteFixedCost, importFixedCostExamples, type FixedCostRow, type FixedCostInput } from "@/lib/actions/fixed-costs";
import { FIXED_COST_CATEGORIES, FIXED_COST_CATEGORY_LABEL } from "@/lib/fixed-costs";
import { toast } from "@/lib/toast";

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const monthLabel = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("th-TH", { month: "short", year: "2-digit" }); };

type Data = { rows: FixedCostRow[]; actual: number; planned: number; byCategory: Record<string, number>; canManage: boolean };

export default function FixedCostsClient({ month, data }: { month: string; data: Data }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [editing, setEditing] = useState<FixedCostRow | "new" | null>(null);
    const [showInactive, setShowInactive] = useState(false);
    const go = (m: string) => router.push(`/dashboard/finance/fixed-costs?month=${m}`);
    const rows = showInactive ? data.rows : data.rows.filter(r => r.active);
    const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok: string, after?: () => void) => start(async () => {
        const res = await fn();
        if (!res.success) { toast.error(res.error || "ไม่สำเร็จ"); return; }
        toast.success(ok); after?.(); router.refresh();
    });

    return (
        <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-4 pb-24">
            <div className="flex items-center gap-3 flex-wrap">
                <Building2 className="h-5 w-5 text-blue-700" />
                <div className="flex-1 min-w-[220px]">
                    <h1 className="text-lg font-bold text-slate-800">ต้นทุนคงที่</h1>
                    <p className="text-xs text-slate-500">รวมเข้ารายงานรายเดือน → กำไรจริง + จุดคุ้มทุน · รายปีหารเฉลี่ย 12 · &quot;วางแผน&quot; แยกไว้ไม่ปนตัวเลขจริง</p>
                </div>
                <div className="inline-flex items-center gap-1">
                    <button onClick={() => go(shiftMonth(month, -1))} className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center" aria-label="เดือนก่อน"><ChevronLeft className="h-4 w-4" /></button>
                    <input type="month" value={month} onChange={e => e.target.value && go(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
                    <button onClick={() => go(shiftMonth(month, 1))} className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center" aria-label="เดือนถัดไป"><ChevronRight className="h-4 w-4" /></button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-blue-700 text-white p-4">
                    <div className="text-xs text-blue-100">ต้นทุนคงที่ (จ่ายจริง) / เดือน</div>
                    <div className="text-2xl font-black tabular-nums">{baht(data.actual)}</div>
                </div>
                <div className="rounded-2xl bg-white border border-dashed border-slate-300 p-4">
                    <div className="text-xs text-slate-500">วางแผน (ยังไม่จ่าย)</div>
                    <div className="text-2xl font-black tabular-nums text-slate-600">{baht(data.planned)}</div>
                    <div className="text-[11px] text-slate-400">ถ้าจ่ายจริงทั้งหมด = {baht(data.actual + data.planned)}</div>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-0.5">
                    {Object.entries(data.byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs"><span className="text-slate-500">{FIXED_COST_CATEGORY_LABEL[k]}</span><span className="tabular-nums font-semibold">{baht(v)}</span></div>
                    ))}
                    {Object.keys(data.byCategory).length === 0 && <div className="text-xs text-slate-400">ยังไม่มีรายการจ่ายจริง</div>}
                </div>
            </div>

            <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-700 flex-1">รายการ ({rows.length})</span>
                    <label className="text-xs text-slate-600 inline-flex items-center gap-1"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> แสดงที่ไม่มีผลเดือนนี้</label>
                    {data.canManage && data.rows.length === 0 && (
                        <button onClick={() => run(() => importFixedCostExamples(`${month}-01`), "นำเข้าตัวอย่างแล้ว — ตรวจตัวเลขอีกครั้ง")} disabled={pending}
                            className="h-8 px-3 rounded-lg border border-slate-300 text-xs font-semibold inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" /> นำเข้าตัวอย่างจากสเปก</button>
                    )}
                    {data.canManage && <button onClick={() => setEditing("new")} className="h-8 px-3 rounded-lg bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> เพิ่มรายการ</button>}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                            <tr>
                                <th className="text-left px-3 py-2">รายการ</th>
                                <th className="text-left px-3 py-2">หมวด</th>
                                <th className="text-right px-3 py-2">จำนวนเงิน</th>
                                <th className="text-right px-3 py-2">ต่อเดือน</th>
                                <th className="text-left px-3 py-2">ช่วงเวลา</th>
                                <th className="px-3 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">ยังไม่มีรายการ</td></tr>
                            ) : rows.map(r => (
                                <tr key={r.id} className={`border-t border-slate-100 ${!r.active ? "opacity-50" : ""}`}>
                                    <td className="px-3 py-2">
                                        <div className="font-medium text-slate-800">{r.name} {r.status === "planned" && <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-dashed border-slate-300">วางแผน</span>}</div>
                                        {r.note && <div className="text-[11px] text-slate-400">{r.note}</div>}
                                    </td>
                                    <td className="px-3 py-2 text-slate-600">{FIXED_COST_CATEGORY_LABEL[r.category]}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{baht(r.amount)}<span className="text-[11px] text-slate-400">/{r.cycle === "yearly" ? "ปี" : "เดือน"}</span></td>
                                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{baht(r.monthly)}</td>
                                    <td className="px-3 py-2 text-xs text-slate-500">{monthLabel(r.start_month.slice(0, 7))} – {r.end_month ? monthLabel(r.end_month.slice(0, 7)) : "ปัจจุบัน"}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                        {data.canManage && <>
                                            <button onClick={() => setEditing(r)} className="p-1.5 text-slate-500 hover:text-blue-700" aria-label="แก้ไข"><Pencil className="h-3.5 w-3.5" /></button>
                                            <button onClick={() => confirm(`ลบ "${r.name}"?\nถ้าเลิกจ่ายแล้ว แนะนำให้ตั้งเดือนสิ้นสุดแทน (ย้อนดูเดือนเก่าได้)`) && run(() => deleteFixedCost(r.id), "ลบแล้ว")} className="p-1.5 text-slate-500 hover:text-rose-600" aria-label="ลบ"><Trash2 className="h-3.5 w-3.5" /></button>
                                        </>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="px-4 py-2 text-[11px] text-slate-400">เงินเดือนพนักงาน/ค่าตอบแทนแพทย์ดึงจากหน้าค่าตอบแทนอัตโนมัติ ไม่ต้องใส่ซ้ำ · เลิกจ่ายรายการไหนให้ตั้ง &quot;เดือนสิ้นสุด&quot; แทนการลบ เพื่อให้รายงานเดือนเก่ายังถูกต้อง</p>
            </section>

            {editing && <EditModal row={editing === "new" ? null : editing} month={month} pending={pending} onClose={() => setEditing(null)}
                onSave={(id, input) => run(() => saveFixedCost(id, input), "บันทึกแล้ว", () => setEditing(null))} />}
        </div>
    );
}

function EditModal({ row, month, pending, onClose, onSave }: {
    row: FixedCostRow | null; month: string; pending: boolean; onClose: () => void; onSave: (id: string | null, input: FixedCostInput) => void;
}) {
    const [f, setF] = useState({
        name: row?.name || "", category: row?.category || "place", amount: row ? String(row.amount) : "", cycle: row?.cycle || "monthly",
        start: (row?.start_month || `${month}-01`).slice(0, 7), end: row?.end_month?.slice(0, 7) || "", status: row?.status || "actual", note: row?.note || "",
    });
    const cat = FIXED_COST_CATEGORIES.find(c => c.value === f.category);
    const inp = "h-9 w-full rounded-lg border border-slate-300 px-2 text-sm";
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-3">
                <div className="flex items-center"><h2 className="text-base font-bold text-slate-800 flex-1">{row ? "แก้ไข" : "เพิ่ม"}ต้นทุนคงที่</h2><button onClick={onClose} aria-label="ปิด"><X className="h-4 w-4 text-slate-400" /></button></div>
                <label className="block text-xs text-slate-600 space-y-1"><span className="font-semibold">ชื่อรายการ</span><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inp} /></label>
                <label className="block text-xs text-slate-600 space-y-1"><span className="font-semibold">หมวด</span>
                    <select value={f.category} onChange={e => setF({ ...f, category: e.target.value as typeof f.category })} className={inp}>
                        {FIXED_COST_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    {cat?.hint && <span className="text-[11px] text-slate-400">{cat.hint}</span>}
                </label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs text-slate-600 space-y-1"><span className="font-semibold">จำนวนเงิน (บาท)</span><input type="number" min="0" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} className={`${inp} text-right tabular-nums`} /></label>
                    <label className="text-xs text-slate-600 space-y-1"><span className="font-semibold">รอบจ่าย</span>
                        <select value={f.cycle} onChange={e => setF({ ...f, cycle: e.target.value as "monthly" | "yearly" })} className={inp}><option value="monthly">รายเดือน</option><option value="yearly">รายปี (หาร 12)</option></select>
                    </label>
                    <label className="text-xs text-slate-600 space-y-1"><span className="font-semibold">เริ่มเดือน</span><input type="month" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} className={inp} /></label>
                    <label className="text-xs text-slate-600 space-y-1"><span className="font-semibold">สิ้นสุดเดือน (ว่าง = ต่อเนื่อง)</span><input type="month" value={f.end} onChange={e => setF({ ...f, end: e.target.value })} className={inp} /></label>
                </div>
                <div className="flex gap-2">
                    {(["actual", "planned"] as const).map(s => (
                        <button key={s} type="button" onClick={() => setF({ ...f, status: s })} className={`flex-1 h-9 rounded-lg text-sm font-semibold border ${f.status === s ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-600 border-slate-300"}`}>
                            {s === "actual" ? "จ่ายจริง" : "วางแผน (ยังไม่จ่าย)"}
                        </button>
                    ))}
                </div>
                <label className="block text-xs text-slate-600 space-y-1"><span className="font-semibold">หมายเหตุ</span><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} className={inp} /></label>
                {f.cycle === "yearly" && Number(f.amount) > 0 && <p className="text-xs text-slate-500">ต่อเดือน ≈ {baht(Math.round(Number(f.amount) / 12 * 100) / 100)}</p>}
                <div className="flex justify-end gap-2 pt-1">
                    <button onClick={onClose} className="h-9 px-4 rounded-lg text-sm text-slate-600">ยกเลิก</button>
                    <button disabled={pending || !f.name.trim() || f.amount === ""} onClick={() => onSave(row?.id || null, {
                        name: f.name, category: f.category, amount: Number(f.amount), cycle: f.cycle, start_month: `${f.start}-01`,
                        end_month: f.end ? `${f.end}-01` : null, status: f.status, note: f.note,
                    })} className="h-9 px-4 rounded-lg bg-blue-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1">
                        {pending && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก
                    </button>
                </div>
            </div>
        </div>
    );
}
