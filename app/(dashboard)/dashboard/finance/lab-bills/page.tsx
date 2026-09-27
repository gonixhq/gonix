import { gatePermission } from "@/lib/auth/guard";
import { getLabBills } from "@/lib/actions/lab-bills";
import { bangkokDate } from "@/lib/utils/date";
import LabBillsClient from "./lab-bills-client";

export const dynamic = "force-dynamic";

export default async function LabBillsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
    await gatePermission("finance.view");
    const sp = await searchParams;
    // ค่าเริ่มต้น = เดือนก่อน (ใบแจ้งหนี้มาวันที่ 5 ของเดือนถัดไป)
    const today = bangkokDate();
    const [y, m] = today.split("-").map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    const month = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month! : prev;
    const data = await getLabBills(month);
    if ("error" in data) return <div className="p-10 text-center text-slate-500">โหลดไม่สำเร็จ: {data.error}</div>;
    return <LabBillsClient month={month} today={today} data={data} />;
}
