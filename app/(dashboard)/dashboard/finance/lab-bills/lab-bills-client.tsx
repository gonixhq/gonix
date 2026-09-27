"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FlaskConical, Plus, X, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/lib/toast";
import { saveLabBill, markLabBillPaid, deleteLabBill, backfillLabCost, type LabBillRow, type LabSentRow, type LabVendorSummary } from "@/lib/actions/lab-bills";

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const thDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const nextMonth5 = (month: string) => { const [y, m] = month.split("-").map(Number); return m === 12 ? `${y + 1}-01-05` : `${y}-${String(m + 1).padStart(2, "0")}-05`; };

export default function LabBillsClient({ month, today, data }: {
    month: string; today: string;
    data: { sent: LabSentRow[]; summary: LabVendorSummary[]; bills: LabBillRow[]; openBills: LabBillRow[]; canManage: boolean };
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [form, setForm] = useState<null | { id?: string; vendor: string; invoice_no: string; bill_date: string; due_date: string; amount: string; note: string }>(null);
    const [openVendor, setOpenVendor] = useState<string | null>(null);
    const totalExpected = data.summary.reduce((s, v) => s + v.expected, 0);
    const totalBilled = data.bills.reduce((s, b) => s + b.amount, 0);
    const missing = data.summary.reduce((s, v) => s + v.missingCost, 0);
    const outstanding = data.openBills.reduce((s, b) => s + b.amount, 0);
    const overdue = data.openBills.filter(b => b.due_date < today);
    const vendors = useMemo(() => [...new Set([...data.summary.map(s => s.vendor), ...data.bills.map(b => b.vendor)])].filter(v => !v.startsWith("(")), [data]);

    const newBill = (vendor = vendors[0] || "") => {
        const bd = nextMonth5(month);
        setForm({ vendor, invoice_no: "", bill_date: bd, due_date: addDays(bd, 30), amount: "", note: "" });
    };
    const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => start(async () => {
        const r = await fn();
        if (!r.ok) { toast.error(r.error || "ไม่สำเร็จ"); return; }
        toast.success(msg); router.refresh();
    });

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FlaskConical className="h-6 w-6 text-violet-600" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">บิลแล็บภายนอก</h1>
                        <p className="text-xs text-slate-500">เทียบใบแจ้งหนี้ (มาวันที่ 5 · เครดิต 30 วัน) กับรายการที่ระบบบันทึกว่าส่งตรวจ</p>
                    </div>
                </div>
                <input type="month" value={month} onChange={e => router.push(`/dashboard/finance/lab-bills?month=${e.target.value}`)}
                    className="h-10 rounded-xl border border-slate-300 px-3 text-sm" />
                {data.canManage && <button onClick={() => newBill()} className="h-10 px-4 rounded-xl bg-violet-600 text-white text-sm font-bold inline-flex items-center gap-1.5"><Plus className="h-4 w-4" /> บันทึกใบแจ้งหนี้</button>}
            </div>

            {/* สรุป */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card label={`ส่งตรวจเดือนนี้ (${data.sent.length} รายการ)`} value={baht(totalExpected)} hint="ยอดที่ระบบคาด" />
                <Card label="ใบแจ้งหนี้ที่บันทึก" value={baht(totalBilled)} hint={data.bills.length ? `${data.bills.length} ใบ` : "ยังไม่บันทึก"} />
                <Card label="ส่วนต่าง" value={data.bills.length ? baht(totalBilled - totalExpected) : "—"}
                    tone={data.bills.length && Math.abs(totalBilled - totalExpected) > 1 ? "warn" : "ok"} hint="ใบแจ้งหนี้ − ที่คาด" />
                <Card label="ค้างจ่ายทั้งหมด" value={baht(outstanding)} tone={overdue.length ? "bad" : undefined} hint={overdue.length ? `เกินกำหนด ${overdue.length} ใบ` : `${data.openBills.length} ใบ`} />
            </div>

            {missing > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="flex-1">มี {missing} รายการที่ยังไม่มีต้นทุน — ตั้ง &quot;ต้นทุนส่งแล็บ&quot; ที่ <Link href="/dashboard/settings/services" className="underline font-semibold">รายการบริการ &amp; ราคา</Link> แล้วกดคิดย้อนหลัง</span>
                    {data.canManage && <button disabled={pending} onClick={() => start(async () => {
                        const r = await backfillLabCost(month);
                        if (!r.ok) { toast.error(r.error || "ไม่สำเร็จ"); return; }
                        toast.success(`อัปเดตต้นทุน ${r.count} รายการ`); router.refresh();
                    })} className="h-8 px-3 rounded-lg bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1">
                        <RefreshCw className="h-3.5 w-3.5" /> คิดต้นทุนย้อนหลังเดือนนี้
                    </button>}
                </div>
            )}

            {/* แยกตามแล็บ */}
            <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">เทียบตามแล็บ · งานเดือน {month}</div>
                {data.summary.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">ไม่มีรายการส่งแล็บภายนอกในเดือนนี้</p> : (
                    <div className="divide-y divide-slate-100">
                        {data.summary.map(v => {
                            const diff = v.billed - v.expected;
                            const rows = data.sent.filter(s => s.vendor === v.vendor);
                            const open = openVendor === v.vendor;
                            return (
                                <div key={v.vendor}>
                                    <div className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
                                        <button onClick={() => setOpenVendor(open ? null : v.vendor)} className="flex items-center gap-1 font-semibold text-slate-800 flex-1 min-w-[160px] text-left">
                                            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {v.vendor}
                                            <span className="text-xs font-normal text-slate-500">· {v.count} รายการ</span>
                                        </button>
                                        <span className="tabular-nums text-slate-600">คาด {baht(v.expected)}</span>
                                        <span className="tabular-nums text-slate-600">บิล {v.billed ? baht(v.billed) : "—"}</span>
                                        <span className={`tabular-nums font-bold ${!v.billed ? "text-slate-400" : Math.abs(diff) <= 1 ? "text-emerald-600" : "text-amber-600"}`}>
                                            {!v.billed ? "รอใบแจ้งหนี้" : Math.abs(diff) <= 1 ? "ตรง ✓" : `ต่าง ${diff > 0 ? "+" : ""}${baht(diff)}`}
                                        </span>
                                        {data.canManage && !v.billed && !v.vendor.startsWith("(") && (
                                            <button onClick={() => newBill(v.vendor)} className="h-8 px-3 rounded-lg border border-violet-200 text-violet-700 text-xs font-semibold">+ ใบแจ้งหนี้</button>
                                        )}
                                    </div>
                                    {open && (
                                        <div className="px-4 pb-3 overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead className="text-slate-400"><tr><th className="text-left py-1">วันที่</th><th className="text-left">อ้างอิง</th><th className="text-left">รายการ</th><th className="text-right">ต้นทุน</th></tr></thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {rows.map(r => (
                                                        <tr key={r.id}>
                                                            <td className="py-1 tabular-nums">{thDate(r.date)}</td>
                                                            <td className="font-mono text-slate-500">{r.source === "anon" ? `นิรนาม ${r.ref}` : r.ref}</td>
                                                            <td>{r.name}</td>
                                                            <td className={`text-right tabular-nums ${r.cost ? "" : "text-amber-600"}`}>{r.cost ? baht(r.cost) : "ยังไม่ตั้ง"}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ใบแจ้งหนี้ค้างจ่าย (ทุกเดือน) */}
            <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">ใบแจ้งหนี้ค้างจ่าย (ทุกเดือน)</div>
                {data.openBills.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">ไม่มีบิลค้างจ่าย 🎉</p> : (
                    <BillTable rows={data.openBills} today={today} canManage={data.canManage} pending={pending}
                        onPay={b => act(() => markLabBillPaid(b.id, today), "บันทึกจ่ายแล้ว")}
                        onEdit={b => setForm({ id: b.id, vendor: b.vendor, invoice_no: b.invoice_no || "", bill_date: b.bill_date, due_date: b.due_date, amount: String(b.amount), note: b.note || "" })}
                        onDelete={b => { if (confirm(`ลบใบแจ้งหนี้ ${b.vendor} ${baht(b.amount)}?`)) act(() => deleteLabBill(b.id), "ลบแล้ว"); }} />
                )}
            </section>

            {data.bills.some(b => b.paid_at) && (
                <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">จ่ายแล้ว · งานเดือน {month}</div>
                    <BillTable rows={data.bills.filter(b => b.paid_at)} today={today} canManage={data.canManage} pending={pending}
                        onPay={b => act(() => markLabBillPaid(b.id, null), "ยกเลิกสถานะจ่ายแล้ว")} onEdit={() => {}} onDelete={() => {}} />
                </section>
            )}

            <p className="text-[11px] text-slate-400">ต้นทุนแล็บนับเข้ารายงานกำไรตั้งแต่ตอนขาย (ต่อรายการ) · ตอนจ่ายบิลแล็บ <b>ไม่ต้อง</b>ลงเป็นเงินสดย่อย/ค่าใช้จ่ายซ้ำ · นับเฉพาะเมนูประเภท &quot;แล็บภายนอก&quot;</p>

            {form && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
                        <div className="flex items-center">
                            <h2 className="font-bold text-lg text-slate-800 flex-1">{form.id ? "แก้ไข" : "บันทึก"}ใบแจ้งหนี้แล็บ · งาน {month}</h2>
                            <button onClick={() => setForm(null)} aria-label="ปิด"><X className="h-4 w-4 text-slate-400" /></button>
                        </div>
                        <L label="แล็บ">
                            <input list="lab-vendors" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
                            <datalist id="lab-vendors">{vendors.map(v => <option key={v} value={v} />)}</datalist>
                        </L>
                        <div className="grid grid-cols-2 gap-3">
                            <L label="เลขที่ใบแจ้งหนี้"><input value={form.invoice_no} onChange={e => setForm({ ...form, invoice_no: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
                            <L label="ยอดตามใบแจ้งหนี้ (฿)"><input type="number" min={0} step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm text-right tabular-nums" /></L>
                            <L label="วันที่ใบแจ้งหนี้"><input type="date" value={form.bill_date} onChange={e => setForm({ ...form, bill_date: e.target.value, due_date: addDays(e.target.value, 30) })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
                            <L label="ครบกำหนดจ่าย (+30 วัน)"><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
                        </div>
                        {(() => { const exp = data.summary.find(s => s.vendor === form.vendor)?.expected; return exp != null && form.amount !== "" ? (
                            <p className={`text-xs ${Math.abs(Number(form.amount) - exp) <= 1 ? "text-emerald-600" : "text-amber-600"}`}>ระบบคาด {baht(exp)} · ต่าง {baht(Number(form.amount) - exp)}</p>
                        ) : null; })()}
                        <L label="หมายเหตุ"><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setForm(null)} className="h-10 px-4 rounded-xl text-sm text-slate-600">ยกเลิก</button>
                            <button disabled={pending || !form.vendor.trim() || form.amount === ""} onClick={() => start(async () => {
                                const r = await saveLabBill({ id: form.id, vendor: form.vendor, period_month: month, invoice_no: form.invoice_no, bill_date: form.bill_date, due_date: form.due_date, amount: Number(form.amount), note: form.note });
                                if (!r.ok) { toast.error(r.error || "บันทึกไม่สำเร็จ"); return; }
                                toast.success("บันทึกแล้ว"); setForm(null); router.refresh();
                            })} className="h-10 px-4 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                                {pending && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Card({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" | "bad" }) {
    const c = tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-slate-800";
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`text-xl font-bold tabular-nums ${c}`}>{value}</div>
            {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
        </div>
    );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block text-xs text-slate-600 space-y-1"><span className="font-semibold">{label}</span>{children}</label>;
}

function BillTable({ rows, today, canManage, pending, onPay, onEdit, onDelete }: {
    rows: LabBillRow[]; today: string; canManage: boolean; pending: boolean;
    onPay: (b: LabBillRow) => void; onEdit: (b: LabBillRow) => void; onDelete: (b: LabBillRow) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="text-xs text-slate-400 bg-slate-50"><tr>
                    <th className="text-left px-4 py-2">แล็บ</th><th className="text-left px-2">งานเดือน</th><th className="text-left px-2">เลขที่</th>
                    <th className="text-right px-2">ยอด</th><th className="text-left px-2">ครบกำหนด</th><th className="px-4" />
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map(b => {
                        const late = !b.paid_at && b.due_date < today;
                        const days = Math.round((new Date(b.due_date).getTime() - new Date(today).getTime()) / 86400000);
                        return (
                            <tr key={b.id}>
                                <td className="px-4 py-2 font-semibold text-slate-800">{b.vendor}</td>
                                <td className="px-2 tabular-nums">{b.period_month}</td>
                                <td className="px-2 font-mono text-xs text-slate-500">{b.invoice_no || "—"}</td>
                                <td className="px-2 text-right tabular-nums font-semibold">{baht(b.amount)}</td>
                                <td className={`px-2 text-xs ${b.paid_at ? "text-emerald-600" : late ? "text-rose-600 font-bold" : days <= 7 ? "text-amber-600" : "text-slate-600"}`}>
                                    {b.paid_at ? <>จ่ายแล้ว {thDate(b.paid_at)}</> : <>{thDate(b.due_date)} · {late ? `เกิน ${-days} วัน` : `อีก ${days} วัน`}</>}
                                </td>
                                <td className="px-4 py-2 text-right whitespace-nowrap">
                                    {canManage && (
                                        <div className="inline-flex items-center gap-1">
                                            <button disabled={pending} onClick={() => onPay(b)} className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1 ${b.paid_at ? "border border-slate-200 text-slate-500" : "bg-emerald-600 text-white"}`}>
                                                <CheckCircle2 className="h-3.5 w-3.5" /> {b.paid_at ? "ยกเลิกจ่าย" : "จ่ายแล้ว"}
                                            </button>
                                            {!b.paid_at && <>
                                                <button onClick={() => onEdit(b)} className="h-8 px-2 rounded-lg border border-slate-200 text-xs text-slate-600">แก้</button>
                                                <button onClick={() => onDelete(b)} className="h-8 px-2 rounded-lg text-rose-500" aria-label="ลบ"><Trash2 className="h-3.5 w-3.5" /></button>
                                            </>}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
