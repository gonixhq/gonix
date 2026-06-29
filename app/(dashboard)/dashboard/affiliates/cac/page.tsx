import { gatePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { getCacReport, listAdSpend } from "@/lib/actions/marketing";
import CacClient from "./cac-client";

export const dynamic = "force-dynamic";

export default async function CacPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
    await gatePermission("finance.view");
    const sp = await searchParams;
    const now = new Date();
    const month = sp.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [report, spend, canManage] = await Promise.all([getCacReport(month), listAdSpend(month), can("finance.commission")]);
    return <CacClient month={month} report={report} spend={spend} canManage={canManage} />;
}
