import { gatePermission } from "@/lib/auth/guard";
import { listCampaigns, getCampaignPerformance } from "@/lib/actions/campaigns";
import { getEffectivePermissionsForUser } from "@/lib/auth/permissions";
import { bangkokDate } from "@/lib/utils/date";
import CampaignsClient from "./campaigns-client";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({
    searchParams,
}: {
    searchParams: Promise<{ from?: string; to?: string }>;
}) {
    await gatePermission("campaign.view");
    const sp = await searchParams;
    const today = bangkokDate();
    const from = sp.from || today.slice(0, 8) + "01";   // ต้นเดือนปัจจุบัน
    const to = sp.to || today;

    const [campaigns, perf, me] = await Promise.all([
        listCampaigns(true),
        getCampaignPerformance(from, to),
        getEffectivePermissionsForUser(),
    ]);

    return (
        <CampaignsClient
            campaigns={campaigns}
            perf={perf}
            range={{ from, to }}
            canManage={!!me.permissions["campaign.manage"]}
        />
    );
}
