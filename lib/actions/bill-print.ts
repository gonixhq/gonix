"use server";

import { createClient } from "@/lib/supabase/server";

// ข้อมูลพิมพ์ใบสำคัญจ่าย / 50 ทวิ จากบิลค่าใช้จ่าย (RLS จำกัดคลินิกของผู้ใช้)
export interface BillPrintData {
    clinic: { name: string; name_en: string | null; company: string | null; tax_id: string | null; address: string | null; phone: string | null; license: string | null };
    bill: {
        id: string; vendor: string; invoice_no: string | null; bill_date: string; due_date: string; doc_type: string; bill_type: string; category: string | null;
        lines: { description: string; qty: number; unit_price: number; amount: number }[]; note: string | null;
        discount: number; subtotal: number; vat_amount: number; vat_mode: string; amount: number; wht_pct: number; wht_amount: number; net_pay: number;
        paid_at: string | null; paid_method: string | null; paid_ref: string | null;
    };
    vendor: { name: string; tax_id: string | null; address: string | null; branch: string | null; phone: string | null; isPerson: boolean };
    preparedBy: string | null;
}

export async function getBillPrintData(id: string): Promise<BillPrintData | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from("profiles").select("clinic_id, full_name").eq("id", user.id).single();
    if (!profile?.clinic_id) return null;
    const { data: b } = await supabase.from("vendor_bills").select("*").eq("id", id).eq("clinic_id", profile.clinic_id).maybeSingle();
    if (!b) return null;
    const [{ data: t }, { data: v }, { data: creator }] = await Promise.all([
        supabase.from("tenants").select("clinic_name, clinic_name_en, company_name, tax_id, address_detail, phone, license_number").eq("id", profile.clinic_id).maybeSingle(),
        supabase.from("vendors").select("name, tax_id, address, branch, phone").eq("clinic_id", profile.clinic_id).eq("name", b.vendor).maybeSingle(),
        b.created_by ? supabase.from("profiles").select("full_name").eq("id", b.created_by).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const n = (x: unknown) => Number(x || 0);
    const rawLines = Array.isArray(b.lines) ? b.lines as { description?: string; qty?: number; unit_price?: number; amount?: number }[] : [];
    const lines = rawLines.length
        ? rawLines.map(l => ({ description: l.description || "-", qty: n(l.qty) || 1, unit_price: n(l.unit_price), amount: n(l.amount ?? n(l.qty) * n(l.unit_price)) }))
        : [{ description: b.note || "ตามเอกสารแนบ", qty: 1, unit_price: n(b.vat_mode === "excl" ? b.subtotal : b.amount), amount: n(b.vat_mode === "excl" ? b.subtotal : b.amount) }];
    const taxId = (v?.tax_id as string) || null;
    return {
        clinic: {
            name: (t?.clinic_name as string) || "คลินิก", name_en: (t?.clinic_name_en as string) || null, company: (t?.company_name as string) || null,
            tax_id: (t?.tax_id as string) || null, address: (t?.address_detail as string) || null, phone: (t?.phone as string) || null, license: (t?.license_number as string) || null,
        },
        bill: {
            id: b.id, vendor: b.vendor, invoice_no: b.invoice_no || null, bill_date: b.bill_date, due_date: b.due_date, doc_type: b.doc_type || "invoice",
            bill_type: b.bill_type, category: b.category || null, lines, note: rawLines.length ? (b.note || null) : null,
            discount: n(b.discount), subtotal: n(b.subtotal ?? b.amount), vat_amount: n(b.vat_amount), vat_mode: b.vat_mode || "none", amount: n(b.amount),
            wht_pct: n(b.wht_pct), wht_amount: n(b.wht_amount), net_pay: Math.round((n(b.amount) - n(b.wht_amount)) * 100) / 100,
            paid_at: b.paid_at || null, paid_method: b.paid_method || null, paid_ref: b.paid_ref || null,
        },
        vendor: {
            name: (v?.name as string) || b.vendor, tax_id: taxId, address: (v?.address as string) || null, branch: (v?.branch as string) || null, phone: (v?.phone as string) || null,
            // เลขนิติบุคคลขึ้นต้นด้วย 0 · บัตรประชาชนขึ้นต้น 1-8 · ไม่มีเลข = ถือเป็นบุคคลธรรมดา
            isPerson: !taxId || !taxId.startsWith("0"),
        },
        preparedBy: (creator as { full_name?: string } | null)?.full_name || null,
    };
}
