import { gatePermission } from "@/lib/auth/guard";
import { getMonthlyReport } from "@/lib/actions/monthly-report";
import { bangkokDate } from "@/lib/utils/date";
import MonthlyReportClient from "./monthly-report-client";

export const dynamic = "force-dynamic";

export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
    await gatePermission("finance.view");
    const sp = await searchParams;
    const cur = Number(bangkokDate().slice(0, 4));
    const year = /^\d{4}$/.test(sp.year || "") ? Number(sp.year) : cur;
    const report = await getMonthlyReport(year);
    if ("error" in report) return <div className="p-10 text-center text-slate-500">โหลดไม่สำเร็จ: {report.error}</div>;
    return <MonthlyReportClient report={report} currentYear={cur} />;
}
