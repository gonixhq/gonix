import { gatePermission } from "@/lib/auth/guard";
import { getReportSummary, getOutstandingInvoices } from "@/lib/actions/reports";
import { getBusinessInsights, getRfmAnalysis, getBasketAnalysis } from "@/lib/actions/business-insights";
import { getPeakHours, getStaffPerformance } from "@/lib/actions/operations-report";
import ReportsClient from "./reports-client";

export const dynamic = "force-dynamic";

function bangkokToday(): string {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

export default async function ReportsPage({
    searchParams,
}: {
    searchParams: Promise<{ start?: string; end?: string }>;
}) {
    await gatePermission("reports.view");
    const params = await searchParams;

    const today = bangkokToday();
    // Default = เดือนนี้
    const [y, m] = today.split("-");
    const defaultStart = `${y}-${m}-01`;

    const startDate = params.start || defaultStart;
    const endDate = params.end || today;

    const [summary, outstanding, biz, rfm, basket, peak, staffPerf] = await Promise.all([
        getReportSummary(startDate, endDate),
        getOutstandingInvoices(),
        getBusinessInsights(startDate, endDate),
        getRfmAnalysis(),
        getBasketAnalysis(startDate, endDate),
        getPeakHours(startDate, endDate),
        getStaffPerformance(startDate, endDate),
    ]);

    return (
        <ReportsClient
            summary={summary}
            outstanding={outstanding}
            biz={biz}
            rfm={rfm}
            basket={basket}
            peak={peak}
            staffPerf={staffPerf}
            startDate={startDate}
            endDate={endDate}
            today={today}
        />
    );
}
