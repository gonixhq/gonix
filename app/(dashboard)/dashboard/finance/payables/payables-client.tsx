"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Receipt, Plus, X, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Trash2, ChevronDown, ChevronUp, Pencil, Link2 } from "lucide-react";
import { toast } from "@/lib/toast";
import {
    saveBill, markBillPaid, deleteBill, linkReceiptToBill, saveVendor, backfillLabCost,
    type BillRow, type LabSentRow, type LabVendorSummary, type ReceiptRow, type VendorRow,
} from "@/lib/actions/payables";
import { BILL_TYPE_LABEL, EXPENSE_CATEGORIES, PAY_METHODS, expenseCategoryLabel, type BillType } from "@/lib/payables";

export type PayTab = "overview" | "lab" | "supplier" | "expense" | "vendors";

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const thDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const TYPE_COLOR: Record<BillType, string> = { lab: "bg-violet-100 text-violet-700", supplier: "bg-sky-100 text-sky-700", expense: "bg-amber-100 text-amber-700" };

type Data = {
    lab: { sent: LabSentRow[]; summary: LabVendorSummary[] };
    bills: BillRow[]; openBills: BillRow[]; receipts: ReceiptRow[]; vendors: VendorRow[]; canManage: boolean;
};
type BillForm = { id?: string; bill_type: BillType; vendor: string; invoice_no: string; bill_date: string; due_date: string; amount: string; category: string; in_pl: boolean; note: string };

