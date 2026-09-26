import { gatePermission } from "@/lib/auth/guard";
import { getWasteLog, getWasteItemPicks, getOpenVials } from "@/lib/actions/stock-waste";
import { bangkokDate } from "@/lib/utils/date";
import WasteClient from "./waste-client";

export const dynamic = "force-dynamic";

export default async function WastePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
    await gatePermission("inventory.view");
    const sp = await searchParams;
    const today = bangkokDate();
    const month = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month! : today.slice(0, 7);
    const [log, items, openVials] = await Promise.all([getWasteLog(month), getWasteItemPicks(), getOpenVials()]);
    if ("error" in log) return <div className="p-10 text-center text-slate-500">โหลดไม่สำเร็จ: {log.error}</div>;
    return <WasteClient month={month} today={today} log={log} items={items} openVials={openVials} />;
}
