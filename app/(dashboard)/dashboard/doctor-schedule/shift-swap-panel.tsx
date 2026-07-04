"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ArrowLeftRight, Loader2, Check, Ban, Plus, History } from "lucide-react";
import {
    getUpcomingShiftsForStaff, createSwapRequest, getSwapRequests, decideSwapRequest, cancelSwapRequest,
    type SwapShiftOption, type SwapRequestRow,
} from "@/lib/actions/shift-swap";
import type { ScheduleStaff } from "@/lib/actions/doctor-shifts";

const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function dateLabel(d: string) {
    const dt = new Date(d + "T00:00:00");
    return `${dt.getDate()} ${THAI_MONTHS_SHORT[dt.getMonth()]}`;
}
const STATUS: Record<string, { label: string; cls: string }> = {
    pending: { label: "รออนุมัติ", cls: "bg-amber-100 text-amber-700" },
    approved: { label: "อนุมัติแล้ว", cls: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "ปฏิเสธ", cls: "bg-rose-100 text-rose-700" },
    cancelled: { label: "ยกเลิก", cls: "bg-slate-100 text-slate-500" },
};

export default function ShiftSwapPanel({ staff, onClose }: { staff: ScheduleStaff[]; onClose: () => void }) {
    const [requests, setRequests] = useState<SwapRequestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState("");

    // create form
    const [fromStaffId, setFromStaffId] = useState("");
    const [shifts, setShifts] = useState<SwapShiftOption[]>([]);
    const [shiftId, setShiftId] = useState("");
    const [toStaffId, setToStaffId] = useState("");
    const [reason, setReason] = useState("");
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { setRequests(await getSwapRequests()); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!fromStaffId) { setShifts([]); setShiftId(""); return; }
        getUpcomingShiftsForStaff(fromStaffId).then((s) => { setShifts(s); setShiftId(""); });
    }, [fromStaffId]);

    async function handleCreate() {
        if (!shiftId || !toStaffId) { setError("เลือกเวรและผู้รับเวรก่อน"); return; }
        setCreating(true); setError("");
        const r = await createSwapRequest({ shift_id: shiftId, to_staff_id: toStaffId, reason: reason || undefined });
        setCreating(false);
        if (!r.success) { setError(r.error || "สร้างคำขอไม่สำเร็จ"); return; }
        setReason(""); setShiftId(""); setToStaffId("");
        await load();
    }
    async function decide(id: string, approve: boolean) {
        const note = approve ? undefined : (prompt("เหตุผลที่ปฏิเสธ (ไม่บังคับ)") || undefined);
        setBusyId(id); setError("");
        const r = await decideSwapRequest(id, approve, note);
        setBusyId(null);
        if (!r.success) { setError(r.error || "ทำรายการไม่สำเร็จ"); return; }
        await load();
    }
    async function cancel(id: string) {
        setBusyId(id); setError("");
        const r = await cancelSwapRequest(id);
        setBusyId(null);
        if (!r.success) { setError(r.error || "ยกเลิกไม่สำเร็จ"); return; }
        await load();
    }

    const pending = requests.filter((r) => r.status === "pending");
    const history = requests.filter((r) => r.status !== "pending");

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-[#2B54F0]" /> ขอเปลี่ยนเวร</h2>
                    <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"><X className="h-4 w-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {error && <div className="rounded-xl px-3 py-2 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>}

                    {/* สร้างคำขอ */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
                        <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> สร้างคำขอเปลี่ยนเวร</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                                <label className="text-[11px] font-semibold text-slate-500">เจ้าของเวรเดิม</label>
                                <select value={fromStaffId} onChange={(e) => setFromStaffId(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                                    <option value="">— เลือกพนักงาน —</option>
                                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-slate-500">เวรที่จะเปลี่ยน</label>
                                <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} disabled={!fromStaffId} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100">
                                    <option value="">{!fromStaffId ? "— เลือกพนักงานก่อน —" : shifts.length === 0 ? "— ไม่มีเวรในอนาคต —" : "— เลือกเวร —"}</option>
                                    {shifts.map((s) => <option key={s.id} value={s.id}>{dateLabel(s.shift_date)} · {s.start_time}–{s.end_time}{s.room_name ? ` · ${s.room_name}` : ""}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-slate-500">ให้ใครรับเวรแทน</label>
                                <select value={toStaffId} onChange={(e) => setToStaffId(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                                    <option value="">— เลือกผู้รับเวร —</option>
                                    {staff.filter((s) => s.id !== fromStaffId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-slate-500">เหตุผล (ไม่บังคับ)</label>
                                <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="เช่น ติดธุระ" />
                            </div>
                        </div>
                        <button onClick={handleCreate} disabled={creating || !shiftId || !toStaffId} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-50" style={{ background: "linear-gradient(90deg, #2B54F0, #00A6C0)" }}>
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} ส่งคำขอ
                        </button>
                    </div>

                    {loading ? (
                        <div className="py-10 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                    ) : (
                        <>
                            {/* Pending */}
                            <div>
                                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">รออนุมัติ ({pending.length})</div>
                                {pending.length === 0 ? (
                                    <div className="text-sm text-slate-400 py-3 text-center">ไม่มีคำขอรออนุมัติ</div>
                                ) : (
                                    <div className="space-y-2">
                                        {pending.map((r) => (
                                            <div key={r.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <div className="text-sm text-slate-700">
                                                        <span className="font-bold">{r.from_name}</span> → <span className="font-bold text-[#2B54F0]">{r.to_name}</span>
                                                        <span className="text-slate-400 ml-2">· {dateLabel(r.shift_date)}</span>
                                                        {r.reason && <span className="text-slate-400"> · {r.reason}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <button onClick={() => decide(r.id, true)} disabled={busyId === r.id} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                                                            {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} อนุมัติ
                                                        </button>
                                                        <button onClick={() => decide(r.id, false)} disabled={busyId === r.id} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 disabled:opacity-50">
                                                            <X className="h-3.5 w-3.5" /> ปฏิเสธ
                                                        </button>
                                                        <button onClick={() => cancel(r.id)} disabled={busyId === r.id} title="ยกเลิกคำขอ" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                                                            <Ban className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* History */}
                            {history.length > 0 && (
                                <div>
                                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> ประวัติ ({history.length})</div>
                                    <div className="divide-y divide-slate-100">
                                        {history.map((r) => {
                                            const st = STATUS[r.status] || STATUS.cancelled;
                                            return (
                                                <div key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm flex-wrap">
                                                    <div className="text-slate-600">
                                                        <span className="font-semibold">{r.from_name}</span> → <span className="font-semibold">{r.to_name}</span>
                                                        <span className="text-slate-400 ml-2">· {dateLabel(r.shift_date)}</span>
                                                        {r.decision_note && <span className="text-rose-500"> · {r.decision_note}</span>}
                                                    </div>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
