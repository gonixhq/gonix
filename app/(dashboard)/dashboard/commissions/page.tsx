import { gatePermission } from "@/lib/auth/guard";
import { getCommissionsByPeriod, getCommissionDaily } from "@/lib/actions/commissions";
import CommissionsClient from "./commissions-client";
import CommissionsDailyClient from "./commissions-daily-client";

export const dynamic = "force-dynamic";

export default async function CommissionsPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; view?: string; date?: string }>;
}) {
    await gatePermission("finance.view");
    const params = await searchParams;

    // ── มุมมองรายวัน ──
    if (params.view === "daily") {
        const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
        const date = params.date || today;
        const daily = await getCommissionDaily(date);
        return <CommissionsDailyClient data={daily} date={date} />;
    }

    // ── มุมมองรายเดือน (default) ──
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const month = params.month || currentMonth;

    const commissions = await getCommissionsByPeriod(month);

    return <CommissionsClient commissions={commissions} month={month} />;
}