export default function PayablesClient({ month, today, tab, data }: { month: string; today: string; tab: PayTab; data: Data }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [form, setForm] = useState<BillForm | null>(null);
    const [payFor, setPayFor] = useState<BillRow | null>(null);
    const [vendorForm, setVendorForm] = useState<Partial<VendorRow> | null>(null);
    const go = (t: PayTab, m = month) => router.push(`/dashboard/finance/payables?tab=${t}&month=${m}`);

    const outstanding = data.openBills.reduce((s, b) => s + b.amount, 0);
    const overdue = data.openBills.filter(b => b.due_date < today);
    const dueSoon = data.openBills.filter(b => b.due_date >= today && daysBetween(today, b.due_date) <= 7);
    const byType = (t: BillType) => data.openBills.filter(b => b.bill_type === t).reduce((s, b) => s + b.amount, 0);

    const vendorByName = useMemo(() => new Map(data.vendors.map(v => [v.name, v])), [data.vendors]);
    const newBill = (bill_type: BillType, vendor = "") => {
        const v = vendorByName.get(vendor);
        let bd = today;
        if (bill_type === "lab") { const [y, m] = month.split("-").map(Number); bd = m === 12 ? `${y + 1}-01-05` : `${y}-${String(m + 1).padStart(2, "0")}-05`; }
        setForm({ bill_type, vendor, invoice_no: "", bill_date: bd, due_date: addDays(bd, v?.credit_days ?? (bill_type === "expense" ? 7 : 30)), amount: "", category: "other", in_pl: true, note: "" });
    };
    const editBill = (b: BillRow) => setForm({ id: b.id, bill_type: b.bill_type, vendor: b.vendor, invoice_no: b.invoice_no || "", bill_date: b.bill_date, due_date: b.due_date,
        amount: String(b.amount), category: b.category || "other", in_pl: b.in_pl, note: b.note || "" });
    const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, after?: () => void) => start(async () => {
        const r = await fn();
        if (!r.ok) { toast.error(r.error || "ไม่สำเร็จ"); return; }
        toast.success(msg); after?.(); router.refresh();
    });
    const billActions = {
        onPay: (b: BillRow) => setPayFor(b),
        onUnpay: (b: BillRow) => act(() => markBillPaid(b.id, null), "ยกเลิกสถานะจ่ายแล้ว"),
        onEdit: editBill,
        onDelete: (b: BillRow) => { if (confirm(`ลบบิล ${b.vendor} ${baht(b.amount)}?`)) act(() => deleteBill(b.id), "ลบแล้ว"); },
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Receipt className="h-6 w-6 text-violet-600" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">บิลค้างจ่าย (เจ้าหนี้)</h1>
                        <p className="text-xs text-slate-500">แล็บภายนอก · บริษัทยา/เวชภัณฑ์ · ค่าใช้จ่ายคลินิก — ติดตามครบกำหนดจ่าย</p>
                    </div>
                </div>
                {tab !== "overview" && tab !== "vendors" && (
                    <input type="month" value={month} onChange={e => go(tab, e.target.value)} className="h-10 rounded-xl border border-slate-300 px-3 text-sm" />
                )}
                {data.canManage && tab !== "vendors" && (
                    <button onClick={() => newBill(tab === "lab" || tab === "supplier" || tab === "expense" ? tab : "supplier")}
                        className="h-10 px-4 rounded-xl bg-violet-600 text-white text-sm font-bold inline-flex items-center gap-1.5"><Plus className="h-4 w-4" /> บันทึกบิล</button>
                )}
                {data.canManage && tab === "vendors" && (
                    <button onClick={() => setVendorForm({ vendor_type: "supplier", credit_days: 30, is_active: true })}
                        className="h-10 px-4 rounded-xl bg-violet-600 text-white text-sm font-bold inline-flex items-center gap-1.5"><Plus className="h-4 w-4" /> เพิ่มผู้ขาย</button>
                )}
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
                {([["overview", "ภาพรวม"], ["lab", "แล็บภายนอก"], ["supplier", "บริษัทยา"], ["expense", "ค่าใช้จ่าย"], ["vendors", "ผู้ขาย"]] as [PayTab, string][]).map(([k, l]) => (
                    <button key={k} onClick={() => go(k)} className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === k ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{l}</button>
                ))}
            </div>

            {tab === "overview" && (<>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card label="ค้างจ่ายทั้งหมด" value={baht(outstanding)} hint={`${data.openBills.length} ใบ`} />
                    <Card label="เกินกำหนด" value={baht(overdue.reduce((s, b) => s + b.amount, 0))} tone={overdue.length ? "bad" : "ok"} hint={`${overdue.length} ใบ`} />
                    <Card label="ครบกำหนดใน 7 วัน" value={baht(dueSoon.reduce((s, b) => s + b.amount, 0))} tone={dueSoon.length ? "warn" : undefined} hint={`${dueSoon.length} ใบ`} />
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs space-y-1">
                        {(["lab", "supplier", "expense"] as BillType[]).map(t => (
                            <div key={t} className="flex justify-between"><span className="text-slate-500">{BILL_TYPE_LABEL[t]}</span><b className="tabular-nums">{baht(byType(t))}</b></div>
                        ))}
                    </div>
                </div>
                <Section title="บิลที่ยังไม่จ่าย (เรียงตามวันครบกำหนด)">
                    {data.openBills.length === 0 ? <Empty text="ไม่มีบิลค้างจ่าย 🎉" /> : <BillTable rows={data.openBills} today={today} canManage={data.canManage} pending={pending} showType {...billActions} />}
                </Section>
            </>)}

            {tab === "lab" && <LabTab month={month} data={data} canManage={data.canManage} pending={pending} today={today}
                onNew={v => newBill("lab", v)} onBackfill={() => start(async () => {
                    const r = await backfillLabCost(month);
                    if (!r.ok) { toast.error(r.error || "ไม่สำเร็จ"); return; }
                    toast.success(`อัปเดตต้นทุน ${r.count} รายการ`); router.refresh();
                })} billActions={billActions} />}

            {tab === "supplier" && <SupplierTab data={data} today={today} pending={pending} canManage={data.canManage} billActions={billActions}
                onLink={(rid, bid) => act(() => linkReceiptToBill(rid, bid), bid ? "ผูกกับบิลแล้ว" : "ถอดออกแล้ว")} />}

            {tab === "expense" && (<>
                {(() => {
                    const ex = data.bills.filter(b => b.bill_type === "expense");
                    const cat = new Map<string, number>();
                    ex.filter(b => b.in_pl).forEach(b => cat.set(b.category || "other", (cat.get(b.category || "other") || 0) + b.amount));
                    return (<>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Card label={`ค่าใช้จ่ายเดือน ${month}`} value={baht(ex.filter(b => b.in_pl).reduce((s, b) => s + b.amount, 0))} hint="นับเข้ารายงานกำไร" />
                            <Card label="ยังไม่จ่าย" value={baht(ex.filter(b => !b.paid_at).reduce((s, b) => s + b.amount, 0))} tone={ex.some(b => !b.paid_at && b.due_date < today) ? "bad" : undefined} />
                            <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs grid grid-cols-2 gap-x-4 gap-y-1">
                                {[...cat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                                    <div key={k} className="flex justify-between"><span className="text-slate-500 truncate">{expenseCategoryLabel(k)}</span><b className="tabular-nums">{baht(v)}</b></div>
                                ))}
                                {cat.size === 0 && <span className="text-slate-400">ยังไม่มีรายการ</span>}
                            </div>
                        </div>
                        <Section title={`บิลค่าใช้จ่าย · เดือน ${month}`}>
                            {ex.length === 0 ? <Empty text="ยังไม่มีบิลค่าใช้จ่ายเดือนนี้" /> : <BillTable rows={ex} today={today} canManage={data.canManage} pending={pending} showCategory {...billActions} />}
                        </Section>
                        <p className="text-[11px] text-slate-400">รายการที่ตั้งไว้ใน <Link href="/dashboard/finance/fixed-costs" className="underline">ต้นทุนคงที่</Link> แล้ว (เช่น ค่าเช่า) ให้เอาติ๊ก &quot;นับเข้ากำไร&quot; ออก — ใช้หน้านี้ติดตามการจ่ายอย่างเดียว · ค่าใช้จ่ายเล็กๆ ที่จ่ายเงินสดทันที ใช้ &quot;เงินสดย่อย&quot; ที่หน้าปิดยอดตามเดิม</p>
                    </>);
                })()}
            </>)}

            {tab === "vendors" && (
                <Section title="ทะเบียนผู้ขาย / เจ้าหนี้">
                    {data.vendors.length === 0 ? <Empty text="ยังไม่มีผู้ขาย" /> : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs text-slate-400 bg-slate-50"><tr>
                                    <th className="text-left px-4 py-2">ชื่อ</th><th className="text-left px-2">ประเภท</th><th className="text-right px-2">เครดิต</th>
                                    <th className="text-left px-2">บิลมาวันที่</th><th className="text-left px-2">เลขผู้เสียภาษี / โทร</th><th className="px-4" />
                                </tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.vendors.map(v => (
                                        <tr key={v.id} className={v.is_active ? "" : "opacity-50"}>
                                            <td className="px-4 py-2 font-semibold text-slate-800">{v.name}</td>
                                            <td className="px-2"><span className={`text-[11px] px-2 py-0.5 rounded font-bold ${TYPE_COLOR[v.vendor_type]}`}>{BILL_TYPE_LABEL[v.vendor_type]}</span></td>
                                            <td className="px-2 text-right tabular-nums">{v.credit_days} วัน</td>
                                            <td className="px-2">{v.bill_day ? `ทุกวันที่ ${v.bill_day}` : "—"}</td>
                                            <td className="px-2 text-xs text-slate-500">{[v.tax_id, v.phone].filter(Boolean).join(" · ") || "—"}</td>
                                            <td className="px-4 text-right">{data.canManage && <button onClick={() => setVendorForm(v)} className="h-8 px-2 rounded-lg border border-slate-200 text-xs text-slate-600"><Pencil className="h-3.5 w-3.5" /></button>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>
            )}

            <p className="text-[11px] text-slate-400">ต้นทุนแล็บ/ยานับเข้ารายงานกำไรตอนขาย/ใช้ของแล้ว — จ่ายบิลแล็บ/บริษัทยา <b>ไม่ต้อง</b>ลงเงินสดย่อยซ้ำ · บิลค่าใช้จ่ายนับเข้ากำไรตามเดือนของบิล</p>

            {form && <BillModal form={form} setForm={setForm} month={month} vendors={data.vendors} pending={pending}
                expected={form.bill_type === "lab" ? data.lab.summary.find(s => s.vendor === form.vendor)?.expected : undefined}
                onSave={() => act(() => saveBill({ id: form.id, bill_type: form.bill_type, vendor: form.vendor, period_month: month, invoice_no: form.invoice_no, bill_date: form.bill_date,
                    due_date: form.due_date, amount: Number(form.amount), category: form.category, in_pl: form.in_pl, note: form.note }), "บันทึกแล้ว", () => setForm(null))} />}

            {payFor && <PayModal bill={payFor} today={today} pending={pending} onClose={() => setPayFor(null)}
                onSave={(p) => act(() => markBillPaid(payFor.id, p), "บันทึกจ่ายแล้ว", () => setPayFor(null))} />}

            {vendorForm && <VendorModal v={vendorForm} setV={setVendorForm} pending={pending}
                onSave={() => act(() => saveVendor({ id: vendorForm.id, name: vendorForm.name || "", vendor_type: vendorForm.vendor_type || "supplier", credit_days: Number(vendorForm.credit_days ?? 30),
                    bill_day: vendorForm.bill_day ?? null, tax_id: vendorForm.tax_id || "", phone: vendorForm.phone || "", note: vendorForm.note || "", is_active: vendorForm.is_active !== false }), "บันทึกแล้ว", () => setVendorForm(null))} />}
        </div>
    );
}

// ── แท็บแล็บ ──
function LabTab({ month, data, canManage, pending, today, onNew, onBackfill, billActions }: {
    month: string; data: Data; canManage: boolean; pending: boolean; today: string; onNew: (v: string) => void; onBackfill: () => void;
    billActions: BillActs;
}) {
    const [openVendor, setOpenVendor] = useState<string | null>(null);
    const { sent, summary } = data.lab;
    const labBills = data.bills.filter(b => b.bill_type === "lab");
    const totalExpected = summary.reduce((s, v) => s + v.expected, 0);
    const totalBilled = labBills.reduce((s, b) => s + b.amount, 0);
    const missing = summary.reduce((s, v) => s + v.missingCost, 0);
    return (<>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card label={`ส่งตรวจเดือน ${month} (${sent.length} รายการ)`} value={baht(totalExpected)} hint="ยอดที่ระบบคาด" />
            <Card label="ใบแจ้งหนี้ที่บันทึก" value={baht(totalBilled)} hint={labBills.length ? `${labBills.length} ใบ` : "ยังไม่บันทึก"} />
            <Card label="ส่วนต่าง" value={labBills.length ? baht(totalBilled - totalExpected) : "—"} tone={labBills.length && Math.abs(totalBilled - totalExpected) > 1 ? "warn" : "ok"} hint="ใบแจ้งหนี้ − ที่คาด" />
        </div>
        {missing > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="flex-1">มี {missing} รายการที่ยังไม่มีต้นทุน — ตั้ง &quot;ต้นทุนส่งแล็บ&quot; ที่ <Link href="/dashboard/settings/services" className="underline font-semibold">รายการบริการ &amp; ราคา</Link> แล้วกดคิดย้อนหลัง</span>
                {canManage && <button disabled={pending} onClick={onBackfill} className="h-8 px-3 rounded-lg bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" /> คิดต้นทุนย้อนหลังเดือนนี้</button>}
            </div>
        )}
        <Section title={`เทียบตามแล็บ · งานเดือน ${month}`}>
            {summary.length === 0 ? <Empty text="ไม่มีรายการส่งแล็บภายนอกในเดือนนี้" /> : (
                <div className="divide-y divide-slate-100">
                    {summary.map(v => {
                        const diff = v.billed - v.expected;
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
                                    {canManage && !v.billed && !v.vendor.startsWith("(") && (
                                        <button onClick={() => onNew(v.vendor)} className="h-8 px-3 rounded-lg border border-violet-200 text-violet-700 text-xs font-semibold">+ ใบแจ้งหนี้</button>
                                    )}
                                </div>
                                {open && (
                                    <div className="px-4 pb-3 overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead className="text-slate-400"><tr><th className="text-left py-1">วันที่</th><th className="text-left">อ้างอิง</th><th className="text-left">รายการ</th><th className="text-right">ต้นทุน</th></tr></thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {sent.filter(s => s.vendor === v.vendor).map(r => (
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
        </Section>
        {labBills.length > 0 && <Section title={`ใบแจ้งหนี้แล็บ · งานเดือน ${month}`}><BillTable rows={labBills} today={today} canManage={canManage} pending={pending} {...billActions} /></Section>}
    </>);
}

// ── แท็บบริษัทยา ──
function SupplierTab({ data, today, pending, canManage, billActions, onLink }: {
    data: Data; today: string; pending: boolean; canManage: boolean; billActions: BillActs; onLink: (receiptId: string, billId: string | null) => void;
}) {
    const sup = data.bills.filter(b => b.bill_type === "supplier");
    const openSup = data.openBills.filter(b => b.bill_type === "supplier");
    const linkable = [...new Map([...sup, ...openSup].map(b => [b.id, b])).values()];
    const unlinked = data.receipts.filter(r => !r.vendor_bill_id);
    return (<>
        <Section title="ใบแจ้งหนี้บริษัทยา · เดือนนี้">
            {sup.length === 0 ? <Empty text="ยังไม่มีบิลบริษัทยาเดือนนี้" /> : <BillTable rows={sup} today={today} canManage={canManage} pending={pending} showReceived {...billActions} />}
        </Section>
        <Section title={`รับของเข้าสต๊อกเดือนนี้ (${data.receipts.length} ครั้ง · ยังไม่ผูกบิล ${unlinked.length})`}>
            {data.receipts.length === 0 ? <Empty text="ไม่มีการรับของเข้าเดือนนี้" /> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-xs text-slate-400 bg-slate-50"><tr>
                            <th className="text-left px-4 py-2">วันที่</th><th className="text-left px-2">รายการ</th><th className="text-right px-2">จำนวน</th>
                            <th className="text-right px-2">มูลค่าทุน</th><th className="text-left px-2">ผูกกับบิล</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                            {data.receipts.map(r => (
                                <tr key={r.id}>
                                    <td className="px-4 py-2 tabular-nums text-xs">{thDate(r.date)}</td>
                                    <td className="px-2">{r.item_name}{r.supplier && <span className="text-xs text-slate-400"> · {r.supplier}</span>}</td>
                                    <td className="px-2 text-right tabular-nums">{r.qty.toLocaleString()} {r.unit || ""}</td>
                                    <td className={`px-2 text-right tabular-nums ${r.total_cost ? "" : "text-amber-600"}`}>{r.total_cost ? baht(r.total_cost) : "ไม่ได้ใส่ทุน"}</td>
                                    <td className="px-2 py-1">
                                        {canManage ? (
                                            <select disabled={pending} value={r.vendor_bill_id || ""} onChange={e => onLink(r.id, e.target.value || null)}
                                                className={`h-8 w-full max-w-[260px] rounded-lg border px-2 text-xs ${r.vendor_bill_id ? "border-emerald-300 bg-emerald-50" : "border-slate-300"}`}>
                                                <option value="">— ยังไม่ผูก —</option>
                                                {linkable.map(b => <option key={b.id} value={b.id}>{b.vendor}{b.invoice_no ? ` #${b.invoice_no}` : ""} · {baht(b.amount)}</option>)}
                                            </select>
                                        ) : (r.vendor_bill_id ? <Link2 className="h-4 w-4 text-emerald-600" /> : "—")}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Section>
        <p className="text-[11px] text-slate-400">บันทึกใบแจ้งหนี้ก่อน → ตอนรับของเข้าที่หน้าคลังเลือก &quot;ผูกกับใบแจ้งหนี้&quot; (หรือผูกย้อนหลังในตารางนี้) → ระบบเทียบยอดรับของกับยอดบิล</p>
    </>);
}

// ── ส่วนประกอบ ──
type BillActs = { onPay: (b: BillRow) => void; onUnpay: (b: BillRow) => void; onEdit: (b: BillRow) => void; onDelete: (b: BillRow) => void };

function BillTable({ rows, today, canManage, pending, showType, showCategory, showReceived, onPay, onUnpay, onEdit, onDelete }: {
    rows: BillRow[]; today: string; canManage: boolean; pending: boolean; showType?: boolean; showCategory?: boolean; showReceived?: boolean;
} & BillActs) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="text-xs text-slate-400 bg-slate-50"><tr>
                    <th className="text-left px-4 py-2">เจ้าหนี้</th>
                    {showType && <th className="text-left px-2">ประเภท</th>}
                    {showCategory && <th className="text-left px-2">หมวด</th>}
                    <th className="text-left px-2">เดือน</th><th className="text-left px-2">เลขที่</th>
                    <th className="text-right px-2">ยอด</th>
                    {showReceived && <th className="text-right px-2">รับของ</th>}
                    <th className="text-left px-2">ครบกำหนด</th><th className="px-4" />
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map(b => {
                        const late = !b.paid_at && b.due_date < today;
                        const days = daysBetween(today, b.due_date);
                        const recvDiff = b.received - b.amount;
                        return (
                            <tr key={b.id}>
                                <td className="px-4 py-2 font-semibold text-slate-800">{b.vendor}{b.note && <div className="text-[11px] font-normal text-slate-400">{b.note}</div>}</td>
                                {showType && <td className="px-2"><span className={`text-[11px] px-2 py-0.5 rounded font-bold whitespace-nowrap ${TYPE_COLOR[b.bill_type]}`}>{BILL_TYPE_LABEL[b.bill_type]}</span></td>}
                                {showCategory && <td className="px-2 text-xs">{expenseCategoryLabel(b.category)}{!b.in_pl && <span className="text-slate-400"> · ไม่นับกำไร</span>}</td>}
                                <td className="px-2 tabular-nums text-xs">{b.period_month}</td>
                                <td className="px-2 font-mono text-xs text-slate-500">{b.invoice_no || "—"}</td>
                                <td className="px-2 text-right tabular-nums font-semibold">{baht(b.amount)}</td>
                                {showReceived && <td className={`px-2 text-right tabular-nums text-xs ${!b.received ? "text-slate-400" : Math.abs(recvDiff) <= 1 ? "text-emerald-600" : "text-amber-600"}`}>
                                    {!b.received ? "ยังไม่ผูก" : Math.abs(recvDiff) <= 1 ? `${baht(b.received)} ✓` : `${baht(b.received)} (ต่าง ${baht(recvDiff)})`}
                                </td>}
                                <td className={`px-2 text-xs whitespace-nowrap ${b.paid_at ? "text-emerald-600" : late ? "text-rose-600 font-bold" : days <= 7 ? "text-amber-600" : "text-slate-600"}`}>
                                    {b.paid_at ? <>จ่ายแล้ว {thDate(b.paid_at)}{b.paid_ref ? ` · ${b.paid_ref}` : ""}</> : <>{thDate(b.due_date)} · {late ? `เกิน ${-days} วัน` : days === 0 ? "วันนี้" : `อีก ${days} วัน`}</>}
                                </td>
                                <td className="px-4 py-2 text-right whitespace-nowrap">
                                    {canManage && (
                                        <div className="inline-flex items-center gap-1">
                                            {b.paid_at ? (
                                                <button disabled={pending} onClick={() => onUnpay(b)} className="h-8 px-3 rounded-lg text-xs border border-slate-200 text-slate-500">ยกเลิกจ่าย</button>
                                            ) : (<>
                                                <button disabled={pending} onClick={() => onPay(b)} className="h-8 px-3 rounded-lg text-xs font-semibold bg-emerald-600 text-white inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> จ่าย</button>
                                                <button onClick={() => onEdit(b)} className="h-8 px-2 rounded-lg border border-slate-200 text-slate-600" aria-label="แก้"><Pencil className="h-3.5 w-3.5" /></button>
                                                <button onClick={() => onDelete(b)} className="h-8 px-2 rounded-lg text-rose-500" aria-label="ลบ"><Trash2 className="h-3.5 w-3.5" /></button>
                                            </>)}
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

function BillModal({ form, setForm, month, vendors, expected, pending, onSave }: {
    form: BillForm; setForm: (f: BillForm | null) => void; month: string; vendors: VendorRow[]; expected?: number; pending: boolean; onSave: () => void;
}) {
    const list = vendors.filter(v => v.is_active && v.vendor_type === form.bill_type);
    const pickVendor = (name: string) => {
        const v = vendors.find(x => x.name === name);
        setForm({ ...form, vendor: name, due_date: v ? addDays(form.bill_date, v.credit_days) : form.due_date });
    };
    return (
        <Modal title={`${form.id ? "แก้ไข" : "บันทึก"}บิล · เดือน ${month}`} onClose={() => setForm(null)}>
            {!form.id && (
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                    {(["supplier", "expense", "lab"] as BillType[]).map(t => (
                        <button key={t} type="button" onClick={() => setForm({ ...form, bill_type: t, vendor: "" })}
                            className={`h-8 rounded-lg text-xs font-semibold ${form.bill_type === t ? "bg-white shadow text-violet-700" : "text-slate-500"}`}>{BILL_TYPE_LABEL[t]}</button>
                    ))}
                </div>
            )}
            <L label={form.bill_type === "expense" ? "จ่ายให้ใคร (เช่น การไฟฟ้า, เจ้าของตึก)" : form.bill_type === "lab" ? "แล็บ" : "บริษัท"}>
                <input list="pay-vendors" value={form.vendor} onChange={e => pickVendor(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
                <datalist id="pay-vendors">{list.map(v => <option key={v.id} value={v.name} />)}</datalist>
            </L>
            {form.bill_type === "expense" && (
                <div className="grid grid-cols-2 gap-3 items-end">
                    <L label="หมวด">
                        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm">
                            {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </L>
                    <label className="flex items-center gap-2 text-xs text-slate-600 h-9">
                        <input type="checkbox" checked={form.in_pl} onChange={e => setForm({ ...form, in_pl: e.target.checked })} className="h-4 w-4" />
                        นับเข้ารายงานกำไร <span className="text-slate-400">(เอาออกถ้ามีในต้นทุนคงที่แล้ว)</span>
                    </label>
                </div>
            )}
            <div className="grid grid-cols-2 gap-3">
                <L label="เลขที่ใบแจ้งหนี้/ใบกำกับ"><input value={form.invoice_no} onChange={e => setForm({ ...form, invoice_no: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
                <L label="ยอด (฿)"><input type="number" min={0} step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm text-right tabular-nums" /></L>
                <L label="วันที่บิล"><input type="date" value={form.bill_date} onChange={e => {
                    const v = vendors.find(x => x.name === form.vendor);
                    setForm({ ...form, bill_date: e.target.value, due_date: addDays(e.target.value, v?.credit_days ?? daysBetween(form.bill_date, form.due_date)) });
                }} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
                <L label={`ครบกำหนดจ่าย (เครดิต ${daysBetween(form.bill_date, form.due_date)} วัน)`}><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
            </div>
            {expected != null && form.amount !== "" && (
                <p className={`text-xs ${Math.abs(Number(form.amount) - expected) <= 1 ? "text-emerald-600" : "text-amber-600"}`}>ระบบคาด {baht(expected)} · ต่าง {baht(Number(form.amount) - expected)}</p>
            )}
            <L label="หมายเหตุ"><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
            <ModalFooter pending={pending} disabled={!form.vendor.trim() || form.amount === ""} onCancel={() => setForm(null)} onSave={onSave} />
        </Modal>
    );
}

function PayModal({ bill, today, pending, onClose, onSave }: { bill: BillRow; today: string; pending: boolean; onClose: () => void; onSave: (p: { date: string; method: string; ref?: string }) => void }) {
    const [date, setDate] = useState(today);
    const [method, setMethod] = useState("transfer");
    const [ref, setRef] = useState("");
    return (
        <Modal title="บันทึกการจ่าย" onClose={onClose}>
            <div className="rounded-xl bg-slate-50 p-3 text-sm"><b>{bill.vendor}</b> {bill.invoice_no && <span className="text-slate-500">#{bill.invoice_no}</span>} · <b className="tabular-nums">{baht(bill.amount)}</b></div>
            <div className="grid grid-cols-2 gap-3">
                <L label="วันที่จ่าย"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
                <L label="วิธีจ่าย">
                    <select value={method} onChange={e => setMethod(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm">
                        {PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </L>
            </div>
            <L label="อ้างอิง (เลขที่โอน/เช็ค)"><input value={ref} onChange={e => setRef(e.target.value)} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
            <ModalFooter pending={pending} onCancel={onClose} onSave={() => onSave({ date, method, ref })} label="บันทึกจ่าย" />
        </Modal>
    );
}

function VendorModal({ v, setV, pending, onSave }: { v: Partial<VendorRow>; setV: (v: Partial<VendorRow> | null) => void; pending: boolean; onSave: () => void }) {
    return (
        <Modal title={v.id ? "แก้ไขผู้ขาย" : "เพิ่มผู้ขาย"} onClose={() => setV(null)}>
            <L label="ชื่อ"><input value={v.name || ""} onChange={e => setV({ ...v, name: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
            <div className="grid grid-cols-3 gap-3">
                <L label="ประเภท">
                    <select value={v.vendor_type || "supplier"} onChange={e => setV({ ...v, vendor_type: e.target.value as BillType })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm">
                        {(["supplier", "lab", "expense"] as BillType[]).map(t => <option key={t} value={t}>{BILL_TYPE_LABEL[t]}</option>)}
                    </select>
                </L>
                <L label="เครดิต (วัน)"><input type="number" min={0} value={v.credit_days ?? 30} onChange={e => setV({ ...v, credit_days: Number(e.target.value) })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm text-right" /></L>
                <L label="บิลมาทุกวันที่"><input type="number" min={1} max={31} value={v.bill_day ?? ""} onChange={e => setV({ ...v, bill_day: e.target.value ? Number(e.target.value) : null })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm text-right" /></L>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <L label="เลขผู้เสียภาษี"><input value={v.tax_id || ""} onChange={e => setV({ ...v, tax_id: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
                <L label="โทร"><input value={v.phone || ""} onChange={e => setV({ ...v, phone: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
            </div>
            <L label="หมายเหตุ (เลขบัญชีโอน ฯลฯ)"><input value={v.note || ""} onChange={e => setV({ ...v, note: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
            {v.id && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={v.is_active !== false} onChange={e => setV({ ...v, is_active: e.target.checked })} className="h-4 w-4" /> ใช้งานอยู่</label>}
            <ModalFooter pending={pending} disabled={!v.name?.trim()} onCancel={() => setV(null)} onSave={onSave} />
        </Modal>
    );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center">
                    <h2 className="font-bold text-lg text-slate-800 flex-1">{title}</h2>
                    <button onClick={onClose} aria-label="ปิด"><X className="h-4 w-4 text-slate-400" /></button>
                </div>
                {children}
            </div>
        </div>
    );
}
function ModalFooter({ pending, disabled, onCancel, onSave, label = "บันทึก" }: { pending: boolean; disabled?: boolean; onCancel: () => void; onSave: () => void; label?: string }) {
    return (
        <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCancel} className="h-10 px-4 rounded-xl text-sm text-slate-600">ยกเลิก</button>
            <button disabled={pending || disabled} onClick={onSave} className="h-10 px-4 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} {label}
            </button>
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
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">{title}</div>{children}</section>;
}
function Empty({ text }: { text: string }) { return <p className="p-6 text-center text-sm text-slate-400">{text}</p>; }
function L({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block text-xs text-slate-600 space-y-1"><span className="font-semibold">{label}</span>{children}</label>;
}
