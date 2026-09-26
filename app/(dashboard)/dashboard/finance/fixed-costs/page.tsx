import { gatePermission } from "@/lib/auth/guard";
import { getFixedCosts } from "@/lib/actions/fixed-costs";
import { bangkokDate } from "@/lib/utils/date";
import FixedCostsClient from "./fixed-costs-client";

export const dynamic = "force-dynamic";

export default async function FixedCostsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
    await gatePermission("finance.view");
    const sp = await searchParams;
    const month = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month! : bangkokDate().slice(0, 7);
    const data = await getFixedCosts(month);
    if ("error" in data) return <div className="p-10 text-center text-slate-500">โหลดไม่สำเร็จ: {data.error}</div>;
    return <FixedCostsClient month={month} data={data} />;
}
