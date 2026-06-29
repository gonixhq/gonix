import { gatePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { getAffiliatesSummary, getMonthLock, getBranches } from "@/lib/actions/affiliates";
import AffiliatesClient from "./affiliates-client";

export const dynamic = "force-dynamic";

export default async function AffiliatesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
    await gatePermission("finance.view");
    const sp = await searchParams;
    const now = new Date();
    const month = sp.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [summary, lock, branches, canManage] = await Promise.all([
        getAffiliatesSummary(month), getMonthLock(month), getBranches(), can("finance.commission"),
    ]);
    return <AffiliatesClient month={month} summary={summary} locked={lock.locked} lockedAt={lock.locked_at} branches={branches} canManage={canManage} />;
}
