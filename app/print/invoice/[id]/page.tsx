import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PrintTrigger from "./print-trigger";

export const dynamic = "force-dynamic";

/** ตั้งชื่อ tab/document → browser ใช้เป็น filename default ตอนบันทึก PDF
 *  รูปแบบ: INV-052478-0006_จำเนียร_เตรียม
 */
export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
    const { id } = await params;
    try {
        const supabase = await createClient();
        const { data } = await supabase
            .from("invoice_headers")
            .select("patients!inner(first_name, last_name)")
            .eq("id", id)
            .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pt = data ? (Array.isArray((data as any).patients) ? (data as any).patients[0] : (data as any).patients) : null;
        if (pt) {
            const name = `${pt.first_name || ""}_${pt.last_name || ""}`.trim().replace(/\s+/g, "_");
            return { title: `${id}_${name}` };
        }
    } catch {
        // fallback to id only
    }
    return { title: id };
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
    cash: "เงินสด",
    transfer: "โอนเงิน / QR",
    credit_card: "บัตรเครดิต",
    debit_card: "บัตรเดบิต",
};

const ITEM_TYPE_LABEL: Record<string, string> = {
    doctor_fee: "ค่าตรวจ",
    drug: "ค่ายา",
    lab: "ค่าตรวจห้องปฏิบัติการ",
    procedure: "ค่าหัตถการ",
    service: "ค่าบริการ",
    supply: "ค่าวัสดุ",
    lab_external: "ค่าตรวจห้องปฏิบัติการภายนอก",
    other: "อื่นๆ",
};

function thaiDate(dateStr: string): string {
    const d = new Date(dateStr);
    const day = d.getDate();
    const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
        "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function thaiTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น.";
}

/** Format phone number: รองรับเบอร์เดียวหรือหลายเบอร์คั่นด้วย / หรือ ,
 *  Mobile  10 digits: 0xx-xxx-xxxx  (เช่น 0939874559 → 093-987-4559)
 *  Landline 9 digits: 0xx-xxxxxx    (เช่น 053111215  → 053-111215)
 */
function formatPhone(raw: string | null | undefined): string {
    if (!raw) return "";
    const parts = raw.split(/[/,]/).map(s => s.trim()).filter(Boolean);
    return parts.map(p => {
        const digits = p.replace(/\D/g, "");
        if (digits.length === 10) {
            // Mobile: 0xx-xxx-xxxx
            return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
        }
        if (digits.length === 9) {
            // Landline: 0xx-xxxxxx
            return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        }
        // Already formatted or other length — return as-is
        return p;
    }).join(" / ");
}

