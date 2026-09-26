import { gatePermission } from "@/lib/auth/guard";
import { getCardFeeReport } from "@/lib/actions/card-fee-report";
import { bangkokDate } from "@/lib/utils/date";
import CardFeesClient from "./card-fees-client";

export const dynamic = "force-dynamic";

export default async function CardFeesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
    await gatePermission("finance.view");
    const sp = await searchParams;
    const month = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month! : bangkokDate().slice(0, 7);
    const report = await getCardFeeReport(month);
    if ("error" in report) return <div className="p-10 text-center text-slate-500">โหลดรายงานไม่สำเร็จ: {report.error}</div>;
    return <CardFeesClient report={report} />;
}
