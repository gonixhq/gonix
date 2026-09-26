"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, ChevronLeft, ChevronRight, CheckCircle2, Loader2, Layers, AlertTriangle, Undo2, Settings2 } from "lucide-react";
import { approveTeamCommission, unapproveTeamCommission, setStaffTeamInfo, saveTeamTiers, type TeamCommissionReport } from "@/lib/actions/team-commission";
import { TEAM_POSITIONS, TEAM_POSITION_LABEL, type TeamPosition, type TeamTier } from "@/lib/team-commission";
import { toast } from "@/lib/toast";

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const monthLabel = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" }); };

export default function TeamCommissionClient({ report }: { report: TeamCommissionReport }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [editTiers, setEditTiers] = useState(false);
    const r = report;
    const locked = !!r.approved;
    const go = (m: string) => router.push(`/dashboard/finance/team-commission?month=${m}`);

    function run(fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
        start(async () => {
            const res = await fn();
            if (!res.success) { toast.error(res.error || "ไม่สำเร็จ"); return; }
            toast.success(ok); router.refresh();
        });
    }

    return (
        <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4 pb-24">
            <div className="flex items-center gap-3 flex-wrap">
                <Users className="h-5 w-5 text-blue-700" />
                <div className="flex-1 min-w-[220px]">
                    <h1 className="text-lg font-bold text-slate-800">คอมทีม (กองกลางความงาม)</h1>
                    <p className="text-xs text-slate-500">ขั้นบันไดจากรายได้ความงามที่รับจริงทั้งเดือน · แบ่งตาม น้ำหนักตำแหน่ง × วันมาทำงาน</p>
                </div>
                <div className="inline-flex items-center gap-1">
                    <button onClick={() => go(shiftMonth(r.month, -1))} className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center" aria-label="เดือนก่อน"><ChevronLeft className="h-4 w-4" /></button>
                    <input type="month" value={r.month} onChange={e => e.target.value && go(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
                    <button onClick={() => go(shiftMonth(r.month, 1))} className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center" aria-label="เดือนถัดไป"><ChevronRight className="h-4 w-4" /></button>
                </div>
            </div>

            {/* สรุป */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="รายได้ความงามที่รับจริง" value={baht(r.received)} />
                <Stat label="ฐานคอมทีม" value={baht(r.base)} hint={r.base !== r.received ? "ถ่วง % นับเข้าคอมทีม (เช่น ผ่าตัดที่อื่น 40%)" : undefined} />
                <Stat label="ขั้นที่ได้" value={r.tierPct ? `${r.tierPct}%` : "ยังไม่ถึงขั้น"} hint={r.nextTier ? `อีก ${baht(r.nextTier.min - r.base)} ถึงขั้น ${r.nextTier.pct}%` : undefined} />
                <Stat label="กองกลาง" value={baht(r.pool)} strong />
            </div>

            {r.over1M && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800 inline-flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> ยอดเกิน 1 ล้าน — พิจารณาโบนัสพิเศษ (ไม่คำนวณอัตโนมัติ)
                </div>
            )}

            {/* ขั้นบันได */}
            <section className="rounded-2xl bg-white border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Layers className="h-4 w-4 text-slate-500" />
                    <h2 className="text-sm font-bold text-slate-700 flex-1">ขั้นบันได</h2>
                    {r.canManage && !editTiers && <button onClick={() => setEditTiers(true)} className="text-xs text-blue-700 inline-flex items-center gap-1"><Settings2 className="h-3.5 w-3.5" /> แก้ขั้น</button>}
                </div>
                {editTiers ? (
                    <TierEditor month={r.month} tiers={r.tiers} onDone={() => { setEditTiers(false); router.refresh(); }} />
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {r.tiers.map(t => (
                            <span key={t.min} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${r.tierPct === t.pct && r.base >= t.min ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"}`}>
                                ตั้งแต่ {baht(t.min).replace(".00", "")} → {t.pct}%
                            </span>
                        ))}
                    </div>
                )}
            </section>

            {/* การแบ่ง */}
            <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-bold text-slate-700 flex-1">การแบ่งกองกลาง {monthLabel(r.month)}</h2>
                    {locked ? (
                        <>
                            <span className="text-xs text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> อนุมัติแล้ว {new Date(r.approved!.at).toLocaleDateString("th-TH")} — เข้าหน้าค่าตอบแทนแล้ว</span>
                            {r.canManage && <button onClick={() => confirm("ยกเลิกการอนุมัติคอมทีมเดือนนี้?") && run(() => unapproveTeamCommission(r.month), "ยกเลิกอนุมัติแล้ว")} disabled={pending}
                                className="h-8 px-2.5 rounded-lg border border-slate-300 text-xs inline-flex items-center gap-1"><Undo2 className="h-3.5 w-3.5" /> ยกเลิกอนุมัติ</button>}
                        </>
                    ) : r.canManage && (
                        <button onClick={() => confirm(`อนุมัติคอมทีม ${monthLabel(r.month)} กองกลาง ${baht(r.pool)}?\nหลังอนุมัติตัวเลขจะล็อก และเข้าหน้าค่าตอบแทน`) && run(() => approveTeamCommission(r.month), "อนุมัติแล้ว")}
                            disabled={pending || r.pool <= 0} className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1">
                            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} อนุมัติ & ล็อกยอด
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500">
                            <tr>
                                <th className="text-left px-3 py-2">พนักงาน</th>
                                <th className="text-left px-3 py-2">ตำแหน่ง (คอมทีม)</th>
                                <th className="text-left px-3 py-2">พ้นทดลองงาน</th>
                                <th className="text-right px-3 py-2">น้ำหนัก</th>
                                <th className="text-right px-3 py-2">วันทำงาน</th>
                                <th className="text-right px-3 py-2">คะแนน</th>
                                <th className="text-right px-3 py-2">ได้รับ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {r.rows.map(s => (
                                <tr key={s.staff_id} className="border-t border-slate-100">
                                    <td className="px-3 py-2 font-medium text-slate-800">{s.name}</td>
                                    <td className="px-3 py-2">
                                        {locked || !r.canManage ? (TEAM_POSITION_LABEL[s.team_position || ""] || "—") : (
                                            <select value={s.team_position || ""} disabled={pending}
                                                onChange={e => run(() => setStaffTeamInfo(s.staff_id, { team_position: (e.target.value || null) as TeamPosition | null }), "บันทึกตำแหน่งแล้ว")}
                                                className={`h-8 rounded-lg border px-1.5 text-xs ${s.team_position ? "border-slate-200" : "border-amber-400 text-amber-700"}`}>
                                                <option value="">— ยังไม่ตั้ง —</option>
                                                {TEAM_POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                            </select>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        {locked || !r.canManage ? (s.probation_end || "—") : (
                                            <input type="date" defaultValue={s.probation_end || ""} disabled={pending} title="วันสุดท้ายของทดลองงาน (ว่าง = พ้นแล้ว)"
                                                onBlur={e => e.target.value !== (s.probation_end || "") && run(() => setStaffTeamInfo(s.staff_id, { probation_end: e.target.value || null }), "บันทึกแล้ว")}
                                                className="h-8 rounded-lg border border-slate-200 px-1.5 text-xs" />
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">{s.weight ? `×${s.weight}` : "—"}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{s.work_days}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{s.score}</td>
                                    <td className="px-3 py-2 text-right tabular-nums font-bold">
                                        {s.amount > 0 ? baht(s.amount) : <span className="text-xs font-normal text-slate-400">{s.note || "—"}</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-50 text-sm font-bold">
                            <tr><td colSpan={5} className="px-3 py-2 text-right">รวม</td><td className="px-3 py-2 text-right tabular-nums">{r.totalScore}</td><td className="px-3 py-2 text-right tabular-nums">{baht(r.rows.reduce((a, s) => a + s.amount, 0))}</td></tr>
                        </tfoot>
                    </table>
                </div>
                <p className="px-4 py-2 text-[11px] text-slate-400">วันทำงานนับจากการตอกบัตร/เวลาเข้า-ออกงาน (1 วัน = 1 วันที่มีบันทึก) · น้ำหนักตำแหน่งแก้ได้ที่ <Link href="/dashboard/settings/finance-rates" className="underline">อัตราการเงิน</Link></p>
            </section>

            {/* ที่มาของฐาน */}
            {r.topItems.length > 0 && (
                <section className="rounded-2xl bg-white border border-slate-200 p-4">
                    <h2 className="text-sm font-bold text-slate-700 mb-2">รายการที่นับเข้าฐาน (สูงสุด 15)</h2>
                    <table className="w-full text-xs">
                        <tbody>
                            {r.topItems.map(t => (
                                <tr key={`${t.item_name}|${t.team_pct}`} className="border-t border-slate-100">
                                    <td className="py-1.5">{t.item_name} {t.team_pct !== 100 && <span className="text-amber-700">(นับ {t.team_pct}%)</span>}</td>
                                    <td className="py-1.5 text-right tabular-nums text-slate-500">{baht(t.received)}</td>
                                    <td className="py-1.5 text-right tabular-nums font-semibold w-32">{baht(t.counted)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
    return (
        <div className={`rounded-2xl border p-3 ${strong ? "bg-blue-700 border-blue-700 text-white" : "bg-white border-slate-200"}`}>
            <div className={`text-xs ${strong ? "text-blue-100" : "text-slate-500"}`}>{label}</div>
            <div className="text-xl font-black tabular-nums">{value}</div>
            {hint && <div className={`text-[11px] mt-0.5 ${strong ? "text-blue-100" : "text-slate-400"}`}>{hint}</div>}
        </div>
    );
}

function TierEditor({ month, tiers, onDone }: { month: string; tiers: TeamTier[]; onDone: () => void }) {
    const [rows, setRows] = useState(tiers.map(t => ({ min: String(t.min), pct: String(t.pct) })));
    const [from, setFrom] = useState(`${month}-01`);
    const [pending, start] = useTransition();
    const save = () => start(async () => {
        const res = await saveTeamTiers(from, rows.map(r => ({ min: Number(r.min), pct: Number(r.pct) })));
        if (!res.success) { toast.error(res.error || "บันทึกไม่สำเร็จ"); return; }
        toast.success("บันทึกขั้นแล้ว"); onDone();
    });
    return (
        <div className="space-y-2">
            {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                    ตั้งแต่ ฿<input type="number" value={r.min} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, min: e.target.value } : x))} className="h-8 w-32 rounded-lg border border-slate-300 px-2 text-right tabular-nums" />
                    → <input type="number" step="0.1" value={r.pct} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, pct: e.target.value } : x))} className="h-8 w-20 rounded-lg border border-slate-300 px-2 text-right tabular-nums" /> %
                    <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-xs text-rose-600">ลบ</button>
                </div>
            ))}
            <button onClick={() => setRows([...rows, { min: "", pct: "" }])} className="text-xs text-blue-700">+ เพิ่มขั้น</button>
            <div className="flex items-center gap-2 flex-wrap pt-1">
                <label className="text-xs text-slate-600">มีผลตั้งแต่เดือน <input type="month" value={from.slice(0, 7)} onChange={e => e.target.value && setFrom(`${e.target.value}-01`)} className="ml-1 h-8 rounded-lg border border-slate-300 px-2 text-sm" /></label>
                <button onClick={save} disabled={pending} className="h-8 px-3 rounded-lg bg-blue-700 text-white text-xs font-bold disabled:opacity-50">บันทึก</button>
                <button onClick={onDone} className="h-8 px-2 text-xs text-slate-500">ยกเลิก</button>
                <span className="text-[11px] text-slate-400">เดือนก่อนหน้าใช้ขั้นเดิม (ไม่คิดย้อนหลัง)</span>
            </div>
        </div>
    );
}
