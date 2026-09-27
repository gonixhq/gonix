"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Receipt, Plus, X, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Trash2, ChevronDown, ChevronUp, Pencil, Link2, Paperclip, FileCheck2, Send, Download, Sparkles, Search, Printer, ClipboardList, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import {
    saveBill, markBillPaid, deleteBill, linkReceiptToBill, saveVendor, backfillLabCost,
    uploadBillAttachment, deleteBillAttachment, markBillsSent, exportBillsForAccountant,
    type BillRow, type LabSentRow, type LabVendorSummary, type ReceiptRow, type VendorRow,
} from "@/lib/actions/payables";
import BillEditor from "./bill-editor";
import { createBatch, removeBillFromBatch, approveBatch, payBatch, cancelBatch, type BatchRow, type BatchStatus } from "@/lib/actions/payment-batches";
import { type BillForm, billToForm, emptyLine, calcBill, shrinkImage, openAttachment } from "./bill-utils";
import { BILL_TYPE_LABEL, PAY_METHODS, DOC_TYPE_LABEL, expenseCategoryLabel, type BillType } from "@/lib/payables";

export type PayTab = "overview" | "batches" | "lab" | "supplier" | "expense" | "accountant" | "vendors";
type BatchData = { batches: BatchRow[]; canPrepare: boolean; canApprove: boolean };
type BatchRef = Map<string, { no: string; status: BatchStatus }>;
const BATCH_STATUS: Record<BatchStatus, { label: string; cls: string }> = {
    prepared: { label: "รออนุมัติ", cls: "bg-amber-100 text-amber-800" },
    approved: { label: "อนุมัติแล้ว · รอจ่าย", cls: "bg-sky-100 text-sky-800" },
    paid: { label: "ชำระแล้ว", cls: "bg-emerald-100 text-emerald-800" },
    cancelled: { label: "ยกเลิก", cls: "bg-slate-100 text-slate-500" },
};

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const thDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const TYPE_COLOR: Record<BillType, string> = { lab: "bg-violet-100 text-violet-700", supplier: "bg-sky-100 text-sky-700", expense: "bg-amber-100 text-amber-700" };

