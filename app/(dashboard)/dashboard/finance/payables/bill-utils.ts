import { toast } from "@/lib/toast";
import { getBillAttachmentUrl, type BillAttachment, type BillRow } from "@/lib/actions/payables";
import type { BillType } from "@/lib/payables";

export const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const thDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
export const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
export const r2 = (n: number) => Math.round(n * 100) / 100;

export type FormLine = { description: string; category: string; qty: string; unit_price: string };
export type BillForm = {
    id?: string; bill_type: BillType; vendor: string; invoice_no: string; bill_date: string; due_date: string; category: string; in_pl: boolean; note: string;
    doc_type: string; vat_mode: "none" | "excl" | "incl"; wht_pct: number; original_filed: boolean; original_ref: string; files: File[]; attachments: BillAttachment[];
    lines: FormLine[]; discount: string;
    vendor_tax_id?: string | null; vendor_branch?: string | null; vendor_address?: string | null;
    scan?: { confidence: string; warnings: string[]; checkTotal: number | null } | null;
    autoScan?: boolean;
};
export const emptyLine = (category = "other"): FormLine => ({ description: "", category, qty: "1", unit_price: "" });

/** รวมเป็นเงิน → ส่วนลด → หลังหักส่วนลด → VAT (แยก/รวม) → รวมทั้งสิ้น → หัก ณ ที่จ่าย (ตรงกับ server saveBill) */
export function calcBill(f: Pick<BillForm, "lines" | "discount" | "vat_mode" | "wht_pct">) {
    const gross = r2(f.lines.reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0));
    const discount = Math.max(0, r2(Number(f.discount) || 0));
    const after = r2(gross - discount);
    const subtotal = f.vat_mode === "incl" ? r2(after / 1.07) : after;
    const vat = f.vat_mode === "excl" ? r2(after * 0.07) : f.vat_mode === "incl" ? r2(after - subtotal) : 0;
    const total = r2(subtotal + vat), wht = r2(subtotal * (f.wht_pct || 0) / 100);
    return { gross, discount, after, subtotal, vat, total, wht, net: r2(total - wht) };
}

/** บิลเดิม → ฟอร์ม (บิลก่อน mig 163 ไม่มีรายการ → 1 บรรทัดจากยอด) */
export function billToForm(b: BillRow): BillForm {
    const lines: FormLine[] = b.lines.length
        ? b.lines.map(l => ({ description: l.description, category: l.category || b.category || "other", qty: String(l.qty ?? 1), unit_price: String(l.unit_price ?? "") }))
        : [{ description: b.note || b.vendor, category: b.category || "other", qty: "1", unit_price: String(r2(b.vat_mode === "excl" ? b.subtotal : b.amount)) }];
    return {
        id: b.id, bill_type: b.bill_type, vendor: b.vendor, invoice_no: b.invoice_no || "", bill_date: b.bill_date, due_date: b.due_date,
        category: b.category || "other", in_pl: b.in_pl, note: b.lines.length ? (b.note || "") : "", doc_type: b.doc_type, vat_mode: b.vat_mode, wht_pct: b.wht_pct,
        original_filed: b.original_filed, original_ref: b.original_ref || "", files: [], attachments: b.attachments, lines, discount: b.discount ? String(b.discount) : "",
    };
}

/** ย่อรูปก่อนอัปโหลด (ด้านยาวสุด 2000px, JPEG 0.82) — PDF/ไฟล์เล็กส่งตามเดิม */
export async function shrinkImage(file: File): Promise<File> {
    if (!file.type.startsWith("image/") || file.type === "image/heic" || file.size < 900 * 1024) return file;
    try {
        const bmp = await createImageBitmap(file);
        const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
        const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
        cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
        const blob = await new Promise<Blob | null>(res => cv.toBlob(res, "image/jpeg", 0.82));
        return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    } catch { return file; }
}

export async function openAttachment(path: string) {
    const r = await getBillAttachmentUrl(path);
    if (r.ok && r.url) window.open(r.url, "_blank"); else toast.error(r.error || "เปิดไฟล์ไม่ได้");
}
