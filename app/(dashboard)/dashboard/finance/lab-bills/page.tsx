import { redirect } from "next/navigation";

// ย้ายไปรวมที่หน้าบิลค้างจ่าย (mig 161)
export default async function LabBillsRedirect({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
    const sp = await searchParams;
    redirect(`/dashboard/finance/payables?tab=lab${sp.month ? `&month=${sp.month}` : ""}`);
}