type Data = {
    lab: { sent: LabSentRow[]; summary: LabVendorSummary[] };
    bills: BillRow[]; openBills: BillRow[]; receipts: ReceiptRow[]; vendors: VendorRow[]; canManage: boolean;
};
export default function PayablesClient({ month, today, tab, data, batchData }: { month: string; today: string; tab: PayTab; data: Data; batchData: BatchData }) {
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
        setForm({ bill_type, vendor, invoice_no: "", bill_date: bd, due_date: addDays(bd, v?.credit_days ?? (bill_type === "expense" ? 7 : 30)), category: "other", in_pl: true, note: "",
            doc_type: bill_type === "expense" ? "receipt" : "invoice", vat_mode: "none", wht_pct: 0, original_filed: false, original_ref: "", files: [], attachments: [],
            lines: [{ ...emptyLine(), description: bill_type === "lab" ? `ค่าตรวจแล็บ งานเดือน ${month}` : "" }], discount: "",
            vendor_tax_id: v?.tax_id ?? null, vendor_branch: v?.branch ?? null, vendor_address: v?.address ?? null });
    };
    const editBill = (b: BillRow) => { const v = vendorByName.get(b.vendor); setForm({ ...billToForm(b), vendor_tax_id: v?.tax_id ?? null, vendor_branch: v?.branch ?? null, vendor_address: v?.address ?? null }); };
    const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, after?: () => void) => start(async () => {
        const r = await fn();
        if (!r.ok) { toast.error(r.error || "ไม่สำเร็จ"); return; }
        toast.success(msg); after?.(); router.refresh();
    });
    const [payBatchFor, setPayBatchFor] = useState<BatchRow | null>(null);
    const batchRef: BatchRef = useMemo(() => new Map(batchData.batches.filter(b => b.status === "prepared" || b.status === "approved")
        .flatMap(b => b.bills.map(x => [x.id, { no: b.batch_no, status: b.status }] as const))), [batchData]);
    const onCreateBatch = (ids: string[]) => start(async () => {
        const r = await createBatch(ids);
        if (!r.ok) { toast.error(r.error || "สร้างไม่สำเร็จ"); return; }
        toast.success(`สร้างใบเตรียมจ่าย ${r.batch_no} แล้ว`); router.push(`/dashboard/finance/payables?tab=batches&month=${month}`); router.refresh();
    });
    const billActions = {
        batchRef, onCreateBatch: data.canManage ? onCreateBatch : undefined,
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
                        <h1 className="text-xl font-bold text-slate-800">ค่าใช้จ่าย</h1>
                        <p className="text-xs text-slate-500">บันทึกบิล/ใบกำกับภาษี · แล็บภายนอก · บริษัทยา · ค่าใช้จ่ายทั่วไป — ติดตามครบกำหนดจ่าย + ส่งสำนักงานบัญชี</p>
                    </div>
                </div>
                {tab !== "overview" && tab !== "vendors" && tab !== "batches" && (
                    <input type="month" value={month} onChange={e => go(tab, e.target.value)} className="h-10 rounded-xl border border-slate-300 px-3 text-sm" />
                )}
                {data.canManage && tab !== "vendors" && tab !== "accountant" && tab !== "batches" && (
                    <button onClick={() => { newBill(tab === "lab" || tab === "supplier" || tab === "expense" ? tab : "expense"); setForm(f => f && { ...f, autoScan: true }); }}
                        className="h-10 px-4 rounded-xl border border-violet-300 bg-violet-50 text-violet-700 text-sm font-bold inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> สแกนบิล (AI)</button>
                )}
                {data.canManage && tab !== "vendors" && tab !== "accountant" && tab !== "batches" && (
                    <button onClick={() => newBill(tab === "lab" || tab === "supplier" || tab === "expense" ? tab : "supplier")}
                        className="h-10 px-4 rounded-xl bg-violet-600 text-white text-sm font-bold inline-flex items-center gap-1.5"><Plus className="h-4 w-4" /> บันทึกบิล</button>
                )}
                {data.canManage && tab === "vendors" && (
                    <button onClick={() => setVendorForm({ vendor_type: "supplier", credit_days: 30, is_active: true })}
                        className="h-10 px-4 rounded-xl bg-violet-600 text-white text-sm font-bold inline-flex items-center gap-1.5"><Plus className="h-4 w-4" /> เพิ่มผู้ขาย</button>
                )}
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
                {([["overview", "ภาพรวม"], ["batches", `เตรียมจ่าย${batchData.batches.filter(b => b.status === "prepared").length ? ` (${batchData.batches.filter(b => b.status === "prepared").length})` : ""}`], ["lab", "แล็บภายนอก"], ["supplier", "บริษัทยา"], ["expense", "ค่าใช้จ่ายทั่วไป"], ["accountant", "ส่งบัญชี"], ["vendors", "ผู้ขาย"]] as [PayTab, string][]).map(([k, l]) => (
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
                    {data.openBills.length === 0 ? <Empty text="ไม่มีบิลค้างจ่าย 🎉" /> : <FilteredBills rows={data.openBills} today={today} canManage={data.canManage} pending={pending} showType {...billActions} />}
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
                            {ex.length === 0 ? <Empty text="ยังไม่มีบิลค่าใช้จ่ายเดือนนี้" /> : <FilteredBills rows={ex} today={today} canManage={data.canManage} pending={pending} showCategory {...billActions} />}
                        </Section>
                        <p className="text-[11px] text-slate-400">รายการที่ตั้งไว้ใน <Link href="/dashboard/finance/fixed-costs" className="underline">ต้นทุนคงที่</Link> แล้ว (เช่น ค่าเช่า) ให้เอาติ๊ก &quot;นับเข้ากำไร&quot; ออก — ใช้หน้านี้ติดตามการจ่ายอย่างเดียว · ค่าใช้จ่ายเล็กๆ ที่จ่ายเงินสดทันที ใช้ &quot;เงินสดย่อย&quot; ที่หน้าปิดยอดตามเดิม</p>
                    </>);
                })()}
            </>)}

            {tab === "batches" && <BatchesTab bd={batchData} pending={pending}
                onApprove={b => act(() => approveBatch(b.id), `อนุมัติ ${b.batch_no} แล้ว`)}
                onPay={b => setPayBatchFor(b)}
                onCancel={b => { if (confirm(`ยกเลิกใบเตรียมจ่าย ${b.batch_no}? (บิลกลับเป็นรอชำระ)`)) act(() => cancelBatch(b.id), "ยกเลิกแล้ว"); }}
                onRemove={(b, billId) => act(() => removeBillFromBatch(b.id, billId), "เอาบิลออกแล้ว")} />}

            {tab === "accountant" && <AccountantTab month={month} bills={data.bills} canManage={data.canManage} pending={pending} start={start} onEdit={editBill} />}

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

            {form && <BillEditor form={form} setForm={setForm} month={month} vendors={data.vendors} pending={pending}
                expected={form.bill_type === "lab" ? data.lab.summary.find(s => s.vendor === form.vendor)?.expected : undefined}
                onDeleteAttachment={a => form.id && start(async () => {
                    const r = await deleteBillAttachment(form.id!, a.path);
                    if (!r.ok) { toast.error(r.error || "ลบไม่สำเร็จ"); return; }
                    setForm({ ...form, attachments: form.attachments.filter(x => x.path !== a.path) }); router.refresh();
                })}
                onSave={() => start(async () => {
                    const r = await saveBill({ id: form.id, bill_type: form.bill_type, vendor: form.vendor, period_month: month, invoice_no: form.invoice_no, bill_date: form.bill_date,
                        due_date: form.due_date, amount: calcBill(form).after, category: form.category, in_pl: form.in_pl, note: form.note,
                        lines: form.lines.map(l => ({ description: l.description, category: form.bill_type === "expense" ? l.category : null, qty: Number(l.qty) || 0, unit_price: Number(l.unit_price) || 0 })),
                        discount: Number(form.discount) || 0,
                        doc_type: form.doc_type, vat_mode: form.vat_mode, wht_pct: form.wht_pct, original_filed: form.original_filed, original_ref: form.original_ref,
                        vendor_tax_id: form.vendor_tax_id, vendor_branch: form.vendor_branch, vendor_address: form.vendor_address });
                    if (!r.ok || !r.id) { toast.error(r.error || "บันทึกไม่สำเร็จ"); return; }
                    let failed = 0;
                    for (const file of form.files) {
                        const fd = new FormData(); fd.append("bill_id", r.id); fd.append("file", await shrinkImage(file));
                        const u = await uploadBillAttachment(fd);
                        if (!u.ok) { failed++; toast.error(`${file.name}: ${u.error}`); }
                    }
                    toast.success(failed ? `บันทึกแล้ว (แนบไฟล์ไม่สำเร็จ ${failed})` : "บันทึกแล้ว");
                    setForm(null); router.refresh();
                })} />}

            {payBatchFor && <PayModal bill={{ vendor: payBatchFor.vendor, invoice_no: payBatchFor.batch_no, amount: payBatchFor.total, wht_amount: payBatchFor.wht_total, wht_pct: 0, net_pay: payBatchFor.net_total }}
                today={today} pending={pending} onClose={() => setPayBatchFor(null)}
                onSave={(p) => act(() => payBatch(payBatchFor.id, p), `จ่าย ${payBatchFor.batch_no} แล้ว — บิล ${payBatchFor.bills.length} ใบชำระแล้ว`, () => setPayBatchFor(null))} />}

            {payFor && <PayModal bill={payFor} today={today} pending={pending} onClose={() => setPayFor(null)}
                onSave={(p) => act(() => markBillPaid(payFor.id, p), "บันทึกจ่ายแล้ว", () => setPayFor(null))} />}

            {vendorForm && <VendorModal v={vendorForm} setV={setVendorForm} pending={pending}
                onSave={() => act(() => saveVendor({ id: vendorForm.id, name: vendorForm.name || "", vendor_type: vendorForm.vendor_type || "supplier", credit_days: Number(vendorForm.credit_days ?? 30),
                    bill_day: vendorForm.bill_day ?? null, tax_id: vendorForm.tax_id || "", phone: vendorForm.phone || "", note: vendorForm.note || "", is_active: vendorForm.is_active !== false, address: vendorForm.address || "", branch: vendorForm.branch || "" }), "บันทึกแล้ว", () => setVendorForm(null))} />}
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
        {labBills.length > 0 && <Section title={`ใบแจ้งหนี้แล็บ · งานเดือน ${month}`}><FilteredBills rows={labBills} today={today} canManage={canManage} pending={pending} {...billActions} /></Section>}
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
            {sup.length === 0 ? <Empty text="ยังไม่มีบิลบริษัทยาเดือนนี้" /> : <FilteredBills rows={sup} today={today} canManage={canManage} pending={pending} showReceived {...billActions} />}
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
type BillActs = { onPay: (b: BillRow) => void; onUnpay: (b: BillRow) => void; onEdit: (b: BillRow) => void; onDelete: (b: BillRow) => void;
    batchRef?: BatchRef; onCreateBatch?: (ids: string[]) => void; selected?: Set<string>; onToggle?: (b: BillRow) => void };

