import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { bangkokDate } from "@/lib/utils/date";
import { getAnonRevenue } from "@/lib/actions/anonymous";
import { getPettyCash } from "@/lib/actions/expenses";
import { getDeferredRevenue } from "@/lib/actions/packages";
import { getSegmentRevenue } from "@/lib/actions/segment-revenue";
import FinanceClient from "./finance-client";

export const dynamic = "force-dynamic";

// ── ตัวช่วยช่วงวันที่ (เวลาไทย) ──
function startOfWeek(d: string): string {
    const dt = new Date(`${d}T00:00:00+07:00`);
    const dow = (dt.getUTCDay() + 6) % 7; // จันทร์=0
    dt.setUTCDate(dt.getUTCDate() - dow);
    return dt.toISOString().slice(0, 10);
}
function startOfMonth(d: string): string {
    return d.slice(0, 7) + "-01";
}

export default async function FinancePage({
    searchParams,
}: {
    searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
    await gatePermission("finance.view");
    const sp = await searchParams;
    const supabase = await createClient();
    const today = bangkokDate();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("clinic_id").eq("id", user?.id || "").maybeSingle();
    const clinicId = (profile?.clinic_id as string) || "";

    // ── resolve range ──
    const preset = sp.preset || "today";
    let from = today, to = today;
    if (preset === "week") { from = startOfWeek(today); to = today; }
    else if (preset === "month") { from = startOfMonth(today); to = today; }
    else if (preset === "custom") { from = sp.from || today; to = sp.to || today; if (from > to) [from, to] = [to, from]; }

    const rangeStartISO = new Date(`${from}T00:00:00+07:00`).toISOString();
    const rangeNext = new Date(`${to}T00:00:00+07:00`); rangeNext.setDate(rangeNext.getDate() + 1);
    const rangeEndISO = rangeNext.toISOString();

    // ── invoices ในช่วง (ตาม invoice_date) ──
    const { data: invoices } = await supabase
        .from("invoice_headers")
        .select(`id, vn, hn, invoice_date, subtotal, discount_amount, total_amount, paid_amount, balance_due, status, created_at,
            patients(prefix, first_name, last_name)`)
        .eq("clinic_id", clinicId)
        .gte("invoice_date", from).lte("invoice_date", to)
        .order("invoice_date", { ascending: false }).order("created_at", { ascending: false })
        .limit(1000);

    // ── เคสนิรนามที่จ่ายในช่วง ──
    const { data: anonPaid } = await supabase
        .from("anon_cases")
        .select("id, verify_code, case_code, case_date, total_amount, payment_method, paid_at")
        .eq("clinic_id", clinicId)
        .eq("paid", true).gte("paid_at", rangeStartISO).lt("paid_at", rangeEndISO)
        .order("paid_at", { ascending: false }).limit(1000);

    // ── รายรับช่วงนี้ (paid_amount ยกเว้น voided/refunded) + นิรนาม ──
    const anonRev = await getAnonRevenue(from, to);
    const rangeRevenue = (invoices || [])
        .filter((r) => r.status !== "voided" && r.status !== "refunded")
        .reduce((s, r) => s + Number(r.paid_amount || 0), 0) + anonRev.total;
    const rangeCount = (invoices || []).length + (anonPaid || []).length;

    // ── สรุปช่องทางชำระ (cash/transfer/credit) ในช่วง ──
    const { data: payLogs } = await supabase
        .from("payment_logs").select("payment_method, amount")
        .eq("clinic_id", clinicId)
        .gte("paid_at", rangeStartISO).lt("paid_at", rangeEndISO);
    const chanAgg: Record<string, number> = { cash: 0, transfer: 0, credit: 0 };
    for (const p of payLogs || []) {
        const m = p.payment_method as string;
        const k = m === "cash" ? "cash" : (m === "transfer" || m === "qr_promptpay") ? "transfer" : m === "credit_card" ? "credit" : "transfer";
        chanAgg[k] = (chanAgg[k] || 0) + Number(p.amount || 0);
    }
    for (const m of anonRev.byMethod) {
        const k = m.method === "cash" ? "cash" : (m.method === "transfer" || m.method === "qr_promptpay") ? "transfer" : m.method === "credit_card" ? "credit" : "transfer";
        chanAgg[k] = (chanAgg[k] || 0) + m.amount;
    }

    // ── Pending (issued/partial) ทั้งระบบ ──
    const { data: pending } = await supabase
        .from("invoice_headers").select("balance_due").eq("clinic_id", clinicId).in("status", ["issued", "partial"]);
    const pendingAmount = (pending || []).reduce((s, r) => s + Number(r.balance_due || 0), 0);

    // ── รายจ่ายย่อย (ช่วง) + กระแสเงินสดสุทธิ ──
    const petty = await getPettyCash(from, to);
    const netCashFlow = rangeRevenue - petty.total;

    const deferred = await getDeferredRevenue();
    const segments = await getSegmentRevenue(from, to);

    // ── รวมเคสนิรนามเข้ารายการ ──
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
        .sort((x, y) => String(y._ts).localeCompare(String(x._ts)));

    return (
        <FinanceClient
            invoices={mergedInvoices}
            range={{ preset, from, to, isToday: preset === "today" }}
            rangeRevenue={rangeRevenue}
            rangeCount={rangeCount}
            channels={{ cash: Math.round(chanAgg.cash * 100) / 100, transfer: Math.round(chanAgg.transfer * 100) / 100, credit: Math.round(chanAgg.credit * 100) / 100 }}
            pendingAmount={pendingAmount}
            pettyTotal={petty.total}
            pettyItems={petty.items}
            netCashFlow={netCashFlow}
            deferredValue={deferred.outstanding}
            deferredCount={deferred.count}
            segments={segments}
        />
    );
}
