import { gatePermission } from "@/lib/auth/guard";
import { getProcedureCosts } from "@/lib/actions/procedure-costs";
import { bangkokDate } from "@/lib/utils/date";
import ProcedureCostsClient from "./procedure-costs-client";

export const dynamic = "force-dynamic";

export default async function ProcedureCostsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
    await gatePermission("finance.view");
    const sp = await searchParams;
    const month = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month! : bangkokDate().slice(0, 7);
    const report = await getProcedureCosts(month);
    if ("error" in report) return <div className="p-10 text-center text-slate-500">โหลดไม่สำเร็จ: {report.error}</div>;
    return <ProcedureCostsClient report={report} />;
}
