"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Percent, CreditCard, Landmark, History, Loader2, Check, X, CalendarClock, Stethoscope } from "lucide-react";
import { RATE_META, type RateMeta } from "@/lib/card-fees";
import { setFinanceRate, cancelScheduledRate, type FinanceRateRow } from "@/lib/actions/finance-rates";
import { toast } from "@/lib/toast";

const GROUPS: { key: RateMeta["group"]; title: string; desc: string; icon: React.ElementType }[] = [
    { key: "mdr", title: "ค่าธรรมเนียมบัตร (MDR)", desc: "คิดต่อการชำระเงินแต่ละแถว = ยอดรูด × MDR + VAT ของค่าธรรมเนียม · ไม่เรียกเก็บเพิ่มจากลูกค้า", icon: CreditCard },
    { key: "card", title: "VAT ค่าธรรมเนียม & การผ่อน", desc: "ใช้คำนวณต้นทุนจริงและรายงานผ่อน", icon: Percent },
    { key: "tax", title: "ภาษีมูลค่าเพิ่ม (VAT) ของคลินิก", desc: "ธนเวชยกเว้น VAT — เปิดเมื่อคลินิกจด VAT", icon: Landmark },
    { key: "comp", title: "ค่าตอบแทน / คอม / ต้นทุน", desc: "ค่าชั่วโมง DF คอมแนะนำ คอมทีม เกณฑ์มาร์จิ้น — คำนวณอัตโนมัติจากเวลาทำงานจริงและบิล", icon: Stethoscope },
    { key: "loyalty", title: "คูปอง / ลูกค้าสัมพันธ์", desc: "คูปองวันเกิด (จะรวมกับระบบแต้ม/แลกคูปองภายหลัง)", icon: Percent },
    { key: "kpi", title: "KPI & เงินสำรอง", desc: "ใช้คำนวณ KPI หน้าแรก (เจ้าของ)", icon: Landmark },
];

