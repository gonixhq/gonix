"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cake, Send, Copy, Check, Ticket, Loader2, Pencil, Phone, ChevronDown } from "lucide-react";
import { sendBirthdayLine, markBirthdayGreeted, issueBirthdayCoupon, setBirthdayMessage, getBirthdayMessageFor, type BirthdayData, type BirthdayRow } from "@/lib/actions/birthday";
import { BIRTHDAY_PLACEHOLDERS } from "@/lib/birthday";
import { toast } from "@/lib/toast";

const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
const diffDays = (a: string, b: string) => Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000);

// วันเกิดคนไข้: วันนี้ + 7 วันข้างหน้า เด่นสุด · ทั้งเดือนพับไว้ · ส่ง HBD (LINE / คัดลอก) + ออกคูปองวันเกิด
export default function BirthdayPanel({ data, canEdit }: { data: BirthdayData; canEdit: boolean }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [busyHn, setBusyHn] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [showMonth, setShowMonth] = useState(false);
    const [editMsg, setEditMsg] = useState(false);
    const [msg, setMsg] = useState(data.message);

    const soon = useMemo(() => data.rows.filter(r => { const d = diffDays(r.bday, data.today); return d >= 0 && d <= 7; }), [data]);
    const month = useMemo(() => data.rows.filter(r => r.bday.slice(0, 7) === data.month), [data]);
    const todayCount = soon.filter(r => r.bday === data.today).length;

    function act(hn: string, fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
        setBusyHn(hn);
        start(async () => {
            const res = await fn();
            setBusyHn(null);
            if (!res.success) { toast.error(res.error || "ไม่สำเร็จ"); return; }
            toast.success(ok); router.refresh();
        });
    }
    async function copyMsg(r: BirthdayRow) {
        const text = await getBirthdayMessageFor(r.hn);
        try { await navigator.clipboard.writeText(text); setCopied(r.hn); setTimeout(() => setCopied(null), 1500); } catch { toast.error("คัดลอกไม่สำเร็จ"); }
    }

    const Row = ({ r }: { r: BirthdayRow }) => {
        const d = diffDays(r.bday, data.today);
        const busy = pending && busyHn === r.hn;
        return (
            <div className={`flex items-center gap-3 flex-wrap px-4 py-3 ${d === 0 ? "bg-pink-50/70" : ""}`}>
                <div className={`h-11 w-11 rounded-xl flex flex-col items-center justify-center shrink-0 ${d === 0 ? "bg-pink-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                    <span className="text-[10px] leading-none">{new Date(`${r.bday}T00:00:00`).toLocaleDateString("th-TH", { month: "short" })}</span>
                    <span className="text-base font-black leading-tight">{Number(r.bday.slice(8, 10))}</span>
                </div>
                <div className="flex-1 min-w-[180px]">
                    <Link href={`/dashboard/patients/${r.hn}`} className="font-bold text-slate-800 hover:text-blue-700">
                        {r.name}{r.nickname && <span className="text-pink-600"> ({r.nickname})</span>}
                    </Link>
                    <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                        <span>{d === 0 ? "🎂 วันนี้" : d > 0 ? `อีก ${d} วัน · ${dayLabel(r.bday)}` : `ผ่านมา ${-d} วัน`}</span>
                        <span>· ครบ {r.age} ปี</span>
                        {r.lastVisit && <span className="text-slate-400">· มาล่าสุด {new Date(`${r.lastVisit}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</span>}
                        {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-0.5 text-blue-700"><Phone className="h-3 w-3" />{r.phone}</a>}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {r.greeted ? (
                        <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 inline-flex items-center gap-1"><Check className="h-3 w-3" /> อวยพรแล้ว{r.greeted === "line" ? " (LINE)" : ""}</span>
                    ) : r.hasLine ? (
                        <button onClick={() => act(r.hn, () => sendBirthdayLine(r.hn), "ส่ง HBD ทาง LINE แล้ว")} disabled={busy}
                            className="h-8 px-3 rounded-lg bg-[#06C755] text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} ส่ง HBD (LINE)
                        </button>
                    ) : (
                        <>
                            <button onClick={() => copyMsg(r)} className="h-8 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 inline-flex items-center gap-1" title="ยังไม่ผูก LINE — คัดลอกไปส่งเอง">
                                {copied === r.hn ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} คัดลอกข้อความ
                            </button>
                            <button onClick={() => act(r.hn, () => markBirthdayGreeted(r.hn), "บันทึกว่าอวยพรแล้ว")} disabled={busy}
                                className="h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100">ส่งแล้ว ✓</button>
                        </>
                    )}
                    {r.coupon ? (
                        <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg inline-flex items-center gap-1 ${r.coupon.status === "used" ? "bg-slate-100 text-slate-500" : "bg-violet-50 text-violet-700"}`} title={r.coupon.title}>
                            <Ticket className="h-3 w-3" /> {r.coupon.status === "used" ? "ใช้คูปองแล้ว" : `คูปอง · ${r.coupon.valueLabel}`}
                        </span>
                    ) : (
                        <button onClick={() => act(r.hn, () => issueBirthdayCoupon(r.hn), "ออกคูปองวันเกิดแล้ว")} disabled={busy}
                            className="h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50">
                            <Ticket className="h-3.5 w-3.5" /> ออกคูปอง
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="gonix-card-premium overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                <Cake className="h-5 w-5 text-pink-500" />
                <h2 className="text-base font-bold text-slate-800 flex-1">วันเกิดคนไข้</h2>
                {todayCount > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-pink-500 text-white">วันนี้ {todayCount} คน</span>}
                <span className="text-xs text-slate-500">7 วันข้างหน้า {soon.length} · เดือนนี้ {month.length}</span>
                {canEdit && <button onClick={() => setEditMsg(v => !v)} className="text-xs text-blue-700 inline-flex items-center gap-1"><Pencil className="h-3 w-3" /> ข้อความอวยพร</button>}
            </div>

            {editMsg && (
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 space-y-2">
                    <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-400 flex-1">{BIRTHDAY_PLACEHOLDERS}</span>
                        <button onClick={() => start(async () => { const r = await setBirthdayMessage(msg); if (!r.success) toast.error(r.error || "บันทึกไม่สำเร็จ"); else { toast.success("บันทึกข้อความแล้ว"); setEditMsg(false); router.refresh(); } })}
                            className="h-8 px-3 rounded-lg bg-blue-700 text-white text-xs font-bold">บันทึก</button>
                    </div>
                </div>
            )}

            {!data.couponConfigured && (
                <div className="px-4 py-2 text-[11px] text-violet-700 bg-violet-50/60 border-b border-violet-100">
                    คูปองวันเกิดยังไม่ได้ตั้งมูลค่า — ออกคูปองไว้ก่อนได้ (ใช้ได้ทั้งเดือนเกิด · เฉพาะฝั่งความงาม) · ตั้ง % ส่วนลดที่ <Link href="/dashboard/settings/finance-rates" className="underline">อัตราการเงิน</Link> (จะรวมกับระบบแต้ม/แลกคูปองภายหลัง)
                </div>
            )}

            {soon.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">ไม่มีคนไข้วันเกิดใน 7 วันข้างหน้า</p>
            ) : (
                <div className="divide-y divide-slate-100">{soon.map(r => <Row key={`s-${r.hn}`} r={r} />)}</div>
            )}

            {month.length > 0 && (
                <>
                    <button onClick={() => setShowMonth(v => !v)} className="w-full px-4 py-2.5 border-t border-slate-100 text-xs font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1">
                        วันเกิดทั้งเดือนนี้ ({month.length} คน) <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMonth ? "rotate-180" : ""}`} />
                    </button>
                    {showMonth && <div className="divide-y divide-slate-100 border-t border-slate-100">{month.map(r => <Row key={`m-${r.hn}`} r={r} />)}</div>}
                </>
            )}
        </div>
    );
}