function bahtText(n: number): string {
    const units = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
    const nums = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
    if (n === 0) return "ศูนย์บาทถ้วน";
    const intPart = Math.floor(n);
    const decPart = Math.round((n - intPart) * 100);

    function readInt(num: number): string {
        if (num === 0) return "";
        let result = "";
        const s = num.toString();
        const len = s.length;
        for (let i = 0; i < len; i++) {
            const digit = parseInt(s[i]);
            const pos = len - i - 1;
            if (digit === 0) continue;
            if (pos === 0 && digit === 1 && len > 1) result += "เอ็ด";
            else if (pos === 1 && digit === 1) result += "สิบ";
            else if (pos === 1 && digit === 2) result += "ยี่สิบ";
            else if (pos === 1) result += nums[digit] + "สิบ";
            else result += nums[digit] + units[pos];
        }
        return result;
    }

    let txt = readInt(intPart) + "บาท";
    if (decPart === 0) txt += "ถ้วน";
    else txt += readInt(decPart) + "สตางค์";
    return txt;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ReceiptCopyProps {
    copyLabel: string;
    copyLabelEn: string;
    isOriginal: boolean;
    inv: any;
    items: any[];
    pt: any;
    clinic: any;
    branch: any;
    issuedByName: string;
    positivePayments: any[];
    refunds: any[];
    subtotal: number;
    discount: number;
    discountLines: any[];
    tax: number;
    total: number;
    balance: number;
    isVoided: boolean;
    isRefunded: boolean;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function ReceiptCopy({
    copyLabel, copyLabelEn, isOriginal,
    inv, items, pt, clinic, branch, issuedByName,
    positivePayments, refunds,
    subtotal, discount, discountLines, tax, total, balance,
    isVoided, isRefunded,
}: ReceiptCopyProps) {
    return (
        <div className="receipt-half relative px-6 py-4 text-[10.5px] leading-snug text-slate-900 font-sans flex flex-col gap-2">

            {/* Watermark (voided/refunded) */}
            {(isVoided || isRefunded) && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className={`text-[60px] font-black opacity-15 rotate-[-25deg] tracking-widest ${
                        isVoided ? "text-slate-600" : "text-rose-600"
                    }`}>
                        {isVoided ? "VOIDED" : "REFUNDED"}
                    </div>
                </div>
            )}

            {/* Header — match OPD Card style + Title + Copy badge มุมขวา */}
            <div style={{ borderTop: "3px double #000", borderBottom: "2px solid #000" }} className="py-1 px-1">
                <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/clinic-logo.png" alt="Clinic" className="h-24 w-24 object-contain shrink-0" />
                    <div className="leading-tight flex-1 min-w-0">
                        <div className="text-[16px] font-black text-black tracking-tight">
                            บริษัท ธนเวช เมดิคอล จำกัด <span className="text-[12px] font-semibold text-slate-700">({branch?.branch_name || "สำนักงานใหญ่"})</span>
                        </div>
                        <div className="text-[10px] text-slate-700 mt-1.5 leading-relaxed">
                            {branch?.address || "108/27 หมู่ 1 ต.สันพระเนตร อ.สันทราย จ.เชียงใหม่ 50210"}
                        </div>
                        <div className="text-[10px] text-slate-700">
                            เลขประจำตัวผู้เสียภาษี: <span className="font-mono">{clinic?.tax_id || "0505569001439"}</span>
                        </div>
                        <div className="text-[10px] text-slate-700">
                            โทรศัพท์ {formatPhone(branch?.phone) || "093-987-4559 / 053-111215"}
                        </div>
                    </div>
                    {/* Title + Copy badge — มุมขวาบน */}
                    <div className="text-right shrink-0 pl-2 flex flex-col items-end gap-1.5">
                        <div>
                            <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-600">
                                Receipt
                            </div>
                            <h1 className="text-[18px] font-black tracking-tight text-black leading-tight mt-0.5">
                                ใบเสร็จรับเงิน
                            </h1>
                        </div>
                        <div className={`text-[10px] font-bold px-2.5 py-0.5 rounded border-2 ${
                            isOriginal
                                ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                                : "bg-amber-50 border-amber-500 text-amber-700"
                        }`}>
                            {copyLabel} · {copyLabelEn}
                        </div>
                    </div>
                </div>
            </div>

            {/* Info — 2 col */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-1">
                <div className="space-y-1">
                    <div className="flex gap-2">
                        <span className="text-slate-500 w-14 shrink-0">เลขที่:</span>
                        <span className="font-mono font-bold">{inv.id}</span>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-slate-500 w-14 shrink-0">วันที่:</span>
                        <span>{thaiDate(inv.invoice_date || inv.created_at)} · {thaiTime(inv.created_at)}</span>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-slate-500 w-14 shrink-0">VN:</span>
                        <span className="font-mono">{inv.vn}</span>
                    </div>
                </div>
                <div className="space-y-1">
                    <div className="flex gap-2">
                        <span className="text-slate-500 w-14 shrink-0">ผู้รับ:</span>
                        <span className="font-semibold">{pt?.prefix}{pt?.first_name} {pt?.last_name}</span>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-slate-500 w-14 shrink-0">HN:</span>
                        <span className="font-mono">{inv.hn}</span>
                    </div>
                    {(pt?.phone || pt?.thai_id_card) && (
                        <div className="flex gap-2">
                            <span className="text-slate-500 w-14 shrink-0">{pt.thai_id_card ? "เลขบัตร:" : "โทร:"}</span>
                            <span className="font-mono">{pt.thai_id_card || pt.phone}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Items table */}
            <table className="w-full border-collapse text-[10.5px] mt-1">
                <thead>
                    <tr className="border-y border-slate-800">
                        <th className="text-center font-bold py-1 px-1 w-6">#</th>
                        <th className="text-left font-bold py-1 px-1.5">รายการ</th>
                        <th className="text-center font-bold py-1 px-1 w-8">จน.</th>
                        <th className="text-right font-bold py-1 px-1.5 w-16">ราคา/หน่วย</th>
                        <th className="text-right font-bold py-1 px-1.5 w-20">จำนวนเงิน</th>
                    </tr>
                </thead>
                <tbody>
                    {items.length === 0 ? (
                        <tr><td colSpan={5} className="text-center text-slate-400 py-3 italic">ไม่มีรายการ</td></tr>
                    ) : items.map((it, idx) => (
                        <tr key={it.id} className="border-b border-slate-100">
                            <td className="text-center py-1 px-1 tabular-nums">{idx + 1}</td>
                            <td className="py-1 px-1.5">
                                {it.item_name}
                                <span className="text-[10px] text-slate-500 ml-1">({ITEM_TYPE_LABEL[it.item_type] || it.item_type})</span>
                            </td>
                            <td className="text-center py-1 px-1 tabular-nums">{Number(it.qty)}</td>
                            <td className="text-right py-1 px-1.5 tabular-nums">{Number(it.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="text-right py-1 px-1.5 tabular-nums font-semibold">{Number(it.line_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-800">
                    <tr>
                        <td colSpan={4} className="text-right py-0.5 px-1.5 font-semibold">ยอดรวม</td>
                        <td className="text-right py-0.5 px-1.5 tabular-nums font-semibold">{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                    {/* ส่วนลดแยกบรรทัดตามที่มา — คนไข้/บัญชีเห็นว่าแต่ละก้อนมาจากไหน */}
                    {discountLines.length > 0 ? discountLines.map((d: any) => (
                        <tr key={d.id}>
                            <td colSpan={4} className="text-right py-0.5 px-1.5 text-slate-700">
                                ส่วนลด — {d.label}
                            </td>
                            <td className="text-right py-0.5 px-1.5 tabular-nums text-red-600">−{Number(d.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                    )) : discount > 0 && (
                        <tr>
                            <td colSpan={4} className="text-right py-0.5 px-1.5 text-slate-700">หักส่วนลด</td>
                            <td className="text-right py-0.5 px-1.5 tabular-nums text-red-600">−{discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                    )}
                    {discountLines.length > 0 && (
                        <tr>
                            <td colSpan={4} className="text-right py-0.5 px-1.5 font-semibold text-slate-700">รวมส่วนลด</td>
                            <td className="text-right py-0.5 px-1.5 tabular-nums font-semibold text-red-600">−{discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                    )}
                    {tax > 0 && (
                        <tr>
                            <td colSpan={4} className="text-right py-0.5 px-1.5 text-slate-700">ภาษีมูลค่าเพิ่ม (VAT)</td>
                            <td className="text-right py-0.5 px-1.5 tabular-nums">+{tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                    )}
                    <tr className="border-t border-slate-300 bg-slate-50">
                        <td colSpan={4} className="py-1 px-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-black text-[12px]">ยอดสุทธิ</span>
                                <span className="text-[9.5px] text-slate-600 italic">
                                    (ตัวอักษร: <span className="font-bold text-slate-800 not-italic">{bahtText(total)}</span>)
                                </span>
                            </div>
                        </td>
                        <td className="text-right py-1 px-1.5 tabular-nums font-black text-[13px] align-middle">฿{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                </tfoot>
            </table>

            {/* Payment info */}
            {(positivePayments.length > 0 || refunds.length > 0 || balance > 0) && (
                <div className="px-1 space-y-0.5">
                    {positivePayments.length > 0 && (
                        <div className="text-[9.5px]">
                            <span className="font-semibold text-slate-700">ชำระโดย: </span>
                            {positivePayments.map((p, i) => (
                                <span key={i} className="mr-2">
                                    {PAYMENT_METHOD_LABEL[p.payment_method] || p.payment_method}
                                    {" "}฿{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                            ))}
                        </div>
                    )}
                    {refunds.length > 0 && (
                        <div className="text-[9.5px] text-rose-700">
                            <span className="font-semibold">⚠ คืนเงิน: </span>
                            ฿{Math.abs(refunds.reduce((s, r) => s + Number(r.amount), 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    )}
                    {balance > 0 && (
                        <div className="text-[9.5px] text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-0.5 inline-block">
                            ⚠ ค้างชำระ ฿{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    )}
                </div>
            )}

            {/* Spacer pushes signatures to bottom */}
            <div className="flex-1" />

            {/* Signatures + footer (bottom-anchored) */}
            <div>
                <div className="grid grid-cols-2 gap-8 px-2">
                    <div className="text-center">
                        <div className="border-t border-slate-700 pt-1 text-[9.5px]">
                            <div className="font-semibold">ผู้รับเงิน</div>
                            <div className="text-slate-600 text-[10px] mt-0.5">{issuedByName}</div>
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="border-t border-slate-700 pt-1 text-[9.5px]">
                            <div className="font-semibold">ผู้รับใบเสร็จ</div>
                            <div className="text-slate-600 text-[10px] mt-0.5">—</div>
                        </div>
                    </div>
                </div>

                <div className="text-center text-[10px] text-slate-500 mt-1.5 pt-1 border-t border-dashed border-slate-300">
                    ขอบคุณที่ใช้บริการ
                </div>
            </div>
        </div>
    );
}

export default async function InvoicePrintPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const supabase = await createClient();

    const [invRes, itemsRes, paymentsRes] = await Promise.all([
        supabase.from("invoice_headers").select(`
            id, vn, hn, invoice_date, subtotal, discount_amount, tax_amount,
            total_amount, paid_amount, balance_due, status, created_at,
            clinic_id,
            patients!inner(prefix, first_name, last_name, phone, thai_id_card, address_detail),
            issued_by:staff!invoice_headers_issued_by_fkey(profiles(full_name))
        `).eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("id, item_type, item_name, qty, unit_price, line_total").eq("inv_id", id).order("id"),
        supabase.from("payment_logs").select("payment_method, amount, transaction_ref, bank_name, created_at").eq("inv_id", id).order("created_at"),
    ]);

    // ส่วนลดแยกตามที่มา (mig 107) — ถ้าไม่มีข้อมูล (บิลเก่า) จะ fallback เป็นบรรทัดรวมเดิม
    const { data: discRows } = await supabase.from("invoice_discounts")
        .select("id, discount_type, discount_source, amount, campaigns(code, name)")
        .eq("inv_id", id).order("created_at");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = invRes.data as any;
    if (!inv) notFound();

    const items = itemsRes.data || [];
    const payments = paymentsRes.data || [];
    const positivePayments = payments.filter(p => Number(p.amount) >= 0);
    const refunds = payments.filter(p => Number(p.amount) < 0);

    const pt = Array.isArray(inv.patients) ? inv.patients[0] : inv.patients;
    const issuedBy = Array.isArray(inv.issued_by) ? inv.issued_by[0] : inv.issued_by;
    const issuedByName = issuedBy?.profiles?.full_name || issuedBy?.profiles?.[0]?.full_name || "—";

    const { data: clinic } = await supabase
        .from("tenants").select("clinic_name, clinic_name_en, tax_id, logo_url")
        .eq("id", inv.clinic_id).maybeSingle();

    const { data: branch } = await supabase
        .from("branches").select("branch_name, address, phone")
        .eq("clinic_id", inv.clinic_id).eq("is_active", true)
        .order("sort_order").limit(1).maybeSingle();

    const subtotal = Number(inv.subtotal || 0);
    const discount = Number(inv.discount_amount || 0);
    const tax = Number(inv.tax_amount || 0);
    const total = Number(inv.total_amount || 0);
    const balance = Number(inv.balance_due || 0);

    const isVoided = inv.status === "voided";
    const isRefunded = inv.status === "refunded";

    const KIND_LABEL: Record<string, string> = {
        campaign: "โปรโมชัน", manual: "ส่วนลดพิเศษ",
        package: "ส่วนลดคอส", staff_benefit: "สวัสดิการพนักงาน",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const discountLines = ((discRows || []) as any[]).map((d) => {
        const camp = Array.isArray(d.campaigns) ? d.campaigns[0] : d.campaigns;
        const label = camp ? `${camp.code} (${camp.name})`
            : d.discount_source || KIND_LABEL[d.discount_type] || "ส่วนลด";
        return { id: d.id, label, amount: Number(d.amount || 0) };
    }).filter((d) => d.amount > 0);

    const commonProps = {
        inv, items, pt, clinic, branch, issuedByName,
        positivePayments, refunds,
        subtotal, discount, discountLines, tax, total, balance,
        isVoided, isRefunded,
    };

    return (
        <div className="min-h-screen bg-slate-100 print:bg-white print:min-h-0">
            <PrintTrigger />

            {/* Action bar — hide on print */}
            <div className="print:hidden bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
                <div>
                    <h1 className="text-base font-bold text-slate-800">ตัวอย่างใบเสร็จรับเงิน</h1>
                    <p className="text-xs text-slate-500">{inv.id} · A4 พิมพ์ออกมา 2 ส่วน (ต้นฉบับ + สำเนา)</p>
                </div>
                <button
                    className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold flex items-center gap-2"
                    id="print-now-btn"
                >
                    🖨 พิมพ์ / บันทึก PDF
                </button>
            </div>

            {/* A4 paper — 2 receipts stacked */}
            <div className="receipt-page mx-auto my-6 print:my-0 bg-white shadow-lg print:shadow-none flex flex-col">
                {/* Original (top half) */}
                <ReceiptCopy
                    {...commonProps}
                    copyLabel="ต้นฉบับ"
                    copyLabelEn="ORIGINAL"
                    isOriginal={true}
                />

                {/* Cut line */}
                <div className="receipt-cut-line"></div>

                {/* Copy (bottom half) */}
                <ReceiptCopy
                    {...commonProps}
                    copyLabel="สำเนา"
                    copyLabelEn="COPY"
                    isOriginal={false}
                />
            </div>

            {/* Print CSS — A4 portrait, 2 halves */}
            <style>{`
                .receipt-page {
                    width: 210mm;
                    min-height: 297mm;
                }
                .receipt-half {
                    height: 145mm;          /* ~A5 landscape (half A4 portrait) */
                    box-sizing: border-box;
                }
                .receipt-cut-line {
                    height: 0;
                    border-top: 1px dashed #999;
                    margin: 0 12mm;
                    position: relative;
                }
                .receipt-cut-line::before {
                    content: "✂ ตัดตามรอยปะ";
                    position: absolute;
                    top: -8px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: white;
                    padding: 0 8px;
                    font-size: 9px;
                    color: #999;
                }
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 6mm;
                    }
                    body {
                        background: white !important;
                    }
                    .receipt-page {
                        margin: 0 !important;
                        box-shadow: none !important;
                        min-height: 0 !important;
                    }
                    .receipt-cut-line::before {
                        background: transparent;
                    }
                }
            `}</style>
        </div>
    );
}
