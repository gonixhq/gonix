import { gatePermission } from "@/lib/auth/guard";
import { getCommissionsByPeriod } from "@/lib/actions/commissions";
import CommissionsClient from "./commissions-client";

export const dynamic = "force-dynamic";

export default async function CommissionsPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    await gatePermission("finance.view");
    const params = await searchParams;

    // Default = current month in Bangkok TZ
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const month = params.month || currentMonth;

    const commissions = await getCommissionsByPeriod(month);

    return <CommissionsClient commissions={commissions} month={month} />;
}