const fmtVal = (v: number, unit: string) => unit === "baht" ? `฿${v.toLocaleString("th-TH")}` : unit === "%" ? `${v}%` : unit === "month" ? `${v} เดือน` : unit === "weight" ? `×${v}` : String(v);
const fmtDate = (d: string) => d <= "2000-12-31" ? "ตั้งแต่เริ่มระบบ" : new Date(d + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

export default function FinanceRatesClient({ rows, today, canEdit }: { rows: FinanceRateRow[]; today: string; canEdit: boolean }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [editing, setEditing] = useState<string | null>(null);
    const [val, setVal] = useState("");
    const [from, setFrom] = useState(today);
    const [note, setNote] = useState("");
    const [showHist, setShowHist] = useState<string | null>(null);

    const byKey = (k: string) => rows.filter((r) => r.rate_key === k); // เรียงวันเริ่มใช้ ใหม่→เก่า
    const current = (k: string) => byKey(k).find((r) => r.effective_from <= today);
    const scheduled = (k: string) => byKey(k).filter((r) => r.effective_from > today);

    function openEdit(m: RateMeta) {
        setEditing(m.key); setVal(String(current(m.key)?.rate_value ?? "")); setFrom(today); setNote("");
    }
    function save(m: RateMeta, value?: number) {
        const v = value ?? Number(val);
        start(async () => {
            const res = await setFinanceRate({ key: m.key, value: v, effectiveFrom: from, note });
            if (!res.success) { toast.error(res.error || "บันทึกไม่สำเร็จ"); return; }
            toast.success(from > today ? `ตั้งอัตราล่วงหน้า มีผล ${fmtDate(from)}` : "บันทึกอัตราแล้ว");
            setEditing(null); router.refresh();
        });
    }
    function cancel(id: string) {
        if (!confirm("ยกเลิกอัตราที่ตั้งล่วงหน้านี้?")) return;
        start(async () => {
            const res = await cancelScheduledRate(id);
            if (!res.success) { toast.error(res.error || "ยกเลิกไม่สำเร็จ"); return; }
            toast.success("ยกเลิกแล้ว"); router.refresh();
        });
    }

    return (
        <div className="space-y-4 max-w-4xl mx-auto animate-fade-in p-3 sm:p-6 pb-24">
            <div className="rounded-2xl bg-white/85 border border-white/90 p-4 shadow-sm">
                <h1 className="text-lg font-bold text-slate-800">อัตราการเงินของคลินิก</h1>
                <p className="text-sm text-slate-500 mt-1">ทุกอัตรามี <b>วันเริ่มใช้</b> · เปลี่ยนอัตราแล้ว <b>บิลที่บันทึกไปแล้วคิดตามอัตราเดิม</b> (ระบบ snapshot ไว้ในรายการรับเงิน) · ตั้งล่วงหน้าได้เมื่อธนาคารแจ้งปรับ</p>
                {!canEdit && <p className="text-xs text-amber-700 mt-2">ดูได้อย่างเดียว — แก้อัตราได้เฉพาะเจ้าของ/ผู้จัดการ</p>}
            </div>

            {GROUPS.map((g) => (
                <section key={g.key} className="rounded-2xl bg-white/85 border border-white/90 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-start gap-2.5">
                        <g.icon className="h-4 w-4 text-blue-700 mt-0.5" />
                        <div><h2 className="text-sm font-bold text-slate-800">{g.title}</h2><p className="text-xs text-slate-500">{g.desc}</p></div>
                    </div>
                    <ul className="divide-y divide-slate-100">
                        {RATE_META.filter((m) => m.group === g.key).map((m) => {
                            const cur = current(m.key);
                            const sch = scheduled(m.key);
                            const hist = byKey(m.key).filter((r) => r.effective_from <= today);
                            return (
                                <li key={m.key} className="px-4 py-3">
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <div className="flex-1 min-w-[180px]">
                                            <div className="text-sm font-semibold text-slate-800">{m.label}</div>
                                            {m.hint && <div className="text-xs text-slate-500">{m.hint}</div>}
                                            {cur && <div className="text-[11px] text-slate-400 mt-0.5">มีผล{cur.effective_from <= "2000-12-31" ? "" : "ตั้งแต่"} {fmtDate(cur.effective_from)}</div>}
                                        </div>
                                        {m.unit === "flag" ? (
                                            <button disabled={!canEdit || pending} onClick={() => { setFrom(today); setNote(""); save(m, cur?.rate_value ? 0 : 1); }}
                                                className={`h-9 px-4 rounded-full text-sm font-bold border disabled:opacity-60 ${cur?.rate_value ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-300"}`}>
                                                {cur?.rate_value ? "จด VAT (เปิด)" : "ยกเว้น VAT (ปิด)"}
                                            </button>
                                        ) : (
                                            <div className="text-xl font-black tabular-nums text-slate-800">{cur ? fmtVal(cur.rate_value, m.unit) : <span className="text-sm text-rose-600">ยังไม่ตั้ง</span>}</div>
                                        )}
                                        {canEdit && m.unit !== "flag" && editing !== m.key && (
                                            <button onClick={() => openEdit(m)} className="h-9 px-3 rounded-lg border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-50">เปลี่ยนอัตรา</button>
                                        )}
                                        {hist.length > 1 && (
                                            <button onClick={() => setShowHist(showHist === m.key ? null : m.key)} className="h-9 px-2 rounded-lg text-slate-500 text-xs hover:bg-slate-100 inline-flex items-center gap-1"><History className="h-3.5 w-3.5" /> ประวัติ</button>
                                        )}
                                    </div>

                                    {sch.map((s) => (
                                        <div key={s.id} className="mt-2 flex items-center gap-2 text-xs rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5">
                                            <CalendarClock className="h-3.5 w-3.5 text-amber-600" />
                                            <span className="text-amber-800">ตั้งล่วงหน้า: <b>{fmtVal(s.rate_value, m.unit)}</b> มีผล {fmtDate(s.effective_from)}{s.note ? ` · ${s.note}` : ""}</span>
                                            {canEdit && <button onClick={() => cancel(s.id)} disabled={pending} className="ml-auto text-amber-700 hover:underline">ยกเลิก</button>}
                                        </div>
                                    ))}

                                    {editing === m.key && (
                                        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3 flex items-end gap-2 flex-wrap">
                                            <label className="text-xs text-slate-600">อัตราใหม่ ({m.unit === "baht" ? "บาท" : m.unit === "month" ? "เดือน" : m.unit === "weight" ? "น้ำหนัก" : "%"})
                                                <input type="number" step="0.0001" min="0" max={m.unit === "baht" ? 100000000 : m.unit === "month" ? 60 : m.unit === "weight" ? 20 : 100} value={val} onChange={(e) => setVal(e.target.value)} className="mt-1 block w-28 h-9 rounded-lg border border-slate-300 px-2 text-sm text-right tabular-nums" /></label>
                                            <label className="text-xs text-slate-600">มีผลตั้งแต่
                                                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-9 rounded-lg border border-slate-300 px-2 text-sm" /></label>
                                            <label className="text-xs text-slate-600 flex-1 min-w-[160px]">หมายเหตุ
                                                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ธนาคารแจ้งปรับอัตรา" className="mt-1 block w-full h-9 rounded-lg border border-slate-300 px-2 text-sm" /></label>
                                            <button onClick={() => save(m)} disabled={pending || val === ""} className="h-9 px-3 rounded-lg bg-blue-700 text-white text-sm font-bold inline-flex items-center gap-1 disabled:opacity-50">
                                                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} บันทึก</button>
                                            <button onClick={() => setEditing(null)} className="h-9 px-2 rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                                        </div>
                                    )}

                                    {showHist === m.key && (
                                        <table className="mt-2 w-full text-xs">
                                            <tbody>{hist.map((h) => (
                                                <tr key={h.id} className="border-t border-slate-100">
                                                    <td className="py-1 text-slate-600">{fmtDate(h.effective_from)}</td>
                                                    <td className="py-1 font-semibold tabular-nums">{fmtVal(h.rate_value, m.unit)}</td>
                                                    <td className="py-1 text-slate-500">{h.note || "—"}</td>
                                                    <td className="py-1 text-slate-400 text-right">{h.created_by_name || ""}</td>
                                                </tr>
                                            ))}</tbody>
                                        </table>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </div>
    );
}
