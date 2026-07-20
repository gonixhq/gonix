"use client";

import { useState, useTransition } from "react";
import InvoiceCampaign from "./invoice-campaign";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    ArrowLeft, Printer, Receipt, X, AlertTriangle,
    Banknote, QrCode, CreditCard, RotateCcw, Ban, FileText, User as UserIcon,
} from "lucide-react";
import { voidInvoice, refundInvoice, addPayment } from "@/lib/actions/invoices";

interface Patient {
    prefix?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    thai_id_card?: string | null;
    gender?: string | null;
    dob?: string | null;
}

interface Invoice {
    id: string;
    vn: string;
    hn: string;
    invoice_date: string;
    subtotal?: number | null;
    discount_amount?: number | null;
    tax_amount?: number | null;
    total_amount: number;
    paid_amount?: number | null;
    balance_due?: number | null;
    status: string;
    campaign?: string | null;
    created_at: string;
    updated_at?: string | null;
    patients: Patient | Patient[];
}

interface InvoiceItem {
    id: string;
    item_type: string;
    item_name: string;
    qty: number;
    unit_price: number;
    discount_pct?: number | null;
    line_total: number;
}

interface PaymentLog {
    id: string;
    payment_method: string;
    amount: number;
    transaction_ref?: string | null;
    bank_name?: string | null;
    paid_at: string;
    note?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
    draft: "ร่าง",
    issued: "รอชำระ",
    partial: "ชำระบางส่วน",
    paid: "ชำระแล้ว",
    voided: "ยกเลิก",
    refunded: "คืนเงินแล้ว",
};

const STATUS_COLOR: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    issued: "bg-amber-100 text-amber-700",
    partial: "bg-cyan-100 text-cyan-700",
    paid: "bg-emerald-100 text-emerald-700",
    voided: "bg-slate-200 text-slate-500 line-through",
    refunded: "bg-rose-100 text-rose-700",
};

const ITEM_TYPE_LABEL: Record<string, string> = {
    doctor_fee: "ค่าตรวจ",
    drug: "ค่ายา",
    lab: "ค่าแล็บ",
    procedure: "หัตถการ",
    service: "บริการ",
    supply: "วัสดุ",
    lab_external: "แล็บภายนอก",
    other: "อื่นๆ",
};

const ITEM_TYPE_COLOR: Record<string, string> = {
    doctor_fee: "bg-cyan-100 text-cyan-700",
    drug: "bg-amber-100 text-amber-700",
    lab: "bg-purple-100 text-purple-700",
    procedure: "bg-rose-100 text-rose-700",
    service: "bg-blue-100 text-blue-700",
    supply: "bg-indigo-100 text-indigo-700",
    lab_external: "bg-purple-100 text-purple-700",
    other: "bg-slate-100 text-slate-700",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
    cash: "เงินสด",
    transfer: "โอน/QR",
    credit_card: "บัตรเครดิต",
    debit_card: "บัตรเดบิต",
};

const PAYMENT_METHOD_ICON: Record<string, React.ElementType> = {
    cash: Banknote,
    transfer: QrCode,
    credit_card: CreditCard,
    debit_card: CreditCard,
};

function calcAge(dob: string | null | undefined): string {
    if (!dob) return "—";
    const d = new Date(dob);
    const now = new Date();
    let y = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) y--;
    return `${y} ปี`;
}

interface AuditLog {
    id: string;
    action: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new_data: any;
    performed_at: string;
    profiles: { full_name: string; role: string } | { full_name: string; role: string }[] | null;
}

interface DiscountLine { id: string; type: string; label: string | null; amount: number }

