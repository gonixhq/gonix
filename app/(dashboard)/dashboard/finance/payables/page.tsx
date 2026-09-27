import { gatePermission } from "@/lib/auth/guard";
import { getPayables } from "@/lib/actions/payables";
import { listBatches } from "@/lib/actions/payment-batches";
import { bangkokDate } from "@/lib/utils/date";
import PayablesClient, { type PayTab } from "./payables-client";

export const dynamic = "force-dynamic";

const TABS: PayTab[] = ["overview", "batches", "advance", "lab", "supplier", "expense", "accountant", "vendors"];

export default async function PayablesPage({ searchParams }: { searchParams: Promise<{ month?: string; tab?: string }> }) {
    await gatePermission("finance.reports");
    const sp = await searchParams;
    const today = bangkokDate();
    const tab = (TABS.includes(sp.tab as PayTab) ? sp.tab : "overview") as PayTab;
    // แล็บ: ค่าเริ่มต้น = เดือนก่อน (ใบแจ้งหนี้มาวันที่ 5 ของเดือนถัดไป) · อื่นๆ = เดือนนี้
    const [y, m] = today.split("-").map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    const month = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month! : tab === "lab" ? prev : today.slice(0, 7);
    const [data, bt] = await Promise.all([getPayables(month), listBatches()]);
    if ("error" in data) return <div className="p-10 text-center text-slate-500">โหลดไม่สำเร็จ: {data.error}</div>;
    const batches = "error" in bt ? { batches: [], canPrepare: false, canApprove: false } : bt;
    return <PayablesClient month={month} today={today} tab={tab} data={data} batchData={batches} />;
}
