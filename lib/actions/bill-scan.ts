"use server";

import { createClient } from "@/lib/supabase/server";

// สแกนบิล/ใบกำกับภาษีด้วย AI (Claude vision) → กรอกฟอร์มบิลค้างจ่ายให้ · คนตรวจก่อนบันทึกเสมอ
// ต้องตั้ง env: ANTHROPIC_API_KEY (ไม่บังคับ: BILL_SCAN_MODEL — ค่าเริ่มต้น claude-sonnet-5)

export interface ScannedBill {
    doc_type: "tax_invoice" | "receipt" | "invoice" | "cash_bill" | "other";
    invoice_no: string | null;
    bill_date: string | null;          // YYYY-MM-DD (ค.ศ.)
    due_date: string | null;
    vendor_name: string | null;
    vendor_tax_id: string | null;
    vendor_branch: string | null;
    vendor_address: string | null;
    vat_mode: "none" | "excl" | "incl";
    subtotal: number | null;
    vat_amount: number | null;
    total: number | null;
    wht_pct: number | null;
    bill_type: "lab" | "supplier" | "expense";
    expense_category: string | null;
    items: { description: string; qty: number | null; amount: number | null }[];
    confidence: "high" | "medium" | "low";
    warnings: string[];
}

const MIME_OK = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const MAX = 10 * 1024 * 1024;

const SCHEMA = {
    type: "object",
    properties: {
        doc_type: { type: "string", enum: ["tax_invoice", "receipt", "invoice", "cash_bill", "other"], description: "ใบกำกับภาษี=tax_invoice (รวมใบกำกับภาษี/ใบเสร็จ), ใบเสร็จรับเงิน=receipt, ใบแจ้งหนี้/ใบวางบิล=invoice, บิลเงินสด=cash_bill" },
        invoice_no: { type: ["string", "null"] },
        bill_date: { type: ["string", "null"], description: "YYYY-MM-DD ปี ค.ศ. (แปลง พ.ศ. − 543)" },
        due_date: { type: ["string", "null"], description: "วันครบกำหนดชำระ ถ้ามีระบุ YYYY-MM-DD ค.ศ." },
        vendor_name: { type: ["string", "null"], description: "ชื่อผู้ขาย/ผู้ออกเอกสาร (ไม่ใช่ชื่อคลินิกผู้ซื้อ)" },
        vendor_tax_id: { type: ["string", "null"], description: "เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ขาย ตัวเลขล้วน" },
        vendor_branch: { type: ["string", "null"], description: "สำนักงานใหญ่ หรือ สาขาที่ xxxxx" },
        vendor_address: { type: ["string", "null"] },
        vat_mode: { type: "string", enum: ["none", "excl", "incl"], description: "none=ไม่มี VAT, excl=แสดงยอดก่อน VAT แล้วบวก VAT, incl=ราคารวม VAT แล้ว" },
        subtotal: { type: ["number", "null"], description: "ยอดก่อน VAT (หลังหักส่วนลด)" },
        vat_amount: { type: ["number", "null"] },
        total: { type: ["number", "null"], description: "ยอดรวมทั้งสิ้น" },
        wht_pct: { type: ["number", "null"], description: "ถ้าเอกสารระบุหัก ณ ที่จ่าย ใส่ % (1/2/3/5) ไม่ระบุ = null" },
        bill_type: { type: "string", enum: ["lab", "supplier", "expense"], description: "lab=แล็บตรวจวิเคราะห์/ส่งตรวจ, supplier=ยา เวชภัณฑ์ เครื่องมือแพทย์ สินค้าเข้าสต๊อก, expense=ค่าใช้จ่ายอื่น" },
        expense_category: { type: ["string", "null"], enum: ["utility", "rent", "maintenance", "office", "marketing", "professional", "license", "cleaning", "other", null] },
        items: { type: "array", items: { type: "object", properties: { description: { type: "string" }, qty: { type: ["number", "null"] }, amount: { type: ["number", "null"] } }, required: ["description"] } },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        warnings: { type: "array", items: { type: "string" }, description: "สิ่งที่อ่านไม่ชัด/ไม่แน่ใจ เป็นภาษาไทยสั้นๆ" },
    },
    required: ["doc_type", "vat_mode", "bill_type", "items", "confidence", "warnings"],
};