export default function InvoiceDetailClient({
    invoice, items, payments, discountLines = [], canManage, auditLogs = [],
}: {
    invoice: Invoice;
    items: InvoiceItem[];
    payments: PaymentLog[];
    discountLines?: DiscountLine[];
    canManage: boolean;
    auditLogs?: AuditLog[];
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showVoidConfirm, setShowVoidConfirm] = useState(false);
    const [showRefundConfirm, setShowRefundConfirm] = useState(false);
    const [showAddPayment, setShowAddPayment] = useState(false);
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [addPayAmount, setAddPayAmount] = useState("");
    const [addPayMethod, setAddPayMethod] = useState<"cash" | "transfer" | "credit_card" | "qr_promptpay">("cash");
    const [addPayNote, setAddPayNote] = useState("");

    function handleAddPayment() {
        setError(null);
        startTransition(async () => {
            const res = await addPayment({
                invId: invoice.id,
                amount: parseFloat(addPayAmount),
                paymentMethod: addPayMethod,
                note: addPayNote || undefined,
            });
            if (!res.success) {
                setError(res.error || "บันทึกไม่สำเร็จ");
                return;
            }
            setShowAddPayment(false);
            setAddPayAmount("");
            setAddPayNote("");
            router.refresh();
        });
    }

    const pt = Array.isArray(invoice.patients) ? invoice.patients[0] : invoice.patients;

    const subtotal = Number(invoice.subtotal || 0);
    const discount = Number(invoice.discount_amount || 0);
    const tax = Number(invoice.tax_amount || 0);
    const total = Number(invoice.total_amount || 0);
    const paid = Number(invoice.paid_amount || 0);
    const balance = Number(invoice.balance_due || 0);

    // ยึดยอดหัวบิลเป็นหลัก — ส่วนที่ breakdown ไม่ครบ (บิลเก่า/ไม่ระบุ) เติมเป็น "ไม่ระบุที่มา"
    const breakdownSum = discountLines.reduce((s, d) => s + d.amount, 0);
    const unclassified = Math.round((discount - breakdownSum) * 100) / 100;
    const shownDiscounts = [
        ...discountLines,
        ...(unclassified > 0.01 ? [{ id: "_unclassified", type: "unclassified", label: "ไม่ระบุที่มา", amount: unclassified }] : []),
    ];

    const positivePayments = payments.filter(p => p.amount >= 0);
    const refunds = payments.filter(p => p.amount < 0);

    function handleVoid() {
        setError(null);
        startTransition(async () => {
            const res = await voidInvoice(invoice.id, reason.trim() || undefined);
            if (!res.success) {
                setError(res.error || "ยกเลิกไม่สำเร็จ");
                return;
            }
            setShowVoidConfirm(false);
            router.refresh();
        });
    }

    function handleRefund() {
        setError(null);
        startTransition(async () => {
            const res = await refundInvoice(invoice.id, reason.trim() || undefined);
            if (!res.success) {
                setError(res.error || "คืนเงินไม่สำเร็จ");
                return;
            }
            setShowRefundConfirm(false);
            router.refresh();
        });
    }

    const isVoided = invoice.status === "voided" || invoice.status === "refunded";

    return (
        <div className="space-y-4 max-w-5xl mx-auto animate-fade-in pb-12">
            {/* Sub-header */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <Link href="/dashboard/finance">
                        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 h-9 text-slate-600 hover:text-slate-800">
                            <ArrowLeft className="h-4 w-4" /> กลับ
                        </Button>
                    </Link>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono text-sm font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">{invoice.id}</span>
                    <Badge className={`border-0 font-bold ${STATUS_COLOR[invoice.status] || STATUS_COLOR.draft}`}>
                        {STATUS_LABEL[invoice.status] || invoice.status}
                    </Badge>
                </div>
                <div className="flex items-center gap-2">
                    {/* รับชำระเพิ่ม — สำหรับ partial / issued ที่ยังค้างชำระ */}
                    {!isVoided && balance > 0 && (
                        <Button
                            size="sm"
                            onClick={() => { setAddPayAmount(balance.toString()); setShowAddPayment(true); }}
                            className="rounded-xl gap-1.5 h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20"
                        >
                            <RotateCcw className="h-3.5 w-3.5" /> รับชำระเพิ่ม (฿{balance.toLocaleString()})
                        </Button>
                    )}
                    {canManage && invoice.status === "paid" && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowRefundConfirm(true)}
                            className="rounded-xl gap-1.5 h-9 text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
                        >
                            <RotateCcw className="h-3.5 w-3.5" /> คืนเงิน
                        </Button>
                    )}
                    {canManage && !isVoided && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowVoidConfirm(true)}
                            className="rounded-xl gap-1.5 h-9 text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
                        >
                            <Ban className="h-3.5 w-3.5" /> ยกเลิกใบเสร็จรับเงิน
                        </Button>
                    )}
                    <Link href={`/print/invoice/${invoice.id}?noauto=1`} target="_blank">
                        <Button size="sm" className="rounded-xl gap-1.5 h-9 bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-500/20">
                            <Printer className="h-4 w-4" /> พิมพ์ใบเสร็จรับเงิน
                        </Button>
                    </Link>
                </div>
            </div>

            <InvoiceCampaign invId={invoice.id} initial={invoice.campaign ?? null} />

            {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {/* Status banner (voided/refunded) */}
            {invoice.status === "voided" && (
                <div className="rounded-xl bg-slate-100 border border-slate-300 px-4 py-3 flex items-center gap-3">
                    <Ban className="h-5 w-5 text-slate-600 shrink-0" />
                    <div>
                        <div className="font-bold text-slate-700">ใบเสร็จรับเงินนี้ถูกยกเลิก</div>
                        <div className="text-xs text-slate-500">ไม่มีผลทางการเงิน — ข้อมูลคงไว้สำหรับ audit</div>
                    </div>
                </div>
            )}
            {invoice.status === "refunded" && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 flex items-center gap-3">
                    <RotateCcw className="h-5 w-5 text-rose-600 shrink-0" />
                    <div>
                        <div className="font-bold text-rose-900">ใบเสร็จรับเงินนี้คืนเงินแล้ว</div>
                        <div className="text-xs text-rose-700">ยอดที่คืน: ฿{paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">

                {/* ═══ LEFT: Invoice content ═══ */}
                <div className="space-y-4">
                    {/* Patient info */}
                    <div className="gonix-card-premium p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <UserIcon className="h-4 w-4 text-blue-700" />
                            <h2 className="text-sm font-bold text-slate-800">ข้อมูลผู้ป่วย</h2>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">ชื่อ</div>
                                <div className="font-bold text-slate-800">{pt?.prefix}{pt?.first_name} {pt?.last_name}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">HN</div>
                                <div className="font-mono font-bold text-blue-700">{invoice.hn}</div>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">VN</div>
                                <Link href={`/dashboard/visits/${invoice.vn}`} className="font-mono font-bold text-blue-700 hover:underline">
                                    {invoice.vn}
                                </Link>
                            </div>
                            <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wider">เพศ · อายุ</div>
                                <div className="font-semibold text-slate-700">
                                    {pt?.gender === "M" ? "ชาย" : pt?.gender === "F" ? "หญิง" : "—"} · {calcAge(pt?.dob)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Line items */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200/60 bg-slate-50/40">
                            <Receipt className="h-4 w-4 text-blue-700" />
                            <h2 className="text-sm font-bold text-slate-800">รายการในใบเสร็จรับเงิน</h2>
                            <span className="text-xs text-slate-500">({items.length} รายการ)</span>
                        </div>

                        {items.length === 0 ? (
                            <div className="py-8 text-center text-sm text-slate-500">
                                ไม่มีรายการ — ใบเสร็จนี้บันทึกแต่ยอดรวม
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50/60">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            <th className="text-left px-4 py-2 w-20">ประเภท</th>
                                            <th className="text-left px-4 py-2">รายการ</th>
                                            <th className="text-right px-4 py-2 w-16">จำนวน</th>
                                            <th className="text-right px-4 py-2 w-28">ราคา/หน่วย</th>
                                            <th className="text-right px-4 py-2 w-28">รวม</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((it) => (
                                            <tr key={it.id} className="border-t border-slate-100">
                                                <td className="px-4 py-2.5">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${ITEM_TYPE_COLOR[it.item_type] || ITEM_TYPE_COLOR.other}`}>
                                                        {ITEM_TYPE_LABEL[it.item_type] || it.item_type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-800 font-medium">{it.item_name}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{Number(it.qty)}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">฿{Number(it.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-800">
                                                    ฿{Number(it.line_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Payment history */}
                    <div className="gonix-card-premium overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200/60 bg-slate-50/40">
                            <Banknote className="h-4 w-4 text-emerald-700" />
                            <h2 className="text-sm font-bold text-slate-800">ประวัติการชำระเงิน</h2>
                            <span className="text-xs text-slate-500">({payments.length} รายการ)</span>
                        </div>

                        {payments.length === 0 ? (
                            <div className="py-8 text-center text-sm text-slate-500">ยังไม่มีบันทึกการชำระเงิน</div>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {payments.map((p) => {
                                    const Icon = PAYMENT_METHOD_ICON[p.payment_method] || Banknote;
                                    const isRefund = p.amount < 0;
                                    return (
                                        <li key={p.id} className="px-5 py-3 flex items-center gap-3">
                                            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                                                isRefund ? "bg-rose-100" : "bg-emerald-100"
                                            }`}>
                                                <Icon className={`h-4 w-4 ${isRefund ? "text-rose-600" : "text-emerald-600"}`} strokeWidth={2.5} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-slate-800">
                                                    {isRefund ? "🔄 คืนเงิน" : PAYMENT_METHOD_LABEL[p.payment_method] || p.payment_method}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-0.5">
                                                    {new Date(p.paid_at).toLocaleString("th-TH", {
                                                        day: "numeric", month: "short", year: "2-digit",
                                                        hour: "2-digit", minute: "2-digit",
                                                    })}
                                                    {p.bank_name && <> · {p.bank_name}</>}
                                                    {p.transaction_ref && <> · <span className="font-mono">{p.transaction_ref}</span></>}
                                                </div>
                                            </div>
                                            <div className={`text-base font-black tabular-nums ${isRefund ? "text-rose-600" : "text-emerald-700"}`}>
                                                {isRefund ? "−" : "+"}฿{Math.abs(Number(p.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                {/* ═══ RIGHT: Summary sidebar ═══ */}
                <div className="lg:sticky lg:top-4 space-y-3">
                    <div className="gonix-card-premium p-4 space-y-2.5">
                        <div className="flex items-center gap-2 pb-2 border-b border-slate-200/60">
                            <FileText className="h-4 w-4 text-blue-700" />
                            <h2 className="text-sm font-bold text-slate-800">สรุปยอด</h2>
                        </div>

                        <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between text-slate-600">
                                <span>ยอดรวมก่อนหัก</span>
                                <span className="tabular-nums">฿{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            {discount > 0 && (
                                <>
                                    {shownDiscounts.map((d) => (
                                        <div key={d.id} className="flex justify-between text-red-600">
                                            <span className="truncate pr-2">
                                                ส่วนลด{d.label ? ` — ${d.label}` : ""}
                                                {d.type === "unclassified" && (
                                                    <span className="text-[10px] text-amber-600 ml-1">(ไม่ได้บันทึกที่มา)</span>
                                                )}
                                            </span>
                                            <span className="tabular-nums shrink-0">−฿{d.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    ))}
                                    {shownDiscounts.length > 1 && (
                                        <div className="flex justify-between text-red-600 font-bold border-t border-dashed border-red-200 pt-1">
                                            <span>รวมส่วนลด</span>
                                            <span className="tabular-nums">−฿{discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    )}
                                </>
                            )}
                            {tax > 0 && (
                                <div className="flex justify-between text-slate-600">
                                    <span>ภาษี</span>
                                    <span className="tabular-nums">+฿{tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                        </div>

                        <div className="pt-2.5 border-t-2 border-dashed border-slate-200 flex items-end justify-between">
                            <span className="text-sm font-bold text-slate-700">ยอดสุทธิ</span>
                            <span className="text-2xl font-black text-slate-800 tracking-tight tabular-nums">
                                ฿{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <div className="pt-2.5 border-t border-slate-200/60 space-y-1.5 text-sm">
                            <div className="flex justify-between text-emerald-700 font-semibold">
                                <span>ชำระแล้ว</span>
                                <span className="tabular-nums">฿{paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            {balance > 0 && (
                                <div className="flex justify-between text-amber-700 font-bold">
                                    <span>คงเหลือ</span>
                                    <span className="tabular-nums">฿{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                            {refunds.length > 0 && (
                                <div className="flex justify-between text-rose-600 font-semibold">
                                    <span>คืนเงิน</span>
                                    <span className="tabular-nums">−฿{Math.abs(refunds.reduce((s, r) => s + Number(r.amount), 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Meta */}
                    <div className="gonix-card-premium p-4 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-slate-500">วันที่ออก</span>
                            <span className="font-semibold text-slate-700 tabular-nums">
                                {new Date(invoice.invoice_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">สร้างเมื่อ</span>
                            <span className="font-semibold text-slate-700 tabular-nums">
                                {new Date(invoice.created_at).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                        </div>
                        {invoice.updated_at && invoice.updated_at !== invoice.created_at && (
                            <div className="flex justify-between">
                                <span className="text-slate-500">แก้ไขล่าสุด</span>
                                <span className="font-semibold text-slate-700 tabular-nums">
                                    {new Date(invoice.updated_at).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Audit Log — ประวัติการ void/refund */}
            {auditLogs.length > 0 && (
                <div className="gonix-card-premium overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 bg-amber-50/40 flex items-center gap-2">
                        <h2 className="text-sm font-bold text-amber-900">ประวัติการกระทำ (Audit Log)</h2>
                        <span className="text-xs text-amber-700">({auditLogs.length})</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {auditLogs.map(log => {
                            const performer = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;
                            const reason = log.new_data?.reason || "—";
                            const actionLabel = log.action === "void" ? "ยกเลิกใบเสร็จ" : log.action === "refund" ? "คืนเงิน" : log.action;
                            const actionColor = log.action === "void" ? "bg-slate-100 text-slate-800" : "bg-rose-100 text-rose-800";
                            return (
                                <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${actionColor} shrink-0`}>
                                        {actionLabel}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-slate-800">
                                            <span className="font-bold">{performer?.full_name || "Unknown"}</span>
                                            <span className="text-slate-400 ml-2 text-xs">({performer?.role || "?"})</span>
                                        </div>
                                        <div className="text-[13px] text-slate-700 mt-0.5">เหตุผล: {reason}</div>
                                    </div>
                                    <div className="text-[11px] text-slate-500 shrink-0 text-right">
                                        {new Date(log.performed_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Add Payment (รับชำระเพิ่ม สำหรับ partial/outstanding) */}
            {showAddPayment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                <RotateCcw className="h-5 w-5 text-emerald-700" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-slate-900">รับชำระเพิ่ม</h3>
                                <p className="text-xs text-slate-500">{invoice.id} · ค้างอีก ฿{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                            <button onClick={() => setShowAddPayment(false)} className="rounded-lg p-1 hover:bg-slate-100">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-700">ยอดที่รับ <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={addPayAmount}
                                        onChange={e => setAddPayAmount(e.target.value)}
                                        className="w-full pl-7 h-11 rounded-xl border border-slate-300 text-base font-bold tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                    />
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">฿</span>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-700">วิธีชำระ</label>
                                <select
                                    value={addPayMethod}
                                    onChange={e => setAddPayMethod(e.target.value as "cash" | "transfer" | "credit_card" | "qr_promptpay")}
                                    className="w-full h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                >
                                    <option value="cash">เงินสด</option>
                                    <option value="transfer">โอน</option>
                                    <option value="credit_card">บัตรเครดิต</option>
                                    <option value="qr_promptpay">QR / พร้อมเพย์</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">หมายเหตุ</label>
                            <input
                                type="text"
                                value={addPayNote}
                                onChange={e => setAddPayNote(e.target.value)}
                                placeholder="(ไม่บังคับ)"
                                className="w-full h-10 rounded-xl border border-slate-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                            />
                        </div>

                        {/* Quick amount buttons */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-slate-500 font-medium">ลัด:</span>
                            <button type="button" onClick={() => setAddPayAmount(balance.toString())}
                                className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">ค้างเต็ม ฿{balance.toLocaleString()}</button>
                            <button type="button" onClick={() => setAddPayAmount((balance / 2).toString())}
                                className="text-[11px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">ครึ่ง 50%</button>
                        </div>

                        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700 space-y-0.5">
                            <div className="flex justify-between"><span>ยอดเดิม</span><span className="font-bold tabular-nums">฿{paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                            <div className="flex justify-between"><span>+ รับเพิ่ม</span><span className="font-bold tabular-nums text-emerald-700">฿{(parseFloat(addPayAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                            <div className="flex justify-between pt-1 border-t border-slate-200"><span>= รวมจ่าย</span><span className="font-bold tabular-nums">฿{(paid + (parseFloat(addPayAmount) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                            <div className="flex justify-between"><span>คงค้าง</span><span className={`font-bold tabular-nums ${Math.max(0, total - paid - (parseFloat(addPayAmount) || 0)) === 0 ? "text-emerald-700" : "text-amber-700"}`}>฿{Math.max(0, total - paid - (parseFloat(addPayAmount) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => setShowAddPayment(false)} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                            <Button onClick={handleAddPayment} disabled={pending || !addPayAmount || parseFloat(addPayAmount) <= 0} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                                {pending ? "กำลังบันทึก..." : "บันทึกการรับเงิน"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Void confirm */}
            {showVoidConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                                <Ban className="h-5 w-5 text-slate-700" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-slate-900">ยกเลิกใบเสร็จรับเงิน?</h3>
                                <p className="text-xs text-slate-500">{invoice.id}</p>
                            </div>
                            <button onClick={() => setShowVoidConfirm(false)} className="rounded-lg p-1 hover:bg-slate-100">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>
                        <p className="text-sm text-slate-600">ใบเสร็จรับเงินจะถูก mark ว่ายกเลิก — ข้อมูลคงไว้สำหรับ audit แต่ไม่นับยอดในรายงาน</p>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">
                                เหตุผล <span className="text-red-500">*</span> <span className="text-slate-400 font-normal">(บังคับ — บันทึก audit log)</span>
                            </label>
                            <textarea
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="ระบุเหตุผลในการยกเลิก..."
                                rows={3}
                                className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${
                                    reason.trim().length >= 5 ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-200" : "border-slate-300 focus:border-slate-500 focus:ring-slate-200"
                                }`}
                            />
                            <div className="text-[11px] text-slate-500 text-right">{reason.trim().length} / 5+ ตัวอักษร</div>
                        </div>
                        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                            ℹ ระบบจะบันทึก: ผู้กระทำ · เวลา · เหตุผล — ในประวัติ audit log
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => setShowVoidConfirm(false)} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                            <Button onClick={handleVoid} disabled={pending || reason.trim().length < 5} className="rounded-xl bg-slate-700 hover:bg-slate-800 text-white disabled:opacity-50">
                                {pending ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Refund confirm */}
            {showRefundConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center">
                                <RotateCcw className="h-5 w-5 text-rose-700" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-slate-900">คืนเงินใบเสร็จรับเงิน?</h3>
                                <p className="text-xs text-slate-500">{invoice.id} · ยอด ฿{paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                            <button onClick={() => setShowRefundConfirm(false)} className="rounded-lg p-1 hover:bg-slate-100">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>
                        <p className="text-sm text-slate-600">บันทึก refund + เปลี่ยน status เป็น &quot;คืนเงินแล้ว&quot;</p>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">
                                เหตุผลคืนเงิน <span className="text-red-500">*</span> <span className="text-slate-400 font-normal">(บังคับ — บันทึก audit log)</span>
                            </label>
                            <textarea
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="เช่น คนไข้ขอยกเลิกบริการ / ระบบคิดเงินผิด"
                                rows={3}
                                className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${
                                    reason.trim().length >= 5 ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-200" : "border-slate-300 focus:border-rose-500 focus:ring-rose-200"
                                }`}
                            />
                            <div className="text-[11px] text-slate-500 text-right">{reason.trim().length} / 5+ ตัวอักษร</div>
                        </div>
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                            ⚠ ระบบจะบันทึก payment log ยอดลบ + audit log (ผู้กระทำ + เหตุผล)
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => setShowRefundConfirm(false)} disabled={pending} className="rounded-xl">ยกเลิก</Button>
                            <Button onClick={handleRefund} disabled={pending || reason.trim().length < 5} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50">
                                {pending ? "กำลังคืนเงิน..." : "ยืนยันคืนเงิน"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
