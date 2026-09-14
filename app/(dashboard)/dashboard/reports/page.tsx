import { gatePermission } from "@/lib/auth/guard";
import { getReportSummary, getOutstandingInvoices } from "@/lib/actions/reports";
import { getBusinessInsights, getRfmAnalysis, getBasketAnalysis } from "@/lib/actions/business-insights";
import { getPeakHours, getStaffPerformance, getOutstandingPackages, getInventoryRevenue } from "@/lib/actions/operations-report";
import { getGoalProgress } from "@/lib/actions/targets";
import { getAcquisitionSources, getConsultationConversion, getDemographics, getCampaignPerformance } from "@/lib/actions/marketing-report";
import { getSalesForecast } from "@/lib/actions/advanced-report";
import { getSafetyMetrics } from "@/lib/actions/follow-up";
import { getDiscountReport } from "@/lib/actions/campaigns";
import { isSeg, type Seg } from "@/lib/report-segment";
import { getProfitReport } from "@/lib/actions/profit-report";
import { validDate, shiftDate } from "@/lib/finance-range";
import ReportsClient from "./reports-client";

export const dynamic = "force-dynamic";

function bangkokToday(): string {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

export default async function ReportsPage({
    searchParams,
}: {
    searchParams: Promise<{ start?: string; end?: string; seg?: string }>;
}) {
    await gatePermission("reports.view");
    const params = await searchParams;
    const seg: Seg = isSeg(params.seg) ? params.seg : "all";

    const today = bangkokToday();
    // Default = เดือนนี้
    const [y, m] = today.split("-");
    const defaultStart = `${y}-${m}-01`;

    const requestedStart = validDate(params.start, defaultStart);
    const requestedEnd = validDate(params.end, today);
    const startDate = requestedStart <= requestedEnd ? requestedStart : requestedEnd;
    const endDate = requestedStart <= requestedEnd ? requestedEnd : requestedStart;

    // ── ช่วงก่อนหน้า (ยาวเท่ากัน อยู่ก่อน startDate) สำหรับเทียบ Period-over-Period ──
    const spanDays = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000);
    const prevEnd = shiftDate(startDate, -1);
    const prevStart = shiftDate(prevEnd, -spanDays);
    const profit = await getProfitReport(startDate, endDate);

    const [summary, outstanding, biz, rfm, basket, peak, staffPerf, outstandingPkg, invMargin] = await Promise.all([
        getReportSummary(startDate, endDate, seg),
        getOutstandingInvoices(),
        getBusinessInsights(startDate, endDate, seg),
        getRfmAnalysis(seg),
        getBasketAnalysis(startDate, endDate, seg),
        getPeakHours(startDate, endDate, seg),
        getStaffPerformance(startDate, endDate, seg),
        getOutstandingPackages(),
        getInventoryRevenue(startDate, endDate, seg),
    ]);
    const [prevSummary, goal, acqSources, conversion, demographics, campaigns] = await Promise.all([
        getReportSummary(prevStart, prevEnd, seg),
        getGoalProgress(),
        getAcquisitionSources(startDate, endDate, seg),
        getConsultationConversion(startDate, endDate, seg),
        getDemographics(),
        getCampaignPerformance(startDate, endDate, seg),
    ]);
    const [forecast, safety, discountReport] = await Promise.all([
        getSalesForecast(),
        getSafetyMetrics(startDate, endDate),
        getDiscountReport(startDate, endDate),
    ]);

    return (
        <ReportsClient
            profit={profit}
            summary={summary}
            prevSummary={prevSummary}
            goal={goal}
            acqSources={acqSources}
            conversion={conversion}
            demographics={demographics}
            campaigns={campaigns}
            discountReport={discountReport}
            forecast={forecast}
            safety={safety}
            outstanding={outstanding}
            biz={biz}
            rfm={rfm}
            basket={basket}
            peak={peak}
            staffPerf={staffPerf}
            outstandingPkg={outstandingPkg}
            invMargin={invMargin}
            seg={seg}
            startDate={startDate}
            endDate={endDate}
            today={today}
        />
    );
}
