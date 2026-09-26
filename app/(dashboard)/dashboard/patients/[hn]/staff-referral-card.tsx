"use client";

import { useEffect, useState, useTransition } from "react";
import { UserCheck, Loader2, AlertTriangle, X } from "lucide-react";
import { getPatientStaffReferral, setStaffReferral, cancelStaffReferral, listReferralStaff, type PatientStaffReferral } from "@/lib/actions/staff-referrals";
import { toast } from "@/lib/toast";

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
const END_LABEL: Record<string, string> = { lapsed: "หลุด (ไม่มาเกินกำหนด)", staff_left: "พนักงานลาออก", cancelled: "ยกเลิก" };

// คอมแนะนำ (เฟส 2D): พนักงานผู้แนะนำของลูกค้ารายนี้
export default function StaffReferralCard({ hn }: { hn: string }) {
    const [info, setInfo] = useState<PatientStaffReferral | null>(null);
    const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
    const [pick, setPick] = useState("");
    const [loading, setLoading] = useState(true);
    const [pending, start] = useTransition();

    const reload = async () => { setInfo(await getPatientStaffReferral(hn)); setLoading(false); };
    useEffect(() => { reload(); listReferralStaff().then(setStaff); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [hn]);

    function save() {
        if (!pick) return;
        start(async () => {
            const r = await setStaffReferral(hn, pick);
            if (!r.success) { toast.error(r.error || "บันทึกไม่สำเร็จ"); return; }
            toast.success("บันทึกผู้แนะนำแล้ว"); setPick(""); await reload();
        });
    }
    function cancel(id: string) {
        const reason = prompt("เหตุผลที่ยกเลิกผู้แนะนำ (เช่น บันทึกผิดคน)");
        if (!reason?.trim()) return;
        start(async () => {
            const r = await cancelStaffReferral(id, reason, hn);
            if (!r.success) { toast.error(r.error || "ยกเลิกไม่สำเร็จ"); return; }
            toast.success("ยกเลิกแล้ว"); await reload();
        });
    }

    if (loading) return <div className="rounded-2xl bg-white border border-slate-200 p-4"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>;
    if (!info) return null;
    const { active, lapsedAt, canRegister } = info;
    const past = info.history.filter(h => h.ended_on);

    return (
        <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-800">พนักงานผู้แนะนำ (คอมแนะนำ)</h3>
            </div>

            {active && !lapsedAt ? (
                <div className="flex items-center gap-3 flex-wrap rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                    <div className="flex-1 min-w-[180px]">
                        <div className="text-sm font-bold text-emerald-900">{active.staff_name}</div>
                        <div className="text-xs text-emerald-700">
                            {active.kind === "returning" ? "ตามลูกค้ากลับมา" : "ลูกค้าใหม่"} · ตั้งแต่ {fmt(active.started_on)}
                            {info.lastVisit ? ` · มาล่าสุด ${fmt(info.lastVisit)}` : ""}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">ไม่มาเกิน {info.lapseMonths} เดือน ผู้แนะนำจะหลุดอัตโนมัติ</div>
                    </div>
                    <button onClick={() => cancel(active.id)} disabled={pending} className="h-8 px-2.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1" title="เฉพาะเจ้าของ/ผู้จัดการ">
                        <X className="h-3.5 w-3.5" /> ยกเลิก
                    </button>
                </div>
            ) : (
                <>
                    {active && lapsedAt && (
                        <div className="text-xs text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> ผู้แนะนำเดิม ({active.staff_name}) หลุดแล้วตั้งแต่ {fmt(lapsedAt)} — ลูกค้าไม่ได้มาเกิน {info.lapseMonths} เดือน</div>
                    )}
                    {canRegister ? (
                        <div className="flex items-center gap-2 flex-wrap">
                            <select value={pick} onChange={e => setPick(e.target.value)} className="h-9 rounded-xl border border-slate-300 bg-white px-2 text-sm min-w-[200px]">
                                <option value="">— เลือกพนักงานผู้แนะนำ —</option>
                                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <button onClick={save} disabled={!pick || pending} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1">
                                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} บันทึก
                            </button>
                            <span className="text-xs text-slate-500">{canRegister === "new" ? "ลูกค้าใหม่ — บันทึกได้เฉพาะวันนี้ (วันลงทะเบียน)" : `ลูกค้าหายไปเกิน ${info.lapseMonths} เดือน — พนักงานที่ตามกลับมาลงชื่อได้`}</span>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500">ไม่มีผู้แนะนำ · บันทึกได้เฉพาะวันลงทะเบียนครั้งแรก หรือเมื่อลูกค้าไม่ได้มาเกิน {info.lapseMonths} เดือน (ลูกค้าเดิม/จากโฆษณาไม่นับ)</p>
                    )}
                </>
            )}

            {past.length > 0 && (
                <div className="text-[11px] text-slate-500 space-y-0.5">
                    {past.map(h => <div key={h.id}>• {h.staff_name}: {fmt(h.started_on)} – {fmt(h.ended_on!)} · {END_LABEL[h.end_reason || ""] || h.end_reason}</div>)}
                </div>
            )}
        </div>
    );
}
