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
            id, vn, hn, invoice_date, subtotal, discount_amount, tax_amount,
            total_amount, paid_amount, balance_due, status,
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
        .select("id, payment_method, amount, transaction_ref, bank_name, paid_at, note")
        .eq("inv_id", id)
        .order("paid_at", { ascending: true });

    // คืนเงิน / ยกเลิก ใบเสร็จ — พนักงานทุกคนทำได้ แต่ต้องใส่เหตุผล + audit log
    const canManage = true;

    // ประวัติการกระทำ (void/refund history)
    const auditRes = await getInvoiceAuditLogs(id);
    const auditLogs = auditRes.data || [];

    return (
        <InvoiceDetailClient
            invoice={invoice}
            items={items || []}
            payments={payments || []}
            canManage={canManage}
            auditLogs={auditLogs}
        />
    );
}
