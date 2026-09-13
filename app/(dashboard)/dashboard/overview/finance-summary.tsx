import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { sumMoney, outstandingMoney } from "@/lib/overview-money";

/** ข้อมูลการเงินจริง อ่านทีละหน้าเพื่อไม่ชนขีดจำกัด 1,000 แถว */
export default async function FinanceSummary({ today }: { today: string }) {
    const { clinicId, permissions } = await getEffectivePermissionsForUser();
    if (!clinicId || !permissions["finance.view"]) return null;
    const db = await createClient();
    const start = `${today}T00:00:00+07:00`;
    const end = new Date(new Date(start).getTime() + 86400000).toISOString();
    const payments: { amount: number; note: string | null; deposit_type: string | null }[] = [];
    const invoices: { total_amount: number; paid_amount: number }[] = [];
    let failed = false;
    for (let offset = 0; ; offset += 500) {
        const { data, error } = await db.from("payment_logs")
            .select("id,amount,note,deposit_type,invoice_headers!inner(status)")
            .eq("clinic_id", clinicId).neq("invoice_headers.status", "voided")
            .gte("paid_at", start).lt("paid_at", end).order("id").range(offset, offset + 499);
        if (error) { failed = true; break; }
        payments.push(...(data || []));
        if ((data?.length || 0) < 500) break;
    }
    for (let offset = 0; ; offset += 500) {
        const { data, error } = await db.from("invoice_headers").select("id,total_amount,paid_amount")
            .eq("clinic_id", clinicId).not("status", "in", "(voided,refunded)")
            .order("id").range(offset, offset + 499);
        if (error) { failed = true; break; }
        invoices.push(...(data || []));
        if ((data?.length || 0) < 500) break;
    }
    const received = sumMoney(payments.map(p => p.amount));
    const deposit = sumMoney(payments.filter(p => Number(p.amount) > 0 &&
        (p.note?.startsWith("มัดจำ") || (p.deposit_type && p.deposit_type !== "none"))).map(p => p.amount));
    const outstanding = outstandingMoney(invoices);
    const money = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return <section className="gonix-card-premium p-5" data-widget="finance">
        <div className="flex justify-between gap-3 mb-3"><h2 className="font-semibold text-slate-800">การรับเงินและยอดค้าง</h2><Link href="/dashboard/finance" className="text-sm text-blue-700">ดูรายละเอียด →</Link></div>
        {failed ? <p role="alert" className="text-sm text-slate-600">โหลดข้อมูลการเงินไม่สำเร็จ กรุณารีเฟรชหน้า</p> : <div className="grid sm:grid-cols-3 gap-3">
            {[ ["รับเงินจริงสุทธิวันนี้", received, "รวมมัดจำและรับชำระเพิ่ม หักรายการคืนเงินวันนี้"],
                ["มัดจำที่บันทึกวันนี้", deposit, "เป็นส่วนหนึ่งของยอดรับเงินจริง ไม่บวกซ้ำ"],
                ["ยอดค้างชำระทั้งหมด", outstanding, "ยอดบิลที่ยังรับไม่ครบ รวมบิลก่อนวันนี้"] ].map(([label, value, detail]) =>
                <div key={String(label)} className="rounded-2xl bg-slate-50/70 border border-slate-200/60 p-4">
                    <p className="text-sm text-slate-600">{label}</p><p className="text-2xl font-semibold text-slate-900 tabular-nums my-1">{money(Number(value))}</p><p className="text-xs text-slate-600">{detail}</p>
                </div>)}
        </div>}
        <p className="text-xs text-slate-500 mt-3">เฉพาะใบเสร็จคลินิก ไม่รวมคลินิกนิรนาม · มัดจำนับเฉพาะรายการที่บันทึกระบุว่าเป็นมัดจำ · วันที่รับเงินจริงตามเวลาไทย</p>
    </section>;
}
