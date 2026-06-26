"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { X, Plus, Trash2, Loader2, Split } from "lucide-react";
import { getItemSplits, listStaffOptions, setItemSplits, type StaffOption } from "@/lib/actions/commissions";

interface Row { staff_id: string; percent: number }

export default function SplitModal({
    invItemId, itemName, role, currentStaffId, currentStaffName, onClose,
}: {
    invItemId: string;
    itemName: string;
    role: string;
    currentStaffId: string;
    currentStaffName: string;
    onClose: () => void;
}) {
    const router = useRouter();
    const [rows, setRows] = useState<Row[]>([]);
    const [options, setOptions] = useState<StaffOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            const [existing, opts] = await Promise.all([getItemSplits(invItemId, role), listStaffOptions()]);
            setOptions(opts);
            if (existing.length > 0) {
                setRows(existing.map(e => ({ staff_id: e.staff_id, percent: e.percent })));
            } else {
                // ตั้งต้น 50/50 จากผู้ทำเคสหลัก
                setRows([{ staff_id: currentStaffId, percent: 50 }, { staff_id: "", percent: 50 }]);
            }
            setLoading(false);
        })();
    }, [invItemId, role, currentStaffId]);

    const sum = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);

    function update(i: number, patch: Partial<Row>) {
        setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
    }

    function save(clear = false) {
        setErr(null);
        start(async () => {
            const payload = clear ? [] : rows.filter(r => r.staff_id && r.percent > 0);
            const res = await setItemSplits(invItemId, role, payload);
            if (!res.success) { setErr(res.error || "บันทึกไม่สำเร็จ"); return; }
            onClose();
            router.refresh();
        });
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-bold text-slate-800 inline-flex items-center gap-2"><Split className="h-5 w-5 text-violet-600" /> แบ่งค่ามือ</h2>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><X className="h-4 w-4" /></button>
                </div>
                <p className="text-xs text-slate-500 mb-4">{itemName} · เดิมเป็นของ {currentStaffName}</p>

                {loading ? (
                    <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></div>
                ) : (
                    <>
                        <div className="space-y-2">
                            {rows.map((r, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <select
                                        value={r.staff_id}
                                        onChange={e => update(i, { staff_id: e.target.value })}
                                        className="flex-1 h-9 rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                                    >
                                        <option value="">— เลือกพนักงาน —</option>
                                        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                    </select>
                                    <input
                                        type="number" min={0} max={100} value={r.percent}
                                        onChange={e => update(i, { percent: Number(e.target.value) })}
                                        className="w-20 h-9 rounded-lg border border-slate-200 px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-violet-300"
                                    />
                                    <span className="text-sm text-slate-400">%</span>
                                    <button onClick={() => setRows(rs => rs.filter((_, idx) => idx !== i))}
                                        className="h-9 w-9 rounded-lg hover:bg-rose-50 flex items-center justify-center text-rose-400 shrink-0">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setRows(rs => [...rs, { staff_id: "", percent: 0 }])}
                            className="mt-2 text-xs font-semibold text-violet-600 hover:text-violet-700 inline-flex items-center gap-1">
                            <Plus className="h-3.5 w-3.5" /> เพิ่มคน
                        </button>

                        <div className={`mt-3 text-sm font-bold text-right ${Math.abs(sum - 100) < 0.01 ? "text-emerald-600" : "text-rose-600"}`}>
                            รวม {sum}% {Math.abs(sum - 100) < 0.01 ? "✓" : "(ต้อง = 100)"}
                        </div>
                        {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}

                        <div className="flex items-center gap-2 mt-4">
                            <Button variant="outline" disabled={pending} onClick={() => save(true)}
                                className="rounded-lg h-9 text-xs text-slate-500">
                                ล้างการแบ่ง (คืนค่าเดิม)
                            </Button>
                            <Button disabled={pending || Math.abs(sum - 100) > 0.01} onClick={() => save(false)}
                                className="rounded-lg h-9 flex-1 bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
                                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} บันทึกการแบ่ง
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