export async function scanBillDocument(formData: FormData): Promise<{ ok: boolean; data?: ScannedBill; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, error: "Unauthorized" };
        const { data: profile } = await supabase.from("profiles").select("clinic_id, role").eq("id", user.id).single();
        if (!profile?.clinic_id || !["owner", "admin"].includes(String(profile.role))) return { ok: false, error: "เฉพาะเจ้าของ/ผู้จัดการ" };
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) return { ok: false, error: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ที่ Vercel" };

        const file = formData.get("file") as File | null;
        if (!file || file.size === 0) return { ok: false, error: "ไม่พบไฟล์" };
        if (file.size > MAX) return { ok: false, error: "ไฟล์ใหญ่เกิน 10MB" };
        const type = file.type === "image/jpg" ? "image/jpeg" : file.type;
        if (!MIME_OK.has(type)) return { ok: false, error: "รองรับ JPG/PNG/WEBP/PDF (รูป HEIC ให้ถ่ายใหม่เป็น JPG)" };
        const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");

        const { data: tenant } = await supabase.from("tenants").select("clinic_name").eq("id", profile.clinic_id).maybeSingle();
        const clinicName = (tenant?.clinic_name as string) || "คลินิก";
        const today = new Date().toISOString().slice(0, 10);

        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
                model: process.env.BILL_SCAN_MODEL || "claude-sonnet-5",
                max_tokens: 2000,
                tools: [{ name: "record_bill", description: "บันทึกข้อมูลที่อ่านได้จากเอกสาร", input_schema: SCHEMA }],
                tool_choice: { type: "tool", name: "record_bill" },
                messages: [{
                    role: "user",
                    content: [
                        type === "application/pdf"
                            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
                            : { type: "image", source: { type: "base64", media_type: type, data: b64 } },
                        { type: "text", text:
                            `อ่านเอกสารค่าใช้จ่ายนี้ (ภาษาไทย/อังกฤษ) ที่ "${clinicName}" เป็นผู้ซื้อ/ผู้จ่าย แล้วเรียก record_bill\n` +
                            `- ผู้ขาย = ผู้ออกเอกสาร ไม่ใช่ ${clinicName}\n- วันที่ใช้ ค.ศ. (วันนี้ ${today}) · ตัวเลขเป็นบาท ไม่มีคอมม่า\n` +
                            `- ช่องไหนอ่านไม่ได้ให้ null และเขียนใน warnings · ห้ามเดา` },
                    ],
                }],
            }),
        });
        if (!res.ok) {
            const t = await res.text();
            return { ok: false, error: `AI อ่านไม่สำเร็จ (${res.status}) ${t.slice(0, 160)}` };
        }
        const json = await res.json() as { content?: { type: string; name?: string; input?: unknown }[] };
        const tool = json.content?.find(c => c.type === "tool_use" && c.name === "record_bill");
        if (!tool?.input) return { ok: false, error: "AI ไม่ได้ส่งข้อมูลกลับ" };
        const d = tool.input as ScannedBill;
        const iso = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
        return { ok: true, data: {
            ...d,
            bill_date: iso(d.bill_date), due_date: iso(d.due_date),
            vendor_tax_id: d.vendor_tax_id ? d.vendor_tax_id.replace(/\D/g, "") || null : null,
            subtotal: num(d.subtotal), vat_amount: num(d.vat_amount), total: num(d.total), wht_pct: num(d.wht_pct),
            items: Array.isArray(d.items) ? d.items : [], warnings: Array.isArray(d.warnings) ? d.warnings : [],
        } };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "สแกนไม่สำเร็จ" };
    }
}