/** รายการบิลแบบ FlowAccount: กรองสถานะ + ค้นหา */
function FilteredBills(props: Parameters<typeof BillTable>[0]) {
    const [st, setSt] = useState<"all" | "unpaid" | "overdue" | "paid">("all");
    const [q, setQ] = useState("");
    const [sel, setSel] = useState<Set<string>>(new Set());
    const { rows, today, onCreateBatch, canManage } = props;
    const selRows = rows.filter(b => sel.has(b.id));
    const selVendor = selRows[0]?.vendor;
    const toggle = (b: BillRow) => {
        if (selVendor && b.vendor !== selVendor && !sel.has(b.id)) { toast.error("ใบเตรียมจ่ายรวมได้เฉพาะบิลของผู้ขายเดียวกัน"); return; }
        setSel(p => { const n = new Set(p); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; });
    };
    const cnt = { all: rows.length, unpaid: rows.filter(b => !b.paid_at).length, overdue: rows.filter(b => !b.paid_at && b.due_date < today).length, paid: rows.filter(b => b.paid_at).length };
    const k = q.trim().toLowerCase();
    const shown = rows.filter(b => (st === "all" || (st === "paid" ? !!b.paid_at : st === "overdue" ? !b.paid_at && b.due_date < today : !b.paid_at))
        && (!k || [b.vendor, b.invoice_no, b.note, ...b.lines.map(l => l.description)].some(x => (x || "").toLowerCase().includes(k))));
    return (<>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100">
            {([["all", "แสดงทั้งหมด"], ["unpaid", "รอชำระ"], ["overdue", "เกินกำหนด"], ["paid", "ชำระแล้ว"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setSt(key)}
                    className={`h-8 px-3 rounded-full text-xs font-semibold border ${st === key ? "bg-violet-600 border-violet-600 text-white" : key === "overdue" && cnt.overdue ? "border-rose-200 text-rose-600 bg-rose-50" : "border-slate-200 text-slate-600 bg-white"}`}>
                    {label} ({cnt[key]})
                </button>
            ))}
            <div className="flex-1" />
            <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา ผู้ขาย / เลขที่ / รายการ" className="h-8 w-56 rounded-full border border-slate-200 pl-8 pr-3 text-xs" />
            </div>
        </div>
        {sel.size > 0 && onCreateBatch && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-violet-50 border-b border-violet-100 text-sm">
                <ClipboardList className="h-4 w-4 text-violet-600" />
                <span className="flex-1">เลือก {sel.size} บิล · <b>{selVendor}</b> · ยอดโอน <b className="tabular-nums">{baht(selRows.reduce((s, b) => s + b.net_pay, 0))}</b></span>
                <button onClick={() => setSel(new Set())} className="h-8 px-3 rounded-lg text-xs text-slate-500">ล้าง</button>
                <button disabled={props.pending} onClick={() => { onCreateBatch([...sel]); setSel(new Set()); }} className="h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-bold">สร้างใบเตรียมจ่าย</button>
            </div>
        )}
        {shown.length === 0 ? <Empty text="ไม่พบรายการ" /> : <BillTable {...props} rows={shown} selected={sel} onToggle={onCreateBatch && canManage ? toggle : undefined} />}
    </>);
}

