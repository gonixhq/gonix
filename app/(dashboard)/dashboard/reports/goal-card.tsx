"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Target, Pencil, Loader2, Check } from "lucide-react";
import { setRevenueTarget, type GoalProgress } from "@/lib/actions/targets";

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function GoalCard({ goal }: { goal: GoalProgress }) {
    const [editing, setEditing] = useState(false);
    return (
        <div className="gonix-card-premium p-5">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Target className="h-4 w-4 text-[#2B54F0]" /> เป้ารายได้ (Goal Tracking)</h2>
                {goal.canEdit && (
                    <button onClick={() => setEditing(e => !e)} className="text-xs font-bold text-[#2B54F0] inline-flex items-center gap-1">
                        <Pencil className="h-3.5 w-3.5" /> {editing ? "ปิด" : "ตั้งเป้า"}
                    </button>
                )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
                <GoalBar label={goal.monthLabel} periodKey={goal.monthKey} target={goal.monthTarget} actual={goal.monthActual} pct={goal.monthPct} editing={editing} />
                <GoalBar label={goal.quarterLabel} periodKey={goal.quarterKey} target={goal.quarterTarget} actual={goal.quarterActual} pct={goal.quarterPct} editing={editing} />
            </div>
        </div>
    );
}

function GoalBar({ label, periodKey, target, actual, pct, editing }: { label: string; periodKey: string; target: number; actual: number; pct: number; editing: boolean }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [val, setVal] = useState(target);
    const [saved, setSaved] = useState(false);

    const capped = Math.min(100, pct);
    const over = pct >= 100;
    const barColor = over ? "bg-emerald-500" : pct >= 70 ? "bg-[#2B54F0]" : pct >= 40 ? "bg-amber-500" : "bg-rose-400";

    function save() {
        start(async () => {
            const r = await setRevenueTarget(periodKey, Number(val) || 0);
            if (!r.success) { alert(r.error || "บันทึกไม่สำเร็จ"); return; }
            setSaved(true); setTimeout(() => setSaved(false), 1500);
            router.refresh();
        });
    }

    return (
        <div className="rounded-xl border border-slate-100 p-3.5">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">{label}</span>
                <span className={`text-xs font-black tabular-nums ${over ? "text-emerald-600" : "text-slate-700"}`}>{target > 0 ? `${pct}%` : "ยังไม่ตั้งเป้า"}</span>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${target > 0 ? capped : 0}%` }} />
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500 tabular-nums">
                {baht(actual)} {target > 0 && <span className="text-slate-400">/ เป้า {baht(target)}</span>}
            </div>
            {editing && (
                <div className="mt-2 flex items-center gap-1.5">
                    <input type="number" min={0} value={val} onChange={e => setVal(Number(e.target.value))}
                        className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2B54F0]/30" placeholder="ตั้งเป้า (บาท)" />
                    <button onClick={save} disabled={pending} className="h-8 px-2.5 rounded-lg bg-[#2B54F0] text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
                        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : "บันทึก"}
                    </button>
                </div>
            )}
        </div>
    );
}
