import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { bangkokDate } from "@/lib/utils/date";
import { getAnonRevenue } from "@/lib/actions/anonymous";
import FinanceClient from "./finance-client";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
    await gatePermission("finance.view");
    const supabase = await createClient();
    const today = bangkokDate();

    // Calculate Asia/Bangkok day window — start..end ของวันนี้
    const dayStartISO = new Date(`${today}T00:00:00+07:00`).toISOString();
    const nextDate = new Date(`${today}T00:00:00+07:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    const dayEndISO = nextDate.toISOString();

    // Fetch recent invoice headers
    const { data: invoices } = await supabase
        .from("invoice_headers")
        .select(`
            id, vn, hn, invoice_date, subtotal, discount_amount, total_amount, paid_amount, balance_due, status, created_at,
            patients(prefix, first_name, last_name)
        `)
        .order("created_at", { ascending: false })
        .limit(50);

    // เคสนิรนามที่ชำระแล้ว (เอามารวมในรายการใบเสร็จล่าสุด)
    const { data: anonPaid } = await supabase
        .from("anon_cases")
        .select("id, verify_code, case_code, case_date, total_amount, paid_at")
        .eq("paid", true)
        .order("paid_at", { ascending: false })
        .limit(50);

    // Today's revenue: ยอดที่ชำระจริง (paid_amount) รวมมัดจำ/partial ยกเว้น voided/refunded
    const { data: todayPaid } = await supabase
        .from("invoice_headers")
        .select("paid_amount, status")
        .gte("created_at", dayStartISO)
        .lt("created_at", dayEndISO);

    // Pending (issued or partial) — ทั้งระบบ ไม่ใช่แค่วันนี้
    const { data: pending } = await supabase
        .from("invoice_headers")
        .select("balance_due")
        .in("status", ["issued", "partial"]);

    // Today's invoice count (Asia/Bangkok window)
    const { count: todayInvoiceCount } = await supabase
        .from("invoice_headers")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayStartISO)
        .lt("created_at", dayEndISO);

    const anonRev = await getAnonRevenue(today, today); // + รายรับคลินิกนิรนามวันนี้
    const todayRevenue = (todayPaid || [])
        .filter((r) => r.status !== "voided" && r.status !== "refunded")
        .reduce((s, r) => s + Number(r.paid_amount || 0), 0) + anonRev.total;
    const pendingAmount = (pending || []).reduce((s, r) => s + Number(r.balance_due || 0), 0);

    // รวมเคสนิรนามเข้ารายการ (เรียงตามเวลาล่าสุด)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalRows = (invoices || []).map((i: any) => ({ ...i, _ts: i.created_at as string }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anonRows = (anonPaid || []).map((a: any) => ({
        id: (a.verify_code || a.case_code || String(a.id).slice(0, 8)) as string,
        vn: "—", hn: "—",
        invoice_date: a.case_date as string,
        total_amount: Number(a.total_amount || 0),
        paid_amount: Number(a.total_amount || 0),
        balance_due: 0,
        status: "paid",
        patients: { prefix: "", first_name: "นิรนาม", last_name: "" },
        is_anon: true,
        route: `/dashboard/anonymous/${a.id}`,
        _ts: (a.paid_at as string) || a.case_date,
    }));
    const mergedInvoices = [...normalRows, ...anonRows]
        .sort((x, y) => String(y._ts).localeCompare(String(x._ts)))
        .slice(0, 50);

    return (
        <FinanceClient
            invoices={mergedInvoices}
            todayRevenue={todayRevenue}
            pendingAmount={pendingAmount}
            todayInvoiceCount={todayInvoiceCount || 0}
        />
    );
}