function BillTable({ rows, today, canManage, pending, showType, showCategory, showReceived, onPay, onUnpay, onEdit, onDelete, batchRef, selected, onToggle }: {
    rows: BillRow[]; today: string; canManage: boolean; pending: boolean; showType?: boolean; showCategory?: boolean; showReceived?: boolean;
} & BillActs) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="text-xs text-slate-400 bg-slate-50"><tr>
                    {onToggle && <th className="w-8 pl-3" />}
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
                            <tr key={b.id} className={selected?.has(b.id) ? "bg-violet-50/60" : ""}>
                                {onToggle && <td className="pl-3">{!b.paid_at && !batchRef?.has(b.id) && <input type="checkbox" checked={!!selected?.has(b.id)} onChange={() => onToggle(b)} className="h-4 w-4" />}</td>}
                                <td className="px-4 py-2 font-semibold text-slate-800">
                                    {b.vendor}{b.note && <div className="text-[11px] font-normal text-slate-400">{b.note}</div>}
                                    <DocBadges b={b} />
                                    {batchRef?.get(b.id) && <span className="inline-flex items-center gap-0.5 mt-0.5 text-[10px] font-semibold px-1.5 rounded bg-sky-50 text-sky-700"><ClipboardList className="h-2.5 w-2.5" /> {batchRef.get(b.id)!.no} · {BATCH_STATUS[batchRef.get(b.id)!.status].label}</span>}
                                </td>
                                {showType && <td className="px-2"><span className={`text-[11px] px-2 py-0.5 rounded font-bold whitespace-nowrap ${TYPE_COLOR[b.bill_type]}`}>{BILL_TYPE_LABEL[b.bill_type]}</span></td>}
                                {showCategory && <td className="px-2 text-xs">{expenseCategoryLabel(b.category)}{!b.in_pl && <span className="text-slate-400"> · ไม่นับกำไร</span>}</td>}
                                <td className="px-2 tabular-nums text-xs">{b.period_month}</td>
                                <td className="px-2 font-mono text-xs text-slate-500">{b.invoice_no || "—"}</td>
                                <td className="px-2 text-right tabular-nums font-semibold">{baht(b.amount)}{b.wht_amount > 0 && <div className="text-[10px] font-normal text-slate-400">โอนจริง {baht(b.net_pay)}</div>}</td>
                                {showReceived && <td className={`px-2 text-right tabular-nums text-xs ${!b.received ? "text-slate-400" : Math.abs(recvDiff) <= 1 ? "text-emerald-600" : "text-amber-600"}`}>
                                    {!b.received ? "ยังไม่ผูก" : Math.abs(recvDiff) <= 1 ? `${baht(b.received)} ✓` : `${baht(b.received)} (ต่าง ${baht(recvDiff)})`}
                                </td>}
                                <td className={`px-2 text-xs whitespace-nowrap ${b.paid_at ? "text-emerald-600" : late ? "text-rose-600 font-bold" : days <= 7 ? "text-amber-600" : "text-slate-600"}`}>
                                    {b.paid_at ? <>จ่ายแล้ว {thDate(b.paid_at)}{b.paid_ref ? ` · ${b.paid_ref}` : ""}</> : <>{thDate(b.due_date)} · {late ? `เกิน ${-days} วัน` : days === 0 ? "วันนี้" : `อีก ${days} วัน`}</>}
                                </td>
                                <td className="px-4 py-2 text-right whitespace-nowrap">
                                    {canManage && (
                                        <div className="inline-flex items-center gap-1">
                                            <a href={`/print/payment-voucher/${b.id}`} target="_blank" rel="noreferrer" title="พิมพ์ใบสำคัญจ่าย (จ่ายบุคคลธรรมดา/ไม่มีใบเสร็จ)"
                                                className="h-8 px-2 rounded-lg border border-slate-200 text-slate-600 inline-flex items-center gap-1 text-[11px]"><Printer className="h-3.5 w-3.5" /> ใบสำคัญจ่าย</a>
                                            {b.wht_amount > 0 && <a href={`/print/vendor-wht/${b.id}`} target="_blank" rel="noreferrer" title="พิมพ์หนังสือรับรองหัก ณ ที่จ่าย"
                                                className="h-8 px-2 rounded-lg border border-violet-200 text-violet-700 inline-flex items-center text-[11px] font-semibold">50 ทวิ</a>}
                                            {b.paid_at ? (
                                                <button disabled={pending} onClick={() => onUnpay(b)} className="h-8 px-3 rounded-lg text-xs border border-slate-200 text-slate-500">ยกเลิกจ่าย</button>
                                            ) : batchRef?.has(b.id) ? null : (<>
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

function PayModal({ bill, today, pending, onClose, onSave }: { bill: Pick<BillRow, "vendor" | "invoice_no" | "amount" | "wht_amount" | "wht_pct" | "net_pay">; today: string; pending: boolean; onClose: () => void; onSave: (p: { date: string; method: string; ref?: string }) => void }) {
    const [date, setDate] = useState(today);
    const [method, setMethod] = useState("transfer");
    const [ref, setRef] = useState("");
    return (
        <Modal title="บันทึกการจ่าย" onClose={onClose}>
            <div className="rounded-xl bg-slate-50 p-3 text-sm"><b>{bill.vendor}</b> {bill.invoice_no && <span className="text-slate-500">#{bill.invoice_no}</span>} · <b className="tabular-nums">{baht(bill.amount)}</b>
                {bill.wht_amount > 0 && <div className="text-xs text-slate-600 mt-1">หัก ณ ที่จ่าย{bill.wht_pct ? ` ${bill.wht_pct}%` : ""} = {baht(bill.wht_amount)} → <b>โอนจริง {baht(bill.net_pay)}</b> · อย่าลืมออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)</div>}
            </div>
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
                <L label="เลขผู้เสียภาษี / บัตรประชาชน"><input value={v.tax_id || ""} onChange={e => setV({ ...v, tax_id: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
                <L label="โทร"><input value={v.phone || ""} onChange={e => setV({ ...v, phone: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><L label="ที่อยู่ (ตามใบกำกับภาษี)"><input value={v.address || ""} onChange={e => setV({ ...v, address: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L></div>
                <L label="สาขา"><input value={v.branch || ""} onChange={e => setV({ ...v, branch: e.target.value })} placeholder="สำนักงานใหญ่" className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
            </div>
            <L label="หมายเหตุ (เลขบัญชีโอน ฯลฯ)"><input value={v.note || ""} onChange={e => setV({ ...v, note: e.target.value })} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" /></L>
            {v.id && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={v.is_active !== false} onChange={e => setV({ ...v, is_active: e.target.checked })} className="h-4 w-4" /> ใช้งานอยู่</label>}
            <ModalFooter pending={pending} disabled={!v.name?.trim()} onCancel={() => setV(null)} onSave={onSave} />
        </Modal>
    );
}

function BatchesTab({ bd, pending, onApprove, onPay, onCancel, onRemove }: {
    bd: BatchData; pending: boolean; onApprove: (b: BatchRow) => void; onPay: (b: BatchRow) => void; onCancel: (b: BatchRow) => void; onRemove: (b: BatchRow, billId: string) => void;
}) {
    const [showDone, setShowDone] = useState(false);
    const active = bd.batches.filter(b => b.status === "prepared" || b.status === "approved");
    const done = bd.batches.filter(b => b.status === "paid" || b.status === "cancelled");
    const card = (b: BatchRow) => (
        <div key={b.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-100">
                <ClipboardList className="h-4 w-4 text-violet-600" />
                <span className="font-mono font-bold text-slate-800">{b.batch_no}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${BATCH_STATUS[b.status].cls}`}>{BATCH_STATUS[b.status].label}</span>
                <span className="font-semibold text-slate-800">{b.vendor}</span>
                <span className="flex-1" />
                <span className="text-sm tabular-nums">ยอดโอน <b className="text-lg">{baht(b.net_total)}</b></span>
            </div>
            <div className="px-4 py-2 text-xs text-slate-500 flex flex-wrap gap-x-4">
                <span>เตรียมโดย {b.prepared_by || "—"} · {thDate(b.prepared_at)}</span>
                {b.approved_at && <span className="inline-flex items-center gap-1 text-sky-700"><ShieldCheck className="h-3.5 w-3.5" /> อนุมัติโดย {b.approved_by || "—"} · {thDate(b.approved_at)}</span>}
                {b.paid_at && <span className="text-emerald-700">จ่ายแล้ว {thDate(b.paid_at)}{b.paid_ref ? ` · ${b.paid_ref}` : ""}</span>}
                {b.wht_total > 0 && <span>รวม {baht(b.total)} · หัก ณ ที่จ่าย {baht(b.wht_total)}</span>}
            </div>
            <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-50">
                    {b.bills.map(x => (
                        <tr key={x.id}>
                            <td className="px-4 py-1.5 text-xs tabular-nums w-24">{thDate(x.bill_date)}</td>
                            <td className="px-2 py-1.5 font-mono text-xs text-slate-500">{x.invoice_no || "—"}</td>
                            <td className="px-2 py-1.5 text-xs text-slate-600 truncate">{x.note || ""}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{baht(x.amount)}</td>
                            <td className="px-4 py-1.5 w-8">{b.status === "prepared" && bd.canPrepare && <button onClick={() => onRemove(b, x.id)} className="text-slate-400 hover:text-rose-500" aria-label="เอาออก"><X className="h-3.5 w-3.5" /></button>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="px-4 py-2.5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60">
                <a href={`/print/payment-batch/${b.id}`} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 inline-flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> พิมพ์ใบเตรียมจ่าย</a>
                {(b.status === "prepared" || b.status === "approved") && bd.canPrepare && <button disabled={pending} onClick={() => onCancel(b)} className="h-8 px-3 rounded-lg text-xs text-slate-500">ยกเลิก</button>}
                {b.status === "prepared" && bd.canApprove && <button disabled={pending} onClick={() => onApprove(b)} className="h-8 px-3 rounded-lg bg-sky-600 text-white text-xs font-bold inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> อนุมัติ</button>}
                {b.status === "prepared" && !bd.canApprove && <span className="text-xs text-amber-700">รอเจ้าของ/ผู้จัดการอนุมัติ (แจ้ง LINE แล้ว)</span>}
                {(b.status === "approved" || (b.status === "prepared" && bd.canApprove)) && bd.canPrepare && (
                    <button disabled={pending} onClick={() => onPay(b)} className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {b.status === "prepared" ? "อนุมัติ + จ่าย" : "บันทึกจ่าย"}</button>
                )}
            </div>
        </div>
    );
    return (<>
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-xs text-violet-900">
            <b>ใบเตรียมจ่าย</b> = รวมหลายบิลของผู้ขายเดียวกันเป็นยอดเดียว → เจ้าของอนุมัติ → จ่ายครั้งเดียว (บิลทุกใบเปลี่ยนเป็นชำระแล้ว) ·
            สร้างได้จากแท็บ ภาพรวม/บริษัทยา/แล็บ/ค่าใช้จ่ายทั่วไป: ติ๊กเลือกบิล → &quot;สร้างใบเตรียมจ่าย&quot;
        </div>
        {active.length === 0 ? <Section title="รอดำเนินการ"><Empty text="ไม่มีใบเตรียมจ่ายที่รอดำเนินการ" /></Section> : <div className="space-y-3">{active.map(card)}</div>}
        {done.length > 0 && (
            <div>
                <button onClick={() => setShowDone(v => !v)} className="text-sm font-semibold text-slate-500 inline-flex items-center gap-1">{showDone ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} จ่ายแล้ว / ยกเลิก ({done.length})</button>
                {showDone && <div className="space-y-3 mt-2">{done.map(card)}</div>}
            </div>
        )}
    </>);
}

function DocBadges({ b }: { b: BillRow }) {
    return (
        <div className="flex flex-wrap gap-1 mt-0.5 text-[10px] font-normal">
            {b.attachments.length > 0
                ? <button type="button" onClick={() => openAttachment(b.attachments[0].path)} className="inline-flex items-center gap-0.5 px-1.5 rounded bg-blue-50 text-blue-700"><Paperclip className="h-2.5 w-2.5" />{b.attachments.length}</button>
                : <span className="px-1.5 rounded bg-rose-50 text-rose-600">ไม่มีรูป</span>}
            <span className={`px-1.5 rounded ${b.original_filed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{b.original_filed ? "ต้นฉบับ ✓" : "ต้นฉบับยังไม่เก็บ"}</span>
            {b.sent_to_accountant_at && <span className="px-1.5 rounded bg-violet-50 text-violet-700">ส่งบัญชีแล้ว</span>}
        </div>
    );
}

function AccountantTab({ month, bills, canManage, pending, start, onEdit }: {
    month: string; bills: BillRow[]; canManage: boolean; pending: boolean; start: (fn: () => Promise<void>) => void; onEdit: (b: BillRow) => void;
}) {
    const router = useRouter();
    const [sel, setSel] = useState<Set<string>>(() => new Set(bills.filter(b => !b.sent_to_accountant_at).map(b => b.id)));
    const noPhoto = bills.filter(b => b.attachments.length === 0);
    const noOriginal = bills.filter(b => !b.original_filed);
    const toggle = (id: string) => setSel(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const download = () => start(async () => {
        const r = await exportBillsForAccountant(month);
        if (!r.ok || r.csv == null) { toast.error(r.error || "ส่งออกไม่สำเร็จ"); return; }
        const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a"); a.href = url; a.download = `ค่าใช้จ่าย-${month}.csv`; a.click(); URL.revokeObjectURL(url);
        toast.success(`ส่งออก ${r.count} บิล (ลิงก์รูปใช้ได้ 7 วัน)`);
    });
    const mark = (sent: boolean) => start(async () => {
        const r = await markBillsSent([...sel], sent);
        if (!r.ok) { toast.error(r.error || "ไม่สำเร็จ"); return; }
        toast.success(sent ? `ทำเครื่องหมายส่งแล้ว ${sel.size} บิล` : "ยกเลิกแล้ว"); router.refresh();
    });
    return (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label={`บิลเดือน ${month}`} value={String(bills.length)} hint={baht(bills.reduce((s, b) => s + b.amount, 0))} />
            <Card label="ส่งบัญชีแล้ว" value={String(bills.filter(b => b.sent_to_accountant_at).length)} tone="ok" />
            <Card label="ยังไม่มีรูปเอกสาร" value={String(noPhoto.length)} tone={noPhoto.length ? "bad" : "ok"} />
            <Card label="ต้นฉบับยังไม่เข้าแฟ้ม" value={String(noOriginal.length)} tone={noOriginal.length ? "warn" : "ok"} />
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-violet-900 space-y-1">
            <div className="font-semibold">ขั้นตอนส่งสำนักงานบัญชีทุกสิ้นเดือน</div>
            <ol className="list-decimal pl-5 text-xs space-y-0.5 text-violet-800">
                <li>ทุกบิลต้องมีรูป/PDF แนบ (ถ่ายรูปจากมือถือได้) และติ๊ก &quot;เก็บต้นฉบับเข้าแฟ้มแล้ว&quot;</li>
                <li>กด &quot;ดาวน์โหลด Excel&quot; → ส่งไฟล์ให้สำนักงานบัญชี (ในไฟล์มีลิงก์เปิดรูปแต่ละบิล ใช้ได้ 7 วัน)</li>
                <li>กด &quot;ทำเครื่องหมายส่งแล้ว&quot; — เดือนหน้าจะเห็นว่าบิลไหนส่งไปแล้ว/ยัง</li>
            </ol>
        </div>
        <Section title={`บิลทั้งหมด · เดือน ${month}`}>
            {bills.length === 0 ? <Empty text="ยังไม่มีบิลเดือนนี้" /> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-xs text-slate-400 bg-slate-50"><tr>
                            <th className="px-3 py-2 w-8"><input type="checkbox" checked={sel.size === bills.length} onChange={e => setSel(e.target.checked ? new Set(bills.map(b => b.id)) : new Set())} /></th>
                            <th className="text-left px-2">วันที่</th><th className="text-left px-2">เอกสาร</th><th className="text-left px-2">ผู้ขาย</th>
                            <th className="text-right px-2">VAT</th><th className="text-right px-2">รวม</th><th className="text-left px-2">สถานะเอกสาร</th><th className="px-3" />
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                            {bills.map(b => (
                                <tr key={b.id} className={sel.has(b.id) ? "bg-violet-50/40" : ""}>
                                    <td className="px-3 py-2"><input type="checkbox" checked={sel.has(b.id)} onChange={() => toggle(b.id)} /></td>
                                    <td className="px-2 text-xs tabular-nums">{thDate(b.bill_date)}</td>
                                    <td className="px-2 text-xs">{DOC_TYPE_LABEL[b.doc_type] || b.doc_type}<div className="font-mono text-slate-400">{b.invoice_no || "—"}</div></td>
                                    <td className="px-2 font-semibold text-slate-800">{b.vendor}<div className="text-[11px] font-normal text-slate-400">{BILL_TYPE_LABEL[b.bill_type]}</div></td>
                                    <td className="px-2 text-right tabular-nums text-xs">{b.vat_amount ? baht(b.vat_amount) : "—"}</td>
                                    <td className="px-2 text-right tabular-nums font-semibold">{baht(b.amount)}</td>
                                    <td className="px-2"><DocBadges b={b} /></td>
                                    <td className="px-3 text-right">{canManage && <button onClick={() => onEdit(b)} className="h-8 px-2 rounded-lg border border-slate-200 text-xs text-slate-600 inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> แนบ/แก้</button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Section>
        <div className="flex flex-wrap gap-2 justify-end">
            <button disabled={pending || !bills.length} onClick={download} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                <Download className="h-4 w-4" /> ดาวน์โหลด Excel
            </button>
            {canManage && <>
                <button disabled={pending || !sel.size} onClick={() => mark(false)} className="h-10 px-4 rounded-xl text-sm text-slate-500 disabled:opacity-50">ยกเลิกสถานะส่ง</button>
                <button disabled={pending || !sel.size} onClick={() => mark(true)} className="h-10 px-4 rounded-xl bg-violet-600 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} ทำเครื่องหมายส่งแล้ว ({sel.size})
                </button>
            </>}
        </div>
    </>);
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
