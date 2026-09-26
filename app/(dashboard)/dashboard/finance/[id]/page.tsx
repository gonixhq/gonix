import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { notFound } from "next/navigation";
import { getInvoiceAuditLogs } from "@/lib/actions/invoices";
import InvoiceDetailClient from "./invoice-detail-client";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    await gatePermission("finance.view");
    const { id } = await params;
    const supabase = await createClient();

    // Fetch invoice header + patient
    const { data: invoice } = await supabase
        .from("invoice_headers")
        .select(`
            id, vn, hn, invoice_date, bill_date, subtotal, discount_amount, tax_amount,
            total_amount, paid_amount, balance_due, status, campaign,
            created_at, updated_at,
            patients!inner(prefix, first_name, last_name, phone, thai_id_card, gender, dob)
        `)
        .eq("id", id)
        .maybeSingle();

    if (!invoice) return notFound();

    // Fetch line items
    const { data: items } = await supabase
        .from("invoice_items")
        .select("id, item_type, item_name, qty, unit_price, discount_pct, line_total")
        .eq("inv_id", id)
        .order("id");

    // Fetch payment logs (table uses `paid_at`, not `created_at`)
    const { data: payments } = await supabase
        .from("payment_logs")
        .select("id, payment_method, amount, transaction_ref, bank_name, paid_at, note, card_type, card_issuer, installment_months, mdr_rate_pct, card_fee, card_fee_vat")
        .eq("inv_id", id)
        .order("paid_at", { ascending: true });

    // ส่วนลดแยกตามที่มา (mig 107) — บิลเก่าจะไม่มี, client เติม "ไม่ระบุที่มา" ให้ยอดตรงหัวบิล
    const { data: discountRows } = await supabase
        .from("invoice_discounts")
        .select("id, discount_type, discount_source, amount, campaigns(code, name)")
        .eq("inv_id", id)
        .order("created_at");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const discountLines = ((discountRows || []) as any[]).map((d) => {
        const camp = Array.isArray(d.campaigns) ? d.campaigns[0] : d.campaigns;
        return {
            id: d.id as string,
            type: d.discount_type as string,
            label: camp ? `${camp.code} · ${camp.name}` : (d.discount_source || null),
            amount: Number(d.amount || 0),
        };
    });

    // คืนเงิน / ยกเลิก ใบเสร็จ — พนักงานทุกคนทำได้ แต่ต้องใส่เหตุผล + audit log
    const canManage = true;
    // แยกส่วนที่ยังไม่ได้ใช้เป็นคอร์ส (owner/admin) — ต้องเลือกเมนูบริการที่ใช้ตอนกลับมา
    const { data: { user: me } } = await supabase.auth.getUser();
    const { data: meProf } = me ? await supabase.from("profiles").select("role").eq("id", me.id).maybeSingle() : { data: null };
    const isOwnerAdmin = ["owner", "admin"].includes(String(meProf?.role || ""));
    const { data: svcRows } = isOwnerAdmin ? await supabase.from("service_catalog").select("id, service_name").eq("is_active", true).order("service_name") : { data: [] };
    const services = (svcRows || []).map(s => ({ id: s.id as string, name: s.service_name as string }));

    // ประวัติการกระทำ (void/refund history)
    const auditRes = await getInvoiceAuditLogs(id);
    const auditLogs = auditRes.data || [];

    return (
        <InvoiceDetailClient
            invoice={invoice}
            items={items || []}
            payments={payments || []}
            discountLines={discountLines}
            canManage={canManage}
            services={services}
            isOwnerAdmin={isOwnerAdmin}
            auditLogs={auditLogs}
        />
    );
}
