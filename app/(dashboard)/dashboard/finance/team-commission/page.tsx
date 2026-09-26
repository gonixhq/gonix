import { gatePermission } from "@/lib/auth/guard";
import { getTeamCommission } from "@/lib/actions/team-commission";
import { bangkokDate } from "@/lib/utils/date";
import TeamCommissionClient from "./team-commission-client";

export const dynamic = "force-dynamic";

export default async function TeamCommissionPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
    await gatePermission("finance.commission");
    const sp = await searchParams;
    const month = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month! : bangkokDate().slice(0, 7);
    const report = await getTeamCommission(month);
    if ("error" in report) return <div className="p-10 text-center text-slate-500">โหลดไม่สำเร็จ: {report.error}</div>;
    return <TeamCommissionClient report={report} />;
}
