import { gatePermission } from "@/lib/auth/guard";
import { getEODSummary, getCloseDayHistory } from "@/lib/actions/end-of-day";
import EODClient from "./eod-client";

export default async function EODPage({
    searchParams,
}: {
    searchParams: Promise<{ date?: string }>;
}) {
    await gatePermission("finance.eod");
    const params = await searchParams;
    const targetDate = params.date || undefined;

    const [summaryRes, history] = await Promise.all([
        getEODSummary(targetDate),
        getCloseDayHistory(30),
    ]);

    if ("error" in summaryRes) {
        return (
            <div className="max-w-3xl mx-auto p-8 text-center">
                <p className="text-red-600 font-semibold">โหลดข้อมูลล้มเหลว: {summaryRes.error}</p>
            </div>
        );
    }

    return <EODClient summary={summaryRes} history={history} />;
}
