import { gatePermission } from "@/lib/auth/guard";
import { getCommissionDetail } from "@/lib/actions/commissions";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import StaffDetailClient from "./staff-detail-client";

export const dynamic = "force-dynamic";

export default async function CommissionDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ staffKey: string }>;
    searchParams: Promise<{ month?: string }>;
}) {
    await gatePermission("finance.view");
    const { staffKey } = await params;
    const sp = await searchParams;

    // staffKey = "staff_id-role"
    const dashIdx = staffKey.lastIndexOf("-");
    const staffId = staffKey.substring(0, dashIdx);
    const role = staffKey.substring(dashIdx + 1);

    if (!staffId || !role) return notFound();

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const month = sp.month || currentMonth;

    const detail = await getCommissionDetail(staffId, role, month);

    // Check payout
    const supabase = await createClient();
    const { data: payout } = await supabase
        .from("commission_payouts")
        .select("amount, paid_at, payment_method, note")
        .eq("staff_id", staffId)
        .eq("period_month", month)
        .maybeSingle();

    return (
        <StaffDetailClient
            staffId={staffId}
            role={role}
            month={month}
            staffName={detail.staff_name}
            entries={detail.entries}
            total={detail.total}
            payout={payout}
            isApproved={detail.is_approved}
            approvedAmount={detail.approved_amount}
            approvedAt={detail.approved_at}
        />
    );
}
