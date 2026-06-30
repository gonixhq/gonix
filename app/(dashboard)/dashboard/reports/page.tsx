import { gatePermission } from "@/lib/auth/guard";
import { getReportSummary, getOutstandingInvoices } from "@/lib/actions/reports";
import { getBusinessInsights, getRfmAnalysis, getBasketAnalysis } from "@/lib/actions/business-insights";
import { getPeakHours, getStaffPerformance, getOutstandingPackages, getInventoryRevenue } from "@/lib/actions/operations-report";
import { getGoalProgress } from "@/lib/actions/targets";
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

    // ── ช่วงก่อนหน้า (ยาวเท่ากัน อยู่ก่อน startDate) สำหรับเทียบ Period-over-Period ──
    function isoDate(d: Date) { return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }); }
    const sDate = new Date(`${startDate}T00:00:00+07:00`);
    const eDate = new Date(`${endDate}T00:00:00+07:00`);
    const spanDays = Math.max(0, Math.round((eDate.getTime() - sDate.getTime()) / 86400000));
    const prevEndD = new Date(sDate); prevEndD.setDate(prevEndD.getDate() - 1);
    const prevStartD = new Date(prevEndD); prevStartD.setDate(prevStartD.getDate() - spanDays);
    const prevStart = isoDate(prevStartD);
    const prevEnd = isoDate(prevEndD);

    const [summary, outstanding, biz, rfm, basket, peak, staffPerf, outstandingPkg, invMargin] = await Promise.all([
        getReportSummary(startDate, endDate),
        getOutstandingInvoices(),
        getBusinessInsights(startDate, endDate),
        getRfmAnalysis(),
        getBasketAnalysis(startDate, endDate),
        getPeakHours(startDate, endDate),
        getStaffPerformance(startDate, endDate),
        getOutstandingPackages(),
        getInventoryRevenue(startDate, endDate),
    ]);
    const [prevSummary, goal] = await Promise.all([
        getReportSummary(prevStart, prevEnd),
        getGoalProgress(),
    ]);

    return (
        <ReportsClient
            summary={summary}
            prevSummary={prevSummary}
            goal={goal}
            outstanding={outstanding}
            biz={biz}
            rfm={rfm}
            basket={basket}
            peak={peak}
            staffPerf={staffPerf}
            outstandingPkg={outstandingPkg}
            invMargin={invMargin}
            startDate={startDate}
            endDate={endDate}
            today={today}
        />
    );
}
