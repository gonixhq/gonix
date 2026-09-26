import { createClient } from "@/lib/supabase/server";
import { gatePermission } from "@/lib/auth/guard";
import { bangkokDate } from "@/lib/utils/date";
import { sumMoney, outstandingMoney } from "@/lib/overview-money";
import { validDate, shiftDate, monday, readAll } from "@/lib/finance-range";
import { getPettyCash } from "@/lib/actions/expenses";
import { getDeferredRevenue } from "@/lib/actions/packages";
import { getSegmentRevenue } from "@/lib/actions/segment-revenue";
import { getMedCertsToPrint } from "@/lib/actions/med-cert";
import { getVoidRefundPattern } from "@/lib/actions/finance-insight";
import FinanceClient from "./finance-client";

export const dynamic = "force-dynamic";

// ── ตัวช่วยช่วงวันที่ (เวลาไทย) ──
function startOfMonth(d: string): string {
    return d.slice(0, 7) + "-01";
}
function startOfQuarter(d: string): string {
    const m = Number(d.slice(5, 7));                 // 1-12
    const qStart = Math.floor((m - 1) / 3) * 3 + 1;  // 1,4,7,10
    return `${d.slice(0, 4)}-${String(qStart).padStart(2, "0")}-01`;
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

    if (!clinicId) throw new Error("ไม่พบข้อมูลคลินิก");

    // ── resolve range ──
    const preset = ["week", "month", "quarter", "custom"].includes(sp.preset || "") ? sp.preset! : "today";
    let from = today, to = today;
    if (preset === "week") { from = monday(today); to = today; }
    else if (preset === "month") { from = startOfMonth(today); to = today; }
    else if (preset === "quarter") { from = startOfQuarter(today); to = today; }
    else if (preset === "custom") { from = validDate(sp.from, today); to = validDate(sp.to, today); if (from > to) [from, to] = [to, from]; }

    const rangeStartISO = new Date(`${from}T00:00:00+07:00`).toISOString();
    const rangeEndISO = new Date(`${shiftDate(to, 1)}T00:00:00+07:00`).toISOString();

    // ── invoices ในช่วง (ตาม invoice_date) ──
    const invoices = await readAll((start, end) => supabase
        .from("invoice_headers")
        .select(`id, vn, hn, invoice_date, subtotal, discount_amount, total_amount, paid_amount, balance_due, status, created_at,
            patients(prefix, first_name, last_name)`)
        .eq("clinic_id", clinicId)
        .gte("invoice_date", from).lte("invoice_date", to)
        .order("invoice_date", { ascending: false }).order("created_at", { ascending: false })
        .order("id").range(start, end));

    // ── เคสนิรนามที่จ่ายในช่วง ──
    const anonPaid = await readAll((start, end) => supabase
        .from("anon_cases")
        .select("id, receipt_no, verify_code, case_code, case_date, total_amount, payment_method, paid_at")
        .eq("clinic_id", clinicId)
        .eq("paid", true).gte("paid_at", rangeStartISO).lt("paid_at", rangeEndISO)
        .order("paid_at", { ascending: false }).order("id").range(start, end));

    // รับเงินจริงตาม paid_at รวมรับชำระเพิ่มบิลเก่าและเงินคืนในช่วง
    const payLogs = await readAll((start, end) => supabase.from("payment_logs")
        .select("id, inv_id, payment_method, amount, note, deposit_type, card_fee, card_fee_vat, invoice_headers!inner(status)")
        .eq("clinic_id", clinicId).neq("invoice_headers.status", "voided")
        .gte("paid_at", rangeStartISO).lt("paid_at", rangeEndISO).order("id").range(start, end));
    const regularRevenue = sumMoney(payLogs.map(p => p.amount));
    // ค่าธรรมเนียมบัตร (MDR + VAT, snapshot ตอนรับเงิน — mig 140)
    const cardFeeTotal = sumMoney(payLogs.filter(p => Number(p.amount) > 0).flatMap(p => [p.card_fee || 0, p.card_fee_vat || 0]));
    const anonymousRevenue = sumMoney(anonPaid.map(p => p.total_amount));
    const rangeRevenue = sumMoney([regularRevenue, anonymousRevenue]);
    const depositAmount = sumMoney(payLogs.filter(p => Number(p.amount) > 0 &&
        (p.note?.startsWith("มัดจำ") || (p.deposit_type && p.deposit_type !== "none"))).map(p => p.amount));
    const rangeCount = invoices.length + anonPaid.length;
    const methodKey = (m: string) => m === "cash" ? "cash" : m === "credit_card" ? "credit" : "transfer";
    const channels = { cash: 0, transfer: 0, credit: 0 };
    for (const key of ["cash", "transfer", "credit"] as const) {
        channels[key] = sumMoney([
            ...payLogs.filter(p => methodKey(p.payment_method) === key).map(p => p.amount),
            ...anonPaid.filter(p => methodKey(p.payment_method || "cash") === key).map(p => p.total_amount),
        ]);
    }
    const pending = await readAll((start, end) => supabase.from("invoice_headers").select("id,total_amount,paid_amount")
        .eq("clinic_id", clinicId).not("status", "in", "(voided,refunded)").order("id").range(start, end));
    const anonPending = await readAll((start, end) => supabase.from("anon_cases").select("id,total_amount")
        .eq("clinic_id", clinicId).eq("paid", false).neq("status", "cancelled").order("id").range(start, end));
    const pendingAmount = sumMoney([outstandingMoney(pending), ...anonPending.map(p => p.total_amount)]);

    // ── รายจ่ายย่อย (ช่วง) + กระแสเงินสดสุทธิ ──
    const petty = await getPettyCash(from, to);
    const netCashFlow = sumMoney([rangeRevenue, -petty.total]);

    const deferred = await getDeferredRevenue();
    const segments = await getSegmentRevenue(from, to);

    // ── Trend: เทียบกับช่วงก่อนหน้า (ยาวเท่ากัน) ──
    const lenDays = Math.round((new Date(`${to}T00:00:00+07:00`).getTime() - new Date(`${from}T00:00:00+07:00`).getTime()) / 86400000) + 1;
    const prevToStr = shiftDate(from, -1), prevFromStr = shiftDate(prevToStr, -(lenDays - 1));
    const prevStart = `${prevFromStr}T00:00:00+07:00`, prevEnd = `${from}T00:00:00+07:00`;
    const prevPay = await readAll((start, end) => supabase.from("payment_logs").select("id,amount,invoice_headers!inner(status)")
        .eq("clinic_id", clinicId).neq("invoice_headers.status", "voided")
        .gte("paid_at", prevStart).lt("paid_at", prevEnd).order("id").range(start, end));
    const prevAnon = await readAll((start, end) => supabase.from("anon_cases").select("id,total_amount")
        .eq("clinic_id", clinicId).eq("paid", true).gte("paid_at", prevStart).lt("paid_at", prevEnd).order("id").range(start, end));
    const prevRevenue = sumMoney([...prevPay.map(p => p.amount), ...prevAnon.map(p => p.total_amount)]);
    const growthPct = prevRevenue > 0 ? Math.round((rangeRevenue - prevRevenue) / prevRevenue * 1000) / 10 : null;

    // ── Forecast: คาดการณ์รายรับสิ้นเดือน (เฉพาะ view เดือนนี้) ──
    let forecast: number | null = null;
    if (preset === "month") {
        const day = Number(today.slice(8, 10));
        const daysInMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
        forecast = day > 0 ? Math.round(rangeRevenue / day * daysInMonth) : null;
    }

    // ── ช่องทางชำระของแต่ละบิล (ใช้กรองในตาราง) ──
    const invIds = (invoices || []).map((i) => i.id as string);
    const receiptsByInv = new Map<string, { received: number; refunded: number }>();
    const methodByInv = new Map<string, string[]>();
    for (let chunk = 0; chunk < invIds.length; chunk += 100) {
        const invPays = await readAll((start, end) => supabase
            .from("payment_logs").select("inv_id, payment_method, amount")
            .eq("clinic_id", clinicId).in("inv_id", invIds.slice(chunk, chunk + 100)).order("id").range(start, end));
        for (const p of invPays || []) {
            const totals = receiptsByInv.get(p.inv_id) || { received: 0, refunded: 0 };
            const cents = Math.round(Number(p.amount || 0) * 100);
            if (cents > 0) totals.received += cents;
            if (cents < 0) totals.refunded -= cents;
            receiptsByInv.set(p.inv_id, totals);
            if (Number(p.amount || 0) <= 0) continue;   // ข้ามรายการคืนเงิน (ยอดติดลบ)
            const m = p.payment_method as string;
            const k = m === "cash" ? "cash" : (m === "transfer" || m === "qr_promptpay") ? "transfer" : m === "credit_card" ? "credit" : "transfer";
            const arr = methodByInv.get(p.inv_id as string) || [];
            if (!arr.includes(k)) arr.push(k);
            methodByInv.set(p.inv_id as string, arr);
        }
    }

    // ── รวมเคสนิรนามเข้ารายการ ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalRows = (invoices || []).map((i: any) => ({ ...i, received_original: receiptsByInv.has(i.id) ? receiptsByInv.get(i.id)!.received / 100 : Number(i.paid_amount || 0), refunded_amount: (receiptsByInv.get(i.id)?.refunded || 0) / 100, _ts: i.created_at as string, pay_methods: methodByInv.get(i.id) || [] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anonRows = (anonPaid || []).map((a: any) => ({
        id: (a.receipt_no || a.verify_code || a.case_code || String(a.id).slice(0, 8)) as string,
        vn: "—", hn: "—",
        invoice_date: bangkokDate(new Date(a.paid_at)),
        total_amount: Number(a.total_amount || 0),
        paid_amount: Number(a.total_amount || 0),
        balance_due: 0,
        status: "paid",
        patients: { prefix: "", first_name: "นิรนาม", last_name: "" },
        is_anon: true,
        route: `/dashboard/anonymous/${a.id}`,
        _ts: (a.paid_at as string) || a.case_date,
        pay_methods: [(() => {
            const m = a.payment_method as string;
            return m === "cash" ? "cash" : (m === "transfer" || m === "qr_promptpay") ? "transfer" : m === "credit_card" ? "credit" : "transfer";
        })()],
    }));
    const mergedInvoices = [...normalRows, ...anonRows]
        .sort((x, y) => String(y._ts).localeCompare(String(x._ts)));

    const medCertsToPrint = await getMedCertsToPrint();
    const voidPattern = await getVoidRefundPattern();

    return (
        <FinanceClient
            medCertsToPrint={medCertsToPrint}
            invoices={mergedInvoices}
            range={{ preset, from, to, isToday: preset === "today" }}
            rangeRevenue={rangeRevenue}
            rangeCount={rangeCount}
            channels={channels}
            cardFeeTotal={cardFeeTotal}
            depositAmount={depositAmount}
            regularRevenue={regularRevenue}
            anonymousRevenue={anonymousRevenue}
            pendingAmount={pendingAmount}
            pettyTotal={petty.total}
            pettyItems={petty.items}
            netCashFlow={netCashFlow}
            deferredValue={deferred.outstanding}
            deferredCount={deferred.count}
            segments={segments}
            trend={{ prevRevenue, growthPct }}
            forecast={forecast}
            voidPattern={voidPattern}
        />
    );
}
