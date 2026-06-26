import { gatePermission } from "@/lib/auth/guard";
import { getPriceApprovals } from "@/lib/actions/price-approvals";
import PriceApprovalsClient from "./price-approvals-client";

export const dynamic = "force-dynamic";

export default async function PriceApprovalsPage() {
    await gatePermission("finance.view");
    const pending = await getPriceApprovals("pending");
    return <PriceApprovalsClient pending={pending} />;
}
